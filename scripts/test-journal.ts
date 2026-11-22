import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

type Account = { pb: PocketBase; id: string };
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const active = 'deleted = ""';

async function status(job: Promise<unknown>) {
  try {
    await job;
    return 200;
  } catch (error) {
    assert(error instanceof ClientResponseError, String(error));
    return error.status;
  }
}

export async function journal(
  admin: PocketBase,
  owner: Account,
  other: Account,
  guest: PocketBase,
) {
  const notes = owner.pb.collection("notes");
  const folders = owner.pb.collection("folders");
  const home = (await folders.getFirstListItem("is_default = true")).id;
  const garden = (await folders.create({ user: owner.id, name: "Garden" })).id;
  const make = (text: string, folder = home, extra = {}) =>
    notes.create({ user: owner.id, folder, body: doc(text), ...extra });
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
    pb.send(`/api/notebook/notes/${id}/date`, {
      method: "POST",
      body,
      requestKey: null,
    });

  // FR-001: a new note has no day; create may carry a valid one (compose from Journal).
  const n = await make("Nettle");
  assert.equal((await row(n.id)).journal_date, "");
  assert.equal(
    (await make("Empty day", home, { journal_date: "" })).journal_date,
    "",
  );
  const composed = await make("Composed", home, { journal_date: "2026-11-21" });
  assert.equal((await row(composed.id)).journal_date, "2026-11-21");
  const count = async () =>
    (await admin.sql.run("SELECT count(*) AS n FROM notes")).rows[0][0];
  const total = await count();
  for (const journal_date of ["2026-02-31", "2026-1-5", "10000-01-01", "x"]) {
    assert.equal(
      await status(make("Bad day", home, { journal_date })),
      400,
      journal_date,
    );
  }
  assert.equal(await count(), total);

  // FR-006, FR-007: set, change and remove change only the day, never revision or edit time.
  const before = await row(n.id);
  const reply = (journal_date: string) => ({
    id: n.id,
    user: owner.id,
    folder: home,
    deleted: "",
    revision: n.revision,
    journal_date,
  });
  for (const day of [
    "2026-11-21",
    "2026-11-19",
    "0001-01-01",
    "9999-12-31",
    "",
  ]) {
    assert.deepEqual(await send(n.id, { journal_date: day }), reply(day));
    assert.deepEqual(await row(n.id), { ...before, journal_date: day });
    assert.equal((await notes.getOne(n.id)).journal_date, day);
  }
  await send(n.id, { journal_date: "2026-11-21" });
  const dated = await row(n.id);
  // A same-value request succeeds and writes nothing.
  assert.deepEqual(
    await send(n.id, { journal_date: "2026-11-21" }),
    reply("2026-11-21"),
  );
  assert.deepEqual(await row(n.id), dated);

  // FR-011: only real days, as one exact key; the stored day is kept.
  for (const body of [
    { journal_date: "2026-02-31" },
    { journal_date: "2026-1-5" },
    { journal_date: "10000-01-01" },
    { journal_date: "0000-12-31" },
    { journal_date: 20261121 },
    { journal_date: null },
    {},
    { journal_date: "2026-11-20", revision: n.revision },
    { pinned: true },
    ["2026-11-20"],
    null,
  ]) {
    assert.equal(await status(send(n.id, body)), 400, JSON.stringify(body));
  }
  assert.equal(
    await status(
      owner.pb.send(`/api/notebook/notes/${n.id}/date?journal_date=`, {
        method: "POST",
        body: { journal_date: "" },
      }),
    ),
    400,
  );
  const plain = await fetch(
    new URL(`/api/notebook/notes/${n.id}/date`, owner.pb.baseURL),
    {
      method: "POST",
      headers: {
        Authorization: owner.pb.authStore.token,
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({ journal_date: "" }),
    },
  );
  assert.equal(plain.status, 400);
  assert.deepEqual(await row(n.id), dated);

  // FR-012: the ordinary record API cannot change a day; resending the same value is allowed.
  assert.equal(
    await status(
      notes.update(n.id, { revision: n.revision, journal_date: "2026-11-20" }),
    ),
    404,
  );
  assert.equal((await row(n.id)).journal_date, "2026-11-21");
  const resaved = await notes.update(n.id, {
    revision: n.revision,
    body: doc("Nettle edited"),
    journal_date: "2026-11-21",
  });
  assert.deepEqual(
    [resaved.revision, resaved.journal_date],
    [n.revision + 1, "2026-11-21"],
  );

  // FR-012: another account gets the same 404 as a missing note; a guest gets 401.
  const foreign = await row(n.id);
  let message = "";
  await assert.rejects(send(n.id, { journal_date: "" }, other.pb), (e) => {
    assert(e instanceof ClientResponseError);
    assert.equal(e.status, 404);
    message = e.message;
    return true;
  });
  await assert.rejects(send("z".repeat(15), { journal_date: "" }), (e) => {
    assert(e instanceof ClientResponseError);
    assert.equal(e.status, 404);
    assert.equal(e.message, message);
    return true;
  });
  assert.equal(await status(send(n.id, { journal_date: "" }, guest)), 401);
  assert.deepEqual(await row(n.id), foreign);
  assert.equal(await status(other.pb.collection("notes").getOne(n.id)), 404);

  // FR-007, SC-005: a day set on one device never refuses a save on another; last change wins.
  const device = new PocketBase(owner.pb.baseURL);
  device.autoCancellation(false);
  device.authStore.save(owner.pb.authStore.token, owner.pb.authStore.record);
  const stale = await device.collection("notes").getOne(n.id);
  assert.equal(
    (await send(n.id, { journal_date: "2026-10-01" })).revision,
    stale.revision,
  );
  const saved = await device.collection("notes").update(n.id, {
    revision: stale.revision,
    body: doc("Nettle from device two"),
  });
  assert.equal(saved.revision, stale.revision + 1);
  assert.equal(saved.journal_date, "2026-10-01");
  await send(n.id, { journal_date: "2026-10-02" }, device);
  await send(n.id, { journal_date: "2026-10-03" });
  assert.equal((await row(n.id)).journal_date, "2026-10-03");
  await send(n.id, { journal_date: "" }, device);
  assert.equal((await row(n.id)).journal_date, "");

  // FR-003: Journal lists each active dated note once across folders, newest day first,
  // most recently edited first within a day; pin does not lift a note.
  let clock = 0;
  async function touch(id: string) {
    clock++;
    const stamp = `2026-01-01 00:00:${String(clock).padStart(2, "0")}.000Z`;
    const done = await admin.sql.run(
      `UPDATE notes SET updated='${stamp}' WHERE id='${id}'`,
    );
    assert.equal(done.affectedRows, 1);
  }
  const ids = (page: { items: { id: string }[] }) =>
    page.items.map((r) => r.id);
  const journalView = (pb = owner.pb) =>
    pb.collection("notes").getList(1, 20, {
      fields: "id,folder,journal_date,pinned",
      filter: active + ' && journal_date != ""',
      sort: "-journal_date,-updated,-id",
      requestKey: null,
    });
  const dayView = (day: string, pb = owner.pb) =>
    pb.collection("notes").getList(1, 20, {
      fields: "id,folder,journal_date",
      filter: active + " && " + pb.filter("journal_date = {:day}", { day }),
      sort: "-updated,-id",
      requestKey: null,
    });
  const folderList = (folder?: string) =>
    notes.getList(1, 20, {
      fields: "id",
      filter: folder
        ? active + " && " + owner.pb.filter("folder = {:folder}", { folder })
        : active,
      sort: "-pinned,-updated,-id",
      requestKey: null,
    });
  await admin.sql.run(
    `UPDATE notes SET journal_date='' WHERE user='${owner.id}'`,
  );
  const older = await make("Older day in Notes");
  const early = await make("Same day, edited first", garden);
  const late = await make("Same day, edited last");
  const newest = await make("Newest day in Garden", garden);
  const undated = await make("Undated");
  const seeded = [older, early, late, newest, undated].map((n) => n.id);
  for (const id of seeded) await touch(id);
  await send(older.id, { journal_date: "2026-11-19" });
  await send(early.id, { journal_date: "2026-11-20" });
  await send(late.id, { journal_date: "2026-11-20" });
  await send(newest.id, { journal_date: "2026-11-21" });
  await owner.pb.send(`/api/notebook/notes/${early.id}/pin`, {
    method: "POST",
    body: { pinned: true },
    requestKey: null,
  });
  const view = await journalView();
  assert.deepEqual(
    view.items.map((r) => [r.id, r.folder, r.journal_date]),
    [
      [newest.id, garden, "2026-11-21"],
      [late.id, home, "2026-11-20"],
      [early.id, garden, "2026-11-20"],
      [older.id, home, "2026-11-19"],
    ],
  );
  assert.equal(view.items[2].pinned, true);
  // Folder lists, All Notes and search keep their R7 and R4 order: a day never reorders them.
  assert.deepEqual(ids(await folderList(garden)), [early.id, newest.id]);
  assert.deepEqual(
    ids(await folderList()).filter((id) => seeded.includes(id)),
    [early.id, undated.id, newest.id, late.id, older.id],
  );
  const hits = await notes.getList(1, 20, {
    query: { searchTerm: "day" },
    fields: "id,folder,title,updated,snippet",
    filter:
      active + " && " + owner.pb.filter("search_key ~ {:p}", { p: "%DAY%" }),
    sort: "-updated,-id",
    requestKey: null,
  });
  assert.deepEqual(
    ids(hits).filter((id) => seeded.includes(id)),
    [newest.id, late.id, early.id, older.id],
  );
  for (const hit of hits.items)
    assert.deepEqual(Object.keys(hit).sort(), [
      "folder",
      "id",
      "snippet",
      "title",
      "updated",
    ]);

  // FR-004: one day lists only that day's notes; an empty day lists none.
  assert.deepEqual(ids(await dayView("2026-11-20")), [late.id, early.id]);
  assert.equal((await dayView("2026-11-22")).totalItems, 0);

  // FR-012: another account sees none of these days.
  assert.equal((await journalView(other.pb)).totalItems, 0);
  assert.equal((await dayView("2026-11-20", other.pb)).totalItems, 0);

  // FR-008: the day survives pin, move, delete and restore; deleted notes never show.
  const act = async (verb: string, id: string, extra = {}) => {
    const { revision } = await notes.getOne(id);
    return owner.pb.send(`/api/notebook/notes/${id}/${verb}`, {
      method: "POST",
      body: { revision, ...extra },
      requestKey: null,
    });
  };
  const day = async (id: string) => (await row(id)).journal_date;
  await owner.pb.send(`/api/notebook/notes/${older.id}/pin`, {
    method: "POST",
    body: { pinned: true },
    requestKey: null,
  });
  assert.equal(await day(older.id), "2026-11-19");
  await act("move", older.id, { folder: garden });
  assert.equal(await day(older.id), "2026-11-19");
  await act("delete", older.id);
  assert.equal(await day(older.id), "2026-11-19");
  assert.equal(
    await status(send(older.id, { journal_date: "2026-11-18" })),
    400,
  );
  assert.equal(await day(older.id), "2026-11-19");
  assert.equal(ids(await journalView()).includes(older.id), false);
  assert.equal(ids(await dayView("2026-11-19")).includes(older.id), false);
  await act("restore", older.id);
  assert.equal(await day(older.id), "2026-11-19");
  assert.equal(
    ids(await journalView()).filter((id) => id === older.id).length,
    1,
  );

  // Folder delete with a dated member, then restore into Notes.
  const preview = await owner.pb.send<{ snapshot: string }>(
    `/api/notebook/folders/${garden}/delete-preview`,
    { requestKey: null },
  );
  await folders.delete(garden, { query: { snapshot: preview.snapshot } });
  assert.deepEqual(ids(await journalView()), [late.id]);
  await act("restore", newest.id);
  const back = await notes.getOne(newest.id);
  assert.deepEqual([back.folder, back.journal_date], [home, "2026-11-21"]);
  assert.deepEqual(ids(await journalView()), [newest.id, late.id]);

  console.log("Journal", {
    n: n.id,
    composed: composed.id,
    message,
    view: ids(view),
  });
}
