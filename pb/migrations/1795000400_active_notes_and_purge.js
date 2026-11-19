function activeNotes(app, forward) {
  const notes = app.findCollectionByNameOrId("notes");
  const owner = '@request.auth.collectionName = "users" && user = @request.auth.id';
  const active = owner + ' && deleted = ""';
  const name = "idx_notes_purge";
  const columns = "deleted, id";
  const where = "deleted > ''";
  const definition = "CREATE INDEX `" + name + "` ON `notes` (" + columns + ") WHERE " + where;
  const existing = notes.getIndex(name);
  // The JSVM exposes the nullable Go rule as a boxed string.
  const rule = String(notes.listRule);
  const before = rule === owner && !existing;
  const after = rule === active && existing === definition;
  if (!before && !after) throw new Error("Unexpected notes list rule or definition of " + name);
  if (forward ? after : before) return;

  notes.listRule = forward ? active : owner;
  if (forward) notes.addIndex(name, false, columns, where);
  else notes.removeIndex(name);
  app.save(notes);
}

migrate((app) => activeNotes(app, true), (app) => activeNotes(app, false));
