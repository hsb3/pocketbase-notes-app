onRecordDeleteRequest((e) => {
  e.app.runInTransaction((tx) => {
    if (tx.findRecordsByFilter("entries", "attachments.id ?= {:id}", "", 1, 0, { id: e.record.id }).length) throw new BadRequestError("Remove the file from its entries and save first.");
    e.app = tx;
    e.next();
  });
}, "attachments");

// Unreferenced uploads survive a day so abandoned drafts do not leak storage forever.
cronAdd("unused-attachments", "0 * * * *", () => {
  const cutoff = new Date(Date.now() - 86400000).toISOString().replace("T", " ");
  const rows = arrayOf(new DynamicModel({ id: "" }));
  $app.db().newQuery(require(`${__hooks}/attachment-cleanup.js`)).bind({ cutoff }).all(rows);
  for (const row of rows) {
    $app.runInTransaction((tx) => {
      if (!tx.findRecordsByFilter("entries", "attachments.id ?= {:id}", "", 1, 0, { id: row.id }).length) tx.delete(tx.findRecordById("attachments", row.id));
    });
  }
});
