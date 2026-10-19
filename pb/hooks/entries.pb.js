onRecordValidate((e) => {
  const validate = require(`${__hooks}/entry-validation.js`);
  try {
    validate.body(JSON.parse(e.record.getString("body")));
    validate.date(e.record.getString("kind"), e.record.getString("journal_date"));
  } catch (error) {
    throw new BadRequestError(String(error.message || error));
  }
  e.next();
}, "entries");

onRecordCreateRequest((e) => {
  e.record.set("revision", 1);
  e.next();
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
