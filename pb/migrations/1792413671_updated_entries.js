/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3165375535")

  // add field
  collection.fields.addAt(10, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3073759650",
    "help": "",
    "hidden": false,
    "id": "relation1204091606",
    "maxSelect": 20,
    "minSelect": 0,
    "name": "attachments",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3165375535")

  // remove field
  collection.fields.removeById("relation1204091606")

  return app.save(collection)
})
