const { setTimeout: sleep } = require("node:timers/promises");
const { afterEach, beforeEach, expect, test, spyOn } = require("bun:test");
const { pb } = require("../../src/services/pocketbase.ts");
const {
  listFolders,
  defaultFolder,
  createFolder,
} = require("../../src/features/folders/data.ts");
const {
  getNote,
  listNotes,
  localDate,
  validDate,
} = require("../../src/features/notes/data.ts");
const { NoteDraft } = require("../../src/features/notes/draft.ts");

const user = "owner0000000001",
  folder = "folder000000001",
  token = authToken(3600);
const account = {
  id: user,
  collectionName: "users",
  collectionId: "_pb_users_auth_",
};
function authToken(seconds) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      id: user,
      type: "auth",
      collectionId: "_pb_users_auth_",
      exp: Math.floor(Date.now() / 1000) + seconds,
    }),
    "fixture",
  ].join(".");
}
const body = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
let calls, fetchStub, respond;
function defer() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  pb.authStore.save(token, account);
  respond = undefined;
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
      if (respond) return respond(call);
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
    journal_date: "",
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

test("retry after a validation rejection keeps the ID and reads before replaying a lost reply", async () => {
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
  const recovery = draft.retry();
  expect((await call(2)).method).toBe("GET");
  expect(calls[2].url.pathname).toBe(createPath(draft));
  await reply(2, record(draft, 1, body("Corrected")));
  expect((await call(3)).body).toEqual({
    revision: 1,
    body: body("Keep these words"),
  });
  await reply(3, record(draft, 2));
  expect(await recovery).toBe(true);
  expect(draft.revision).toBe(2);
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
  respond = () => Response.json({ message: "Empty" }, { status: 400 });
  expect(await leave).toBe(false);
  expect(calls.map((c) => c.method)).toEqual(["POST"]);
  expect(draft.body).toEqual(body(" "));
  expect(draft.revision).toBe(1);
  expect(draft.error).toMatch(/writ|empty|attachment|blank/i);
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
  expect(query.get("fields")).toBe(
    "id,folder,title,updated,excerpt,pinned,journal_date",
  );
  expect(query.get("sort")).toBe("-pinned,-updated,-id");
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
    "deleted,id,user,folder,title,body,attachments,revision,updated,pinned,journal_date"
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

const createPath = (draft) => "/api/collections/notes/records/" + draft.id;
const fault = (status, data = {}) =>
  Response.json({ message: "Refused", data }, { status });
const collision = () => fault(400, { id: { code: "validation_not_unique" } });
const savedNote = {
  id: "note00000000001",
  user,
  folder,
  body: body("Baseline"),
  revision: 4,
  attachments: ["file-one", "file-two"],
  deleted: "",
  journal_date: "",
};
const noteCalls = () =>
  calls.filter((c) => c.url.pathname.includes("/notes/records"));
const methods = () => noteCalls().map((c) => c.method);
function serve(
  handler,
  refresh = () => Response.json({ token, record: account }),
) {
  respond = (c) =>
    c.url.pathname === "/api/collections/users/auth-refresh"
      ? refresh(c)
      : handler(c);
}

for (const [name, change] of [
  [
    "reordered keys",
    (r) => {
      r.body = { content: r.body.content, type: "doc" };
    },
  ],
  [
    "different formatting",
    (r) => {
      r.body.content[0].content[0].marks = [{ type: "bold" }];
    },
  ],
  ["reordered attachments", (r) => r.attachments.reverse()],
  ["later revision with identical text", (r) => r.revision++],
]) {
  test("409 owner read-back: " + name, async () => {
    const draft = new NoteDraft({ user, folder, note: savedNote });
    const local = body("Writing");
    draft.edit(local);
    const owned = structuredClone({ ...savedNote, revision: 5, body: local });
    change(owned);
    serve((c) => (c.method === "PATCH" ? fault(409) : Response.json(owned)));
    await draft.flush();
    if (!methods().includes("GET")) await draft.retry();
    expect(methods()).toEqual(["PATCH", "GET"]);
    expect(noteCalls()[1].url.pathname).toBe(createPath(draft));
    expect(draft.body).toEqual(local);
    if (name === "reordered keys") {
      expect(draft.status).toBe("Saved");
      expect(draft.revision).toBe(5);
    } else {
      expect(draft.status + " " + draft.error).toMatch(
        /conflict|newer|changed|different|version/i,
      );
      expect(await draft.retry()).toBe(false);
      expect(methods().filter((m) => m === "PATCH")).toHaveLength(1);
    }
  });
}

test("a failed owner read grants no write; a verified unchanged PATCH baseline permits latest retry", async () => {
  const draft = new NoteDraft({ user, folder, note: savedNote });
  draft.edit(body("Uncertain"));
  serve(() => fault(503));
  expect(await draft.flush()).toBe(false);
  draft.edit(body("Latest"));
  expect(await draft.retry()).toBe(false);
  expect(methods()).toEqual(["PATCH", "GET"]);
  serve((c) =>
    Response.json(
      c.method === "GET"
        ? savedNote
        : { ...savedNote, revision: 5, body: body("Latest") },
    ),
  );
  expect(await draft.retry()).toBe(true);
  expect(methods()).toEqual(["PATCH", "GET", "GET", "PATCH"]);
  expect(noteCalls().at(-1).body).toEqual({
    revision: 4,
    body: body("Latest"),
  });
});

for (const name of ["duplicate ID", "unclassified 400"]) {
  test(name + " with unreadable detail cannot authorize a create", async () => {
    const draft = new NoteDraft({ user, folder });
    draft.edit(body("Keep"));
    serve((c) =>
      c.method === "GET"
        ? fault(404)
        : name === "duplicate ID"
          ? collision()
          : fault(400),
    );
    await draft.flush();
    await draft.retry();
    if (name === "duplicate ID") expect(methods()).toContain("GET");
    expect(methods().filter((m) => m === "POST")).toEqual(["POST"]);
    expect(draft.body).toEqual(body("Keep"));
    expect(draft.status).not.toBe("Saved");
    expect(draft.error).toBeTruthy();
  });
}

test("a missing uncertain create races a duplicate; adopt only the old submitted generation", async () => {
  const draft = new NoteDraft({ user, folder });
  const first = body("First"),
    latest = body("Later");
  draft.edit(first);
  serve(() => fault(503));
  expect(await draft.flush()).toBe(false);
  draft.edit(latest);
  let reads = 0;
  serve((c) => {
    if (c.method === "GET")
      return ++reads === 1
        ? fault(404)
        : Response.json(record(draft, 1, first));
    if (c.method === "POST") return collision();
    return Response.json(record(draft, 2, latest));
  });
  expect(await draft.retry()).toBe(true);
  expect(methods()).toEqual(["POST", "GET", "POST", "GET", "PATCH"]);
  expect(noteCalls()[2].body).toMatchObject({ id: draft.id, body: latest });
  expect(noteCalls()[4].body).toEqual({ revision: 1, body: latest });
  expect(draft.body).toEqual(latest);
  expect(draft.revision).toBe(2);
});

for (const [name, credential] of [
  ["invalid", ""],
  ["expired", authToken(-60)],
]) {
  test(name + " session retains the draft without dispatch", async () => {
    const draft = new NoteDraft({ user, folder });
    pb.authStore.save(credential, account);
    draft.edit(body("Private"));
    serve(() => fault(401));
    expect(await draft.flush()).toBe(false);
    expect(methods()).toEqual([]);
    expect(draft.body).toEqual(body("Private"));
  });
}

for (const [name, refreshStatus] of [
  ["revoked", 401],
  ["temporarily unverifiable", 503],
]) {
  test("masked write denial distinguishes a " + name + " owner", async () => {
    const draft = new NoteDraft({ user, folder, note: savedNote });
    draft.edit(body("Retain"));
    serve(
      () => fault(404),
      () => fault(refreshStatus),
    );
    expect(await draft.flush()).toBe(false);
    const checks = calls.filter((c) =>
      c.url.pathname.endsWith("/users/auth-refresh"),
    );
    expect(checks).toHaveLength(1);
    expect(checks[0].headers.get("Authorization")).toBe(token);
    expect(draft.body).toEqual(body("Retain"));
    if (refreshStatus === 503) {
      expect(pb.authStore.token).toBe(token);
      serve((c) =>
        Response.json(
          c.method === "GET"
            ? savedNote
            : { ...savedNote, revision: 5, body: body("Retain") },
        ),
      );
      expect(await draft.retry()).toBe(true);
    } else {
      expect(draft.error).toMatch(/sign in|session|authenticat/i);
      expect(await draft.retry()).toBe(false);
      expect(methods().filter((m) => m === "PATCH")).toHaveLength(1);
    }
  });
}

test("late acknowledgement from an earlier login cannot publish or drain newer edits", async () => {
  const published = [];
  const draft = new NoteDraft({
    user,
    folder,
    onSaved: (r) => published.push(r.id),
  });
  draft.edit(body("Sent"));
  const save = draft.flush();
  await call(0);
  draft.edit(body("Local only"));
  pb.authStore.save(authToken(7200), { ...account, id: "different-owner" });
  pb.authStore.save(authToken(7300), account);
  serve(() => fault(503));
  await reply(0, record(draft, 1, body("Sent")));
  expect(await save).toBe(false);
  expect(published).toEqual([]);
  expect(methods()).toEqual(["POST"]);
  expect(draft.body).toEqual(body("Local only"));
});

test("the encoded JSON limit accepts 102400 bytes and locally refuses one more", async () => {
  const draft = new NoteDraft({ user, folder });
  const remaining = 102400 - Buffer.byteLength(JSON.stringify(body("")));
  const text =
    "é".repeat(Math.floor(remaining / 2)) + "x".repeat(remaining % 2);
  draft.edit(body(text));
  serve(() => Response.json(record(draft, 1)));
  expect(await draft.flush()).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(calls[0].body.body))).toBe(102400);
  draft.edit(body(text + "x"));
  serve(() => fault(400));
  expect(await draft.flush()).toBe(false);
  expect(methods()).toEqual(["POST"]);
  expect(draft.error).toMatch(/100\s*KB/i);
  expect(draft.body).toEqual(body(text + "x"));
  expect(draft.revision).toBe(1);
});

test("direct success with different returned content cannot acknowledge local text", async () => {
  const draft = new NoteDraft({ user, folder });
  draft.edit(body("Local"));
  serve(() => Response.json(record(draft, 1, body("Other"))));
  expect(await draft.flush()).toBe(false);
  expect(draft.status).not.toBe("Saved");
  expect(draft.body).toEqual(body("Local"));
});

test("a read matching only newer local typing cannot acknowledge an earlier submission", async () => {
  const draft = new NoteDraft({ user, folder, note: savedNote });
  draft.edit(body("On the wire"));
  const attempt = draft.flush();
  await call(0);
  draft.edit(body("Local only"));
  const unrelated = { ...savedNote, revision: 5, body: body("Local only") };
  serve(() => Response.json(unrelated));
  await reply(0, { message: "Interrupted" }, 503);
  await attempt;
  await draft.retry();
  expect(methods()).toEqual(["PATCH", "GET"]);
  expect(draft.status).not.toBe("Saved");
  expect(draft.body).toEqual(body("Local only"));
  expect(await draft.retry()).toBe(false);
  expect(methods().filter((m) => m === "PATCH")).toHaveLength(1);
});

test("a masked create denial checks the captured owner's session before retry", async () => {
  const draft = new NoteDraft({ user, folder });
  draft.edit(body("Still mine"));
  serve(
    () => fault(400),
    () => fault(401),
  );
  expect(await draft.flush()).toBe(false);
  const checks = calls.filter((c) =>
    c.url.pathname.endsWith("/users/auth-refresh"),
  );
  expect(checks.map((c) => c.headers.get("Authorization"))).toEqual([token]);
  expect(draft.error).toMatch(/sign in|session|authenticat/i);
  expect(await draft.retry()).toBe(false);
  expect(methods().filter((m) => m === "POST")).toEqual(["POST"]);
  expect(draft.body).toEqual(body("Still mine"));
});

test("Journal lists filter dated notes by day, newest day first, binding the day", async () => {
  const all = listNotes("journal", 1);
  const query = (await call(0)).url.searchParams;
  expect(query.get("filter")).toBe('deleted = "" && journal_date != ""');
  expect(query.get("sort")).toBe("-journal_date,-updated,-id");
  await reply(0, { items: [] });
  await all;
  const one = listNotes("journal", 1, "2026-11-21");
  const day = (await call(1)).url.searchParams;
  expect(day.get("filter")).toBe('deleted = "" && journal_date = "2026-11-21"');
  expect(day.get("sort")).toBe("-updated,-id");
  await reply(1, { items: [] });
  await one;
  expect(validDate("2026-02-31")).toBe(false);
  expect(validDate("0001-01-01")).toBe(true);
  expect(localDate(new Date(2026, 10, 21, 23, 59))).toBe("2026-11-21");
});

test("a draft composed from Journal sends its day on create only, and keeps it while held", async () => {
  const draft = new NoteDraft({ user, folder, journalDate: "2026-11-21" });
  draft.edit(body("Dated"));
  const held = draft.suspend();
  expect(held.journalDate).toBe("2026-11-21");
  const resumed = new NoteDraft({ user, folder }, held);
  const saving = resumed.retry();
  const create = await call(0);
  expect(create.method).toBe("POST");
  expect(create.body).toEqual({
    id: draft.id,
    user,
    folder,
    attachments: [],
    body: body("Dated"),
    journal_date: "2026-11-21",
  });
  await reply(0, {
    ...record(resumed, 1, body("Dated")),
    journal_date: "2026-11-21",
  });
  expect(await saving).toBe(true);
  resumed.edit(body("Dated, then edited"));
  const update = await call(1);
  expect(update.method).toBe("PATCH");
  expect(update.body).toEqual({
    revision: 1,
    body: body("Dated, then edited"),
  });
  await reply(1, { ...record(resumed, 2), journal_date: "2026-11-21" });
  await resumed.flush();
  resumed.dispose();
});

test("a create reply without the composed day is not confirmed", async () => {
  const draft = new NoteDraft({ user, folder, journalDate: "2026-11-21" });
  draft.edit(body("Dated"));
  const saving = draft.flush();
  await reply(0, record(draft, 1, body("Dated")));
  expect(await saving).toBe(false);
  draft.dispose();
});

test("a notice is an echo only when its day is absent or equal to the held day", () => {
  const draft = new NoteDraft({
    user,
    folder,
    note: record({ id: "note00000000001", body: body("x") }, 3),
  });
  const notice = { id: draft.id, folder, deleted: false, revision: 3 };
  expect(draft.isEcho(notice, false, "2026-11-21")).toBe(true);
  expect(
    draft.isEcho(
      { ...notice, journal_date: "2026-11-21" },
      false,
      "2026-11-21",
    ),
  ).toBe(true);
  expect(
    draft.isEcho(
      { ...notice, journal_date: "2026-11-20" },
      false,
      "2026-11-21",
    ),
  ).toBe(false);
  expect(
    draft.isEcho({ ...notice, journal_date: "" }, false, "2026-11-21"),
  ).toBe(false);
  draft.dispose();
});
