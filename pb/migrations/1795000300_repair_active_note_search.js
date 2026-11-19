// Keep the historical derivation here so replay does not depend on the installed hooks.
function repair(app, forward) {
  const notes = app.findCollectionByNameOrId("notes");
  const name = "idx_notes_user_updated_id_deleted";
  const columns = "user, updated DESC, id DESC, deleted";
  const existing = notes.getIndex(name);
  if (existing && existing !== "CREATE INDEX `" + name + "` ON `notes` (" + columns + ")") {
    throw new Error("Unexpected definition of " + name + ": " + existing);
  }
  if (forward && !existing) {
    notes.addIndex(name, false, columns, "");
    app.save(notes);
  } else if (!forward && existing) {
    notes.removeIndex(name);
    app.save(notes);
  }

  const fold = (s) => s.normalize("NFC").toUpperCase().normalize("NFC");
  let cursor = "";
  for (;;) {
    const rows = arrayOf(new DynamicModel({ id: "", title: "", text: "", search_key: "" }));
    app.db().newQuery("SELECT id,title,text,search_key FROM notes WHERE id > {:cursor} ORDER BY id LIMIT 100")
      .bind({ cursor }).all(rows);
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      const source = row.text.split(/[\r\n\u2028\u2029]/, 1)[0].trim()
        ? row.text : [row.title, row.text].filter(Boolean).join("\n");
      const legacy = fold(source);
      const title = fold(row.title);
      const key = (legacy.includes(title) ? legacy : title + "\n" + legacy).split("\0").join("\n");
      const from = forward ? legacy : key;
      const to = forward ? key : legacy;
      if (from === to || row.search_key === to) continue;
      if (row.search_key !== from) throw new Error("Unexpected search key for note " + row.id);
      const result = app.db().newQuery(`UPDATE notes SET search_key = {:to}
        WHERE id = {:id} AND CAST(search_key AS BLOB) = CAST({:from} AS BLOB)`)
        .bind({ id: row.id, from, to }).execute();
      if (result.rowsAffected() !== 1) throw new Error("Search key update failed for note " + row.id);
    }
  }
}
migrate((app) => repair(app, true), (app) => repair(app, false));
