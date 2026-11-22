onRecordValidate((e) => {
  const validate = require(`${__hooks}/entry-validation.js`);
  const search = require(`${__hooks}/note-search.js`);
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
  note.set("search_key", search.key(title, text));
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
    const life = require(`${__hooks}/note-lifecycle.js`);
    const current = life.ownedNote(tx, e.record.id, e.record.original().getString("user"));
    const expected = submitted.revision;
    if (expected !== current.revision || expected !== e.record.original().getInt("revision")) {
      throw new ApiError(409, "A newer version was saved. Copy this draft before reloading.");
    }
    life.checkDeleted(tx, current.id, current.deleted);
    if (current.deleted) throw new BadRequestError("A note must be active.");
    e.app = tx;
    e.record.set("revision", expected + 1);
    e.next();
  });
}, "notes");

onRecordViewRequest((e) => {
  const life = require(`${__hooks}/note-lifecycle.js`);
  const current = life.ownedNote(e.app, e.record.id, e.record.getString("user"));
  life.checkDeleted(e.app, current.id, current.deleted);
  e.requestEvent.response.header().set("Cache-Control", "private, no-store");
  e.next();
}, "notes");

onRecordDeleteRequest((e) => {
  if (!e.hasSuperuserAuth()) throw new BadRequestError("Notes cannot be permanently deleted.");
  e.next();
}, "notes");

onRecordEnrich((e) => {
  e.next();
  // List handlers can add custom fields before enrichment. Only server-computed previews are public.
  const privateKeys = Object.keys(e.record.customData() || {}).filter((key) => key !== "excerpt" && key !== "snippet");
  e.record.hide("search_key", ...privateKeys);
}, "notes");

onRecordsListRequest((e) => {
  const query = e.requestInfo().query;
  const search = require(`${__hooks}/note-search.js`);
  const term = Object.prototype.hasOwnProperty.call(query, "searchTerm") ? search.validate(query) : null;
  for (const note of e.records) {
    const text = note.getString("text");
    if (term !== null) {
      note.set("snippet", search.snippet(note.getString("title"), text, term));
      note.withCustomData(true);
      continue;
    }
    const start = text.search(/[\r\n\u2028\u2029]/);
    const body = start < 0 ? "" : text.slice(start + 1).trim().replace(/\s+/g, " ");
    note.set("excerpt", Array.from(body).slice(0, 120).join(""));
    note.withCustomData(true);
  }
  e.next();
}, "notes");

// Runs only after the save committed, so a refused or rolled-back write sends nothing.
function noticeSaved(e) {
  e.next();
  require(`${__hooks}/note-notice.js`).send(e.app, {
    id: e.record.id,
    user: e.record.getString("user"),
    folder: e.record.getString("folder"),
    deleted: e.record.getString("deleted"),
    revision: e.record.getInt("revision"),
    pinned: e.record.getBool("pinned"),
  });
}
onRecordAfterCreateSuccess(noticeSaved, "notes");
onRecordAfterUpdateSuccess(noticeSaved, "notes");
