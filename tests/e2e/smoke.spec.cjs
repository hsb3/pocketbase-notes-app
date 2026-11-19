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
  await expect(page).toHaveURL("/folders/all");
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Note", exact: true });
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("Smoke test note");
  await editor.press("Enter");
  await page.keyboard.insertText("A saved thought survives a reload.");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/notes\/[a-z0-9]{15}$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.reload();
  await expect(editor.locator("p")).toHaveText([
    "Smoke test note",
    "A saved thought survives a reload.",
  ]);
  const record = await api(`collections/notes/records/${id}`, admin.token);
  expect(record.user).toBe(session.account.id);
  const anonymous = await fetch(
    `${process.env.VITE_PB_URL}/api/collections/notes/records/${id}`,
  );
  expect(anonymous.status).toBe(404);
});
