onRecordValidate((e) => {
  const validate = require(`${__hooks}/entry-validation.js`);
  const comparisonKey = require(`${__hooks}/comparison-key.js`);
  const note = e.record;
  const user = note.getString("user");
  const folder = note.getString("folder");
  if (!note.isNew()) {
    const original = note.original();
    if (original.getString("user") !== user || original.getString("folder") !== folder) {
      throw new BadRequestError("Note ownership and folder cannot change.");
    }
  }
  if (note.getString("deleted")) throw new BadRequestError("A note must be active.");
  if (!e.app.findRecordsByFilter("folders", "id = {:folder} && user = {:user}", "", 1, 0, { folder, user }).length) {
    throw new BadRequestError("Choose one of your folders.");
  }
  const attachments = note.getStringSlice("attachments");
  if (attachments.length) {
    const files = e.app.findRecordsByIds("attachments", attachments);
    if (files.length !== attachments.length || files.some((file) => file.getString("user") !== user)) {
      throw new BadRequestError("Attachment is unavailable.");
    }
  }
  let doc;
  try {
    doc = JSON.parse(note.getString("body"));
    const images = validate.body(doc, attachments.length > 0);
    if (images.some((id) => !attachments.includes(id))) throw new Error("An embedded image is missing its attachment.");
  } catch (error) {
    throw new BadRequestError(String(error.message || error));
  }

  const text = validate.visibleText(doc);
  const first = text.split(/[\r\n\u2028\u2029]/, 1)[0];
  const blank = !first.trim();
  const title = blank ? "Untitled note" : Array.from(first).slice(0, 160).join("");
  note.set("title", title);
  note.set("text", text);
  const searchable = blank ? [title, text].filter(Boolean).join("\n") : text;
  note.set("search_key", comparisonKey(searchable));
  const tasks = validate.tasks(doc);
  note.set("open_tasks", tasks.count);
  note.set("tasks", tasks.open);
  e.next();
}, "notes");

onRecordCreateRequest((e) => {
  e.app.runInTransaction((tx) => {
    e.app = tx;
    e.record.set("revision", 1);
    e.next();
  });
}, "notes");

onRecordUpdateRequest((e) => {
  // requestInfo().body already contains resolved modifiers; read the client's actual precondition.
  const submitted = new DynamicModel({ revision: 0 });
  try {
    e.bindBody(submitted);
  } catch {
    throw new ApiError(409, "A current numeric revision is required.");
  }
  e.app.runInTransaction((tx) => {
    const current = tx.findRecordById("notes", e.record.id);
    const expected = submitted.revision;
    if (expected !== current.getInt("revision") || expected !== e.record.original().getInt("revision")) {
      throw new ApiError(409, "A newer version was saved. Copy this draft before reloading.");
    }
    e.app = tx;
    e.record.set("revision", expected + 1);
    e.next();
  });
}, "notes");

onRecordDeleteRequest((e) => {
  if (!e.hasSuperuserAuth()) throw new BadRequestError("Notes cannot be permanently deleted.");
  e.next();
}, "notes");

onRecordEnrich((e) => {
  e.record.hide("search_key");
  e.next();
}, "notes");

onRecordsListRequest((e) => {
  for (const note of e.records) {
    const text = note.getString("text");
    const start = text.search(/[\r\n\u2028\u2029]/);
    const body = start < 0 ? "" : text.slice(start + 1).trim().replace(/\s+/g, " ");
    // Enabling custom data would otherwise serialize every custom key.
    note.hide(...Object.keys(note.customData() || {}));
    note.set("excerpt", Array.from(body).slice(0, 120).join(""));
    note.unhide("excerpt");
    note.withCustomData(true);
  }
  e.next();
}, "notes");
