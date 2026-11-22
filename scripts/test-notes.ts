import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";
import { markRetained, noteActions } from "./test-note-actions";
import { liveUpdates } from "./test-live-updates";
import { journal } from "./test-journal";
import { pins } from "./test-pins";

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
}

async function seedProvisioning() {
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
  console.log("PASS seeded account receives one protected Notes folder");
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
async function checkList(
  pb: PocketBase,
  identity: string,
  collection: "folders" | "notes",
  lookup: string,
  filter: string,
  ids: string[],
  hidden: string[],
) {
  const endpoint = new URL(
    `/api/collections/${collection}/records`,
    pb.baseURL,
  );
  endpoint.searchParams.set("filter", filter);
  const response = await fetch(endpoint, {
    headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  for (const value of hidden)
    assert(!body.includes(value), "Private list value returned");
  const page = JSON.parse(body);
  const visible = page.items.map((item: { id: string }) => item.id);
  assert.equal(page.totalItems, ids.length);
  assert.deepEqual(visible, ids);
  console.log(
    "R6 list",
    JSON.stringify({
      collection,
      identity,
      lookup,
      status: response.status,
      total: page.totalItems,
      visible,
    }),
  );
}

async function folderAccess(a: Account, b: Account) {
  const folders = a.pb.collection("folders");
  const data = { user: a.id, name: "  Field Notes  ", name_key: "forged" };
  const folder = await folders.create(data);
  assert.equal(folder.name, "Field Notes");
  assert.equal(folder.name_key, "FIELD NOTES");
  assert.equal(folder.is_default, false);
  const filter = a.pb.filter("id = {:id}", folder);
  const same = await b.pb
    .collection("folders")
    .create({ user: b.id, name: folder.name });
  const unique = await folders.create({
    user: a.id,
    name: "Private trail ledger",
  });
  for (const [identity, pb] of [
    ["A", a.pb],
    ["B", b.pb],
    ["guest", anonymous],
  ] as const) {
    const hidden = [
      ...(identity === "A" ? [] : [a.id, folder.id, unique.id, unique.name]),
      ...(identity === "B" ? [] : [b.id, same.id]),
    ];
    await checkList(
      pb,
      identity,
      "folders",
      "same name",
      pb.filter("name = {:name}", folder),
      identity === "A" ? [folder.id] : identity === "B" ? [same.id] : [],
      hidden,
    );
    await checkList(
      pb,
      identity,
      "folders",
      "unique name",
      pb.filter("name = {:name}", unique),
      identity === "A" ? [unique.id] : [],
      hidden,
    );
  }
  for (const expected of [folder, same, unique])
    assert.deepEqual(
      await admin.collection("folders").getOne(expected.id),
      expected,
    );
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
  for (const [identity, pb] of [
    ["A", a.pb],
    ["B", b.pb],
    ["guest", anonymous],
  ] as const)
    await checkList(
      pb,
      identity,
      "notes",
      "active ID",
      filter,
      identity === "A" ? [note.id] : [],
      identity === "A" ? [] : [note.id, note.user, note.folder, note.title],
    );
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
  assert.deepEqual(await a.pb.collection("notes").getOne(note.id), note);
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

const searchFields = "id,folder,title,updated,snippet";

function searchOptions(pb: PocketBase, term: string) {
  const folded = term.normalize("NFC").toUpperCase().normalize("NFC");
  const pattern = "%" + folded.replace(/[\\%_]/g, "\\$&") + "%";
  return {
    query: { searchTerm: term },
    filter:
      'deleted = "" && ' + pb.filter("search_key ~ {:pattern}", { pattern }),
    sort: "-updated,-id",
    fields: searchFields,
    cache: "no-store" as const,
    requestKey: null,
  };
}

async function searchPage(pb: PocketBase, term: string, page = 1) {
  const result = await pb
    .collection("notes")
    .getList(page, 20, searchOptions(pb, term));
  assert.equal(result.page, page);
  assert.equal(result.perPage, 20);
  return result;
}

async function hits(pb: PocketBase, term: string, ids: string[]) {
  const page = await searchPage(pb, term);
  assert.equal(
    page.totalItems,
    ids.length,
    `total for ${JSON.stringify(term)}`,
  );
  assert.deepEqual(page.items.map((r) => r.id).sort(), [...ids].sort());
  for (const row of page.items) {
    assert.deepEqual(Object.keys(row).sort(), searchFields.split(",").sort());
    assert.deepEqual(Object.keys(row.snippet).sort(), [
      "after",
      "before",
      "match",
    ]);
    for (const [part, limit] of [
      ["before", 33],
      ["match", 160],
      ["after", 33],
    ] as const) {
      assert.equal(typeof row.snippet[part], "string");
      assert.ok(Array.from(row.snippet[part]).length <= limit);
    }
    assert.ok(row.snippet.match);
  }
  return page.items;
}

async function writeText(a: Account, text: string) {
  return a.pb
    .collection("notes")
    .create({ ...(await draft(a)), body: doc(paragraph(text)) });
}

async function boundarySearch() {
  const a = await account();
  const notes = a.pb.collection("notes");
  const title = "x".repeat(158) + "ze";
  const text = title + "\u0301";
  const key = "X".repeat(158) + "ZE\n" + "X".repeat(158) + "ZÉ";
  let note = await writeText(a, text);
  for (const revision of [1, 3]) {
    assert.deepEqual(
      [note.title, note.text, note.revision],
      [title, text, revision],
    );
    assert.equal((await hits(a.pb, "ZE", [note.id]))[0].snippet.match, "ze");
    assert.equal(
      (await hits(a.pb, "ZÉ", [note.id]))[0].snippet.match,
      "ze\u0301",
    );
    await assertStoredSearchKey(note.id, key);
    if (revision === 1) {
      note = await notes.update(note.id, {
        revision,
        body: doc(paragraph("Plain")),
      });
      assert.equal(note.revision, 2);
      await assertStoredSearchKey(note.id, "PLAIN");
      await hits(a.pb, "ZE", []);
      await hits(a.pb, "ZÉ", []);
      note = await notes.update(note.id, {
        revision: 2,
        body: doc(paragraph(text)),
      });
    }
  }
}

async function nulSearch() {
  const a = await account();
  const notes = a.pb.collection("notes");
  const note = await writeText(a, "Oak\0lantern");
  for (const n of [1, 2]) {
    const prefix = "Oak" + "\0".repeat(n);
    const text = prefix + "lantern";
    if (n === 2)
      await notes.update(note.id, { revision: 1, body: doc(paragraph(text)) });
    const current = await notes.getOne(note.id);
    assert.deepEqual(
      [current.body, current.title, current.text, current.revision],
      [doc(paragraph(text)), text, text, n],
    );
    const hex = Buffer.from(text).toString("hex").toUpperCase();
    assert.match(note.id, /^[a-z0-9]{15}$/);
    assert.deepEqual(
      (
        await admin.sql.run(
          `SELECT hex(title), hex(text) FROM notes WHERE id='${note.id}'`,
        )
      ).rows,
      [[hex, hex]],
    );
    const [row] = await hits(a.pb, "LANTERN", [note.id]);
    assert.deepEqual(row.snippet, {
      before: prefix,
      match: "lantern",
      after: "",
    });
    await assertStoredSearchKey(note.id, "OAK" + "\n".repeat(n) + "LANTERN");
    for (const miss of ["OAKLANTERN", "OAK LANTERN"])
      await hits(a.pb, miss, []);
  }
}

async function distantMarks() {
  const a = await account();
  const note = await writeText(
    a,
    "a".repeat(80) + "q" + "\u0301".repeat(29) + "\u0300" + "b".repeat(80),
  );
  const [hit] = await hits(a.pb, "\u0300", [note.id]);
  assert.deepEqual(hit.snippet, {
    before: "…aaq" + "\u0301".repeat(29),
    match: "\u0300",
    after: "b".repeat(32) + "…",
  });
}

async function composedSpan() {
  const a = await account();
  const text = "A" + "\u0315".repeat(29) + "\u0300";
  const composed = await writeText(a, text);
  const [span] = await hits(a.pb, "À", [composed.id]);
  assert.deepEqual(span.snippet, { before: "", match: text, after: "" });

  const term = "café".repeat(40);
  const original = "cafe\u0301".repeat(40);
  const long = await writeText(a, "a".repeat(80) + original + "b".repeat(80));
  const [bounded] = await hits(a.pb, term, [long.id]);
  assert.deepEqual(bounded.snippet, {
    before: "…" + "a".repeat(32),
    match: original.slice(0, 79) + "…" + original.slice(-80),
    after: "b".repeat(32) + "…",
  });
}

async function streamSafeSearch() {
  const a = await account();
  const note = await writeText(
    a,
    "Garden\n" + "q" + "\u0301".repeat(160) + "\u0300 lantern",
  );
  const [word] = await hits(a.pb, "LANTERN", [note.id]);
  assert.equal(word.snippet.match, "lantern");

  const page = await searchPage(a.pb, "\u034f");
  assert.equal(page.totalItems, 1);
  assert.deepEqual(
    page.items.map((r) => r.id),
    [note.id],
  );
  assert.deepEqual(page.items[0].snippet, {
    before: "Garden\nq" + "\u0301".repeat(24) + "…",
    match: "",
    after: "",
  });
}

async function literalSearch() {
  const a = await account();
  const text = `Garden\n🥕 cafe\u0301 Маяк Straße 5%_\\"' & <b> 5% interest`;
  const positive = await writeText(a, text);
  await writeText(a, "Garden\n5XX interest");
  const notes = a.pb.collection("notes");
  for (const [q, rawCount, match] of [
    ["GARDEN", 2, "Garden"],
    ["CAFÉ", 0, "cafe\u0301"],
    ["МАЯК", 0, "Маяк"],
  ] as const) {
    const raw = await notes.getList(1, 20, {
      filter: a.pb.filter('deleted = "" && (title ~ {:q} || text ~ {:q})', {
        q,
      }),
    });
    assert.equal(raw.totalItems, rawCount);
    if (rawCount !== 2)
      assert.equal(
        (await hits(a.pb, q, [positive.id]))[0].snippet.match,
        match,
      );
    else
      assert.deepEqual(
        (await searchPage(a.pb, q)).items.map((r) => r.snippet.match),
        [match, match],
      );
  }
  for (const [term, match] of [
    ["STRASSE", "Straße"],
    ["🥕", "🥕"],
    ["5% interest", "5% interest"],
    ["%", "%"],
    ["_", "_"],
    ["\\", "\\"],
    ['"', '"'],
    ["'", "'"],
    [`5%_\\"'`, `5%_\\"'`],
    ["<b>", "<b>"],
  ]) {
    assert.equal(
      (await hits(a.pb, term, [positive.id]))[0].snippet.match,
      match,
    );
  }
  await hits(a.pb, "cafe", []);
  const blank = await writeText(a, "\nvisible only");
  assert.equal(
    (await hits(a.pb, "UNTITLED NOTE", [blank.id]))[0].snippet.match,
    "Untitled note",
  );
}

async function searchPrivacy() {
  const a = await account(),
    b = await account();
  const folder = await a.pb
    .collection("folders")
    .create({ user: a.id, name: "Garden" });
  const note = await a.pb.collection("notes").create({
    user: a.id,
    folder: folder.id,
    body: doc(
      paragraph("Garden writing"),
      paragraph("Distant sentinel"),
      paragraph("x".repeat(100000) + " 🥕Late-A-Word"),
    ),
  });
  const foreign = await writeText(b, "B-only-word");
  const [row] = await hits(a.pb, "LATE-A-WORD", [note.id]);
  assert.deepEqual(
    [row.folder, row.title, row.updated, row.snippet],
    [
      folder.id,
      note.title,
      note.updated,
      { before: "…" + "x".repeat(30) + " 🥕", match: "Late-A-Word", after: "" },
    ],
  );
  assert.ok(!JSON.stringify(row).includes("Distant sentinel"));
  await hits(b.pb, "B-only-word", [foreign.id]);
  for (const pb of [b.pb, anonymous]) await hits(pb, "Late-A-Word", []);
  for (const pb of [a.pb, anonymous]) await hits(pb, "B-only-word", []);
  if (process.env.CONTAINED_TEST === "1") {
    await markRetained(admin, note.id);
    for (const pb of [a.pb, b.pb, anonymous]) await hits(pb, "Late-A-Word", []);
  }
}

async function visibleSearch() {
  const a = await account();
  const file = await a.pb.collection("attachments").create({
    user: a.id,
    name: "codedfilename.txt",
    file: new File(["codedfilebytes"], "codedfilename.txt", {
      type: "text/plain",
    }),
  });
  await a.pb.collection("notes").create({
    ...(await draft(a)),
    attachments: [file.id],
    body: doc({
      type: "paragraph",
      content: [
        textNode("Sty"),
        {
          ...textNode("led"),
          marks: [
            { type: "link", attrs: { href: "https://example.test/hiddenurl" } },
          ],
        },
        { type: "hardBreak" },
        {
          type: "mention",
          attrs: { id: "hiddenmention", value: "MentionLabel" },
        },
      ],
    }),
  });
  for (const miss of [
    "paragraph",
    "codedfilename",
    "codedfilebytes",
    "hiddenurl",
    "hiddenmention",
  ])
    await hits(a.pb, miss, []);
  for (const term of ["Styled", "MentionLabel"]) {
    const page = await searchPage(a.pb, term);
    assert.equal(page.totalItems, 1);
    assert.equal(page.items[0].snippet.match, term);
  }
  const repeated = await writeText(a, "paragraph\nparagraph paragraph");
  await hits(a.pb, "paragraph", [repeated.id]);
}

async function invalidSearch(a: Account) {
  const notes = a.pb.collection("notes");
  const opts = searchOptions(a.pb, "test");
  for (const overrides of [
    { filter: 'search_key ~ "TEST"' },
    { fields: "id,text" },
    { expand: "folder" },
    { skipTotal: true },
    { sort: "id" },
  ])
    await denied(notes.getList(1, 20, { ...opts, ...overrides }), 400);
  await denied(notes.getList(1, 21, opts), 400);
  for (const term of ["", " a ", "a".repeat(161), "x\0y", "x\ny", "x\u2028y"])
    await denied(notes.getList(1, 20, searchOptions(a.pb, term)), 400);
}

async function searchPaging() {
  const a = await account();
  const folder = await a.pb
    .collection("folders")
    .create({ user: a.id, name: "Garden" });
  const home = await defaultFolder(a.id);
  const ids = [];
  for (let i = 0; i < 21; i++)
    ids.push(
      (
        await a.pb.collection("notes").create({
          user: a.id,
          folder: i % 2 ? home.id : folder.id,
          body: doc(paragraph("Paged text")),
        })
      ).id,
    );
  assert.match(a.id, /^[a-z0-9]{15}$/);
  assert.equal(
    (
      await admin.sql.run(
        `UPDATE notes SET updated='2026-01-01 00:00:00.000Z' WHERE user='${a.id}'`,
      )
    ).affectedRows,
    21,
  );
  ids.sort().reverse();
  for (const number of [1, 2]) {
    const page = await searchPage(a.pb, "paged", number);
    assert.equal(page.totalPages, 2);
    assert.equal(page.totalItems, 21);
    assert.deepEqual(
      page.items.map((r) => r.id),
      ids.slice((number - 1) * 20, number * 20),
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

async function noteList(a: Account, b: Account) {
  const notes = a.pb.collection("notes");
  const folder = await a.pb
    .collection("folders")
    .create({ user: a.id, name: "Page fixture" });
  const filter = a.pb.filter('folder = {:folder} && deleted = ""', {
    folder: folder.id,
  });
  const fields = "id,folder,title,updated,excerpt";
  const query = { filter, sort: "-updated,-id" };
  const write = (text: string) =>
    notes.create({
      user: a.id,
      folder: folder.id,
      body: doc(paragraph(text)),
      excerpt: "forged",
    });
  const long = "🥕".repeat(3000);
  const expected = "🥕".repeat(120);
  for (let i = 0; i < 20; i++) await write(`Title ${i}\r\n${long}`);

  async function measure(projection?: string) {
    const params = new URLSearchParams({ ...query, page: "1", perPage: "20" });
    if (projection) params.set("fields", projection);
    const start = performance.now();
    const res = await fetch(`${url}/api/collections/notes/records?${params}`, {
      headers: { Authorization: a.pb.authStore.token },
    });
    assert.equal(res.status, 200);
    const raw = await res.text();
    const elapsed = performance.now() - start;
    const bytes = Buffer.byteLength(raw, "utf8");
    console.log(
      `List page ${projection ? "projected" : "default"}: ${bytes} decoded UTF-8 bytes, ${elapsed.toFixed(2)} ms`,
    );
    const page = JSON.parse(raw);
    assert.equal(page.totalItems, 20);
    assert.equal(page.items.length, 20);
    return { bytes, items: page.items as Record<string, string>[] };
  }
  const full = await measure();
  const projected = await measure(fields);
  assert.ok(projected.bytes < full.bytes);
  for (const [i, row] of projected.items.entries()) {
    assert.equal(
      full.items[i].excerpt,
      expected,
      "Default list must return the computed preview",
    );
    assert.equal(Object.hasOwn(full.items[i], "search_key"), false);
    assert.deepEqual(Object.keys(row).sort(), fields.split(",").sort());
    assert.deepEqual(
      row,
      Object.fromEntries(fields.split(",").map((k) => [k, full.items[i][k]])),
    );
  }
  const row = projected.items[0];
  const detail = await notes.getOne(row.id);
  assert.deepEqual(detail.body, doc(paragraph(`${row.title}\r\n${long}`)));
  assert.equal(Object.hasOwn(detail, "excerpt"), false);
  for (const pb of [b.pb, anonymous]) {
    assert.equal(
      (await pb.collection("notes").getList(1, 20, { ...query, fields }))
        .totalItems,
      0,
    );
    await denied(pb.collection("notes").getOne(row.id), 404);
  }
  let revision = detail.revision;
  for (const [text, expected] of [
    ["Single line only", ""],
    ["Title\n  ", ""],
    ["\nBody only", "Body only"],
    ["Title\r  Fold\t  spaces", "Fold spaces"],
    ["Title\u2028New\u2029line", "New line"],
    ["Title\u2029Next", "Next"],
  ]) {
    const updated = await notes.update(row.id, {
      revision,
      body: doc(paragraph(text)),
      excerpt: "forged",
    });
    revision = updated.revision;
    const preview = await notes.getFirstListItem(
      a.pb.filter("id = {:id}", row),
      { fields },
    );
    assert.equal(preview.excerpt, expected);
    assert.equal(Object.hasOwn(updated, "excerpt"), false);
  }
  if (process.env.CONTAINED_TEST === "1") {
    const removed = await markRetained(admin, row.id);
    assert.equal((await notes.getOne(row.id)).deleted, removed);
    const active = await notes.getList(1, 20, { ...query, fields });
    assert.equal(active.totalItems, 19);
    assert.ok(active.items.every((r) => r.id !== row.id));
  }
}

async function noteTasks(a: Account, b: Account) {
  const data = await draft(a);
  const notes = a.pb.collection("notes");
  const list = (label: string, checked = false) => ({
    type: "list",
    attrs: { kind: "task", checked },
    content: [paragraph(label)],
  });
  const parent = list("Done", true);
  const bodyWithChild = doc({
    ...parent,
    content: [...parent.content, list("Still open")],
  });
  const note = await notes.create({
    ...data,
    body: bodyWithChild,
    open_tasks: 0,
    tasks: [],
  });
  assert.equal(note.open_tasks, 1);
  assert.deepEqual(note.tasks, [{ path: [0, 1], text: "Still open" }]);
  const openTasks = (pb: PocketBase) =>
    pb.collection("notes").getFullList({
      filter: pb.filter("id = {:id} && open_tasks > 0", { id: note.id }),
      fields: "id,tasks",
    });
  assert.deepEqual(await openTasks(a.pb), [{ id: note.id, tasks: note.tasks }]);
  for (const client of [b.pb, anonymous]) {
    assert.deepEqual(await openTasks(client), []);
  }
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
  const checked = await notes.update(note.id, {
    revision: saved.revision,
    body: doc(list("Finished", true)),
  });
  assert.equal(checked.open_tasks, 0);
  assert.deepEqual(checked.tasks, []);
  assert.deepEqual(await openTasks(a.pb), []);
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
    doc({ type: "paragraph" }),
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

if (process.argv[2] === "--seed-codegen") {
  assert.equal(process.env.CONTAINED_TEST, "1", "Requires the contained stack");
  const owner = await account();
  const notes = owner.pb.collection("notes");
  const data = await draft(owner);
  await notes.create(data);
  assert.deepEqual((await notes.getOne(data.id)).body, data.body);
  console.log("Seeded a codegen account, default folder and note");
  process.exit(0);
}

try {
  const a = await account();
  const b = await account();
  // Run independent cases even on the pre-hook schema to keep each failure visible.
  const failures: string[] = [];
  for (const [label, run] of [
    ...(process.env.CONTAINED_TEST === "1"
      ? [
          [
            "unfiltered active notes and owner tombstone",
            async () => {
              const owner = await account();
              await noteActions(admin, owner.pb, await draft(owner));
            },
          ] as const,
        ]
      : []),
    ["note pins", async () => pins(admin, await account(), b, anonymous)],
    [
      "journal dates",
      async () => journal(admin, await account(), b, anonymous),
    ],
    [
      "live updates",
      async () => liveUpdates(admin, await account(), b, anonymous),
    ],
    ["folder access", () => folderAccess(a, b)],
    ["nonempty folder", () => nonemptyFolder(a)],
    ["folder names", () => folderNames(a, b)],
    ["note access", () => noteAccess(a, b)],
    ["note folder", () => noteFolder(a, b)],
    ["note search", () => noteSearch(a, b)],
    ["search title boundary", boundarySearch],
    ["search word after NUL", nulSearch],
    ["search distant marks", distantMarks],
    ["search composite span", composedSpan],
    ["stream-safe search fallback", streamSafeSearch],
    ["search literal operands", literalSearch],
    ["search private late hit", searchPrivacy],
    ["search visible source", visibleSearch],
    ["invalid marked searches", () => invalidSearch(a)],
    ...(process.env.CONTAINED_TEST === "1"
      ? [["search tied pages", searchPaging] as const]
      : []),
    ["note lines", () => noteLines(a)],
    ["list projection", () => noteList(a, b)],
    ["note tasks", () => noteTasks(a, b)],
    ["note body", () => noteBody(a)],
    ["note files", () => noteFiles(a, b)],
    ["note identity", () => noteIdentity(a, b)],
    ["note revisions", () => noteRevisions(a)],
    ["default provisioning", () => provisioning(a)],
    ["seed provisioning", seedProvisioning],
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
  const note = await a.pb.collection("notes").getFirstListItem('deleted = ""');
  await users.delete(a.id);
  accounts.splice(accounts.indexOf(a.id), 1);
  // Superuser read-back distinguishes a real cascade from an invisible orphan.
  await denied(admin.collection("notes").getOne(note.id), 404);
  await denied(admin.collection("folders").getOne(note.folder), 404);
  console.log(
    "PASS account deletion cascades to owned note and folder (204, then 404 as superuser)",
  );
  assert.deepEqual(failures, []);
} finally {
  for (const id of accounts) await users.delete(id);
}
