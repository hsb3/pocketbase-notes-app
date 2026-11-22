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

  console.log("Journal", {
    n: n.id,
    composed: composed.id,
    message,
    garden,
    active,
  });
}
