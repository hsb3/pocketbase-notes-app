import assert from "node:assert/strict";
import type PocketBase from "pocketbase";

export async function markRetained(admin: PocketBase, id: string) {
  assert.equal(process.env.CONTAINED_TEST, "1");
  assert.match(id, /^[a-z0-9]{15}$/);
  const result = await admin.sql.run(
    `UPDATE notes SET deleted = strftime('%Y-%m-%d %H:%M:%fZ','now','-1 day') WHERE id = '${id}'`,
  );
  assert.equal(result.affectedRows, 1);
  const { deleted } = await admin.collection("notes").getOne(id);
  assert.match(deleted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  return deleted as string;
}

export async function noteActions(
  admin: PocketBase,
  owner: PocketBase,
  draft: { user: string; folder: string; body: unknown },
) {
  const notes = owner.collection("notes");
  const { user, folder, body } = draft;
  const active = await notes.create({ user, folder, body });
  const removed = await notes.create({ user, folder, body });
  const list = () => notes.getList(1, 20, { fields: "id" });
  const before = await list();
  assert.equal(before.totalItems, 2);
  assert.deepEqual(
    before.items.map((r) => r.id).sort(),
    [active.id, removed.id].sort(),
  );
  const stamp = await markRetained(admin, removed.id);
  const detail = await notes.getOne(removed.id);
  assert.deepEqual([detail.user, detail.deleted], [user, stamp]);
  assert.equal((await notes.getOne(active.id)).deleted, "");
  const after = await list();
  console.log("Unfiltered owner list", {
    active: active.id,
    deleted: removed.id,
    stamp,
    before: before.items,
    after: after.items,
  });
  assert.deepEqual(after.items, [{ id: active.id }]);
  assert.equal(after.totalItems, 1);
}
