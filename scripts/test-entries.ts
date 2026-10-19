import assert from "node:assert/strict";
import PocketBase from "pocketbase";

const url = process.env.TEST_PB_URL || process.env.VITE_PB_URL;
assert(
  url && process.env.PB_EMAIL && process.env.PB_PASSWORD,
  "Configure the backend and superuser credentials.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
const accounts: string[] = [];
const clients: PocketBase[] = [];
async function denied(promise: Promise<unknown>, status?: number) {
  await assert.rejects(promise, (error: unknown) => {
    const code = (error as { status: number }).status;
    return status ? code === status : code >= 400;
  });
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `entries-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID();
    const user = await admin
      .collection("users")
      .create({ email, password, passwordConfirm: password, verified: true });
    accounts.push(user.id);
    const client = new PocketBase(url);
    client.autoCancellation(false);
    await client.collection("users").authWithPassword(email, password);
    clients.push(client);
  }
  const [alice, bob] = clients;
  const anonymous = new PocketBase(url);
  const body = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A quiet morning", marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
  const data = {
    user: accounts[0],
    kind: "journal",
    title: "Morning",
    body,
    journal_date: "2026-10-19",
    favorite: false,
    revision: 1,
  };
  const entry = await alice.collection("entries").create(data);
  assert.deepEqual(
    (await alice.collection("entries").getOne(entry.id)).body,
    body,
  );
  assert.equal(
    (await alice.collection("entries").getList(1, 20)).totalItems,
    1,
  );
  for (const client of [bob, anonymous]) {
    assert.equal(
      (await client.collection("entries").getList(1, 20)).totalItems,
      0,
    );
    await denied(client.collection("entries").getOne(entry.id));
    await denied(
      client
        .collection("entries")
        .update(entry.id, { title: "Intrusion", revision: 1 }),
    );
    await denied(client.collection("entries").delete(entry.id));
    await denied(client.collection("entries").create(data));
  }
  await denied(
    alice
      .collection("entries")
      .update(entry.id, { user: accounts[1], revision: 1 }),
  );
  await denied(
    alice
      .collection("entries")
      .update(entry.id, { kind: "note", journal_date: "", revision: 1 }),
  );
  await denied(
    alice.collection("entries").update(entry.id, {
      body: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "https://example.com" } }],
      },
      revision: 1,
    }),
  );
  await denied(
    alice
      .collection("entries")
      .update(entry.id, { journal_date: "2026-02-30", revision: 1 }),
  );
  await denied(
    alice.collection("entries").update(entry.id, {
      body: { type: "doc", content: [{ type: "paragraph" }] },
      revision: 1,
    }),
  );
  const saves = await Promise.allSettled(
    ["First", "Second"].map((title) =>
      alice
        .collection("entries")
        .update(entry.id, { title, revision: 1, favorite: true }),
    ),
  );
  assert.equal(
    saves.filter((r) => r.status === "fulfilled").length,
    1,
    "Exactly one concurrent save must win",
  );
  const failure = saves.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(failure.reason.status, 409);
  const saved = await alice.collection("entries").getOne(entry.id);
  assert.equal(saved.revision, 2);
  assert.equal(saved.favorite, true);
  await denied(
    alice
      .collection("entries")
      .update(entry.id, { title: "Stale", revision: 1 }),
    409,
  );
  assert.equal(
    (
      await alice.collection("entries").getList(1, 20, {
        filter: alice.filter("favorite = true && journal_date = {:date}", {
          date: "2026-10-19",
        }),
      })
    ).totalItems,
    1,
  );
  await alice.collection("entries").delete(entry.id);
  await denied(alice.collection("entries").getOne(entry.id), 404);
  console.log(
    "PASS: persistence, ownership, spoofing, validation, concurrent saves, filters and deletion",
  );
} finally {
  for (const id of accounts) await admin.collection("users").delete(id);
}
