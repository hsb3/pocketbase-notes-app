const retentionMs = 2592000000;
const validDeletedSQL = "(deleted <> '0001-01-01 00:00:00.000Z' AND " +
  "COALESCE(strftime('%Y-%m-%d %H:%M:%fZ',deleted,'+0 days') = deleted COLLATE BINARY, 0))";

function utc(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function validDeleted(value) {
  if (value === "0001-01-01 00:00:00.000Z" || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const ms = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(ms) && utc(ms) === value;
}

function checkDeleted(app, id, value) {
  if (value === "" || validDeleted(value)) return;
  app.logger().error("Invalid note deletion timestamp: " + id);
  throw new InternalServerError("Note data is unavailable.");
}

function deadline(deleted) {
  return Date.parse(deleted.replace(" ", "T")) + retentionMs;
}

function canRestore(deleted, now) {
  return now < deadline(deleted);
}

function ownedNote(app, id, user) {
  const rows = arrayOf(new DynamicModel({ id: "", user: "", revision: 0, folder: "", deleted: "" }));
  app.db().newQuery("SELECT id,user,revision,folder,deleted FROM notes WHERE id={:id} AND user={:user}")
    .bind({ id, user }).all(rows);
  if (!rows.length) throw new NotFoundError("Note unavailable.");
  return rows[0];
}

module.exports = { retentionMs, validDeletedSQL, utc, validDeleted, checkDeleted, deadline, canRestore, ownedNote };
