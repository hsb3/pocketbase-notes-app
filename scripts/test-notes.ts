import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

const url = process.env.TEST_PB_URL || process.env.VITE_PB_URL;
assert(
  url &&
    new URL(url).protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Run only against a local HTTP development backend.",
);
assert(process.env.PB_EMAIL && process.env.PB_PASSWORD);
function client() {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.afterSend = (response, data, options?: { method?: string }) => {
    if (response.ok)
      assert.equal(response.status, options?.method === "DELETE" ? 204 : 200);
    return data;
  };
  return pb;
}
const admin = client();
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
const anonymous = client();
const users = admin.collection("users");
const accounts: string[] = [];
const credentials = () => {
  const password = crypto.randomUUID();
  return {
    email: `folders-${crypto.randomUUID()}@example.com`,
    password,
    passwordConfirm: password,
  };
};
async function account() {
  const data = credentials();
  const { id } = await users.create({ ...data, verified: true });
  accounts.push(id);
  const pb = client();
  await pb.collection("users").authWithPassword(data.email, data.password);
  return { pb, id };
}
async function denied(request: Promise<unknown>, status: number) {
  await assert.rejects(
    request,
    (err) => err instanceof ClientResponseError && err.status === status,
  );
}
async function defaultFolder(user: string) {
  const folders = await admin.collection("folders").getFullList({
    filter: admin.filter("user = {:user} && is_default = true", { user }),
  });
  assert.equal(folders.length, 1, "Expected exactly one default folder");
  assert.equal(folders[0].name, "Notes");
  assert.equal(folders[0].name_key, "NOTES");
  return folders[0];
}

async function provisioning(a: Awaited<ReturnType<typeof account>>) {
  const folder = await defaultFolder(a.id);
  const folders = a.pb.collection("folders");
  await denied(folders.delete(folder.id), 400);
  await denied(folders.update(folder.id, { name: "Renamed" }), 404);
  await denied(folders.update(folder.id, { is_default: false }), 404);
  assert.equal((await defaultFolder(a.id)).id, folder.id);

  const data = credentials();
  const signup = anonymous
    .collection("users")
    .create(data)
    .then((user) => {
      accounts.push(user.id);
      return user;
    });
  if (process.env.VITE_SIGNUP_ENABLED === "true") {
    await defaultFolder((await signup).id);
    console.log("PASS public signup receives one Notes folder");
  } else {
    await denied(signup, 403);
    console.log("PASS public signup disabled (403)");
  }
  const seed = credentials();
  try {
    const run = Bun.spawn(["bun", "scripts/seed.ts"], {
      env: {
        ...process.env,
        PB_URL: url,
        SEED_USER_EMAIL: seed.email,
        SEED_USER_PASSWORD: seed.password,
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    assert.equal(await run.exited, 0, "Synthetic seed failed");
    const user = await users.getFirstListItem(
      admin.filter("email = {:email}", seed),
    );
    await defaultFolder(user.id);
  } finally {
    for (const user of await users.getFullList({
      filter: admin.filter("email = {:email}", seed),
    })) {
      await users.delete(user.id);
    }
  }
  console.log(
    "PASS seeded and administrative accounts receive one protected Notes folder",
  );
}

// The contained runner gives this schema fault its own disposable database.
async function rollback() {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 15);
  const data = { ...credentials(), id };
  const creator =
    process.env.VITE_SIGNUP_ENABLED === "true" ? anonymous : admin;
  const schema = await admin.collections.getOne("folders");
  const fields = schema.fields.map((f) =>
    f.name === "name" ? { ...f, pattern: "^Fixture$" } : f,
  );
  await admin.collections.update(schema.id, { fields });
  try {
    await denied(
      creator
        .collection("users")
        .create(data)
        .then((user) => accounts.push(user.id)),
      400,
    );
    await denied(users.getOne(id), 404);
  } finally {
    await admin.collections.update(schema.id, { fields: schema.fields });
  }
  const user = await creator.collection("users").create(data);
  accounts.push(user.id);
  await defaultFolder(user.id);
  console.log(
    "PASS default insertion failure rolls back account (400, read-back 404), retry succeeds",
  );
}

type Account = Awaited<ReturnType<typeof account>>;
async function folderAccess(a: Account, b: Account) {
  const folders = a.pb.collection("folders");
  const data = { user: a.id, name: "  Field Notes  ", name_key: "forged" };
  const folder = await folders.create(data);
  assert.equal(folder.name, "Field Notes");
  assert.equal(folder.name_key, "FIELD NOTES");
  assert.equal(folder.is_default, false);
  const filter = a.pb.filter("id = {:id}", folder);
  assert.deepEqual(
    (await folders.getList(1, 1, { filter })).items.map((r) => r.id),
    [folder.id],
  );
  assert.equal((await folders.getOne(folder.id)).user, a.id);
  assert.equal(
    (await folders.update(folder.id, { name: folder.name, name_key: "fake" }))
      .name_key,
    "FIELD NOTES",
  );
  for (const other of [b.pb, anonymous]) {
    const foreign = other.collection("folders");
    assert.equal((await foreign.getList(1, 1, { filter })).totalItems, 0);
    await denied(foreign.getOne(folder.id), 404);
    await denied(foreign.create({ ...data, name: "Foreign" }), 400);
    await denied(foreign.update(folder.id, { name: folder.name }), 404);
    await denied(foreign.delete(folder.id), 404);
  }
  await denied(folders.update(folder.id, { user: b.id }), 404);
  await denied(folders.update(folder.id, { "user+": b.id }), 404);
  await denied(folders.update(folder.id, { is_default: true }), 404);
  await denied(folders.update(folder.id, { name: "Renamed" }), 404);
  await denied(
    folders.create({ user: a.id, name: "Second default", is_default: true }),
    400,
  );
  const unchanged = await folders.getOne(folder.id);
  assert.deepEqual(
    [unchanged.user, unchanged.name, unchanged.is_default],
    [a.id, folder.name, false],
  );
  assert.equal(await folders.delete(folder.id), true);
  await denied(folders.getOne(folder.id), 404);
  console.log(
    "PASS folder CRUD: owner 200/204, B and anonymous list 200 (empty), view/update/delete 404, forged create 400",
  );
}

async function nonemptyFolder(a: Account) {
  const folders = a.pb.collection("folders");
  const folder = await folders.create({
    user: a.id,
    name: "Documents",
    name_key: "DOCUMENTS",
  });
  const note = await admin.collection("notes").create({
    user: a.id,
    folder: folder.id,
    revision: 1,
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Fixture" }] },
      ],
    },
  });
  await denied(folders.delete(folder.id), 400);
  assert.equal(
    (await admin.collection("notes").getOne(note.id)).folder,
    folder.id,
  );
  await admin.collection("notes").delete(note.id);
  assert.equal(await folders.delete(folder.id), true);
  console.log(
    "PASS nonempty folder delete 400 with reference preserved; empty delete 204",
  );
}

async function folderNames(a: Account, b: Account) {
  const folders = a.pb.collection("folders");
  const create = (name: string) => folders.create({ user: a.id, name });
  for (const name of [
    " notes ",
    "All NOTES",
    "pinned",
    "JOURNAL",
    "open tasks",
    "recently deleted",
    "  ",
    "🥕".repeat(81),
  ]) {
    await denied(create(name), 400);
  }
  assert.equal((await create("🥕".repeat(80))).name, "🥕".repeat(80));
  const first = await create(" Café ");
  assert.equal(first.name, "Café");
  assert.equal(first.name_key, "CAFÉ");
  for (const name of ["CAFÉ", "Cafe\u0301"]) await denied(create(name), 400);
  assert.equal((await create("Cafe")).name_key, "CAFE");
  assert.equal(
    (
      await b.pb
        .collection("folders")
        .create({ user: b.id, name: "Cafe\u0301" })
    ).name,
    "Cafe\u0301",
  );
  const race = await Promise.allSettled(["Москва", "МОСКВА"].map(create));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.find((r) => r.status === "rejected")?.reason.status, 400);
  assert.equal(
    (await folders.getList(1, 2, { filter: 'name_key = "МОСКВА"' })).totalItems,
    1,
  );
  console.log(
    "PASS reserved names, 80 Unicode code points, accented NFC/case, unaccented distinction, cross-owner names, concurrent Cyrillic uniqueness",
  );
}

const textNode = (text: string) => ({ type: "text", text });
const paragraph = (text: string) => ({
  type: "paragraph",
  content: text ? [textNode(text)] : [],
});
const doc = (...content: unknown[]) => ({ type: "doc", content });
const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 15);
async function draft(a: Account) {
  return {
    id: newId(),
    user: a.id,
    folder: (await defaultFolder(a.id)).id,
    body: doc(paragraph("First draft")),
    attachments: [] as string[],
  };
}

async function noteAccess(a: Account, b: Account) {
  const notes = a.pb.collection("notes");
  const data = await draft(a);
  const note = await notes.create({ ...data, revision: 1 });
  const filter = a.pb.filter('id = {:id} && deleted = ""', data);
  assert.equal((await notes.getList(1, 1, { filter })).totalItems, 1);
  assert.equal((await notes.getOne(note.id)).user, a.id);
  for (const other of [b.pb, anonymous]) {
    const foreign = other.collection("notes");
    assert.equal((await foreign.getList(1, 1, { filter })).totalItems, 0);
    await denied(foreign.getOne(note.id), 404);
    await denied(foreign.create({ ...data, id: newId(), revision: 1 }), 400);
    await denied(
      foreign.update(note.id, { revision: 1, body: doc(paragraph("Edit")) }),
      404,
    );
    await denied(foreign.delete(note.id), 404);
  }
  const otherFolder = await a.pb
    .collection("folders")
    .create({ user: a.id, name: "Second folder" });
  for (const change of [
    { user: b.id },
    { "user+": b.id },
    { folder: otherFolder.id },
    { "folder+": otherFolder.id },
    { deleted: "2026-01-01 00:00:00.000Z" },
  ])
    await denied(notes.update(note.id, { revision: 1, ...change }), 404);
  const saved = await notes.update(note.id, {
    revision: 1,
    body: doc(paragraph("Owner edit")),
  });
  await denied(notes.delete(note.id), 400);
  assert.deepEqual(await notes.getOne(note.id), saved);
  assert.deepEqual(
    [saved.user, saved.folder, saved.deleted, saved.revision],
    [a.id, data.folder, "", 2],
  );
}

async function noteFolder(a: Account, b: Account) {
  const data = { ...(await draft(a)), revision: 1 };
  const notes = a.pb.collection("notes");
  for (const folder of ["", newId(), (await defaultFolder(b.id)).id]) {
    await denied(notes.create({ ...data, folder }), 400);
  }
  await denied(
    notes.create({ ...data, deleted: "2026-01-01 00:00:00.000Z" }),
    400,
  );
  await denied(notes.getOne(data.id), 404);
}

async function assertStoredSearchKey(id: string, key: string) {
  assert.match(id, /^[a-z0-9]{15}$/);
  const result = await admin.sql.run(
    `SELECT search_key FROM notes WHERE id = '${id}'`,
  );
  assert.deepEqual(result.rows, [[key]]);
}

async function noteSearch(a: Account, b: Account) {
  const notes = a.pb.collection("notes");
  const body = doc(
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        textNode("Ма"),
        { ...textNode("як ca"), marks: [{ type: "bold" }] },
        {
          ...textNode("fé"),
          marks: [
            { type: "link", attrs: { href: "https://example.test/invisible" } },
          ],
        },
        { type: "hardBreak" },
        { type: "mention", attrs: { id: "internal", value: "Straße" } },
      ],
    },
    {
      type: "blockquote",
      content: [paragraph("line\nend"), paragraph("last")],
    },
  );
  const note = await notes.create({
    ...(await draft(a)),
    revision: 12,
    body,
    title: "fake",
    text: "fake",
    search_key: "fake",
    open_tasks: 9,
    tasks: ["fake"],
  });
  const saved = await notes.getOne(note.id);
  const folder = await a.pb.collection("folders").getOne(note.folder, {
    expand: "notes_via_folder",
  });
  const expanded = folder.expand?.notes_via_folder.find(
    (item: { id: string }) => item.id === note.id,
  );
  assert.ok(expanded, "The owner must see the saved note in its folder");
  assert.deepEqual(
    [note, saved, expanded].map((record) =>
      Object.hasOwn(record, "search_key"),
    ),
    [false, false, false],
    "Create, detail and expanded notes must omit the search key",
  );
  await assertStoredSearchKey(note.id, "МАЯК CAFÉ\nSTRASSE\nLINE\nEND\nLAST");
  assert.deepEqual(
    [saved.title, saved.text, saved.revision, saved.open_tasks, saved.tasks],
    ["Маяк café", "Маяк café\nStraße\nline\nend\nlast", 1, 0, []],
  );
  for (const [term, matches] of [
    ["маЯК", true],
    ["CaFe\u0301", true],
    ["sTrAsSe", true],
    ["Cafe", false],
    ["invisible", false],
    ["heading", false],
    ["internal", false],
  ] as const) {
    const filter = a.pb.filter(
      'deleted = "" && id = {:id} && search_key ~ {:key}',
      {
        id: note.id,
        key: term.normalize("NFC").toUpperCase().normalize("NFC"),
      },
    );
    const list = await notes.getList(1, 1, { filter });
    assert.deepEqual(
      list.items.map((r) => r.id),
      matches ? [note.id] : [],
      term,
    );
    if (matches)
      assert.equal(Object.hasOwn(list.items[0], "search_key"), false);
    assert.equal(
      (await b.pb.collection("notes").getList(1, 1, { filter })).totalItems,
      0,
    );
  }
}

async function noteLines(a: Account) {
  const data = await draft(a);
  const notes = a.pb.collection("notes");
  const long = "🥕".repeat(164);
  for (const [body, text, title] of [
    [doc(paragraph(""), paragraph("second")), "\nsecond", "Untitled note"],
    [doc(paragraph("   \r\nsecond")), "   \r\nsecond", "Untitled note"],
    [doc(paragraph("one\rtwo")), "one\rtwo", "one"],
    [doc(paragraph(long)), long, "🥕".repeat(160)],
  ] as const) {
    const note = await notes.create({
      ...data,
      id: newId(),
      revision: 1,
      body,
    });
    assert.deepEqual([note.body, note.text, note.title], [body, text, title]);
    if (title === "Untitled note")
      await assertStoredSearchKey(
        note.id,
        `UNTITLED NOTE\n${text.toUpperCase()}`,
      );
  }
}

async function noteTasks(a: Account) {
  const data = await draft(a);
  const notes = a.pb.collection("notes");
  const note = await notes.create({ ...data, revision: 1 });
  const list = (label: string, checked = false) => ({
    type: "list",
    attrs: { kind: "task", checked },
    content: [paragraph(label)],
  });
  const items = Array.from({ length: 101 }, (_, i) =>
    list(i === 0 ? "x".repeat(210) : `Task ${i}`),
  );
  const body = doc(list("Done", true), { type: "blockquote", content: items });
  const saved = await notes.update(note.id, {
    revision: 1,
    body,
    title: "forged",
    search_key: "forged",
    text: "forged",
    open_tasks: 42,
    tasks: ["forged"],
  });
  assert.equal(saved.open_tasks, 101);
  assert.deepEqual(
    saved.tasks,
    items.slice(0, 100).map((_, i) => ({
      path: [1, i],
      text: i === 0 ? "x".repeat(200) : `Task ${i}`,
    })),
  );
  assert.equal(saved.title, "Done");
  assert.ok(saved.text.endsWith("Task 100"));
  await assertStoredSearchKey(saved.id, saved.text.toUpperCase());
  assert.equal(Object.hasOwn(saved, "search_key"), false);
}

async function noteBody(a: Account) {
  const notes = a.pb.collection("notes");
  const data = await draft(a);
  // The JSON field limit counts UTF-8 bytes, including document structure.
  const overhead = Buffer.byteLength(JSON.stringify(doc(paragraph("x")))) - 1;
  const room = 102400 - overhead;
  const boundary = "ß".repeat(Math.floor(room / 2)) + "x".repeat(room % 2);
  const body = doc(paragraph(boundary));
  assert.equal(Buffer.byteLength(JSON.stringify(body)), 102400);
  const saved = await notes.create({ ...data, revision: 1, body });
  await assertStoredSearchKey(saved.id, boundary.toUpperCase());
  for (const invalid of [
    doc(paragraph(" \t")),
    doc({ type: "unknown" }),
    doc(paragraph(boundary + "x")),
  ]) {
    await denied(notes.update(saved.id, { body: invalid, revision: 1 }), 400);
  }
  assert.deepEqual(await notes.getOne(saved.id), saved);
}

async function noteFiles(a: Account, b: Account) {
  const data = await draft(a);
  const notes = a.pb.collection("notes");
  const upload = (owner: Account) =>
    owner.pb.collection("attachments").create({
      user: owner.id,
      name: "fixture.txt",
      file: new File(["fixture"], "fixture.txt", { type: "text/plain" }),
    });
  const own = await upload(a);
  const foreign = await upload(b);
  const saved = await notes.create({
    ...data,
    revision: 1,
    body: doc(paragraph("")),
    attachments: [own.id],
  });
  assert.deepEqual(
    [saved.attachments, saved.text, saved.title],
    [[own.id], "", "Untitled note"],
  );
  await assertStoredSearchKey(saved.id, "UNTITLED NOTE");
  const body = doc({ type: "image", attrs: { src: `attachment:${own.id}` } });
  const image = await notes.update(data.id, { revision: 1, body });
  assert.deepEqual(image.body, body);
  for (const attachments of [[], [foreign.id], [newId()]]) {
    await denied(notes.update(data.id, { revision: 2, attachments }), 400);
  }
  await denied(
    notes.update(data.id, {
      revision: 2,
      body: data.body,
      attachments: [foreign.id],
    }),
    400,
  );
  assert.deepEqual(await notes.getOne(data.id), image);
}

function raceWinner<T>(results: PromiseSettledResult<T>[], status: number) {
  const winners = results.filter((r) => r.status === "fulfilled");
  const errors = results.filter((r) => r.status === "rejected");
  assert.equal(winners.length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].reason instanceof ClientResponseError);
  assert.equal(errors[0].reason.status, status);
  return winners[0].value;
}

async function noteIdentity(a: Account, b: Account) {
  const notes = a.pb.collection("notes");
  const submitted = await draft(a);
  await notes.create(submitted); // Discard the acknowledgement, as if the response was lost.
  await assert.rejects(notes.create(submitted), (e) => {
    assert.ok(e instanceof ClientResponseError);
    assert.equal(e.status, 400);
    assert.ok(e.response.data.id.code);
    console.log("Duplicate note ID", e.status, e.response.data.id);
    return true;
  });
  const snapshot = async () => {
    const { id, user, folder, body, attachments, revision } =
      await notes.getOne(submitted.id);
    return { id, user, folder, body, attachments, revision };
  };
  assert.deepEqual(await snapshot(), { ...submitted, revision: 1 });
  const next = { ...submitted, body: doc(paragraph("Queued edit")) };
  // At the same revision a different submitted body is a conflict, even for the owner.
  assert.notDeepEqual(await snapshot(), { ...next, revision: 1 });
  await notes.update(next.id, { body: next.body, revision: 1 });
  assert.deepEqual(await snapshot(), { ...next, revision: 2 });
  assert.notDeepEqual(await snapshot(), { ...submitted, revision: 1 });
  const raced = await draft(a);
  const bodies = [doc(paragraph("A")), doc(paragraph("B"))];
  const winner = raceWinner(
    await Promise.allSettled(
      bodies.map((body) => notes.create({ ...raced, body })),
    ),
    400,
  );
  const stored = await notes.getOne(raced.id);
  assert.deepEqual(
    [stored.body, stored.revision, stored.id],
    [winner.body, 1, raced.id],
  );
  for (const item of [submitted, raced]) {
    const filter = a.pb.filter("id = {:id}", item);
    assert.equal((await notes.getList(1, 2, { filter })).totalItems, 1);
  }
  await denied(
    b.pb.collection("notes").create({ ...(await draft(b)), id: submitted.id }),
    400,
  );
  await denied(b.pb.collection("notes").getOne(submitted.id), 404);
  assert.deepEqual(await snapshot(), { ...next, revision: 2 });
  for (const id of ["a".repeat(14), "a".repeat(16), "A".repeat(15)]) {
    await denied(notes.create({ ...submitted, id }), 400);
  }
}

async function noteRevisions(a: Account) {
  const data = await draft(a);
  const notes = a.pb.collection("notes");
  await notes.create({ ...data, revision: 1 });
  const bodies = [doc(paragraph("Left")), doc(paragraph("Right"))];
  const winner = raceWinner(
    await Promise.allSettled(
      bodies.map((body) => notes.update(data.id, { body, revision: 1 })),
    ),
    409,
  );
  assert.equal(winner.revision, 2);
  assert.ok(["Left", "Right"].includes(winner.title));
  assert.deepEqual(winner.body, doc(paragraph(winner.title)));
  for (const revision of [1, undefined, "2", 2.5, 3]) {
    await denied(
      notes.update(data.id, {
        revision,
        body: doc(paragraph("Rejected edit")),
      }),
      409,
    );
  }
  assert.deepEqual(await notes.getOne(data.id), winner);
}

try {
  const a = await account();
  const b = await account();
  // Run independent cases even on the pre-hook schema to keep each failure visible.
  const failures: string[] = [];
  for (const [label, run] of [
    ["folder access", () => folderAccess(a, b)],
    ["nonempty folder", () => nonemptyFolder(a)],
    ["folder names", () => folderNames(a, b)],
    ["note access", () => noteAccess(a, b)],
    ["note folder", () => noteFolder(a, b)],
    ["note search", () => noteSearch(a, b)],
    ["note lines", () => noteLines(a)],
    ["note tasks", () => noteTasks(a)],
    ["note body", () => noteBody(a)],
    ["note files", () => noteFiles(a, b)],
    ["note identity", () => noteIdentity(a, b)],
    ["note revisions", () => noteRevisions(a)],
    ["default provisioning", () => provisioning(a)],
    ...(process.env.CONTAINED_TEST === "1"
      ? [["default rollback", rollback] as const]
      : []),
  ] as const) {
    try {
      await run();
      console.log(`PASS ${label}`);
    } catch (error) {
      failures.push(label);
      console.error(
        `FAIL ${label}`,
        error instanceof ClientResponseError
          ? [error.status, error.message, error.response.data]
          : String(error),
      );
    }
  }
  assert.deepEqual(failures, []);

  const note = await a.pb.collection("notes").getFirstListItem('deleted = ""');
  await users.delete(a.id);
  accounts.splice(accounts.indexOf(a.id), 1);
  // Superuser read-back distinguishes a real cascade from an invisible orphan.
  await denied(admin.collection("notes").getOne(note.id), 404);
  await denied(admin.collection("folders").getOne(note.folder), 404);
  console.log(
    "PASS account deletion cascades to owned note and folder (204, then 404 as superuser)",
  );
} finally {
  for (const id of accounts) await users.delete(id);
}
