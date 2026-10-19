import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import PocketBase from "pocketbase";

// Sends verification and reset emails to the owner, then consumes their tokens.
loadEnvFile("deploy/railway/.env");
const env = process.env;
assert.equal(env.PB_URL, "https://notes-staging.up.railway.app");
assert.equal(env.PB_USER_EMAIL, "henry.burden@gmail.com");
const key = Bun.spawnSync(["secret", "get", "RESEND_API_KEY"], {
  stdout: "pipe",
  stderr: "pipe",
});
assert.equal(key.exitCode, 0, "Cannot retrieve Resend management key");
const pb = new PocketBase(env.PB_URL);
type Mail = {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  last_event: string;
  html: string;
};
async function resend<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key.stdout.toString().trim()}` },
  });
  if (response.status === 429) {
    await Bun.sleep(1500);
    return resend<T>(path);
  }
  assert(response.ok, `Resend read failed: ${response.status}`);
  return response.json();
}
const evidence = [];
try {
  for (const [kind, path] of [
    ["verification", "/auth/email-verification-confirm"],
    ["reset", "/auth/password-reset-confirm"],
  ]) {
    const started = Date.now();
    if (kind === "verification")
      await pb.collection("users").requestVerification(env.PB_USER_EMAIL!);
    else await pb.collection("users").requestPasswordReset(env.PB_USER_EMAIL!);
    let mail: Mail | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      await Bun.sleep(2000);
      const list = await resend<{ data: Mail[] }>("/emails?limit=20");
      const candidate = list.data.find(
        (m) =>
          m.to.includes(env.PB_USER_EMAIL!) &&
          m.from.includes("noreply@send.functionform.ai") &&
          Date.parse(m.created_at) >= started - 1000 &&
          (kind === "reset"
            ? /reset/i.test(m.subject)
            : /verify|verification/i.test(m.subject)),
      );
      if (!candidate) continue;
      await Bun.sleep(1000);
      mail = await resend<Mail>(`/emails/${candidate.id}`);
      if (mail.last_event === "delivered") break;
    }
    assert.equal(
      mail?.last_event,
      "delivered",
      `No delivered ${kind} email observed`,
    );
    const links = [...mail.html.matchAll(/href=["']([^"']+)["']/g)].map((m) =>
      m[1].replaceAll("&amp;", "&"),
    );
    const link = links.find((v: string) =>
      v.startsWith(`${env.PB_URL}${path}?`),
    );
    assert(link, "Email must point to the deployed app");
    const token = new URL(link).searchParams.get("token");
    assert(token, "Missing email token");
    if (kind === "verification")
      await pb.collection("users").confirmVerification(token);
    else
      await pb
        .collection("users")
        .confirmPasswordReset(
          token,
          env.PB_USER_PASSWORD!,
          env.PB_USER_PASSWORD!,
        );
    evidence.push({
      kind,
      id: mail.id,
      status: mail.last_event,
      tokenAccepted: true,
    });
    process.stdout.write(`${kind}: delivered and token accepted\n`);
  }
  const login = await pb
    .collection("users")
    .authWithPassword(env.PB_USER_EMAIL!, env.PB_USER_PASSWORD!);
  assert(login.record.verified);
  await Bun.write(
    "/private/tmp/agents/react-pocketbase/codex-deploy/email-checks.json",
    JSON.stringify(evidence, null, 2),
  );
} catch (error) {
  process.stderr.write(
    `Email verification failed: ${error instanceof Error ? error.message : "Unknown error"}\n`,
  );
  process.exitCode = 1;
}
