/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const own = '@request.auth.collectionName = "users" && user = @request.auth.id';
  const immutableOwner = own + ' && @request.body.user:changed = false';
  const ownerId = app.findCollectionByNameOrId("users").id;
  function collection(name, createRule, updateRule, fields, indexes = []) {
    const model = new Collection({
      type: "base", name,
      listRule: own, viewRule: own, deleteRule: own, createRule, updateRule, indexes,
    });
    const id = model.fields.getByName("id");
    id.min = 15;
    id.max = 15;
    id.pattern = "^[a-z0-9]+$";
    model.fields.add(
      new RelationField({ name: "user", collectionId: ownerId, required: true, maxSelect: 1, cascadeDelete: true }),
      ...fields,
      new AutodateField({ name: "created", onCreate: true }),
      new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
    );
    app.save(model);
    return model;
  }
  const folders = collection("folders",
    own + ' && @request.body.is_default:isset = false',
    immutableOwner + ' && @request.body.is_default:changed = false && @request.body.name:changed = false',
    [
      new TextField({ name: "name", required: true, max: 80 }),
      new TextField({ name: "name_key", required: true, max: 240 }),
      new BoolField({ name: "is_default" }),
    ],
    [
      "CREATE UNIQUE INDEX idx_folders_user_name_key ON folders (user, name_key)",
      "CREATE UNIQUE INDEX idx_folders_user_default ON folders (user) WHERE is_default = TRUE",
    ],
  );
  collection("notes", own + ' && @request.body.deleted:isset = false',
    immutableOwner + ' && @request.body.folder:changed = false && @request.body.deleted:changed = false',
    [
      new RelationField({ name: "folder", collectionId: folders.id, maxSelect: 1 }),
      new JSONField({ name: "body", required: true, maxSize: 102400 }),
      new RelationField({ name: "attachments", collectionId: app.findCollectionByNameOrId("attachments").id, maxSelect: 20 }),
      new NumberField({ name: "revision", required: true, onlyInt: true, min: 1 }),
      new DateField({ name: "deleted" }),
      new TextField({ name: "title", max: 160 }),
      new TextField({ name: "text", max: 102400 }),
      new TextField({ name: "search_key", max: 307240 }),
      new NumberField({ name: "open_tasks", onlyInt: true, min: 0 }),
      new JSONField({ name: "tasks", maxSize: 262144 }),
    ],
  );
}, (app) => {
  app.delete(app.findCollectionByNameOrId("notes"));
  app.delete(app.findCollectionByNameOrId("folders"));
});
