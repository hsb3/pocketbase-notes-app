function notePins(app, forward) {
  const notes = app.findCollectionByNameOrId("notes");
  const own = '@request.auth.collectionName = "users" && user = @request.auth.id';
  const create = own + ' && @request.body.deleted:isset = false';
  const update = own + ' && @request.body.user:changed = false && @request.body.folder:changed = false' +
    ' && @request.body.deleted:changed = false';
  const pinCreate = create + ' && @request.body.pinned:isset = false';
  const pinUpdate = update + ' && @request.body.pinned:changed = false';
  const name = "idx_notes_user_pinned_updated_id";
  const columns = "user, pinned, updated, id";
  // Not partial: the list rule's `deleted = '' OR deleted IS NULL` cannot use a `deleted = ''` index.
  const definition = "CREATE INDEX `" + name + "` ON `notes` (" + columns + ")";
  const existing = notes.getIndex(name);
  const field = notes.fields.getByName("pinned");
  // The JSVM exposes the nullable Go rules as boxed strings.
  const rules = [String(notes.createRule), String(notes.updateRule)];
  const before = rules[0] === create && rules[1] === update && !existing && !field;
  const after = rules[0] === pinCreate && rules[1] === pinUpdate && existing === definition &&
    !!field && field.type() === "bool";
  if (!before && !after) throw new Error("Unexpected notes rules, pinned field or definition of " + name);
  if (forward ? after : before) return;

  if (forward) {
    notes.fields.add(new BoolField({ name: "pinned" }));
    notes.addIndex(name, false, columns, "");
    notes.createRule = pinCreate;
    notes.updateRule = pinUpdate;
  } else {
    notes.removeIndex(name);
    notes.fields.removeByName("pinned");
    notes.createRule = create;
    notes.updateRule = update;
  }
  app.save(notes);
}

migrate((app) => notePins(app, true), (app) => notePins(app, false));
