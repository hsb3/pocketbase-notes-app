const { test, expect, api } = require("./fixtures.cjs");

test("@smoke login, save and reload a private note", async ({
  page,
  session,
}) => {
  const { email, password, admin } = session;
  await page.goto("/");
  await page.locator('input[name="identity"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/entries**");
  await page.getByRole("link", { name: "New note", exact: true }).click();
  await page.getByLabel("Entry title").fill("Smoke test note");
  const body = page.getByRole("textbox", { name: "Entry body" });
  await body.fill("A saved thought survives a reload.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/entries\/[a-z0-9]{15}/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.reload();
  await expect(page.getByLabel("Entry title")).toHaveValue("Smoke test note");
  await expect(body).toHaveText("A saved thought survives a reload.");
  const record = await api(`collections/entries/records/${id}`, admin.token);
  expect(record.user).toBe(session.account.id);
  const anonymous = await fetch(
    `${process.env.VITE_PB_URL}/api/collections/entries/records/${id}`,
  );
  expect(anonymous.status).toBe(404);
});
