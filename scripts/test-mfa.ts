import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Run only against the local development backend.",
);
const mailpit = process.env.MAILPIT_URL || "http://127.0.0.1:8025";
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);

const created: string[] = [];
async function account(verified = true) {
  const email = `mfa-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const record = await admin
    .collection("users")
    .create({ email, password, passwordConfirm: password, verified });
  created.push(record.id);
  const client = new PocketBase(url);
  await client.collection("users").authWithPassword(email, password);
  return { email, password, id: record.id, client };
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    assert(error instanceof ClientResponseError, String(error));
    return error.status;
  }
}

async function mfaId(email: string, password: string) {
  try {
    await new PocketBase(url)
      .collection("users")
      .authWithPassword(email, password);
  } catch (error) {
    assert(error instanceof ClientResponseError && error.status === 401);
    assert(error.response.mfaId, "401 must carry an mfaId");
    assert(
      !("token" in error.response),
      "partial sign-in must not get a token",
    );
    return error.response.mfaId as string;
  }
  throw new Error("Password sign-in must require a second step");
}

const seen = new Set<string>();
async function codes(email: string, wait = 10_000) {
  const found: string[] = [];
  for (const deadline = Date.now() + wait; Date.now() < deadline; ) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    assert(search.ok, "Mailpit search failed");
    const { messages } = (await search.json()) as {
      messages: { ID: string }[];
    };
    for (const { ID } of messages.filter(({ ID }) => !seen.has(ID))) {
      seen.add(ID);
      const message = await (
        await fetch(`${mailpit}/api/v1/message/${ID}`)
      ).json();
      const code = (message as { Text: string }).Text.match(/\b\d{8}\b/)?.[0];
      if (code) found.push(code);
    }
    if (found.length) return found;
    await Bun.sleep(250);
  }
  return found;
}
// The second step asks for a code with the mfaId the password step returned.
const requestCode = (email: string, mfaId?: string) =>
  new PocketBase(url)
    .collection("users")
    .requestOTP(email, { body: { email, mfaId } });
const enable = (user: Awaited<ReturnType<typeof account>>) =>
  user.client.collection("users").update(user.id, {
    mfaEnabled: true,
    currentPassword: user.password,
  });
const pendingOf = async (collection: string, record: string) =>
  (
    await admin.collection(collection).getList(1, 1, {
      filter: admin.filter("recordRef = {:record}", { record }),
    })
  ).totalItems;
async function timed(email: string, mfaId?: string) {
  const started = performance.now();
  const { otpId } = await requestCode(email, mfaId);
  return { otpId, ms: performance.now() - started };
}
const median = (values: number[]) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function code(email: string) {
  const [value] = await codes(email);
  assert(value, `No sign-in code arrived for ${email}`);
  return value;
}

try {
  // Off by default: password alone signs in and no code is ever emailed.
  const plain = await account();
  assert.equal(plain.client.authStore.record?.mfaEnabled, false);
  const decoy = await plain.client.collection("users").requestOTP(plain.email);
  assert(decoy.otpId, "Accounts without two-step sign-in still get a decoy id");
  assert.deepEqual(
    await codes(plain.email, 2_000),
    [],
    "No code for opt-out accounts",
  );
  assert.equal(
    await status(
      plain.client.collection("users").update(plain.id, { name: "Plain" }),
    ),
    200,
    "Ordinary profile updates need no password",
  );

  // Turning it on needs the current password and a verified email.
  const users = (client: PocketBase) => client.collection("users");
  const unverified = await account(false);
  assert.equal(
    await status(
      users(unverified.client).update(unverified.id, {
        mfaEnabled: true,
        currentPassword: unverified.password,
      }),
    ),
    400,
    "Unverified accounts cannot turn it on",
  );
  const owner = await account();
  for (const currentPassword of [undefined, "wrong-password"])
    assert.equal(
      await status(
        users(owner.client).update(owner.id, {
          mfaEnabled: true,
          currentPassword,
        }),
      ),
      400,
      "Toggling requires the correct current password",
    );
  assert.equal(
    await status(users(plain.client).update(owner.id, { mfaEnabled: true })),
    404,
    "Another user cannot set the flag",
  );
  assert.equal(
    await status(
      users(plain.client).update(owner.id, {
        mfaEnabled: true,
        currentPassword: plain.password,
      }),
    ),
    404,
    "Another user cannot set the flag even with their own password",
  );
  const enabled = await users(owner.client).update(owner.id, {
    mfaEnabled: true,
    currentPassword: owner.password,
  });
  assert.equal(enabled.mfaEnabled, true);

  // A partial sign-in is not a session: the mfaId opens nothing.
  const pending = await mfaId(owner.email, owner.password);
  for (const path of [
    `collections/users/records/${owner.id}`,
    "collections/entries/records",
  ]) {
    const response: Response = await fetch(`${url}/api/${path}`, {
      headers: { Authorization: pending },
    });
    const body = (await response.json()) as { totalItems?: number };
    assert(
      response.status === 404 || (response.ok && body.totalItems === 0),
      `${path} must not be readable with an mfaId (got ${response.status})`,
    );
  }

  // Code step: wrong code fails, right code signs in, codes are single use.
  const second = new PocketBase(url);
  const { otpId } = await requestCode(owner.email, pending);
  const value = await code(owner.email);
  const wrong = value === "00000000" ? "11111111" : "00000000";
  assert.equal(
    await status(
      second.collection("users").authWithOTP(otpId, wrong, { mfaId: pending }),
    ),
    400,
  );
  await second
    .collection("users")
    .authWithOTP(otpId, value, { mfaId: pending });
  assert.equal(second.authStore.record?.id, owner.id);
  assert.equal(
    await status(
      new PocketBase(url).collection("users").authWithOTP(otpId, value, {
        mfaId: await mfaId(owner.email, owner.password),
      }),
    ),
    400,
    "A used code cannot be used again",
  );

  // A code alone is not enough either: it becomes the first step and asks for the password.
  const codeFirst = new PocketBase(url);
  const otp = await requestCode(
    owner.email,
    await mfaId(owner.email, owner.password),
  );
  try {
    await codeFirst
      .collection("users")
      .authWithOTP(otp.otpId, await code(owner.email));
    throw new Error("A code alone must not sign in");
  } catch (error) {
    assert(error instanceof ClientResponseError && error.status === 401);
    assert(error.response.mfaId);
  }

  // Turning it off needs the password too; a superuser can clear it without one.
  assert.equal(
    await status(users(second).update(owner.id, { mfaEnabled: false })),
    400,
  );
  await users(second).update(owner.id, {
    mfaEnabled: false,
    currentPassword: owner.password,
  });
  await new PocketBase(url)
    .collection("users")
    .authWithPassword(owner.email, owner.password);
  const locked = await account();
  await users(locked.client).update(locked.id, {
    mfaEnabled: true,
    currentPassword: locked.password,
  });
  await admin.collection("users").update(locked.id, { mfaEnabled: false });
  await new PocketBase(url)
    .collection("users")
    .authWithPassword(locked.email, locked.password);

  // Audit 1+2: without a valid mfaId for this account, request-otp is a decoy for
  // everyone: no email, no real code to burn, nothing that tells accounts apart.
  const target = await account();
  await enable(target);
  const bystander = await account();
  await enable(bystander);
  const strangerPending = await mfaId(bystander.email, bystander.password);
  const decoys: Record<string, number[]> = {};
  const ids = new Set<string>();
  for (const [label, email, mfa] of [
    ["opted in, no mfaId", target.email, undefined],
    ["opted in, unknown mfaId", target.email, "aaaaaaaaaaaaaaa"],
    ["opted in, another account's mfaId", target.email, strangerPending],
    ["opted out", plain.email, undefined],
    ["unknown email", `nobody-${crypto.randomUUID()}@example.com`, undefined],
  ] as const) {
    decoys[label] = [];
    for (let i = 0; i < 12; i++) {
      const { otpId, ms } = await timed(email, mfa);
      assert.match(otpId, /^[a-z0-9]{15}$/, label);
      assert(!ids.has(otpId), `${label}: decoy ids must not repeat`);
      ids.add(otpId);
      decoys[label].push(ms);
    }
  }
  assert.deepEqual(
    await codes(target.email, 2_000),
    [],
    "No code without the password step",
  );
  assert.equal(
    await pendingOf("_otps", target.id),
    0,
    "No real codes were created",
  );
  const real = await timed(
    target.email,
    await mfaId(target.email, target.password),
  );
  await code(target.email);
  console.log(
    `request-otp median ms: ${Object.entries(decoys)
      .map(([label, values]) => `${label} ${median(values).toFixed(1)}`)
      .join("; ")}; real send ${real.ms.toFixed(1)}`,
  );

  // Audit 3: turning it off (by the user or a superuser) voids outstanding codes.
  for (const by of ["user", "superuser"] as const) {
    const user = await account();
    await enable(user);
    const leftover = await requestCode(
      user.email,
      await mfaId(user.email, user.password),
    );
    const leftoverCode = await code(user.email);
    const session = new PocketBase(url);
    const step = await mfaId(user.email, user.password);
    const fresh = await requestCode(user.email, step);
    await session
      .collection("users")
      .authWithOTP(fresh.otpId, await code(user.email), { mfaId: step });
    await (by === "user" ? session : admin)
      .collection("users")
      .update(user.id, {
        mfaEnabled: false,
        currentPassword: user.password,
      });
    assert.equal(
      await status(
        new PocketBase(url)
          .collection("users")
          .authWithOTP(leftover.otpId, leftoverCode),
      ),
      400,
      `A code issued before the ${by} turned it off must not sign in alone`,
    );
    assert.equal(await pendingOf("_otps", user.id), 0);
    assert.equal(await pendingOf("_mfas", user.id), 0);
  }

  // Audit 4: turning it on signs out existing sessions.
  const before = await account();
  const old = new PocketBase(url);
  await old.collection("users").authWithPassword(before.email, before.password);
  await enable(before);
  for (const client of [old, before.client])
    assert.equal(
      await status(client.collection("users").authRefresh()),
      401,
      "Sessions from before turning it on must end",
    );

  // Audit 5: a public sign-up cannot start with it on (skipped when sign-up is off).
  const signupEmail = `mfa-signup-${crypto.randomUUID()}@example.com`;
  try {
    const signup = await new PocketBase(url).collection("users").create({
      email: signupEmail,
      password: signupEmail,
      passwordConfirm: signupEmail,
      mfaEnabled: true,
    });
    created.push(signup.id);
    assert.equal(
      (await admin.collection("users").getOne(signup.id)).mfaEnabled,
      false,
      "Sign-up must not turn on two-step sign-in",
    );
    console.log("PASS: public sign-up starts with two-step sign-in off");
  } catch (error) {
    if (!(error instanceof ClientResponseError && error.status === 403))
      throw error;
    console.log(
      "SKIP: public sign-up check (sign-up is disabled on this backend)",
    );
  }

  console.log(
    "PASS: two-step sign-in is opt-in, password-guarded, verified-only, owner-only; partial sign-ins read nothing; codes are single use",
  );
} finally {
  for (const id of created) await admin.collection("users").delete(id);
  if (seen.size)
    await fetch(`${mailpit}/api/v1/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ IDs: [...seen] }),
    });
}
