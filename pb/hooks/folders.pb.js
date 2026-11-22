onRecordValidate((e) => {
  const name = e.record.getString("name").trim();
  const key = require(`${__hooks}/comparison-key.js`)(name);
  const isDefault = e.record.getBool("is_default");
  if (isDefault) {
    if (name !== "Notes") throw new BadRequestError("The default folder must be named Notes.");
  } else if (["NOTES", "ALL NOTES", "PINNED", "JOURNAL", "OPEN TASKS", "RECENTLY DELETED"].includes(key)) {
    throw new BadRequestError("This folder name is reserved.");
  }
  if (!e.record.isNew()) {
    const original = e.record.original();
    if (original.getBool("is_default") !== isDefault || original.getString("user") !== e.record.getString("user")) {
      throw new BadRequestError("Folder ownership and default status are permanent.");
    }
  }
  e.record.set("name", name);
  e.record.set("name_key", key);
  e.next();
}, "folders");

onRecordCreateExecute((e) => {
  const app = e.app;
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      e.next();
    } finally {
      e.app = app;
    }
    const folder = new Record(tx.findCollectionByNameOrId("folders"));
    folder.set("user", e.record.id);
    folder.set("name", "Notes");
    folder.set("is_default", true);
    tx.save(folder);
  });
}, "users");

// Goja compiles each registered callback in isolation. Register the same snapshot transaction for both paths.
function folderAction(e) {
  const request = e.requestEvent || e;
  const preview = request.request.method === "GET";
  const id = preview ? request.request.pathValue("id") : e.record.id;
  const user = request.auth.id;
  request.response.header().set("Cache-Control", "private, no-store");
  let result;
  let removed = [];
  const app = e.app;
  e.app.runInTransaction((tx) => {
    const [folder] = tx.findRecordsByFilter("folders", "id={:id} && user={:user}", "", 1, 0, { id, user });
    if (!folder) throw new NotFoundError("Folder unavailable.");
    if (folder.getBool("is_default")) throw new BadRequestError("The Notes folder is permanent.");
    const life = require(`${__hooks}/note-lifecycle.js`);
    const rows = arrayOf(new DynamicModel({ id: "", user: "", revision: 0, deleted: "" }));
    tx.db().newQuery("SELECT id,user,revision,deleted FROM notes WHERE folder={:id} ORDER BY id").bind({ id }).all(rows);
    const members = rows.map((r) => {
      if (r.user !== user || !Number.isSafeInteger(r.revision) || r.revision < 1 || r.revision >= Number.MAX_SAFE_INTEGER)
        throw new InternalServerError("Folder data is unavailable.");
      life.checkDeleted(tx, r.id, r.deleted);
      return [r.id, r.revision, r.deleted];
    });
    const snapshot = $security.sha256(JSON.stringify([id, members]));
    if (preview) {
      result = { id, name: folder.getString("name"), activeCount: members.filter(m => !m[2]).length, snapshot };
      return;
    }
    const query = request.request.url.query();
    if (query.has("snapshot")) {
      if (query.get("snapshot") !== snapshot) throw new ApiError(409, "Folder changed.");
    } else if (rows.length) {
      throw new BadRequestError("Only an empty folder can be deleted without confirmation.");
    }
    const now = life.utc(Date.now());
    for (const row of rows) {
      const write = tx.db().newQuery("UPDATE notes SET folder='', revision=revision+1, deleted={:deleted} " +
        "WHERE id={:id} AND user={:user} AND folder={:folder} AND revision={:rev} AND deleted={:old}")
        .bind({ deleted: row.deleted || now, id: row.id, user, folder: id, rev: row.revision, old: row.deleted }).execute();
      if (write.rowsAffected() !== 1) throw new ApiError(409, "Folder changed.");
    }
    e.app = tx;
    e.record = folder;
    e.next();
    removed = rows.map((row) => ({ id: row.id, user, folder: "", deleted: row.deleted || now, revision: row.revision + 1 }));
  });
  if (preview) return e.json(200, result);
  const notice = require(`${__hooks}/note-notice.js`);
  for (const note of removed) notice.send(app, note);
}
routerAdd("GET", "/api/notebook/folders/{id}/delete-preview", folderAction, $apis.requireAuth("users"));
onRecordDeleteRequest(folderAction, "folders");
