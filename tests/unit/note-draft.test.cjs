const { setTimeout: sleep } = require("node:timers/promises");
const { afterEach, beforeEach, expect, test, spyOn } = require("bun:test");
const { pb } = require("../../src/services/pocketbase.ts");
const {
  listFolders,
  defaultFolder,
  createFolder,
} = require("../../src/features/folders/data.ts");
const { getNote, listNotes } = require("../../src/features/notes/data.ts");
const { NoteDraft } = require("../../src/features/notes/draft.ts");

const user = "owner0000000001",
  folder = "folder000000001",
  token = "unit-owner-token";
const body = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
let calls, fetchStub;
function defer() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  pb.authStore.save(token, { id: user });
  calls = [];
  fetchStub = spyOn(globalThis, "fetch").mockImplementation(
    async (url, options) => {
      const call = {
        url: new URL(url, "https://unit.invalid"),
        method: options.method,
        headers: new Headers(options.headers),
        body: options.body ? JSON.parse(options.body) : undefined,
        response: defer(),
      };
      calls.push(call);
      return call.response.promise;
    },
  );
});
afterEach(() => {
  fetchStub.mockRestore();
  pb.authStore.clear();
});
async function call(index) {
  for (let i = 0; i < 100 && !calls[index]; i++) await sleep(10);
  expect(calls.length).toBeGreaterThan(index);
  return calls[index];
}
async function reply(index, payload, status = 200) {
  (await call(index)).response.resolve(Response.json(payload, { status }));
}
function record(draft, revision, content = draft.body) {
  return {
    id: draft.id,
    user,
    folder,
    revision,
    body: content,
    attachments: [],
    title: "From server",
    updated: "",
    deleted: "",
  };
}

test("debounces 500 ms from the last edit, retains newer words, and joins concurrent leave until all writes finish", async () => {
  const acknowledged = [];
  const draft = new NoteDraft({
    user,
    folder,
    onSaved: (item) => acknowledged.push(item.revision),
  });
  expect(draft.id).toMatch(/^[a-z0-9]{15}$/);
  draft.edit(body("Initial"));
  await sleep(300);
  draft.edit(body("First"));
  await sleep(300);
  expect(calls).toHaveLength(0);
  const create = await call(0);
  expect(create.headers.get("Authorization")).toBe(token);
  expect(create.method).toBe("POST");
  expect(create.url.pathname).toBe("/api/collections/notes/records");
  expect(create.body).toEqual({
    id: draft.id,
    user,
    folder,
    attachments: [],
    body: body("First"),
  });
  draft.edit(body("Later"));
  expect(draft.status).toBe("Pending");
  const leave = draft.flush();
  expect(draft.flush()).toBe(leave);
  expect(calls).toHaveLength(1);
  await reply(0, record(draft, 1, body("First")));
  const patch = await call(1);
  expect(draft.body).toEqual(body("Later"));
  expect(draft.status).not.toBe("Saved");
  expect(patch.method).toBe("PATCH");
  expect(patch.url.pathname).toBe("/api/collections/notes/records/" + draft.id);
  expect(patch.body).toEqual({ revision: 1, body: body("Later") });
  draft.edit(body("Latest"));
  await reply(1, record(draft, 2, body("Later")));
  expect((await call(2)).body).toEqual({ revision: 2, body: body("Latest") });
  await reply(2, record(draft, 3));
  expect(await leave).toBe(true);
  expect(draft.status).toBe("Saved");
  expect(draft.revision).toBe(3);
  expect(acknowledged).toEqual([1, 2, 3]);
  expect(await draft.flush()).toBe(true);
  expect(calls).toHaveLength(3);
});

test("a definite rejected create can explicitly retry the same ID, ambiguous failures stay stopped", async () => {
  const draft = new NoteDraft({ user, folder });
  draft.edit(body("First"));
  const first = draft.flush();
  await reply(
    0,
    {
      message: "Invalid values.",
      data: { body: { code: "validation_invalid" } },
    },
    400,
  );
  expect(await first).toBe(false);
  expect(draft.error).toBeTruthy();
  draft.edit(body("Corrected"));
  expect(await draft.flush()).toBe(false);
  const retry = draft.retry();
  expect((await call(1)).body.id).toBe(calls[0].body.id);
  await reply(1, { message: "Uncertain" }, 503);
  expect(await retry).toBe(false);
  draft.edit(body("Keep these words"));
  expect(await draft.retry()).toBe(false);
  expect(await draft.flush()).toBe(false);
  expect(draft.body).toEqual(body("Keep these words"));
  expect(draft.status).toBe("Error");
  await sleep(550);
  expect(calls).toHaveLength(2);
});

test("abandon whitespace, save a mention-only document, and never discard a cleared in-flight create", async () => {
  const draft = new NoteDraft({ user, folder });
  draft.edit(body("    "));
  expect(await draft.flush()).toBe(true);
  expect(calls).toHaveLength(0);
  const mention = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "mention", attrs: { id: "seed", value: "Seed" } }],
      },
    ],
  };
  draft.edit(mention);
  const leave = draft.flush();
  expect((await call(0)).body.body).toEqual(mention);
  draft.edit(body(" "));
  await reply(0, record(draft, 1, mention));
  expect((await call(1)).body).toEqual({ revision: 1, body: body(" ") });
  await reply(1, { message: "Write something." }, 400);
  expect(await leave).toBe(false);
  expect(draft.status).toBe("Error");
});

test("reopened file-only notes use their current revision and keep ordered attachments by omission", async () => {
  const note = {
    id: "note00000000001",
    user,
    folder,
    body: body("Old"),
    revision: 7,
    attachments: ["file-one", "file-two"],
  };
  const draft = new NoteDraft({ user, folder, note });
  expect(await draft.flush()).toBe(true);
  draft.edit({ type: "doc", content: [{ type: "paragraph" }] });
  const leave = draft.flush();
  expect((await call(0)).body).toEqual({ revision: 7, body: draft.body });
  await reply(0, { ...record(draft, 8), attachments: note.attachments });
  expect(await leave).toBe(true);
  pb.authStore.save("different-token", { id: "other" });
  draft.edit(body("Private"));
  expect(await draft.flush()).toBe(false);
  expect(calls).toHaveLength(1);
});

test("folder creation, unique owned default and bounded active note projection use the singleton's authenticated transport", async () => {
  const created = createFolder("Garden");
  expect((await call(0)).body).toEqual({ user, name: "Garden" });
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url.pathname).toBe("/api/collections/folders/records");
  const garden = { id: folder, name: "Garden", user, is_default: false };
  await reply(0, garden);
  expect(await created).toEqual(garden);
  const folders = listFolders();
  const ordinary = {
    ...garden,
    id: "default00000001",
    name: "Notes",
    is_default: true,
  };
  await reply(1, {
    items: [ordinary, garden],
    page: 1,
    perPage: 1000,
    totalPages: 1,
    totalItems: 2,
  });
  const found = await folders;
  expect(defaultFolder(found, user)).toEqual(ordinary);
  expect(() => defaultFolder([garden], user)).toThrow();
  expect(() =>
    defaultFolder([ordinary, { ...ordinary, id: "dup" }], user),
  ).toThrow();
  const page = listNotes(folder, 2);
  const list = await call(2);
  expect(list.headers.get("Authorization")).toBe(token);
  expect(list.method).toBe("GET");
  expect(list.url.pathname).toBe("/api/collections/notes/records");
  const query = list.url.searchParams;
  expect(query.get("page")).toBe("2");
  expect(query.get("perPage")).toBe("20");
  expect(query.get("fields")).toBe("id,folder,title,updated,excerpt");
  expect(query.get("sort")).toBe("-updated,-id");
  expect(query.get("filter")).toContain('deleted = ""');
  expect(query.get("filter")).toContain(folder);
  await reply(2, {
    items: [],
    page: 2,
    perPage: 20,
    totalPages: 1,
    totalItems: 0,
  });
  await page;
  const all = listNotes("all", 1);
  expect((await call(3)).url.searchParams.get("filter")).toBe('deleted = ""');
  await reply(3, { items: [] });
  await all;
  const inactive = getNote("inactive0000001");
  const detail = await call(4);
  expect(detail.url.searchParams.get("fields").split(",").sort()).toEqual(
    "deleted,id,user,folder,title,body,attachments,revision,updated"
      .split(",")
      .sort(),
  );
  await reply(4, {
    id: "inactive0000001",
    user,
    deleted: "2026-01-01",
    body: body("Hidden"),
  });
  await expect(inactive).rejects.toThrow();
});

test("an unclassified response or ID collision cannot authorize another create", async () => {
  for (const data of [{}, { id: { code: "validation_not_unique" } }]) {
    const draft = new NoteDraft({ user, folder });
    draft.edit(body("Keep"));
    const start = calls.length;
    const leave = draft.flush();
    await reply(start, { message: "Bad Request", data }, 400);
    expect(await leave).toBe(false);
    const retry = draft.retry();
    // Let a mistaken dispatch finish so failure has bounded time and no dangling request.
    await sleep(10);
    if (calls[start + 1]) await reply(start + 1, record(draft, 1));
    expect(await retry).toBe(false);
    expect(calls.length).toBe(start + 1);
    expect(draft.status).toBe("Error");
  }
});
