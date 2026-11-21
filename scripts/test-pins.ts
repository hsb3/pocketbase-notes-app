import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

type Account = { pb: PocketBase; id: string };
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const active = 'deleted = ""';
const pinnedFirst = "-pinned,-updated,-id";

async function status(job: Promise<unknown>) {
  try {
    await job;
    return 200;
  } catch (error) {
    assert(error instanceof ClientResponseError, String(error));
    return error.status;
  }
}

export async function pins(
  admin: PocketBase,
  owner: Account,
  other: Account,
  guest: PocketBase,
) {
  const notes = owner.pb.collection("notes");
  const folders = owner.pb.collection("folders");
  const home = (await folders.getFirstListItem("is_default = true")).id;
  const garden = (await folders.create({ user: owner.id, name: "Garden" })).id;
  const make = (text: string, folder = home) =>
    notes.create({ user: owner.id, folder, body: doc(text) });
  // Fixed edit times keep the recency order independent of request timing.
  let clock = 0;
  async function touch(id: string) {
    clock++;
    const stamp = `2026-01-01 00:00:${String(clock).padStart(2, "0")}.000Z`;
    const done = await admin.sql.run(
      `UPDATE notes SET updated='${stamp}' WHERE id='${id}'`,
    );
    assert.equal(done.affectedRows, 1);
  }
  async function row(id: string) {
    assert.match(id, /^[a-z0-9]{15}$/);
    const result = await admin.sql.run(
      `SELECT *,hex(body) AS body_bytes FROM notes WHERE id='${id}'`,
    );
    assert.equal(result.rows.length, 1);
    return Object.fromEntries(
      result.columns.map((c, i) => [c.name, result.rows[0][i]]),
    );
  }
  const send = (id: string, body: unknown, pb = owner.pb) =>
    pb.send(`/api/notebook/notes/${id}/pin`, {
      method: "POST",
      body,
      requestKey: null,
    });
  const ids = (page: { items: { id: string }[] }) =>
    page.items.map((r) => r.id);
  const list = (folder?: string, pb = owner.pb) =>
    pb.collection("notes").getList(1, 20, {
      fields: "id,pinned",
      filter: folder
        ? active + " && " + pb.filter("folder = {:folder}", { folder })
        : active,
      sort: pinnedFirst,
      requestKey: null,
    });
  const pinnedView = (pb = owner.pb) =>
    pb.collection("notes").getList(1, 20, {
      fields: "id,folder",
      filter: active + " && pinned = true",
      sort: "-updated,-id",
      requestKey: null,
    });

  const c = await make("Clover oldest");
  const b = await make("Bramble");
  const a = await make("Aster newest");
  for (const note of [c, b, a]) await touch(note.id);
  assert.equal((await notes.getOne(c.id)).pinned, false);
  assert.deepEqual(ids(await list(home)), [a.id, b.id, c.id]);

  // FR-005, FR-006: pin changes only `pinned`, never revision or the edit time.
  const before = await row(c.id);
  const reply = await send(c.id, { pinned: true });
  assert.deepEqual(reply, {
    id: c.id,
    user: owner.id,
    folder: home,
    deleted: "",
    revision: c.revision,
    pinned: true,
  });
  const after = await row(c.id);
  assert.deepEqual({ ...after, pinned: before.pinned }, before);
  assert.equal((await notes.getOne(c.id)).pinned, true);
  assert.deepEqual(await send(c.id, { pinned: true }), reply);
  assert.deepEqual(await row(c.id), after);
  assert.deepEqual(ids(await list(home)), [c.id, a.id, b.id]);
  assert.deepEqual(ids(await list()), [c.id, a.id, b.id]);

  for (const body of [
    { pinned: "true" },
    {},
    { pinned: true, revision: c.revision },
    [true],
    null,
  ]) {
    assert.equal(await status(send(c.id, body)), 400, JSON.stringify(body));
  }
  assert.equal(
    await status(
      owner.pb.send(`/api/notebook/notes/${c.id}/pin?pinned=false`, {
        method: "POST",
        body: { pinned: false },
      }),
    ),
    400,
  );
  assert.deepEqual(await row(c.id), after);

  // Pinned-group recency follows edits; unpin returns a note to its edit position.
  await send(b.id, { pinned: true });
  const edited = await notes.update(b.id, {
    revision: b.revision,
    body: doc("Bramble edited"),
  });
  assert.equal(edited.revision, b.revision + 1);
  assert.equal(edited.pinned, true);
  await touch(b.id);
  assert.deepEqual(ids(await list(home)), [b.id, c.id, a.id]);
  await send(b.id, { pinned: false });
  assert.deepEqual(ids(await list(home)), [c.id, b.id, a.id]);

  // Story 1.4 and FR-006: a second device sees the same order and is never refused by a pin.
  const device = new PocketBase(owner.pb.baseURL);
  device.autoCancellation(false);
  device.authStore.save(owner.pb.authStore.token, owner.pb.authStore.record);
  assert.deepEqual(ids(await list(home, device)), ids(await list(home)));
  const stale = await device.collection("notes").getOne(a.id);
  assert.equal((await send(a.id, { pinned: true })).revision, stale.revision);
  const saved = await device.collection("notes").update(a.id, {
    revision: stale.revision,
    body: doc("Aster from device two"),
  });
  assert.equal(saved.revision, stale.revision + 1);
  assert.equal((await notes.getOne(a.id)).pinned, true);
  await send(a.id, { pinned: true });
  await send(a.id, { pinned: false }, device);
  assert.equal((await notes.getOne(a.id)).pinned, false);

  // FR-008, FR-009: the ordinary record API can neither create nor change a pin.
  for (const pinned of [true, false]) {
    assert.equal(
      await status(
        notes.create({ user: owner.id, folder: home, body: doc("x"), pinned }),
      ),
      400,
    );
  }
  const current = await notes.getOne(a.id);
  assert.equal(
    await status(
      notes.update(a.id, { revision: current.revision, pinned: true }),
    ),
    404,
  );
  assert.equal((await notes.getOne(a.id)).pinned, false);
  const foreign = await row(c.id);
  const missing = await status(send("z".repeat(15), { pinned: false }));
  assert.equal(missing, 404);
  let message = "";
  await assert.rejects(send(c.id, { pinned: false }, other.pb), (e) => {
    assert(e instanceof ClientResponseError);
    assert.equal(e.status, 404);
    message = e.message;
    return true;
  });
  await assert.rejects(send("z".repeat(15), { pinned: false }), (e) => {
    assert(e instanceof ClientResponseError);
    assert.equal(e.message, message);
    return true;
  });
  assert.equal(await status(send(c.id, { pinned: false }, guest)), 401);
  assert.deepEqual(await row(c.id), foreign);
  assert.equal(await status(other.pb.collection("notes").getOne(c.id)), 404);
  assert.equal((await pinnedView(other.pb)).totalItems, 0);
  assert.equal(
    (await list(undefined, other.pb)).items.some((r) => r.id === c.id),
    false,
  );

  // Search order ignores pins (R4).
  const older = await make("Lumen older");
  const newer = await make("Lumen newer");
  await touch(older.id);
  await touch(newer.id);
  await send(older.id, { pinned: true });
  const hits = await notes.getList(1, 20, {
    fields: "id",
    filter:
      active + " && " + owner.pb.filter("search_key ~ {:p}", { p: "%LUMEN%" }),
    sort: "-updated,-id",
    requestKey: null,
  });
  assert.deepEqual(ids(hits), [newer.id, older.id]);
  await send(older.id, { pinned: false });

  // FR-004: Pinned lists each active pinned note once across folders.
  const g = await make("Gorse in Garden", garden);
  await touch(g.id);
  await send(g.id, { pinned: true });
  const view = await pinnedView();
  assert.deepEqual(
    view.items.map((r) => [r.id, r.folder]),
    [
      [g.id, garden],
      [c.id, home],
    ],
  );

  // Every note pinned: one group in recency order.
  const h = await make("Heather in Garden", garden);
  await touch(h.id);
  await send(h.id, { pinned: true });
  assert.deepEqual(ids(await list(garden)), [h.id, g.id]);

  // FR-007: pin survives move, delete and restore; deleted notes never show.
  const act = async (verb: string, id: string, extra = {}) => {
    const { revision } = await notes.getOne(id);
    return owner.pb.send(`/api/notebook/notes/${id}/${verb}`, {
      method: "POST",
      body: { revision, ...extra },
      requestKey: null,
    });
  };
  await act("move", c.id, { folder: garden });
  assert.equal((await notes.getOne(c.id)).pinned, true);
  assert.deepEqual(ids(await list(garden)), [h.id, g.id, c.id]);
  await act("delete", c.id);
  assert.equal(await status(send(c.id, { pinned: false })), 400);
  assert.equal((await notes.getOne(c.id)).pinned, true);
  assert.equal(ids(await pinnedView()).includes(c.id), false);
  assert.equal(ids(await list()).includes(c.id), false);
  await act("restore", c.id);
  assert.equal((await notes.getOne(c.id)).pinned, true);
  assert.equal(ids(await pinnedView()).filter((id) => id === c.id).length, 1);

  // Folder delete with a pinned member, then restore into Notes.
  const preview = await owner.pb.send<{ snapshot: string }>(
    `/api/notebook/folders/${garden}/delete-preview`,
    { requestKey: null },
  );
  await folders.delete(garden, { query: { snapshot: preview.snapshot } });
  assert.equal(ids(await pinnedView()).length, 0);
  await act("restore", g.id);
  const back = await notes.getOne(g.id);
  assert.deepEqual([back.folder, back.pinned], [home, true]);
  assert.deepEqual(ids(await pinnedView()), [g.id]);
  console.log("Pins", { c: c.id, b: b.id, a: a.id, g: g.id, h: h.id, message });
}
