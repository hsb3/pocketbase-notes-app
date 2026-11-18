onRecordValidate((e) => {
  const name = e.record.getString("name").trim();
  const key = require(`${__hooks}/comparison-key.js`)(name);
  const isDefault = e.record.getBool("is_default");
  if (isDefault) {
    if (name !== "Notes") throw new BadRequestError("The default folder must be named Notes.");
  } else if (["NOTES", "ALL NOTES", "PINNED", "JOURNAL", "OPEN TASKS", "RECENTLY DELETED"].includes(key)) {
    throw new BadRequestError("This folder name is reserved.");
  }
  if (!e.record.isNew()) {
    const original = e.record.original();
    if (original.getBool("is_default") !== isDefault || original.getString("user") !== e.record.getString("user")) {
      throw new BadRequestError("Folder ownership and default status are permanent.");
    }
  }
  e.record.set("name", name);
  e.record.set("name_key", key);
  e.next();
}, "folders");

onRecordCreateExecute((e) => {
  const app = e.app;
  app.runInTransaction((tx) => {
    e.app = tx;
    try {
      e.next();
    } finally {
      e.app = app;
    }
    const folder = new Record(tx.findCollectionByNameOrId("folders"));
    folder.set("user", e.record.id);
    folder.set("name", "Notes");
    folder.set("is_default", true);
    tx.save(folder);
  });
}, "users");

onRecordDeleteRequest((e) => {
  e.app.runInTransaction((tx) => {
    const folder = tx.findRecordById("folders", e.record.id);
    if (folder.getBool("is_default")) throw new BadRequestError("The Notes folder is permanent.");
    if (tx.findRecordsByFilter("notes", "folder = {:folder}", "", 1, 0, { folder: folder.id }).length) {
      throw new BadRequestError("Only an empty folder can be deleted.");
    }
    e.app = tx;
    e.next();
  });
}, "folders");
