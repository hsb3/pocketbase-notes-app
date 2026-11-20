cronAdd("expired-notes", "17 3 * * *", () => {
  const life = require(`${__hooks}/note-lifecycle.js`);
  const { isReferenced } = require(`${__hooks}/attachment-cleanup.js`);
  const run = $security.randomString(24);
  const cutoff = life.utc(Date.now() - life.retentionMs);
  const log = $app.logger();
  const counts = { removed: 0, invalid: 0, skipped: 0, failed: 0 };
  function purge(tx, id, integrityOnly) {
    const rows = arrayOf(new DynamicModel({ deleted: "", user: "" }));
    tx.db().newQuery("SELECT deleted,user FROM notes WHERE id={:id}").bind({ id }).all(rows);
    if (!rows.length || !rows[0].deleted) return "skipped";
    const { deleted, user } = rows[0];
    if (!life.validDeleted(deleted)) {
      log.error("Invalid purge date", "run", run, "note", id, "owner", user);
      return "invalid";
    }
    if (integrityOnly || deleted > cutoff) return "skipped";
    const note = tx.findRecordById("notes", id);
    const attachments = new Set(note.getStringSlice("attachments"));
    tx.delete(note);
    let exclusive = false;
    for (const attachment of attachments) {
      const file = tx.findRecordById("attachments", attachment);
      if (isReferenced(tx, attachment)) continue;
      const prefix = file.baseFilesPath() + "/";
      const name = file.getString("file");
      const original = prefix + name;
      const fs = tx.newFilesystem();
      try {
        const observed = new Set(fs.list(prefix).map(obj => obj.key));
        const mime = fs.attributes(original).contentType;
        const possible = /^image\/(png|jpg|jpeg|gif|webp)$/.test(mime) ? prefix + "thumbs_" + name + "/100x100_" + name : "";
        const keys = new Set([original, ...observed]);
        if (possible) keys.add(possible);
        for (const key of keys) {
          const size = toBytes(JSON.stringify(key)).length + 512;
          if (size > (tx.settings().logs.maxDataSize || 16384)) throw Error("Purge key exceeds log data size.");
          log.info("Purge attachment key", "run", run, "owner", user, "note", id, "attachment", attachment,
            "prefix", prefix, "key", key, "expectedOriginal", key === original, "observed", observed.has(key),
            "possibleDerivative", key === possible);
        }
      } finally {
        fs.close();
      }
      tx.delete(file);
      exclusive = true;
    }
    if (!exclusive) log.info("Purge note", "run", run, "owner", user, "note", id, "keys", []);
    return "removed";
  }
  try {
    const settings = $app.settings().logs;
    // One 1024-byte S3 key can need 6144 JSON bytes after escaping, plus its identifiers and roles.
    if (!settings.maxDays || settings.minLevel > 0 || (settings.maxDataSize && settings.maxDataSize < 8192)) {
      console.error("Note purge requires retained info/error logs and 8192 bytes of log data per event.");
      throw Error("Insufficient log retention, level or data size.");
    }
    for (const integrityOnly of [false, true]) {
      const range = integrityOnly ? "deleted > {:cutoff} AND NOT " + life.validDeletedSQL : "deleted <= {:cutoff}";
      let lastDeleted = "", lastId = "";
      while (true) {
        const page = arrayOf(new DynamicModel({ deleted: "", id: "" }));
        $app.db().newQuery("SELECT deleted,id FROM notes WHERE deleted > '' AND " + range +
          " AND (deleted,id) > ({:lastDeleted},{:lastId}) ORDER BY deleted,id LIMIT 100")
          .bind({ cutoff, lastDeleted, lastId }).all(page);
        if (!page.length) break;
        for (const row of page) {
          let outcome;
          try {
            $app.runInTransaction(tx => { outcome = purge(tx, row.id, integrityOnly); });
            counts[outcome]++;
          } catch (err) {
            counts.failed++;
            log.error("Note purge failed", "run", run, "note", row.id, "error", String(err));
          }
        }
        lastDeleted = page[page.length - 1].deleted;
        lastId = page[page.length - 1].id;
      }
    }
    log.info(counts.failed ? "Note purge aborted" : "Note purge finished", "run", run,
      "removed", counts.removed, "invalid", counts.invalid, "skipped", counts.skipped, "failed", counts.failed);
  } catch (err) {
    log.error("Note purge aborted", "run", run, "error", String(err), "failed", counts.failed);
  }
});
