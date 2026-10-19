const { test: base, expect } = require("@playwright/test");
const backend = process.env.VITE_PB_URL;

async function api(path, token, method = "GET", body) {
  const response = await fetch(`${backend}/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: token || "" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`API ${method} ${path}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

const test = base.extend({
  session: async ({ request }, use) => {
    const health = await request.get(`${backend}/api/health`);
    expect(health.ok(), "Start the full backend with make up-full").toBe(true);
    const admin = await api(
      "collections/_superusers/auth-with-password",
      "",
      "POST",
      {
        identity: process.env.PB_EMAIL,
        password: process.env.PB_PASSWORD,
      },
    );
    const email = `e2e-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID();
    const account = await api(
      "collections/users/records",
      admin.token,
      "POST",
      {
        email,
        password,
        passwordConfirm: password,
        verified: true,
        name: "Jamie",
      },
    );
    try {
      await use({ email, password, account, admin });
    } finally {
      await api(
        `collections/users/records/${account.id}`,
        admin.token,
        "DELETE",
      );
    }
  },
});
module.exports = { test, expect, api };
