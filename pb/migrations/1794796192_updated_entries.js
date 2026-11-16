/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3165375535")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_entries_user_updated ON entries (user, updated)",
      "CREATE INDEX idx_entries_journal ON entries (user, kind, journal_date)",
      "CREATE INDEX idx_entries_open_tasks ON entries (user, open_tasks)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "number468010385",
    "max": null,
    "min": 0,
    "name": "open_tasks",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "json1347970455",
    "maxSize": 32768,
    "name": "tasks",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3165375535")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_entries_user_updated ON entries (user, updated)",
      "CREATE INDEX idx_entries_journal ON entries (user, kind, journal_date)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("number468010385")

  // remove field
  collection.fields.removeById("json1347970455")

  return app.save(collection)
})
