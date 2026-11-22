for (const verb of ["move", "delete", "restore"]) {
  routerAdd("POST", "/api/notebook/notes/{id}/" + verb, (e) => {
    const life = require(`${__hooks}/note-lifecycle.js`);
    const id = e.request.pathValue("id");
    const user = e.auth.id;
    const action = e.request.url.path.split("/").pop();
    const recordId = /^[a-z0-9]{15}$/;
    e.response.header().set("Cache-Control", "private, no-store");
    if (!recordId.test(id)) throw new NotFoundError("Note unavailable.");
    // Read to the router's body limit before acquiring the write transaction.
    const raw = readerToString(e.request.body, Number.MAX_SAFE_INTEGER);
    const mediaType = e.request.header.get("Content-Type").split(";")[0].trim().toLowerCase();
    let result;
    e.app.runInTransaction((tx) => {
      const note = life.ownedNote(tx, id, user);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new BadRequestError("Expected a JSON object.");
      }
      if (e.request.url.rawQuery || mediaType !== "application/json" ||
          !body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some(k => k !== "revision" && !(action === "move" && k === "folder"))) {
        throw new BadRequestError("Invalid note action.");
      }
      if (!Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision !== note.revision) {
        throw new ApiError(409, "A current note revision is required.");
      }
      life.checkDeleted(tx, id, note.deleted);
      const now = Date.now();
      const ownedFolder = (folder) => tx.findRecordsByFilter(
        "folders", "id = {:folder} && user = {:user}", "", 1, 0, { folder, user },
      ).length === 1;
      let folder = note.folder;
      let deleted = note.deleted;
      let set;
      if (action === "restore") {
        if (!deleted) throw new BadRequestError("This note is active.");
        if (!life.canRestore(deleted, now)) throw new ApiError(410, "The recovery period has ended.");
        if (!folder || !ownedFolder(folder)) {
          const defaults = tx.findRecordsByFilter("folders", "is_default = true && user = {:user}", "", 2, 0, { user });
          if (defaults.length !== 1) throw new InternalServerError("Default folder unavailable.");
          folder = defaults[0].id;
        }
        deleted = "";
        set = "folder={:folder}, deleted={:deleted}";
      } else {
        if (deleted) throw new BadRequestError("This note is deleted.");
        if (action === "move") {
          folder = body.folder;
          if (typeof folder !== "string" || !recordId.test(folder) || folder === note.folder || !ownedFolder(folder)) {
            throw new BadRequestError("Choose a different available folder.");
          }
          set = "folder={:folder}";
        } else {
          deleted = life.utc(now);
          set = "deleted={:deleted}";
        }
      }
      const updated = tx.db().newQuery("UPDATE notes SET " + set + ", revision=revision+1 " +
        "WHERE id={:id} AND user={:user} AND revision={:revision} AND deleted={:original}")
        .bind({ id, user, folder, deleted, revision: note.revision, original: note.deleted }).execute();
      if (updated.rowsAffected() !== 1) throw new ApiError(409, "Note changed.");
      result = { id, user, folder, deleted, revision: note.revision + 1 };
    });
    require(`${__hooks}/note-notice.js`).send(e.app, result);
    return e.json(200, result);
  }, $apis.requireAuth("users"));
}

// Pin and journal date are metadata-only (constitution III): no revision check, and raw SQL leaves `updated` alone.
for (const verb of ["pin", "date"]) {
  routerAdd("POST", "/api/notebook/notes/{id}/" + verb, (e) => {
    const life = require(`${__hooks}/note-lifecycle.js`);
    const id = e.request.pathValue("id");
    const user = e.auth.id;
    // Goja compiles each callback alone, so the verb comes from the path, not the loop variable.
    const key = e.request.url.path.split("/").pop() === "date" ? "journal_date" : "pinned";
    e.response.header().set("Cache-Control", "private, no-store");
    if (!/^[a-z0-9]{15}$/.test(id)) throw new NotFoundError("Note unavailable.");
    const raw = readerToString(e.request.body, Number.MAX_SAFE_INTEGER);
    const mediaType = e.request.header.get("Content-Type").split(";")[0].trim().toLowerCase();
    let result;
    e.app.runInTransaction((tx) => {
      const note = life.ownedNote(tx, id, user);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new BadRequestError("Expected a JSON object.");
      }
      if (e.request.url.rawQuery || mediaType !== "application/json" ||
          !body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, key)) {
        throw new BadRequestError("Invalid note action.");
      }
      const value = body[key];
      if (key === "pinned") {
        if (typeof value !== "boolean") throw new BadRequestError("Invalid note action.");
      } else {
        try {
          if (typeof value !== "string") throw new Error("Choose a valid journal date.");
          require(`${__hooks}/entry-validation.js`).date(value);
        } catch (error) {
          throw new BadRequestError(String(error.message || error));
        }
      }
      life.checkDeleted(tx, id, note.deleted);
      if (note.deleted) throw new BadRequestError("This note is deleted.");
      // Zero affected rows means the note already had this value. `key` is one of two fixed names.
      tx.db().newQuery("UPDATE notes SET " + key + "={:value} WHERE id={:id} AND user={:user} AND deleted='' AND " +
        key + "<>{:value}").bind({ id, user, value }).execute();
      result = { id, user, folder: note.folder, deleted: "", revision: note.revision, [key]: value };
    });
    require(`${__hooks}/note-notice.js`).send(e.app, result);
    return e.json(200, result);
  }, $apis.requireAuth("users"));
}

routerAdd("GET", "/api/notebook/recently-deleted", (e) => {
  const life = require(`${__hooks}/note-lifecycle.js`);
  e.response.header().set("Cache-Control", "private, no-store");
  const raw = e.request.url.rawQuery;
  const value = raw ? e.request.url.query().get("page") : "1";
  const page = Number(value);
  const offset = (page - 1) * 20;
  if (raw.includes("&") || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(offset)) {
    throw new BadRequestError("Invalid trash page.");
  }
  let result;
  e.app.runInTransaction((tx) => {
    const now = Date.now();
    const params = { user: e.auth.id, cutoff: life.utc(now - life.retentionMs), offset };
    const where = " FROM notes WHERE user={:user} AND deleted>{:cutoff} AND " + life.validDeletedSQL;
    const count = new DynamicModel({ n: 0 });
    tx.db().newQuery("SELECT count(*) AS n" + where).bind(params).one(count);
    const rows = arrayOf(new DynamicModel({ id: "", folder: "", title: "", revision: 0, deleted: "" }));
    tx.db().newQuery("SELECT id,folder,title,revision,deleted" + where + " ORDER BY deleted DESC,id DESC LIMIT 20 OFFSET {:offset}")
      .bind(params).all(rows);
    const items = rows.map(({ id, folder, title, revision, deleted }) =>
      ({ id, folder, title, revision, deleted, deadline: new Date(life.deadline(deleted)).toISOString() }));
    result = { page, perPage: 20, totalItems: count.n, totalPages: Math.ceil(count.n / 20),
      serverNow: new Date(now).toISOString(), items };
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));
