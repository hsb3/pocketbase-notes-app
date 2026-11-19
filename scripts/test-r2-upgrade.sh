#!/bin/sh
# The API runner supplies the pinned binary and a separate, disposable database.
set -eu
[ "${CONTAINED_TEST:-}" = 1 ] && [ -f /.dockerenv ] && [ -x /pb/pocketbase ] || exit 2
exec python3 - <<'PY'
from contextlib import contextmanager
from pathlib import Path
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

origin = "http://127.0.0.1:18081"
source = Path("/pb/pb_migrations")
password = os.environ["PB_PASSWORD"]

def api(path, data=None, token=None):
    request = Request(origin + "/api/" + path, headers={"Content-Type": "application/json"})
    if token:
        request.add_header("Authorization", token)
    if data is not None:
        request.data = json.dumps(data).encode()
    with urlopen(request, timeout=5) as response:
        return json.load(response)

def login(collection, email):
    return api(f"collections/{collection}/auth-with-password", {"identity": email, "password": password})["token"]

def create(collection, token, **fields):
    return api(f"collections/{collection}/records", fields, token)

def user(token, email):
    return create("users", token, email=email, password=password, passwordConfirm=password, verified=True)["id"]

def body(text):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}

@contextmanager
def server():
    with subprocess.Popen([*pb, "serve", "--http=127.0.0.1:18081"], stdout=subprocess.DEVNULL) as process:
        try:
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError("Staged PocketBase exited before readiness")
                try:
                    api("health")
                    break
                except URLError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Staged PocketBase health timeout")
            yield
        finally:
            process.terminate()

with tempfile.TemporaryDirectory(prefix="r2-upgrade-") as scratch:
    root = Path(scratch)
    hooks = root / "hooks"
    migrations = root / "migrations"
    hooks.mkdir()
    migrations.mkdir()
    pb = ["/pb/pocketbase", f"--dir={root}/data", f"--migrationsDir={migrations}",
          f"--hooksDir={hooks}", "--encryptionEnv=PB_ENCRYPTION_KEY"]
    r1 = "1795000000_created_folders_and_notes.js"
    for migration in sorted(source.glob("*.js")):
        if migration.name < r1:
            shutil.copy(migration, migrations)
    shutil.copy("/pb/pb_hooks/entry-validation.js", hooks)
    subprocess.run([*pb, "superuser", "create", os.environ["PB_EMAIL"], password], check=True,
                   stdout=subprocess.DEVNULL)
    with server():
        admin = login("_superusers", os.environ["PB_EMAIL"])
        old = user(admin, "older@example.test")
        entry = create("entries", admin, user=old, kind="note", title="Legacy", body=body("Legacy"), revision=1)
        assert entry["user"] == old

    shutil.copy(source / r1, migrations)
    for name in ["folders.pb.js", "comparison-key.js"]:
        shutil.copy(Path("/pb/pb_hooks") / name, hooks)
    with server():
        current = user(admin, "r1@example.test")
        folder = create("folders", admin, user=current, name="Garden")
        # Store the R1 representation before any R2 note hook is loaded.
        text = "Title\nR1 body"
        note = create("notes", admin, user=current, folder=folder["id"], revision=1, body=body(text),
                      title="Title", text=text, search_key=text.upper(), open_tasks=0, tasks=[])
        assert "excerpt" not in api("collections/notes/records", token=admin)["items"][0]

    with sqlite3.connect(root / "data/data.db") as db:
        def defaults():
            return dict(db.execute("SELECT user,id FROM folders WHERE is_default AND name='Notes' AND name_key='NOTES'"))
        def stored():
            return (db.execute("SELECT * FROM folders WHERE id=?", (folder["id"],)).fetchone(),
                    db.execute("SELECT * FROM notes WHERE id=?", (note["id"],)).fetchone())
        baseline = defaults()
        assert set(baseline) == {current} and all(stored()), "Invalid R1 fixture"
        preserved = stored()
        shutil.copytree("/pb/pb_hooks", hooks, dirs_exist_ok=True)
        # Make a second virtual key visible to the hook so the export allowlist is exercised.
        (hooks / "00-fixture.pb.js").write_text("""
onRecordsListRequest((e) => {
  for (const note of e.records) note.set("fixture_private", "must stay hidden");
  e.next();
}, "notes");""")
        for migration in sorted(source.glob("*.js")):
            if migration.name > r1:
                shutil.copy(migration, migrations)
        subprocess.run([*pb, "migrate", "up"], check=True)
        upgraded = defaults()
        assert set(upgraded) == {old, current}, "Pre-R1 owner still lacks the Notes default"
        assert upgraded[current] == baseline[current], "R1 default ID changed"
        ensure = migrations / "1795000100_ensure_default_folders.js"
        shutil.copy(ensure, migrations / "9999999999_replay_default_folders.js")
        subprocess.run([*pb, "migrate", "up"], check=True)
        assert defaults() == upgraded and stored() == preserved
        assert db.execute("SELECT count(*) FROM folders").fetchone() == (3,), "Unexpected folder or superuser default"
        assert not db.execute("SELECT id FROM _collections WHERE name='entries' OR id='pbc_3165375535'").fetchall()
        assert not db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").fetchall()
    with server():
        token = login("users", "r1@example.test")
        page = api("collections/notes/records?fields=id,excerpt", token=token)
        assert page["items"] == [{"id": note["id"], "excerpt": "R1 body"}], page
        listed = api("collections/notes/records", token=token)["items"][0]
        assert "fixture_private" not in listed and "search_key" not in listed
        assert listed["excerpt"] == "R1 body"
        fresh = user(admin, "r2@example.test")
        folders = api("collections/folders/records", token=login("users", "r2@example.test"))["items"]
        assert [(f["user"], f["name_key"], f["is_default"]) for f in folders] == [(fresh, "NOTES", True)]
    print("PASS staged upgrade, stable defaults after replay, unchanged custom folder and R1 note, "
          "projected R1 preview, entries removed, superusers excluded, fresh user provisioned")
PY
