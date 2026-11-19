migrate((app) => {
  app.delete(app.findCollectionByNameOrId("pbc_3165375535"));
}, () => {
  throw new Error("Restore the pre-R2 backup with the matching app revision to recover entries.");
});
