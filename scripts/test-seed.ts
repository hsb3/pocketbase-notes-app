import assert from "node:assert/strict";
import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Use a local backend.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
const password = crypto.randomUUID();
const replacement = crypto.randomUUID();
const email = `seed-admin-${crypto.randomUUID()}@example.test`;
const userEmail = `seed-user-${crypto.randomUUID()}@example.test`;
const superuser = await admin
  .collection("_superusers")
  .create({ email, password, passwordConfirm: password });
const user = await admin.collection("users").create({
  email: userEmail,
  password,
  passwordConfirm: password,
  verified: false,
  name: "Preserve this name",
});
async function seed(
  adminPassword: string,
  userPassword: string,
  reset = false,
  overrides: Record<string, string> = {},
) {
  const child = Bun.spawn(
    ["sh", "scripts/seed.sh", ...(reset ? ["--reset-passwords"] : [])],
    {
      env: {
        ...process.env,
        PB_URL: url!,
        VITE_PB_URL: url!,
        PB_EMAIL: email,
        PB_PASSWORD: adminPassword,
        SEED_USER_EMAIL: userEmail,
        SEED_USER_PASSWORD: userPassword,
        ...overrides,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  return { code: await child.exited, output, error };
}
async function login(collection: string, identity: string, secret: string) {
  await new PocketBase(url)
    .collection(collection)
    .authWithPassword(identity, secret);
}
try {
  if (process.env.CONTAINED_SEED_CLI === "1") {
    for (const overrides of [
      { PB_ENCRYPTION_KEY: crypto.randomUUID().replaceAll("-", "") },
      { PB_URL: "http://127.0.0.1:8080" },
    ] as Record<string, string>[]) {
      const refused = await seed(replacement, replacement, true, overrides);
      assert.notEqual(refused.code, 0);
      assert.match(refused.error, /requires the isolated local PocketBase/);
      await login("_superusers", email, password);
    }
  }
  assert.notEqual(
    (await seed(replacement, replacement)).code,
    0,
    "Default seed must not reset an existing superuser",
  );
  await login("_superusers", email, password);
  assert.notEqual(
    (await seed(password, replacement)).code,
    0,
    "Default seed must not reset an existing user",
  );
  await login("users", userEmail, password);
  const first = await seed(password, password);
  assert.equal(first.code, 0, first.error);
  const before = await admin.collection("users").getOne(user.id);
  assert.equal(before.verified, false);
  assert.equal(before.name, "Preserve this name");
  const owned = {
    filter: admin.filter("user = {:id}", { id: user.id }),
    sort: "id",
  };
  const folders = admin.collection("folders");
  const notes = admin.collection("notes");
  const defaults = await folders.getFullList(owned);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].is_default, true);
  const samples = await notes.getFullList(owned);
  assert.equal(samples.length, 3, "Expected three sample notes");
  for (const note of samples) {
    assert.equal(note.folder, defaults[0].id);
    assert.equal(note.body.type, "doc");
    assert.equal(note.title, note.body.content[0].content[0].text);
    assert(note.excerpt.length > 0);
  }
  const manualFolder = await folders.create({
    user: user.id,
    name: "My folder",
  });
  const manual = await notes.create({
    user: user.id,
    folder: manualFolder.id,
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep my note" }],
        },
      ],
    },
  });
  assert.equal((await seed(password, password)).code, 0);
  assert.deepEqual(await admin.collection("users").getOne(user.id), before);
  assert.deepEqual(
    (await notes.getFullList(owned)).filter((note) => note.id !== manual.id),
    samples,
  );
  assert.deepEqual(await notes.getOne(manual.id), manual);
  assert.deepEqual(await folders.getOne(manualFolder.id), manualFolder);
  assert.deepEqual(await folders.getOne(defaults[0].id), defaults[0]);
  for (const note of samples) await notes.delete(note.id);
  const reset = await seed(replacement, replacement, true);
  assert.equal(reset.code, 0, reset.error);
  assert.deepEqual(
    (await notes.getFullList(owned)).map((note) => note.id),
    [manual.id],
    "A manual-only notebook must stay intact on reseed",
  );
  assert.deepEqual(await notes.getOne(manual.id), manual);
  await login("_superusers", email, replacement);
  await login("users", userEmail, replacement);
  await assert.rejects(login("users", userEmail, password));
  await assert.rejects(login("_superusers", email, password));
  const freshEmail = `fresh-admin-${crypto.randomUUID()}@example.test`;
  const freshUserEmail = `fresh-user-${crypto.randomUUID()}@example.test`;
  const fresh = Bun.spawn(["sh", "scripts/seed.sh"], {
    env: {
      ...process.env,
      PB_URL: url!,
      PB_EMAIL: freshEmail,
      PB_PASSWORD: password,
      SEED_USER_EMAIL: freshUserEmail,
      SEED_USER_PASSWORD: password,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  await new Response(fresh.stdout).text();
  const freshError = await new Response(fresh.stderr).text();
  const createdAdmins = await admin.collection("_superusers").getFullList({
    filter: admin.filter("email = {:email}", { email: freshEmail }),
  });
  const createdUsers = await admin.collection("users").getFullList({
    filter: admin.filter("email = {:email}", { email: freshUserEmail }),
  });
  try {
    assert.equal(await fresh.exited, 0, freshError);
    assert.equal(createdAdmins.length, 1);
    assert.equal(createdUsers.length, 1);
    await login("_superusers", freshEmail, password);
    await login("users", freshUserEmail, password);
  } finally {
    for (const row of createdUsers)
      await admin.collection("users").delete(row.id);
    for (const row of createdAdmins)
      await admin.collection("_superusers").delete(row.id);
  }
  console.log(
    "PASS: seed preserves credentials and records by default; explicit reset changes only configured seed accounts",
  );
} finally {
  await admin.collection("users").delete(user.id);
  await admin.collection("_superusers").delete(superuser.id);
}
