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
  assert.equal((await seed(password, password)).code, 0);
  const before = await admin.collection("users").getOne(user.id);
  assert.equal(before.verified, false);
  assert.equal(before.name, "Preserve this name");
  const entries = await admin
    .collection("entries")
    .getFullList({ filter: admin.filter("user = {:id}", { id: user.id }) });
  assert(entries.length > 0);
  assert.equal((await seed(password, password)).code, 0);
  assert.deepEqual(await admin.collection("users").getOne(user.id), before);
  assert.deepEqual(
    await admin
      .collection("entries")
      .getFullList({ filter: admin.filter("user = {:id}", { id: user.id }) }),
    entries,
  );
  assert.equal((await seed(replacement, replacement, true)).code, 0);
  await login("_superusers", email, replacement);
  await login("users", userEmail, replacement);
  await assert.rejects(login("users", userEmail, password));
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
