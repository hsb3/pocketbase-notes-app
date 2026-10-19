onRecordValidate((e) => {
  const validate = require(`${__hooks}/entry-validation.js`);
  try {
    const attachments = e.record.getStringSlice("attachments");
    const images = validate.body(JSON.parse(e.record.getString("body")), attachments.length > 0);
    if (images.some((id) => !attachments.includes(id))) throw new Error("An embedded image is missing its attachment.");
    for (const id of attachments) {
      const attachment = e.app.findRecordById("attachments", id);
      if (attachment.getString("user") !== e.record.getString("user")) throw new Error("Attachment is unavailable.");
    }
    validate.date(e.record.getString("kind"), e.record.getString("journal_date"));
  } catch (error) {
    throw new BadRequestError(String(error.message || error));
  }
  e.next();
}, "entries");

onRecordCreateRequest((e) => {
  e.app.runInTransaction((tx) => {
    e.app = tx;
    e.record.set("revision", 1);
    e.next();
  });
}, "entries");

onRecordUpdateRequest((e) => {
  // Read and write under the same writer transaction so concurrent saves cannot both win.
  e.app.runInTransaction((tx) => {
    const current = tx.findRecordById("entries", e.record.id);
    const expected = e.requestInfo().body.revision;
    if (typeof expected !== "number" || current.getInt("revision") !== expected) {
      throw new ApiError(409, "A newer version was saved. Copy this draft before reloading.");
    }
    e.app = tx;
    e.record.set("revision", expected + 1);
    e.next();
  });
}, "entries");
