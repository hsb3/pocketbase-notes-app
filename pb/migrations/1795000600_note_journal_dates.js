function noteJournalDates(app, forward) {
  const notes = app.findCollectionByNameOrId("notes");
  const own = '@request.auth.collectionName = "users" && user = @request.auth.id';
  const create = own + ' && @request.body.deleted:isset = false && @request.body.pinned:isset = false';
  const update = own + ' && @request.body.user:changed = false && @request.body.folder:changed = false' +
    ' && @request.body.deleted:changed = false && @request.body.pinned:changed = false';
  const dayUpdate = update + ' && @request.body.journal_date:changed = false';
  const name = "idx_notes_user_journal_date_updated_id";
  const columns = "user, journal_date, updated, id";
  // Not partial: the list rule's `deleted = '' OR deleted IS NULL` cannot use a `deleted = ''` index.
  const definition = "CREATE INDEX `" + name + "` ON `notes` (" + columns + ")";
  const existing = notes.getIndex(name);
  const field = notes.fields.getByName("journal_date");
  // The JSVM exposes the nullable Go rules as boxed strings.
  const rules = [String(notes.createRule), String(notes.updateRule)];
  const before = rules[0] === create && rules[1] === update && !existing && !field;
  const after = rules[0] === create && rules[1] === dayUpdate && existing === definition &&
    !!field && field.type() === "text";
  if (!before && !after) throw new Error("Unexpected notes rules, journal_date field or definition of " + name);
  if (forward ? after : before) return;

  if (forward) {
    notes.fields.add(new TextField({ name: "journal_date", max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }));
    notes.addIndex(name, false, columns, "");
    notes.updateRule = dayUpdate;
  } else {
    notes.removeIndex(name);
    notes.fields.removeByName("journal_date");
    notes.updateRule = update;
  }
  app.save(notes);
}

migrate((app) => noteJournalDates(app, true), (app) => noteJournalDates(app, false));
