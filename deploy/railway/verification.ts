import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import PocketBase, { ClientResponseError } from "pocketbase";

if (existsSync("deploy/railway/.env")) loadEnvFile("deploy/railway/.env");
export const deploymentURL = process.env.PB_URL;
assert(deploymentURL, "Set PB_URL.");
export const localDeployment = ["localhost", "127.0.0.1", "[::1]"].includes(
  new URL(deploymentURL).hostname,
);
assert(
  localDeployment || deploymentURL === "https://notes-staging.up.railway.app",
  "Unexpected deployment target.",
);

export async function deploymentAdmin(url = deploymentURL!) {
  assert(
    process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD,
    "Set deployment superuser credentials.",
  );
  const admin = new PocketBase(url);
  admin.autoCancellation(false);
  await admin
    .collection("_superusers")
    .authWithPassword(
      process.env.PB_ADMIN_EMAIL,
      process.env.PB_ADMIN_PASSWORD,
    );
  return admin;
}

export async function createVerificationUser(
  admin: PocketBase,
  options: { email?: string; verified?: boolean } = {},
) {
  const nonce = crypto.randomUUID();
  const email = options.email || `verification-${nonce}@example.invalid`;
  const password = crypto.randomUUID();
  const name = `Verification ${nonce}`;
  const existing = await admin
    .collection("users")
    .getList(1, 1, { filter: admin.filter("email = {:email}", { email }) });
  assert.equal(
    existing.totalItems,
    0,
    "Verification requires an unused test email; existing accounts are never adopted.",
  );
  let record;
  try {
    record = await admin.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name,
      verified: options.verified ?? true,
    });
  } catch (error) {
    // Recover only this invocation's uniquely marked account after a lost response.
    if (error instanceof ClientResponseError && error.status === 0) {
      const found = await admin.collection("users").getFullList({
        filter: admin.filter("email = {:email} && name = {:name}", {
          email,
          name,
        }),
      });
      for (const row of found) await admin.collection("users").delete(row.id);
    }
    throw error;
  }
  const cleanup = () => admin.collection("users").delete(record.id);
  const client = new PocketBase(admin.baseURL);
  client.autoCancellation(false);
  try {
    if (options.verified !== false)
      await client.collection("users").authWithPassword(email, password);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { record, email, password, client, cleanup };
}

export function verificationFailure(error: unknown) {
  const reason =
    error instanceof ClientResponseError
      ? `PocketBase HTTP ${error.status}`
      : error instanceof assert.AssertionError
        ? error.message.split("\n")[0]
        : error instanceof Error
          ? error.name
          : "unknown error";
  process.stderr.write(
    `Verification failed (${reason}). Sensitive error payloads are suppressed.\n`,
  );
  process.exitCode = 1;
}
