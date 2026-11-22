// Owner-only change notice on the `notebook-changes` topic (specs/003-live-updates/contracts/notice.md).
function send(app, note) {
  try {
    const data = { id: note.id, folder: note.folder, deleted: !!note.deleted, revision: note.revision };
    if (typeof note.pinned === "boolean") data.pinned = note.pinned;
    if (typeof note.journal_date === "string") data.journal_date = note.journal_date;
    const message = new SubscriptionMessage({ name: "notebook-changes", data: JSON.stringify(data) });
    for (const client of Object.values(app.subscriptionsBroker().clients())) {
      if (!client.hasSubscription("notebook-changes")) continue;
      const auth = client.get("auth");
      if (auth && auth.collection().name === "users" && auth.id === note.user) client.send(message);
    }
  } catch (error) {
    // The write is already committed; a lost notice is caught up on focus or reconnect.
    app.logger().warn("Change notice failed", "note", note.id, "error", String(error));
  }
}

module.exports = { send };
