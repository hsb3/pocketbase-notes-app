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
const email = `capability-${crypto.randomUUID()}@example.com`;
const password = crypto.randomUUID();
const user = await admin
  .collection("users")
  .create({ email, password, passwordConfirm: password, verified: true });
let superuserId = "";
try {
  const client = new PocketBase(url);
  await client.collection("users").authWithPassword(email, password);
  const capability = (token = client.authStore.token) =>
    fetch(`${url}/api/notes/capabilities`, {
      headers: { Authorization: token },
    });
  assert.equal((await capability("")).status, 401);
  assert.equal((await capability(admin.authStore.token)).status, 403);
  assert.deepEqual(await (await capability()).json(), { isAdmin: false });
  superuserId = (
    await admin
      .collection("_superusers")
      .create({ email, password, passwordConfirm: password })
  ).id;
  assert.deepEqual(await (await capability()).json(), { isAdmin: true });
  await admin.collection("users").update(user.id, { verified: false });
  assert.deepEqual(await (await capability()).json(), { isAdmin: false });
  await admin.collection("users").update(user.id, { verified: true });
  await admin.collection("_superusers").delete(superuserId);
  superuserId = "";
  assert.deepEqual(await (await capability()).json(), { isAdmin: false });
  console.log(
    "PASS: capability authentication, verified email association and revocation",
  );
} finally {
  if (superuserId) await admin.collection("_superusers").delete(superuserId);
  await admin.collection("users").delete(user.id);
}
