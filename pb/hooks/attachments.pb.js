onRecordDeleteRequest((e) => {
  e.app.runInTransaction((tx) => {
    const { isReferenced } = require(`${__hooks}/attachment-cleanup.js`);
    if (isReferenced(tx, e.record.id)) throw new BadRequestError("Remove the file from its notes and save first.");
    e.app = tx;
    e.next();
  });
}, "attachments");

// Unreferenced uploads survive a day so abandoned drafts do not leak storage forever.
cronAdd("unused-attachments", "0 * * * *", () => {
  const cutoff = new Date(Date.now() - 86400000).toISOString().replace("T", " ");
  const rows = arrayOf(new DynamicModel({ id: "" }));
  const { candidates, isReferenced } = require(`${__hooks}/attachment-cleanup.js`);
  $app.db().newQuery(candidates).bind({ cutoff }).all(rows);
  for (const row of rows) {
    $app.runInTransaction((tx) => {
      if (!isReferenced(tx, row.id)) tx.delete(tx.findRecordById("attachments", row.id));
    });
  }
});
