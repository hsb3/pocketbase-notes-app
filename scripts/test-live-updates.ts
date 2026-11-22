import assert from "node:assert/strict";
import PocketBase, { ClientResponseError } from "pocketbase";

type Account = { pb: PocketBase; id: string };
type Event = { name: string; data: Record<string, unknown> };
const topic = "notebook-changes";
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const forbidden = [
  "user",
  "title",
  "text",
  "body",
  "excerpt",
  "search_key",
  "tasks",
  "attachments",
];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bun has no EventSource, so read the SSE stream with fetch, as the SDK does in a browser.
async function listen(base: string, topics: string[], token = "") {
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(180_000)]);
  const response = await fetch(new URL("/api/realtime", base), { signal });
  assert.equal(response.status, 200);
  assert(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: Event[] = [];
  let buffer = "";
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
        let name = "";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) name = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5);
        }
        if (name) events.push({ name, data: JSON.parse(data || "{}") });
      }
    }
  })().catch(() => undefined); // The stream ends by abort or cancel.
  const connect = await until(
    () => events.find((e) => e.name === "PB_CONNECT"),
    "PB_CONNECT",
  );
  const clientId = String(connect.data.clientId);
  assert.match(clientId, /^.{40}$/);
  const post = (auth: string) =>
    fetch(new URL("/api/realtime", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ clientId, subscriptions: topics }),
      signal: AbortSignal.timeout(10_000),
    });
  assert.equal((await post(token)).status, 204);
  return {
    events,
    post,
    notices: () => events.filter((e) => e.name === topic).map((e) => e.data),
    close: async () => {
      stop.abort();
      await reader.cancel().catch(() => undefined);
      await pump;
    },
  };
}

async function until<T>(probe: () => T | undefined, label: string, ms = 5_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = probe();
    if (value) return value;
    assert(Date.now() < deadline, `Timed out waiting for ${label}`);
    await pause(25);
  }
}

async function status(job: Promise<unknown>) {
  try {
    await job;
    return 200;
  } catch (error) {
    assert(error instanceof ClientResponseError, String(error));
    return error.status;
  }
}

export async function liveUpdates(
  admin: PocketBase,
  ownerA: Account,
  otherB: Account,
  guest: PocketBase,
) {
  const base = admin.baseURL;
  const a1 = await listen(base, [topic], ownerA.pb.authStore.token);
  const b = await listen(base, [topic, "notes/*"], otherB.pb.authStore.token);
  const anon = await listen(base, [topic], guest.authStore.token);
  const root = await listen(base, [topic], admin.authStore.token);
  try {
    const notes = ownerA.pb.collection("notes");
    const folders = ownerA.pb.collection("folders");
    const home = (await folders.getFirstListItem("is_default = true")).id;
    const garden = (await folders.create({ user: ownerA.id, name: "Garden" }))
      .id;
    const action = (id: string, verb: string, body: unknown, pb = ownerA.pb) =>
      pb.send(`/api/notebook/notes/${id}/${verb}`, {
        method: "POST",
        body,
        requestKey: null,
      });
    const seen: Record<string, unknown>[] = [];
    // Each committed write must produce exactly the next notice, with these values.
    async function expect(write: () => Promise<unknown>, ...wanted: object[]) {
      await write();
      const count = seen.length + wanted.length;
      await until(() => a1.notices().length >= count, `A1 notice ${count}`);
      const got = a1.notices().slice(seen.length);
      assert.equal(got.length, wanted.length);
      for (const [i, notice] of got.entries()) {
        assert.deepEqual(notice, wanted[i]);
        for (const key of forbidden) assert(!(key in notice), key);
        const read = await notes.getOne(String(notice.id), {
          requestKey: null,
        });
        assert.equal(read.revision, notice.revision);
        seen.push(notice);
      }
    }
    async function quiet(write: () => Promise<unknown>, code: number) {
      assert.equal(await status(write()), code);
      await pause(300);
      assert.equal(a1.notices().length, seen.length);
    }

    let note = await notes.create({
      user: ownerA.id,
      folder: home,
      body: doc("Live one"),
    });
    await until(() => a1.notices().length >= 1, "A1 create notice");
    const id = note.id;
    const notice = (fields: object) => ({
      id,
      folder: home,
      deleted: false,
      revision: 1,
      ...fields,
    });
    assert.deepEqual(
      a1.notices()[0],
      notice({ pinned: false, journal_date: "" }),
    );
    seen.push(a1.notices()[0]);
    await expect(
      async () =>
        (note = await notes.update(id, { body: doc("Live two"), revision: 1 })),
      notice({ revision: 2, pinned: false, journal_date: "" }),
    );
    await expect(
      () => action(id, "move", { revision: 2, folder: garden }),
      notice({ folder: garden, revision: 3 }),
    );
    await expect(
      () => action(id, "pin", { pinned: true }),
      notice({ folder: garden, revision: 3, pinned: true }),
    );
    await expect(
      () => action(id, "pin", { pinned: false }),
      notice({ folder: garden, revision: 3, pinned: false }),
    );
    // A day change keeps the revision and carries the day (specs/002-notes-redesign/r8-journal/contracts/journal.md).
    for (const day of ["2026-11-21", "2026-11-21", ""]) {
      await expect(
        () => action(id, "date", { journal_date: day }),
        notice({ folder: garden, revision: 3, journal_date: day }),
      );
    }
    await expect(
      () => action(id, "delete", { revision: 3 }),
      notice({ folder: garden, revision: 4, deleted: true }),
    );
    await expect(
      () => action(id, "restore", { revision: 4 }),
      notice({ folder: garden, revision: 5 }),
    );

    // Refused writes send nothing.
    await quiet(() => action(id, "move", { revision: 4, folder: home }), 409);
    await quiet(() => action(id, "pin", { pinned: true, revision: 5 }), 400);
    await quiet(
      () => action(id, "move", { revision: 5, folder: home }, otherB.pb),
      404,
    );
    await quiet(() => action(id, "date", { journal_date: "2026-02-31" }), 400);
    await quiet(
      () => action(id, "date", { journal_date: "2026-11-21" }, otherB.pb),
      404,
    );
    await quiet(
      () => notes.update(id, { body: doc("Stale"), revision: 2 }),
      409,
    );
    await expect(
      () => action(id, "delete", { revision: 5 }),
      notice({ folder: garden, revision: 6, deleted: true }),
    );
    const aged = await admin.sql.run(
      `UPDATE notes SET deleted=strftime('%Y-%m-%d %H:%M:%fZ','now','-30 days','-1 second') WHERE id='${id}'`,
    );
    assert.equal(aged.affectedRows, 1);
    await quiet(() => action(id, "restore", { revision: 6 }), 410);

    // A folder delete sends one notice per affected note.
    const doomed = (await folders.create({ user: ownerA.id, name: "Doomed" }))
      .id;
    const members = [];
    for (const text of ["First", "Second"]) {
      members.push(
        await notes.create({
          user: ownerA.id,
          folder: doomed,
          body: doc(text),
        }),
      );
    }
    await until(
      () => a1.notices().length >= seen.length + 2,
      "A1 member create notices",
    );
    seen.push(...a1.notices().slice(seen.length));
    const preview = await ownerA.pb.send<{ snapshot: string }>(
      `/api/notebook/folders/${doomed}/delete-preview`,
      { requestKey: null },
    );
    members.sort((x, y) => x.id.localeCompare(y.id));
    await expect(
      () => folders.delete(doomed, { query: { snapshot: preview.snapshot } }),
      ...members.map((m) => ({
        id: m.id,
        folder: "",
        deleted: true,
        revision: 2,
      })),
    );

    // B's own write reaches B only.
    const theirFolder = await otherB.pb
      .collection("folders")
      .getFirstListItem("is_default = true");
    const theirs = await otherB.pb.collection("notes").create({
      user: otherB.id,
      folder: theirFolder.id,
      body: doc("Theirs"),
    });
    await otherB.pb.collection("notes").update(theirs.id, {
      body: doc("Theirs again"),
      revision: theirs.revision,
    });
    await until(
      () =>
        b
          .notices()
          .some(
            (n) => n.id === theirs.id && n.revision === theirs.revision + 1,
          ),
      "B's own notice",
    );
    await pause(300);
    assert.equal(a1.notices().length, seen.length);
    const mine = new Set(seen.map((n) => n.id));
    assert.deepEqual(
      b.notices().filter((n) => mine.has(n.id)),
      [],
    );
    assert.deepEqual(
      b.events.filter(
        (e) =>
          e.name === "notes/*" &&
          mine.has((e.data.record as { id?: string } | undefined)?.id),
      ),
      [],
    );
    assert.deepEqual(anon.notices(), []);
    assert.deepEqual(root.notices(), []);
    // Auth is bound to the connection: another account cannot take it over.
    assert.equal((await a1.post(otherB.pb.authStore.token)).status, 403);
    console.log("Live updates", {
      notices: seen.length,
      id,
      members: members.length,
    });
  } finally {
    await Promise.all([a1.close(), b.close(), anon.close(), root.close()]);
  }
}
