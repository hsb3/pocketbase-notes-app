migrate((app) => {
  const folders = app.findCollectionByNameOrId("folders");
  let cursor = "";
  for (;;) {
    const missing = arrayOf(new DynamicModel({ id: "" }));
    app.db().newQuery(`SELECT u.id FROM users u WHERE u.id > {:cursor}
      AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.user = u.id AND f.is_default)
      ORDER BY u.id LIMIT 100`).bind({ cursor }).all(missing);
    if (!missing.length) break;
    for (const user of missing) {
      const folder = new Record(folders);
      folder.set("user", user.id);
      folder.set("name", "Notes");
      folder.set("name_key", "NOTES");
      folder.set("is_default", true);
      app.save(folder);
      cursor = user.id;
    }
  }

  const invalid = new DynamicModel({ count: 0 });
  app.db().newQuery(`SELECT count(*) AS count FROM users u WHERE NOT EXISTS
    (SELECT 1 FROM folders f WHERE f.user = u.id AND f.is_default AND f.name = 'Notes' AND f.name_key = 'NOTES')`).one(invalid);
  if (invalid.count) throw new Error("Every account must have its Notes default folder.");
}, () => {
  // A provisioned folder may now contain user notes.
});
