import assert from "node:assert/strict";
import PocketBase, { type RecordModel } from "pocketbase";
import { assertStorageObject } from "./test-storage-object";

const url = process.env.VITE_PB_URL;
assert(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Run only against a local development backend.",
);
const admin = new PocketBase(url);
await admin
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
await admin.collections.getOne("attachments");
async function wait(check: () => Promise<boolean>, label: string) {
  const end = Date.now() + 30000;
  do {
    if (await check()) return;
    await Bun.sleep(250);
  } while (Date.now() < end);
  assert.fail(`Timed out: ${label}`);
}
const summaries = async () =>
  (
    await admin.logs.getList(1, 50, {
      filter: 'message="Note purge finished" || message="Note purge aborted"',
    })
  ).items;
if (process.argv.includes("--cron-ready")) {
  assert.equal(process.env.CONTAINED_TEST, "1");
  const jobs = await admin.crons.getFullList();
  console.log("Manual cron registrations", jobs);
  assert.deepEqual(
    jobs.filter((j) => j.id === "expired-notes"),
    [{ id: "expired-notes", expression: "0 0 30 2 *" }],
  );
  assert.equal(jobs.filter((j) => j.id === "unused-attachments").length, 1);
  const { logs } = await admin.settings.getAll();
  assert(logs.maxDays > 0 && logs.minLevel <= 0);
  assert.equal((await summaries()).length, 0);
  assert.equal(await admin.crons.run("expired-notes"), true);
  await wait(
    async () => (await summaries()).length > 0,
    "manual invocation on fresh database",
  );
  const [done] = await summaries();
  assert.equal(done.message, "Note purge finished");
  assert.equal(done.data.removed, 0);
  assert.equal(done.data.failed, 0);
  console.log("Manual cron ready", done.data);
  process.exit(0);
}
const ids: string[] = [];
const clients: PocketBase[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAH0lEQVR4nAASAO3/Av////8AAAAAAAAAAAAAAAAAAwA9+AP/4916ugAAAABJRU5ErkJggg==",
  "base64",
);
let denial = 0;
async function denied(action: Promise<unknown>, status = 400) {
  await assert.rejects(
    action,
    { status },
    `Access/validation rejection ${++denial}`,
  );
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `attachment-${crypto.randomUUID()}@example.com`,
      password = crypto.randomUUID();
    const user = await admin
      .collection("users")
      .create({ email, password, passwordConfirm: password, verified: true });
    ids.push(user.id);
    const client = new PocketBase(process.env.VITE_PB_URL);
    client.autoCancellation(false);
    await client.collection("users").authWithPassword(email, password);
    clients.push(client);
  }
  const [alice, bob] = clients;
  const upload = new FormData();
  upload.set("user", ids[0]);
  upload.set("name", "photo.png");
  upload.set("file", new File([png], "photo.png", { type: "image/png" }));
  const asset = await alice.collection("attachments").create(upload);
  await assertStorageObject(
    `${asset.collectionId}/${asset.id}/${asset.file}`,
    "Attachment object must exist in RustFS",
  );
  const baseURL = alice.files.getURL(asset, asset.file);
  assert.equal((await fetch(baseURL)).status, 404);
  const token = await alice.files.getToken();
  const response = await fetch(
    alice.files.getURL(asset, asset.file, { token }),
  );
  assert(response.ok);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  const wrongToken = await bob.files.getToken();
  assert.equal(
    (await fetch(bob.files.getURL(asset, asset.file, { token: wrongToken })))
      .status,
    404,
  );
  assert.equal(
    (await bob.collection("attachments").getList(1, 20)).totalItems,
    0,
  );
  await denied(bob.collection("attachments").getOne(asset.id), 404);
  await denied(bob.collection("attachments").delete(asset.id), 404);
  await denied(bob.collection("attachments").create(upload));
  const richBody = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A link",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.com",
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
              },
              { type: "underline" },
            ],
          },
        ],
      },
      {
        type: "list",
        attrs: { kind: "task", order: null, checked: true, collapsed: false },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Done" }] },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: "const answer = 42;" }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1, colwidth: null },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Cell" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "mathBlock",
        attrs: { language: "tex" },
        content: [{ type: "text", text: "x^2" }],
      },
      {
        type: "image",
        attrs: { src: `attachment:${asset.id}`, width: 100, height: 100 },
      },
    ],
  };
  const defaultFolder = (client: PocketBase) =>
    client.collection("folders").getFirstListItem("is_default = true");
  const notes = alice.collection("notes");
  const data = {
    user: ids[0],
    folder: (await defaultFolder(alice)).id,
    body: richBody,
    attachments: [asset.id],
  };
  const note = await notes.create(data);
  assert.deepEqual((await notes.getOne(note.id)).body, richBody);
  await denied(
    bob.collection("notes").create({
      ...data,
      user: ids[1],
      folder: (await defaultFolder(bob)).id,
    }),
  );
  await denied(alice.collection("attachments").delete(asset.id));
  await denied(
    notes.update(note.id, { revision: note.revision, attachments: [] }),
  );
  for (const src of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "blob:unfinished",
  ])
    await denied(
      notes.update(note.id, {
        revision: note.revision,
        body: { type: "doc", content: [{ type: "image", attrs: { src } }] },
      }),
    );
  const invalid = new FormData();
  invalid.set("user", ids[0]);
  invalid.set("name", "unsafe.html");
  invalid.set(
    "file",
    new File(["<script>alert(1)</script>"], "unsafe.html", {
      type: "text/html",
    }),
  );
  await denied(alice.collection("attachments").create(invalid));
  const oversized = new FormData();
  oversized.set("user", ids[0]);
  oversized.set("name", "large.txt");
  oversized.set(
    "file",
    new File(["a".repeat(10 * 1024 * 1024 + 1)], "large.txt", {
      type: "text/plain",
    }),
  );
  await denied(alice.collection("attachments").create(oversized));
  const files = alice.collection("attachments");
  const orphan = await files.create(upload);
  const expired =
    process.env.CONTAINED_TEST === "1" ? await files.create(upload) : null;
  if (expired) {
    // Autodate fields ignore record updates. Backdate only these disposable fixtures.
    const ids = [asset.id, expired.id].map((id) => {
      assert.match(id, /^[a-z0-9]{15}$/);
      return `'${id}'`;
    });
    const aged = await admin.sql.run(
      `UPDATE attachments SET created = '2000-01-01 00:00:00.000Z' WHERE id IN (${ids.join(",")})`,
    );
    assert.equal(aged.affectedRows, 2);
  }
  await admin.crons.run("unused-attachments");
  if (expired) {
    // Cron requests return before the job completes.
    const filter = alice.filter("id = {:id}", { id: expired.id });
    for (let i = 0; i < 50; i++) {
      if (!(await files.getList(1, 1, { filter })).totalItems) break;
      await Bun.sleep(100);
    }
    await denied(files.getOne(expired.id), 404);
  }
  assert.equal((await files.getOne(asset.id)).id, asset.id);
  const download = await fetch(
    alice.files.getURL(asset, asset.file, { token }),
  );
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);

  const detach = {
    body: { type: "doc", content: [richBody.content[0]] },
    attachments: [],
  };
  await denied(
    notes.update(note.id, { ...detach, revision: note.revision - 1 }),
    409,
  );
  await denied(files.delete(asset.id));
  await notes.update(note.id, { ...detach, revision: note.revision });
  const detached = await notes.getOne(note.id);
  assert.equal(detached.revision, note.revision + 1);
  assert.deepEqual(detached.attachments, []);
  assert.deepEqual(detached.body, detach.body);
  await alice.collection("attachments").delete(asset.id);
  assert.equal(
    (await fetch(alice.files.getURL(asset, asset.file, { token }))).status,
    404,
  );
  assert.equal(
    (await alice.collection("attachments").getOne(orphan.id)).id,
    orphan.id,
    "Fresh drafts must survive cleanup",
  );
  if (process.env.CONTAINED_TEST === "1") {
    await purgeCases(alice, data.folder, upload, orphan);
  }
  await alice.collection("attachments").delete(orphan.id);
  console.log(
    "PASS: full document round trip, protected files, ownership, unsafe/oversized rejection, note reference protection, orphan cleanup and revision-checked detach",
  );
} finally {
  for (const id of ids) await admin.collection("users").delete(id);
}

async function purgeCases(
  alice: PocketBase,
  folder: string,
  upload: FormData,
  fresh: RecordModel,
) {
  const user = alice.authStore.record!.id;
  const files = alice.collection("attachments");
  const notes = alice.collection("notes");
  const bucket = new Bun.S3Client({
    endpoint: "http://rustfs:9000",
    bucket: process.env.RUSTFS_BUCKET,
    accessKeyId: process.env.RUSTFS_ACCESS_KEY,
    secretAccessKey: process.env.RUSTFS_SECRET_KEY,
    region: "us-east-1",
  });
  const original = (f: RecordModel) => `${f.collectionId}/${f.id}/${f.file}`;
  const thumb = (f: RecordModel) =>
    `${f.collectionId}/${f.id}/thumbs_${f.file}/100x100_${f.file}`;
  async function head(key: string) {
    const r = await fetch(bucket.presign(key, { method: "HEAD" }), {
      method: "HEAD",
    });
    assert([200, 404].includes(r.status), `RustFS HEAD ${key}: ${r.status}`);
    return r.status;
  }
  const token = await alice.files.getToken();
  async function readable(f: RecordModel) {
    assert.equal((await files.getOne(f.id)).file, f.file);
    const response = await fetch(alice.files.getURL(f, f.file, { token }));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.deepEqual(
      Buffer.from(await bucket.file(original(f)).arrayBuffer()),
      png,
    );
  }
  const assets = [];
  for (let i = 0; i < 10; i++) assets.push(await files.create(upload));
  const [x, u, sharedActive, sharedRetained, y, aged, ...corruptFiles] = assets;
  const thumbnail = await fetch(
    alice.files.getURL(x, x.file, { token, thumb: "100x100" }),
  );
  assert.equal(thumbnail.status, 200);
  const bytes = Buffer.from(await thumbnail.arrayBuffer());
  assert(bytes.length > 0);
  assert.notDeepEqual(bytes, png);
  assert.deepEqual(
    Buffer.from(await bucket.file(thumb(x)).arrayBuffer()),
    bytes,
  );
  assert.equal(await head(thumb(u)), 404);
  console.log(
    "RustFS thumbnail inventory",
    thumb(x),
    bytes.length,
    thumb(u),
    404,
  );
  const sql = (q: string) => admin.sql.run(q);
  function ids(rows: RecordModel[]) {
    return rows
      .map((r) => {
        assert.match(r.id, /^[a-z0-9]{15}$/);
        return `'${r.id}'`;
      })
      .join(",");
  }
  const note = (attachments: RecordModel[] = []) =>
    notes.create({
      user,
      folder,
      attachments: attachments.map((r) => r.id),
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Cron fixture" }],
          },
        ],
      },
    });
  const active = await note([sharedActive]),
    retained = await note([sharedRetained]),
    restore = await note([y]);
  const eligible = [await note([x, u, sharedActive, sharedRetained])];
  for (let i = 0; i < 100; i++) eligible.push(await note());
  const invalid: RecordModel[] = [];
  for (const f of corruptFiles) invalid.push(await note([f]));
  const early = "2000-01-01 00:00:00.000Z";
  const recent = (
    await sql("SELECT strftime('%Y-%m-%d %H:%M:%fZ','now','-1 day')")
  ).rows[0][0]!;
  async function date(rows: RecordModel[], value: string) {
    assert.match(value, /^[!a-zA-Z0-9:. -]+$/);
    assert.equal(
      (
        await sql(
          `UPDATE notes SET deleted='${value}' WHERE id IN (${ids(rows)})`,
        )
      ).affectedRows,
      rows.length,
    );
    assert.deepEqual(
      (
        await sql(
          `SELECT deleted,count(*) FROM notes WHERE id IN (${ids(rows)}) GROUP BY deleted`,
        )
      ).rows,
      [[value, String(rows.length)]],
    );
  }
  await date(eligible, early);
  await date([retained, restore], recent);
  for (const [i, v] of [
    "0001-01-01 00:00:00.000Z",
    "!invalid",
    "2099-02-30 00:00:00.000Z",
    "zz-invalid",
  ].entries())
    await date([invalid[i]], v);
  const raw = async (rows: RecordModel[]) =>
    (await sql(`SELECT * FROM notes WHERE id IN (${ids(rows)}) ORDER BY id`))
      .rows;
  const badBefore = await raw(invalid);
  assert.equal((await notes.getOne(active.id)).deleted, "");
  for (const f of [...assets, fresh]) await readable(f);
  assert.equal(
    (
      await sql(
        `UPDATE attachments SET created='${early}' WHERE id IN (${ids(assets)})`,
      )
    ).affectedRows,
    assets.length,
  );
  const rawBadFiles = async () =>
    (
      await sql(
        `SELECT * FROM attachments WHERE id IN (${ids(corruptFiles)}) ORDER BY id`,
      )
    ).rows;
  const badFiles = await rawBadFiles();
  await admin.crons.run("unused-attachments");
  await wait(
    async () => (await head(original(aged))) === 404,
    "aged orphan removal",
  );
  await denied(files.getOne(aged.id), 404);
  async function survivors(rows: RecordModel[]) {
    for (const f of rows) await readable(f);
    assert.deepEqual(await rawBadFiles(), badFiles);
    assert.deepEqual(await raw(invalid), badBefore);
  }
  await survivors(assets.filter((f) => f.id !== aged.id).concat(fresh));
  async function run(count = 1) {
    const old = new Set((await summaries()).map((l) => l.data.run));
    await Promise.all(
      Array.from({ length: count }, () =>
        admin.crons.run("expired-notes", { requestKey: null }),
      ),
    );
    const results = async () =>
      (await summaries()).filter((l) => !old.has(l.data.run));
    await wait(
      async () => (await results()).length >= count,
      "new terminal purge summaries",
    );
    const done = await results();
    assert.equal(new Set(done.map((l) => l.data.run)).size, count);
    for (const l of done) {
      console.log("Terminal purge", l.message, l.data);
      if (l.data.failed) {
        const filter = admin.filter(
          "message='Note purge failed' && data.run={:run}",
          { run: l.data.run },
        );
        console.error(
          (await admin.logs.getList(1, 20, { filter })).items.map(
            (r) => r.data,
          ),
        );
      }
      assert.equal(l.message, "Note purge finished");
      assert.equal(l.data.failed, 0);
      assert.equal(l.data.invalid, 4);
      const bad = (
        await admin.logs.getList(1, 20, {
          filter: admin.filter(
            "message='Invalid purge date' && data.run={:run}",
            { run: l.data.run },
          ),
        })
      ).items;
      assert(bad.every((r) => r.data.owner === user));
      assert.deepEqual(
        bad.map((r) => r.data.note).sort(),
        invalid.map((r) => r.id).sort(),
      );
    }
    return done;
  }
  const [first] = await run();
  assert.equal(first.data.removed, eligible.length);
  assert.deepEqual(await raw(eligible), []);
  const keys = (
    await admin.logs.getList(1, 100, {
      filter: admin.filter(
        "message='Purge attachment key' && data.run={:run}",
        { run: first.data.run },
      ),
    })
  ).items.map((l) => l.data);
  assert.deepEqual(
    keys.map((k) => k.key).sort(),
    [original(x), original(u), thumb(x), thumb(u)].sort(),
  );
  for (const f of [x, u]) {
    await denied(files.getOne(f.id), 404);
    assert.equal(
      (await fetch(alice.files.getURL(f, f.file, { token }))).status,
      404,
    );
    for (const k of keys.filter(
      (k) => k.key === original(f) || k.key === thumb(f),
    )) {
      assert.equal(k.attachment, f.id);
      assert.equal(k.note, eligible[0].id);
      assert.equal(k.owner, user);
      assert.equal(k.prefix, `${f.collectionId}/${f.id}/`);
      assert.equal(k.expectedOriginal, k.key === original(f));
      assert.equal(k.observed, k.key !== thumb(u));
      assert.equal(k.possibleDerivative, k.key === thumb(f));
    }
    for (const key of [original(f), thumb(f)])
      await wait(async () => (await head(key)) === 404, key);
  }
  console.log(
    "Exclusive key roles and independent RustFS absence",
    JSON.stringify(keys),
  );
  const keep = [sharedActive, sharedRetained, y, ...corruptFiles, fresh];
  await survivors(keep);
  assert.equal((await notes.getOne(active.id)).deleted, "");
  assert.equal((await notes.getOne(retained.id)).deleted, recent);
  assert.equal((await run())[0].data.removed, 0);
  await survivors(keep);
  const restored = await alice.send(
    `/api/notebook/notes/${restore.id}/restore`,
    { method: "POST", body: { revision: 1 } },
  );
  assert.equal(restored.deleted, "");
  assert.deepEqual((await notes.getOne(restore.id)).attachments, [y.id]);
  await date([active, retained], early);
  const overlapping = await run(2);
  assert.equal(
    overlapping.reduce((n, l) => n + l.data.removed, 0),
    2,
  );
  assert.deepEqual(await raw([active, retained]), []);
  for (const f of [sharedActive, sharedRetained]) {
    await denied(files.getOne(f.id), 404);
    await wait(async () => (await head(original(f))) === 404, original(f));
  }
  await survivors([y, ...corruptFiles, fresh]);
}
