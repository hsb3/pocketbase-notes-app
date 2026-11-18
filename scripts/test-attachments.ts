import assert from "node:assert/strict";
import PocketBase from "pocketbase";
import { assertStorageObject } from "./test-storage-object";
import { Database } from "bun:sqlite";
import { createRequire } from "node:module";
const { candidates: cleanupSQL } = createRequire(import.meta.url)(
  "../pb/hooks/attachment-cleanup.js",
);
const fixture = new Database(":memory:");
fixture.exec(
  `CREATE TABLE attachments(id TEXT, created TEXT);
   CREATE TABLE entries(attachments TEXT);
   CREATE TABLE notes(attachments TEXT);
   INSERT INTO attachments VALUES
     ('old-unused', '2000-01-01'), ('entry-only', '2000-01-01'),
     ('note-only', '2000-01-01'), ('fresh-unused', '2100-01-01');
   INSERT INTO entries VALUES ('["entry-only"]');
   INSERT INTO notes VALUES ('["note-only"]');`,
);
assert.deepEqual(
  fixture
    .query(cleanupSQL.replaceAll("{:cutoff}", "$cutoff"))
    .all({ $cutoff: "2026-01-01" }),
  [{ id: "old-unused" }],
);
fixture.close();

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
const ids: string[] = [];
const clients: PocketBase[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
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
  const data = {
    user: ids[0],
    kind: "note",
    title: "Rich content",
    body: richBody,
    revision: 1,
    attachments: [asset.id],
  };
  const entry = await alice.collection("entries").create(data);
  assert.deepEqual(
    (await alice.collection("entries").getOne(entry.id)).body,
    richBody,
  );
  await denied(bob.collection("entries").create({ ...data, user: ids[1] }));
  await denied(alice.collection("attachments").delete(asset.id));
  await denied(
    alice
      .collection("entries")
      .update(entry.id, { revision: 1, attachments: [] }),
  );
  for (const src of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "blob:unfinished",
  ])
    await denied(
      alice.collection("entries").update(entry.id, {
        revision: 1,
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
  const noteAsset = await alice.collection("attachments").create(upload);
  const foreignURL = bob.files.getURL(noteAsset, noteAsset.file, {
    token: wrongToken,
  });
  assert.equal((await fetch(foreignURL)).status, 404);
  const noteBody = {
    type: "doc",
    content: [{ type: "image", attrs: { src: `attachment:${noteAsset.id}` } }],
  };
  const noteData = { body: noteBody, attachments: [noteAsset.id] };
  const defaultFolder = (client: PocketBase) =>
    client.collection("folders").getFirstListItem("is_default = true");
  await denied(
    bob.collection("notes").create({
      ...noteData,
      user: ids[1],
      folder: (await defaultFolder(bob)).id,
    }),
  );
  await alice.collection("notes").create({
    ...noteData,
    user: ids[0],
    folder: (await defaultFolder(alice)).id,
  });
  await denied(alice.collection("attachments").delete(noteAsset.id));
  const files = alice.collection("attachments");
  const orphan = await files.create(upload);
  const expired =
    process.env.CONTAINED_TEST === "1" ? await files.create(upload) : null;
  if (expired) {
    // Autodate fields ignore record updates. Backdate only these disposable fixtures.
    const ids = [asset.id, noteAsset.id, expired.id].map((id) => {
      assert.match(id, /^[a-z0-9]{15}$/);
      return `'${id}'`;
    });
    const aged = await admin.sql.run(
      `UPDATE attachments SET created = '2000-01-01 00:00:00.000Z' WHERE id IN (${ids.join(",")})`,
    );
    assert.equal(aged.affectedRows, 3);
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
  for (const file of [asset, noteAsset]) {
    assert.equal((await files.getOne(file.id)).id, file.id);
    const download = await fetch(
      alice.files.getURL(file, file.file, { token }),
    );
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  }

  await alice.collection("entries").delete(entry.id);
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
  await alice.collection("attachments").delete(orphan.id);
  console.log(
    "PASS: full document round trip, protected files, ownership, unsafe/oversized rejection, entry-only and note-only reference protection and orphan selection",
  );
} finally {
  for (const id of ids) await admin.collection("users").delete(id);
}
