import assert from "node:assert/strict";
import PocketBase, { type RecordModel } from "pocketbase";

export async function markRetained(admin: PocketBase, id: string) {
  assert.equal(process.env.CONTAINED_TEST, "1");
  assert.match(id, /^[a-z0-9]{15}$/);
  const result = await admin.sql.run(
    `UPDATE notes SET deleted = strftime('%Y-%m-%d %H:%M:%fZ','now','-1 day') WHERE id = '${id}'`,
  );
  assert.equal(result.affectedRows, 1);
  const { deleted } = await admin.collection("notes").getOne(id);
  assert.match(deleted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  return deleted as string;
}

export async function noteActions(
  admin: PocketBase,
  owner: PocketBase,
  draft: { user: string; folder: string; body: unknown },
) {
  const notes = owner.collection("notes");
  const { user, folder, body } = draft;
  const active = await notes.create({ user, folder, body });
  const removed = await notes.create({ user, folder, body });
  const list = () => notes.getList(1, 20, { fields: "id" });
  const before = await list();
  assert.equal(before.totalItems, 2);
  assert.deepEqual(
    before.items.map((r) => r.id).sort(),
    [active.id, removed.id].sort(),
  );
  const stamp = await markRetained(admin, removed.id);
  const detail = await notes.getOne(removed.id);
  assert.deepEqual([detail.user, detail.deleted], [user, stamp]);
  assert.equal((await notes.getOne(active.id)).deleted, "");
  const after = await list();
  console.log("Unfiltered owner list", {
    active: active.id,
    deleted: removed.id,
    stamp,
    before: before.items,
    after: after.items,
  });
  assert.deepEqual(after.items, [{ id: active.id }]);
  assert.equal(after.totalItems, 1);

  const password = crypto.randomUUID();
  const email = `r5-${password}@example.test`;
  const second = await admin
    .collection("users")
    .create({ email, password, passwordConfirm: password, verified: true });
  try {
    const other = new PocketBase(owner.baseURL);
    await other.collection("users").authWithPassword(email, password);
    await transitions(admin, owner, other, active, removed);
  } finally {
    await admin.collection("users").delete(second.id);
  }
}

const period = 2_592_000_000;
const stampShape = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}Z$/;
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

async function stored(admin: PocketBase, id: string) {
  assert.match(id, /^[a-z0-9]{15}$/);
  const result =
    await admin.sql.run(`SELECT *,hex(body) AS body_bytes,hex(search_key) AS key_bytes,
    hex(attachments) AS attachment_bytes,hex(tasks) AS task_bytes FROM notes WHERE id='${id}'`);
  assert.equal(result.rows.length, 1);
  return Object.fromEntries(
    result.columns.map((c, i) => [c.name, result.rows[0][i]]),
  );
}

async function transitions(
  admin: PocketBase,
  owner: PocketBase,
  other: PocketBase,
  active: RecordModel,
  removed: RecordModel,
) {
  const guest = new PocketBase(owner.baseURL);
  const notes = owner.collection("notes");
  const user = active.user;
  const source = active.folder;
  const garden = async (pb: PocketBase) =>
    (
      await pb
        .collection("folders")
        .create({ user: pb.authStore.record!.id, name: "Garden" })
    ).id;
  const destination = await garden(owner);
  const foreign = await garden(other);
  const bytes = "R5 private attachment";
  const upload = (name: string) =>
    owner.collection("attachments").create({
      user,
      name,
      file: new File([bytes + name], name, { type: "text/plain" }),
    });
  const files = [await upload("z.txt"), await upload("a.txt")];
  const term = "café";
  const rich = {
    type: "doc",
    content: [
      paragraph("Private oak"),
      paragraph("Body-only café"),
      {
        type: "list",
        attrs: { kind: "task", checked: false },
        content: [paragraph("Private task")],
      },
    ],
  };
  const row = await notes.create({
    user,
    folder: source,
    attachments: files.map((f) => f.id),
    body: rich,
  });
  const id = row.id;
  assert.match(id, /^[a-z0-9]{15}$/);
  assert.equal(
    (
      await admin.sql.run(
        `UPDATE notes SET created='2020-01-01 00:00:00.001Z' WHERE id='${id}'`,
      )
    ).affectedRows,
    1,
  );
  await notes.update(id, { revision: 1, body: rich });
  const start = await stored(admin, id);
  assert.notEqual(start.created, start.updated);
  assert.equal(start.open_tasks, "1");
  const control = await notes.update(active.id, {
    revision: active.revision,
    body: { type: "doc", content: [paragraph("Control café")] },
  });
  const path = (verb: string, target = id) =>
    `/api/notebook/notes/${target}/${verb}`;
  async function privateRequest(
    input: string | URL | Request,
    options?: RequestInit,
  ) {
    const response = await fetch(input, options);
    if (response.ok) {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /\bno-store\b/);
    }
    return response;
  }
  const send = (verb: string, body: unknown, pb = owner, target = id) =>
    pb.send(path(verb, target), {
      method: "POST",
      body,
      requestKey: null,
      fetch: privateRequest,
    });
  const trash = (pb = owner, page = "") =>
    pb.send("/api/notebook/recently-deleted" + page, {
      method: "GET",
      requestKey: null,
      fetch: privateRequest,
    });
  async function rejected(job: Promise<unknown>, status: number) {
    let message = "";
    await assert.rejects(job, (e: { status: number; message: string }) => {
      assert.equal(e.status, status, e.message);
      message = e.message;
      return true;
    });
    return message;
  }
  async function filesPrivate() {
    for (const file of files) {
      for (const [pb, expected] of [
        [owner, 200],
        [other, 404],
        [guest, 404],
      ] as const) {
        const token = pb === guest ? "" : await pb.files.getToken();
        const res = await fetch(pb.files.getURL(file, file.file, { token }));
        assert.equal(res.status, expected);
        const content = await res.text();
        if (expected === 200) assert.equal(content, bytes + file.name);
        else assert(!content.includes(bytes));
      }
    }
  }
  async function library(folder: string, deleted: string) {
    const reads = async (filter: string, ids: string[]) => {
      const page = await notes.getList(1, 20, { filter });
      assert.deepEqual(page.items.map((i) => i.id).sort(), ids.sort());
      assert.equal(page.totalItems, ids.length);
    };
    await reads("", deleted ? [control.id] : [control.id, id]);
    for (const selected of [source, destination]) {
      await reads(owner.filter("folder = {:selected}", { selected }), [
        ...(selected === source ? [control.id] : []),
        ...(!deleted && selected === folder ? [id] : []),
      ]);
    }
    for (const pb of [owner, other, guest]) {
      const result = await pb.collection("notes").getList(1, 20, {
        filter: 'deleted = "" && search_key ~ "%CAFÉ%"',
        sort: "-updated,-id",
        fields: "id,folder,title,updated,snippet",
        query: { searchTerm: term },
      });
      const expected =
        pb === owner ? (deleted ? [control.id] : [control.id, id]) : [];
      assert.equal(result.totalItems, expected.length);
      assert.deepEqual(
        result.items.map((item) => item.id).sort(),
        expected.sort(),
      );
      if (pb === owner && !deleted) {
        const match = result.items.find((item) => item.id === id)!;
        assert.deepEqual([match.folder, match.snippet.match], [folder, term]);
      } else assert(!JSON.stringify(result).includes("Private oak"));
    }
    const page = await trash();
    assert.deepEqual(Object.keys(page).sort(), [
      "items",
      "page",
      "perPage",
      "serverNow",
      "totalItems",
      "totalPages",
    ]);
    assert.equal(new Date(page.serverNow).toISOString(), page.serverNow);
    assert.deepEqual([page.page, page.perPage, page.totalPages], [1, 20, 1]);
    assert.equal(page.totalItems, deleted ? 2 : 1);
    assert.deepEqual(
      page.items.map((r: RecordModel) => r.id),
      deleted ? [id, removed.id] : [removed.id],
    );
    if (deleted) {
      const detail = await notes.getOne(id, {
        fetch: privateRequest,
        expand: "attachments",
      });
      assert.deepEqual(
        detail.expand?.attachments.map((f: RecordModel) => f.id),
        files.map((f) => f.id),
      );
      assert.deepEqual(
        [detail.deleted, detail.folder, detail.user],
        [deleted, folder, user],
      );
      assert.deepEqual(page.items[0], {
        id,
        folder,
        title: row.title,
        revision: detail.revision,
        deleted,
        deadline: new Date(
          Date.parse(deleted.replace(" ", "T")) + period,
        ).toISOString(),
      });
    }
    console.log("R5 verified library", {
      id,
      folder,
      deleted,
      trash: page.items,
    });
  }
  let revision = 2;
  let folder = source;
  let deleted = "";
  async function act(verb: string) {
    const payload = {
      revision,
      ...(verb === "move" ? { folder: destination } : {}),
    };
    const before = await stored(admin, id);
    const result = await send(verb, payload);
    if (verb === "move") folder = destination;
    if (verb === "delete") {
      assert.match(result.deleted, stampShape);
      assert(
        Math.abs(Date.now() - Date.parse(result.deleted.replace(" ", "T"))) <
          60_000,
      );
      deleted = result.deleted;
    }
    if (verb === "restore") deleted = "";
    revision++;
    assert.deepEqual(result, { id, user, folder, deleted, revision });
    const after = await stored(admin, id);
    console.log("R5 committed", { verb, payload, result, before, after });
    assert.deepEqual(after, {
      ...before,
      folder,
      deleted,
      revision: String(revision),
    });
    await rejected(send(verb, payload), 409);
    assert.deepEqual(await stored(admin, id), after);
    await library(folder, deleted);
    await filesPrivate();
  }
  await library(folder, deleted);
  await act("move");
  for (const value of [
    undefined,
    "3",
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    revision - 1,
  ])
    await rejected(send("delete", { revision: value }), 409);
  for (const fields of [
    { user },
    { deleted: "" },
    { now: 0 },
    { "revision+": 1 },
  ])
    await rejected(send("delete", { revision, ...fields }), 400);
  for (const body of [null, [], false, "bad json"]) {
    const res = await fetch(new URL(path("delete"), owner.baseURL), {
      method: "POST",
      headers: {
        Authorization: owner.authStore.token,
        "Content-Type": "application/json",
      },
      body: body === "bad json" ? "{" : JSON.stringify(body),
    });
    assert.equal(res.status, 400);
  }
  const missing = "0".repeat(15);
  assert.equal(
    await rejected(send("move", { revision, folder: foreign }), 400),
    await rejected(send("move", { revision, folder: missing }), 400),
  );
  for (const invalid of [destination, "all", "A".repeat(15), null])
    await rejected(send("move", { revision, folder: invalid }), 400);
  await rejected(send("restore", { revision }), 400);
  for (const verb of ["delete", "move", "restore"]) {
    const args = {
      revision: 1,
      ...(verb === "move" ? { folder: foreign } : {}),
    };
    const denied = await rejected(send(verb, args, other), 404);
    assert.equal(await rejected(send(verb, args, other, missing), 404), denied);
    await rejected(send(verb, args, guest), 401);
    await rejected(send(verb, args, admin), 403);
  }
  const bTrash = await trash(other);
  assert.deepEqual(
    [bTrash.totalItems, bTrash.totalPages, bTrash.items],
    [0, 0, []],
  );
  const ownB = await other.collection("notes").create({
    user: other.authStore.record!.id,
    folder: foreign,
    body: { type: "doc", content: [paragraph("Second account only")] },
  });
  await send("delete", { revision: ownB.revision }, other, ownB.id);
  const privatePage = await trash(other);
  assert.equal(privatePage.totalItems, 1);
  assert.deepEqual(
    privatePage.items.map((item: RecordModel) => item.id),
    [ownB.id],
  );
  for (const privateValue of [
    id,
    user,
    destination,
    row.title,
    "Body-only café",
    "Private task",
    bytes,
  ])
    assert(!JSON.stringify(privatePage).includes(privateValue));
  await rejected(trash(guest), 401);
  for (const query of [
    "?page=1&page=2",
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=",
    "?page=9007199254740991",
    "?filter=id",
    "?sort=id",
    "?expand=user",
    "?now=0",
    "?user=" + user,
  ])
    await rejected(trash(owner, query), 400);
  for (const pb of [other, guest]) {
    assert.equal((await pb.collection("notes").getList(1, 20)).totalItems, 0);
    await rejected(pb.collection("notes").getOne(id), 404);
    await rejected(
      pb.collection("notes").update(id, { revision, body: rich }),
      404,
    );
    await rejected(pb.collection("notes").delete(id), 404);
    await rejected(pb.collection("folders").delete(destination), 404);
  }
  await rejected(notes.update(id, { revision, folder: source }), 404);
  await rejected(
    notes.update(id, { revision, deleted: "2025-01-01 00:00:00.000Z" }),
    404,
  );
  await rejected(notes.delete(id), 400);
  assert.deepEqual(await stored(admin, id), {
    ...start,
    folder,
    revision: String(revision),
  });
  await act("delete");
  await rejected(notes.update(id, { revision: revision - 1, body: rich }), 409);
  await rejected(send("move", { revision, folder: source }), 400);
  await rejected(send("delete", { revision }), 400);
  await rejected(notes.update(id, { revision, body: rich }), 400);
  await act("restore");

  for (const competing of ["move", "save"]) {
    const baseline = await notes.getOne(id);
    const edited = {
      type: "doc",
      content: [paragraph("Concurrent writing café")],
    };
    const results = await Promise.allSettled([
      send("delete", { revision: baseline.revision }),
      competing === "move"
        ? send("move", { revision: baseline.revision, folder: source })
        : notes.update(
            id,
            { revision: baseline.revision, body: edited },
            { requestKey: null },
          ),
    ]);
    const saved = await notes.getOne(id);
    console.log(
      "R5 concurrency",
      competing,
      results.map((r) => (r.status === "fulfilled" ? 200 : r.reason.status)),
      saved.id,
      saved.revision,
    );
    assert.equal(saved.revision, baseline.revision + 1);
    const won = results.findIndex((r) => r.status === "fulfilled");
    assert.notEqual(won, -1);
    const loser = results[1 - won];
    assert(loser.status === "rejected");
    assert.equal(loser.reason.status, 409);
    assert.deepEqual(
      saved.body,
      won === 1 && competing === "save" ? edited : baseline.body,
    );
    assert.equal(
      saved.folder,
      won === 1 && competing === "move" ? source : baseline.folder,
    );
    if (won === 0) {
      assert.match(saved.deleted, stampShape);
      await send("restore", { revision: saved.revision });
    } else assert.equal(saved.deleted, "");
  }
  const latest = await notes.getOne(id);
  assert(latest.text.includes(term));
  await send("delete", { revision: latest.revision });
  const freshDeletion = await stored(admin, id);
  assert.match(String(freshDeletion.deleted), stampShape);
  assert((await trash()).items.some((item: RecordModel) => item.id === id));
  const clock = await admin.sql.run(
    "SELECT strftime('%Y-%m-%d %H:%M:%fZ','now','-30 days','-1 second')",
  );
  const agedAt = clock.rows[0][0];
  assert(agedAt);
  assert.match(agedAt, stampShape);
  const aged = await admin.sql.run(
    `UPDATE notes SET deleted='${agedAt}' WHERE id='${id}' AND deleted>''`,
  );
  assert.equal(aged.affectedRows, 1);
  const expired = await stored(admin, id);
  assert.deepEqual(expired, { ...freshDeletion, deleted: agedAt });
  await rejected(
    send("restore", { revision: Number(freshDeletion.revision) }),
    410,
  );
  assert.deepEqual(await stored(admin, id), expired);
  const expiredHits = await notes.getList(1, 20, {
    filter: 'deleted = "" && search_key ~ "%CAFÉ%"',
    sort: "-updated,-id",
    fields: "id,folder,title,updated,snippet",
    query: { searchTerm: term },
  });
  assert.deepEqual(
    expiredHits.items.map((r) => r.id),
    [control.id],
  );
  assert.equal(expiredHits.totalItems, 1);
  assert.deepEqual(
    (await trash()).items.map((r: RecordModel) => r.id),
    [removed.id],
  );
  assert.deepEqual(
    (await notes.getFullList({ fields: "id" })).map((r) => r.id),
    [control.id],
  );
  const detached = await notes.create({
    user,
    folder: destination,
    body: rich,
  });
  await send("delete", { revision: 1 }, owner, detached.id);
  assert.match(detached.id, /^[a-z0-9]{15}$/);
  assert.equal(
    (
      await admin.sql.run(
        `UPDATE notes SET folder='' WHERE id='${detached.id}'`,
      )
    ).affectedRows,
    1,
  );
  const retained = await stored(admin, detached.id);
  assert.equal(retained.folder, "");
  const restored = await send("restore", { revision: 2 }, owner, detached.id);
  assert.deepEqual(restored, {
    id: detached.id,
    user,
    folder: source,
    deleted: "",
    revision: 3,
  });
  assert.deepEqual(await stored(admin, detached.id), {
    ...retained,
    folder: source,
    deleted: "",
    revision: "3",
  });

  const tied: string[] = [];
  for (let i = 0; i < 21; i++)
    tied.push((await notes.create({ user, folder: source, body: rich })).id);
  for (const entry of tied) assert.match(entry, /^[a-z0-9]{15}$/);
  assert.match(removed.id, /^[a-z0-9]{15}$/);
  assert.equal(
    (
      await admin.sql.run(`UPDATE notes SET deleted=(SELECT deleted FROM notes WHERE id='${removed.id}')
    WHERE id IN (${tied.map((i) => `'${i}'`).join(",")})`)
    ).affectedRows,
    21,
  );
  const ids: string[] = [];
  for (const pageNumber of [1, 2]) {
    const page = await trash(owner, "?page=" + pageNumber);
    assert.deepEqual(
      [
        page.page,
        page.perPage,
        page.totalItems,
        page.totalPages,
        page.items.length,
      ],
      [pageNumber, 20, 22, 2, pageNumber === 1 ? 20 : 2],
    );
    ids.push(...page.items.map((r: RecordModel) => r.id));
  }
  assert.deepEqual(ids, [removed.id, ...tied].sort().reverse());
}
