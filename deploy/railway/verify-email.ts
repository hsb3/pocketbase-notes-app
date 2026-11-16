import { evidenceDirectory } from "./evidence";
import assert from "node:assert/strict";
import {
  localDeployment,
  deploymentAdmin,
  createVerificationUser,
  verificationFailure,
} from "./verification";

// Explicit opt-in: sends mail only to an unused test recipient, never an existing account.
async function main() {
  const email = process.env.VERIFY_EMAIL;
  assert(
    email,
    "Set VERIFY_EMAIL to an unused test mailbox. This command sends real mail.",
  );
  const mailpit = process.env.MAILPIT_URL;
  assert(
    !mailpit ||
      (localDeployment &&
        ["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(mailpit).hostname,
        )),
    "Mailpit verification is local-only.",
  );
  assert(
    mailpit || process.env.RESEND_API_KEY,
    "Set RESEND_API_KEY for delivery verification, or local MAILPIT_URL.",
  );
  const admin = await deploymentAdmin();
  const appURL = new URL((await admin.settings.getAll()).meta.appURL);
  const fixture = await createVerificationUser(admin, {
    email,
    verified: false,
  });
  const pb = fixture.client;
  const evidence = [];
  try {
    for (const [kind, path] of [
      ["verification", "/auth/email-verification-confirm"],
      ["reset", "/auth/password-reset-confirm"],
    ]) {
      const started = Date.now();
      if (kind === "verification")
        await pb.collection("users").requestVerification(email);
      else await pb.collection("users").requestPasswordReset(email);
      let token: string | null = null;
      for (let attempt = 0; attempt < 30 && !token; attempt++) {
        await Bun.sleep(1000);
        let html = "";
        if (mailpit) {
          const response: Response = await fetch(
            `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          assert(response.ok, "Mailpit search failed");
          const list = (await response.json()) as {
            messages: { ID: string }[];
          };
          for (const item of list.messages) {
            const response: Response = await fetch(
              `${mailpit}/api/v1/message/${item.ID}`,
              {
                signal: AbortSignal.timeout(15000),
              },
            );
            assert(response.ok, "Mailpit message read failed");
            const message = (await response.json()) as { HTML: string };
            if (message.HTML.includes(path)) {
              html = message.HTML;
              break;
            }
          }
        } else {
          const headers = {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          };
          const response: Response = await fetch(
            "https://api.resend.com/emails?limit=20",
            {
              headers,
              signal: AbortSignal.timeout(15000),
            },
          );
          if (response.status === 429) continue;
          assert(response.ok, `Resend read failed: ${response.status}`);
          const list = (await response.json()) as {
            data: {
              id: string;
              to: string[];
              created_at: string;
              subject: string;
            }[];
          };
          const candidate:
            | { id: string; to: string[]; created_at: string; subject: string }
            | undefined = list.data.find(
            (m) =>
              m.to.includes(email) &&
              Date.parse(m.created_at) >= started - 1000 &&
              (kind === "reset"
                ? /reset/i.test(m.subject)
                : /verify|verification/i.test(m.subject)),
          );
          if (!candidate) continue;
          const detail: Response = await fetch(
            `https://api.resend.com/emails/${candidate.id}`,
            { headers, signal: AbortSignal.timeout(15000) },
          );
          if (detail.status === 429) continue;
          assert(detail.ok, "Resend message read failed");
          const message = (await detail.json()) as {
            html: string;
            last_event: string;
          };
          if (message.last_event === "delivered") html = message.html;
        }
        for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
          const link = new URL(match[1].replaceAll("&amp;", "&"), appURL);
          if (link.origin === appURL.origin && link.pathname === path)
            token = link.searchParams.get("token");
        }
      }
      assert(
        token,
        `No delivered ${kind} email with a matching application link observed`,
      );
      if (kind === "verification")
        await pb.collection("users").confirmVerification(token);
      else {
        const replacement = crypto.randomUUID();
        await pb
          .collection("users")
          .confirmPasswordReset(token, replacement, replacement);
        await pb.collection("users").authWithPassword(email, replacement);
      }
      evidence.push({ kind, delivered: true, tokenAccepted: true });
    }
    assert(
      (await admin.collection("users").getOne(fixture.record.id)).verified,
    );
    await Bun.write(
      `${evidenceDirectory}/email-checks.json`,
      JSON.stringify(evidence),
    );
    process.stdout.write(
      "PASS: disposable-account verification and password-reset delivery/token checks",
    );
  } finally {
    await fixture.cleanup();
  }
}
main().catch(verificationFailure);
