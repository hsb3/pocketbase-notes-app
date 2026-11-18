import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

const url = process.env.TEST_PB_URL || process.env.VITE_PB_URL;
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Run only against a local HTTP development backend.",
);
assert(process.env.PB_EMAIL && process.env.PB_PASSWORD);
function client() {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.afterSend = (response, data, options?: { method?: string }) => {
    if (response.ok)
      assert.equal(response.status, options?.method === "DELETE" ? 204 : 200);
    return data;
  };
  return pb;
}
const admin = client();
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
const anonymous = client();
const users = admin.collection("users");
const accounts: string[] = [];
const credentials = () => {
  const password = crypto.randomUUID();
  return {
    email: `folders-${crypto.randomUUID()}@example.com`,
    password,
    passwordConfirm: password,
  };
};
async function account() {
  const data = credentials();
  const { id } = await users.create({ ...data, verified: true });
  accounts.push(id);
  const pb = client();
  await pb.collection("users").authWithPassword(data.email, data.password);
  return { pb, id };
}
async function denied(request: Promise<unknown>, status: number) {
  await assert.rejects(
    request,
    (err) => err instanceof ClientResponseError && err.status === status,
  );
}
async function defaultFolder(user: string) {
  const folders = await admin.collection("folders").getFullList({
    filter: admin.filter("user = {:user} && is_default = true", { user }),
  });
  assert.equal(folders.length, 1, "Expected exactly one default folder");
  assert.equal(folders[0].name, "Notes");
  assert.equal(folders[0].name_key, "NOTES");
  return folders[0];
}

async function provisioning(a: Awaited<ReturnType<typeof account>>) {
  const folder = await defaultFolder(a.id);
  const folders = a.pb.collection("folders");
  await denied(folders.delete(folder.id), 400);
  await denied(folders.update(folder.id, { name: "Renamed" }), 404);
  await denied(folders.update(folder.id, { is_default: false }), 404);
  assert.equal((await defaultFolder(a.id)).id, folder.id);

  const data = credentials();
  const signup = anonymous
    .collection("users")
    .create(data)
    .then((user) => {
      accounts.push(user.id);
      return user;
    });
  if (process.env.VITE_SIGNUP_ENABLED === "true") {
    await defaultFolder((await signup).id);
    console.log("PASS public signup receives one Notes folder");
  } else {
    await denied(signup, 403);
    console.log("PASS public signup disabled (403)");
  }
  const seed = credentials();
  try {
    const run = Bun.spawn(["bun", "scripts/seed.ts"], {
      env: {
        ...process.env,
        PB_URL: url,
        SEED_USER_EMAIL: seed.email,
        SEED_USER_PASSWORD: seed.password,
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    assert.equal(await run.exited, 0, "Synthetic seed failed");
    const user = await users.getFirstListItem(
      admin.filter("email = {:email}", seed),
    );
    await defaultFolder(user.id);
  } finally {
    for (const user of await users.getFullList({
      filter: admin.filter("email = {:email}", seed),
    })) {
      await users.delete(user.id);
    }
  }
  console.log(
    "PASS seeded and administrative accounts receive one protected Notes folder",
  );
}

// The contained runner gives this schema fault its own disposable database.
async function rollback() {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 15);
  const data = { ...credentials(), id };
  const creator =
    process.env.VITE_SIGNUP_ENABLED === "true" ? anonymous : admin;
  const schema = await admin.collections.getOne("folders");
  const fields = schema.fields.map((f) =>
    f.name === "name" ? { ...f, pattern: "^Fixture$" } : f,
  );
  await admin.collections.update(schema.id, { fields });
  try {
    await denied(
      creator
        .collection("users")
        .create(data)
        .then((user) => accounts.push(user.id)),
      400,
    );
    await denied(users.getOne(id), 404);
  } finally {
    await admin.collections.update(schema.id, { fields: schema.fields });
  }
  const user = await creator.collection("users").create(data);
  accounts.push(user.id);
  await defaultFolder(user.id);
  console.log(
    "PASS default insertion failure rolls back account (400, read-back 404), retry succeeds",
  );
}

type Account = Awaited<ReturnType<typeof account>>;
async function folderAccess(a: Account, b: Account) {
  const folders = a.pb.collection("folders");
  const data = { user: a.id, name: "  Field Notes  ", name_key: "forged" };
  const folder = await folders.create(data);
  assert.equal(folder.name, "Field Notes");
  assert.equal(folder.name_key, "FIELD NOTES");
  assert.equal(folder.is_default, false);
  const filter = a.pb.filter("id = {:id}", folder);
  assert.deepEqual(
    (await folders.getList(1, 1, { filter })).items.map((r) => r.id),
    [folder.id],
  );
  assert.equal((await folders.getOne(folder.id)).user, a.id);
  assert.equal(
    (await folders.update(folder.id, { name: folder.name, name_key: "fake" }))
      .name_key,
    "FIELD NOTES",
  );
  for (const other of [b.pb, anonymous]) {
    const foreign = other.collection("folders");
    assert.equal((await foreign.getList(1, 1, { filter })).totalItems, 0);
    await denied(foreign.getOne(folder.id), 404);
    await denied(foreign.create({ ...data, name: "Foreign" }), 400);
    await denied(foreign.update(folder.id, { name: folder.name }), 404);
    await denied(foreign.delete(folder.id), 404);
  }
  await denied(folders.update(folder.id, { user: b.id }), 404);
  await denied(folders.update(folder.id, { "user+": b.id }), 404);
  await denied(folders.update(folder.id, { is_default: true }), 404);
  await denied(folders.update(folder.id, { name: "Renamed" }), 404);
  await denied(
    folders.create({ user: a.id, name: "Second default", is_default: true }),
    400,
  );
  const unchanged = await folders.getOne(folder.id);
  assert.deepEqual(
    [unchanged.user, unchanged.name, unchanged.is_default],
    [a.id, folder.name, false],
  );
  assert.equal(await folders.delete(folder.id), true);
  await denied(folders.getOne(folder.id), 404);
  console.log(
    "PASS folder CRUD: owner 200/204, B and anonymous list 200 (empty), view/update/delete 404, forged create 400",
  );
}

async function nonemptyFolder(a: Account) {
  const folders = a.pb.collection("folders");
  const folder = await folders.create({
    user: a.id,
    name: "Documents",
    name_key: "DOCUMENTS",
  });
  const note = await admin.collection("notes").create({
    user: a.id,
    folder: folder.id,
    revision: 1,
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Fixture" }] },
      ],
    },
  });
  await denied(folders.delete(folder.id), 400);
  assert.equal(
    (await admin.collection("notes").getOne(note.id)).folder,
    folder.id,
  );
  await admin.collection("notes").delete(note.id);
  assert.equal(await folders.delete(folder.id), true);
  console.log(
    "PASS nonempty folder delete 400 with reference preserved; empty delete 204",
  );
}

async function folderNames(a: Account, b: Account) {
  const folders = a.pb.collection("folders");
  const create = (name: string) => folders.create({ user: a.id, name });
  for (const name of [
    " notes ",
    "All NOTES",
    "pinned",
    "JOURNAL",
    "open tasks",
    "recently deleted",
    "  ",
    "🥕".repeat(81),
  ]) {
    await denied(create(name), 400);
  }
  assert.equal((await create("🥕".repeat(80))).name, "🥕".repeat(80));
  const first = await create(" Café ");
  assert.equal(first.name, "Café");
  assert.equal(first.name_key, "CAFÉ");
  for (const name of ["CAFÉ", "Cafe\u0301"]) await denied(create(name), 400);
  assert.equal((await create("Cafe")).name_key, "CAFE");
  assert.equal(
    (
      await b.pb
        .collection("folders")
        .create({ user: b.id, name: "Cafe\u0301" })
    ).name,
    "Cafe\u0301",
  );
  const race = await Promise.allSettled(["Москва", "МОСКВА"].map(create));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.find((r) => r.status === "rejected")?.reason.status, 400);
  assert.equal(
    (await folders.getList(1, 2, { filter: 'name_key = "МОСКВА"' })).totalItems,
    1,
  );
  console.log(
    "PASS reserved names, 80 Unicode code points, accented NFC/case, unaccented distinction, cross-owner names, concurrent Cyrillic uniqueness",
  );
}

try {
  const a = await account();
  const b = await account();
  // Run independent cases even on the pre-hook schema to keep each failure visible.
  const failures: string[] = [];
  for (const [label, run] of [
    ["folder access", () => folderAccess(a, b)],
    ["nonempty folder", () => nonemptyFolder(a)],
    ["folder names", () => folderNames(a, b)],
    ["default provisioning", () => provisioning(a)],
    ...(process.env.CONTAINED_TEST === "1"
      ? [["default rollback", rollback] as const]
      : []),
  ] as const) {
    try {
      await run();
    } catch (error) {
      failures.push(label);
      console.error(
        `FAIL ${label}`,
        error instanceof ClientResponseError
          ? [error.status, error.message, error.response.data]
          : String(error),
      );
    }
  }
  assert.deepEqual(failures, []);
} finally {
  for (const id of accounts) await users.delete(id);
}
