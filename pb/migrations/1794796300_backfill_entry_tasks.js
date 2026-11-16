/// <reference path="../pb_data/types.d.ts" />
// Fill open_tasks/tasks for entries saved before the hook derived them.
// Raw SQL so `updated` and `revision` stay put (no reordering, no false save conflicts).
migrate((app) => {
  const { tasks } = require(`${__hooks}/entry-validation.js`);
  const rows = arrayOf(new DynamicModel({ id: "", body: "" }));
  app.db().newQuery("SELECT id, body FROM entries").all(rows);
  for (const row of rows) {
    let doc;
    try {
      doc = JSON.parse(row.body);
    } catch {
      continue;
    }
    const result = tasks(doc || {});
    app
      .db()
      .newQuery("UPDATE entries SET open_tasks = {:count}, tasks = {:tasks} WHERE id = {:id}")
      .bind({ count: result.count, tasks: JSON.stringify(result.open), id: row.id })
      .execute();
  }
}, () => {
  // Down: the fields migration removes the columns.
});
