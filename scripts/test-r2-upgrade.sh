#!/bin/sh
# The API runner supplies the pinned binary and a separate, disposable database.
set -eu
[ "${CONTAINED_TEST:-}" = 1 ] && [ -f /.dockerenv ] && [ -x /pb/pocketbase ] || exit 2
exec python3 - <<'PY'
from contextlib import closing, contextmanager
from pathlib import Path
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

origin = "http://127.0.0.1:18081"
source = Path("/pb/pb_migrations")
password = os.environ["PB_PASSWORD"]

def api(path, data=None, token=None, method=None):
    request = Request(origin + "/api/" + path, method=method, headers={"Content-Type": "application/json"})
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
    with trace.open("ab") as log, subprocess.Popen([*pb, "serve", "--http=127.0.0.1:18081", "--dev"], stdout=log, stderr=log) as process:
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
    trace = root / "dev.log"
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

    with closing(sqlite3.connect(root / "data/data.db")) as db:
        [(r1_owner,original_default)] = db.execute("SELECT user,id FROM folders WHERE is_default AND name='Notes' AND name_key='NOTES'")
        assert r1_owner == current
        original_folder = db.execute("SELECT * FROM folders WHERE id=?", (folder["id"],)).fetchone()
        original_note = db.execute("SELECT * FROM notes WHERE id=?", (note["id"],)).fetchone()
        assert original_folder and original_note
    r4 = "1795000300_repair_active_note_search.js"
    replay = "1795000301_replay_note_search.js"
    index = "idx_notes_user_updated_id_deleted"
    date = "2026-01-01 00:00:00.000Z"
    title = "x" * 158 + "ze"
    accented = title + "\u0301"
    old_title_key = "X" * 158 + "ZÉ"
    new_title_key = "X" * 158 + "ZE\n" + old_title_key
    boundary, deleted, nul, edit = ("a" * 15, "b" * 15, "c" * 15, "d" * 15)
    legacy = {
        boundary: (title, accented, old_title_key, ""),
        deleted: (title, accented, old_title_key, date),
        nul: ("Oak\0lantern", "Oak\0lantern", "OAK\0LANTERN", ""),
        edit: ("Ordinary", "Ordinary", "ORDINARY", ""),
    }
    for migration in sorted(source.glob("*.js")):
        if r1 < migration.name < r4:
            shutil.copy(migration, migrations)
    subprocess.run([*pb, "migrate", "up"], check=True)
    with server():
        for ident, (heading, text, key, removed) in legacy.items():
            row = create("notes", admin, id=ident, user=current, folder=folder["id"], revision=3,
                         body=body(text), title=heading, text=text, search_key=key, deleted=removed, tasks=[])
            assert row["id"] == ident

    dbfile = root / "data/data.db"
    def rows(db):
        cursor = db.execute("SELECT * FROM notes ORDER BY id")
        names = [d[0] for d in cursor.description]
        return {r["id"]: r for r in (dict(zip(names, row)) for row in cursor)}

    def metadata(db):
        fields, *rules, indexes = db.execute("""
            SELECT fields,listRule,viewRule,createRule,updateRule,deleteRule,indexes
            FROM _collections WHERE name='notes'""").fetchone()
        physical = dict(db.execute("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='notes'"))
        return fields, rules, json.loads(indexes), physical

    def history(db):
        return [row[0] for row in db.execute("SELECT file FROM _migrations ORDER BY applied,file")]

    def defaults(db):
        return dict(db.execute("SELECT user,id FROM folders WHERE is_default AND name='Notes' AND name_key='NOTES'"))

    def with_keys(snapshot, replacements):
        return {i: {**r, "search_key": replacements.get(i, r["search_key"])} for i, r in snapshot.items()}

    empty_hooks = root / "empty-hooks"
    empty_hooks.mkdir()
    offline = [arg if not arg.startswith("--hooksDir=") else f"--hooksDir={empty_hooks}" for arg in pb]

    def up():
        subprocess.run([*offline, "migrate", "up"], check=True)

    def down(expected):
        with closing(sqlite3.connect(dbfile)) as db:
            assert history(db)[-1] == expected, "Refusing to down an unexpected migration"
        subprocess.run([*offline, "migrate", "down", "1"], input="y\n", text=True, check=True)
        with closing(sqlite3.connect(dbfile)) as db:
            assert expected not in history(db), "Down was cancelled"

    def no_writes(db):
        db.execute("""CREATE TRIGGER no_key_updates BEFORE UPDATE OF search_key ON notes
                      BEGIN SELECT RAISE(ABORT,'target replay updated a key'); END""")
        db.commit()

    def end_no_writes(db):
        assert db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name='no_key_updates'").fetchone()
        db.execute("DROP TRIGGER no_key_updates")
        db.commit()

    def marked(token, term):
        params = urlencode({"searchTerm":term, "filter":'deleted = "" && search_key ~ "%' + term + '%"',
                            "perPage":20, "page":1, "sort":"-updated,-id", "fields":"id,folder,title,updated,snippet"})
        return api("collections/notes/records?" + params, token=token)

    def check_hits(token, term, expected):
        page = marked(token, term)
        assert page["totalItems"] == len(expected) == len(page["items"]), (term, page)
        assert {r["id"]: r["snippet"]["match"] for r in page["items"]} == expected
        for r in page["items"]:
            assert set(r) == {"id", "title", "folder", "updated", "snippet"}
            assert r["folder"] == folder["id"]
            assert set(r["snippet"]) == {"before","match","after"}
        return page["items"]

    def owner_hits(token, edited=False):
        title_ids = [boundary, edit] if edited else [boundary]
        check_hits(token, "ZE", dict.fromkeys(title_ids, "ze"))
        check_hits(token, "ZÉ", dict.fromkeys(title_ids, "ze\u0301"))
        [row] = check_hits(token, "LANTERN", {nul: "lantern"})
        assert row["snippet"] == {"before":"Oak\0", "match":"lantern", "after":""}
        for term in ("OAK LANTERN", "OAKLANTERN"):
            check_hits(token, term, {})
        for reader in (None, login("users", "older@example.test")):
            check_hits(reader, "ZE", {})
            check_hits(reader, "LANTERN", {})

    # PocketBase initializes its auxiliary database before running app migrations.
    bad_dir = root / "bad"
    shutil.copytree(dbfile.parent, bad_dir)
    with closing(sqlite3.connect(dbfile)) as db:
        assert set(defaults(db)) == {old,current} and defaults(db)[current] == original_default
        upgraded = defaults(db)
        assert db.execute("SELECT * FROM folders WHERE id=?", (folder["id"],)).fetchone() == original_folder
        assert db.execute("SELECT * FROM notes WHERE id=?", (note["id"],)).fetchone() == original_note
        initial = rows(db)
        assert set(initial) == set(legacy) | {note["id"]}
        for ident, (heading, text, key, removed) in legacy.items():
            r = initial[ident]
            assert (r["title"].encode(), r["text"].encode(), r["search_key"].encode()) == tuple(x.encode() for x in (heading,text,key))
            assert json.loads(r["body"]) == body(text) and r["deleted"] == removed and r["created"] and r["updated"]
        base_meta, base_history = metadata(db), history(db)
        assert base_history[-1] == "1795000200_drop_entries.js"

    for migration in sorted(source.glob("*.js")):
        if migration.name == r4:
            shutil.copy(migration, migrations)
    print("Available staged migrations:", sorted(p.name for p in migrations.glob("*.js")), flush=True)
    up()
    with closing(sqlite3.connect(dbfile)) as db:
        first = rows(db)
        repaired = {boundary:new_title_key, deleted:new_title_key, nul:"OAK\nLANTERN"}
        checks = {"named page index": index in metadata(db)[3], "R4 history": r4 in history(db),
                  **{f"repair {i}": first[i]["search_key"] == k for i,k in repaired.items()}}
        print("First up checks:", checks, flush=True)
        assert all(checks.values()), checks
        assert first == with_keys(initial, repaired)
        meta = metadata(db)
        assert meta[:2] == base_meta[:2] and len(meta[2]) == len(base_meta[2]) + 1
        assert [sql for sql in meta[2] if index not in sql] == base_meta[2]
        assert {n:s for n,s in meta[3].items() if n != index} == base_meta[3]
        [idx] = [r for r in db.execute("PRAGMA index_list(notes)") if r[1] == index]
        assert idx[2:] == (0,"c",0), idx
        assert [(r[2],r[3]) for r in db.execute(f"PRAGMA index_xinfo({index})") if r[5]] == [
            ("user",0), ("updated",1), ("id",1), ("deleted",0)]
        assert history(db) == base_history + [r4]
        print(f"First up: {len(repaired)} changed keys across {len(first)} complete rows", flush=True)
    shutil.copytree("/pb/pb_hooks", hooks, dirs_exist_ok=True)
    (hooks / "00-fixture.pb.js").write_text("""
    onRecordsListRequest((e) => {
      for (const note of e.records) note.set("fixture_private", "must stay hidden");
      e.next();
    }, "notes");""")

    with server():
        token = login("users", "r1@example.test")
        owner_hits(token)
        offset = trace.stat().st_size
        check_hits(token, "LANTERN", {nul:"lantern"})
        with trace.open("rb") as log:
            log.seek(offset)
            segment = re.sub(r"\x1b\[[0-9;]*m", "", log.read().decode())
        statements = re.findall(r"^\[\d+\.\d+ms\] (.+)$", segment, re.MULTILINE)
        page_sql = [sql for sql in statements if sql.startswith("SELECT ") and "%LANTERN%" in sql
                    and "ORDER BY" in sql and "LIMIT 20" in sql]
        assert len(page_sql) == 1, f"Expected one traced page (found {len(page_sql)})"
        [sql] = page_sql
        assert re.fullmatch("[a-z0-9]{15}",current)
        # Accept only the pinned engine's complete synthetic owner page before passing it to EXPLAIN.
        expected = f"""SELECT `notes`.* FROM `notes` WHERE (('users' = 'users' AND `notes`.`user` = '{current}')) AND (((`notes`.`deleted` = '' OR `notes`.`deleted` IS NULL) AND `notes`.`search_key` LIKE '%LANTERN%' ESCAPE '\\')) ORDER BY `notes`.`updated` DESC, `notes`.`id` DESC LIMIT 20"""
        assert sql == expected, "Unexpected statement for the marked owner page"
        plan = api("sql", {"query":"EXPLAIN QUERY PLAN " + sql}, admin)["rows"]
        version = api("sql", {"query":"SELECT sqlite_version()"}, admin)["rows"][0][0]
        assert any("SEARCH" in r[-1] and index + " (user=?)" in r[-1] for r in plan), plan
        assert not any("TEMP B-TREE" in r[-1] for r in plan), plan
        print("Owner page SQL:",sql,"\nSQLite:",version,"plan:",plan)
        added = create("notes",token,user=current,folder=folder["id"],body=body("Ash\0wicker"))
        changed = api("collections/notes/records/" + edit, {"body":body(accented), "revision":initial[edit]["revision"]}, token, "PATCH")
        assert added["revision"] == 1 and changed["revision"] == initial[edit]["revision"] + 1
        for saved, writing in [(added,"Ash\0wicker"),(changed,accented)]:
            check = api("collections/notes/records/"+saved["id"],token=token)
            assert check == saved and check["text"] == writing and check["body"] == body(writing)
        owner_hits(token, True)
        check_hits(token,"WICKER",{added["id"]:"wicker"})
    with closing(sqlite3.connect(dbfile)) as db:
        post = rows(db)
        assert post[added["id"]]["search_key"] == "ASH\nWICKER" and post[edit]["search_key"] == new_title_key
        assert metadata(db) == meta and set(post) == set(first) | {added["id"]}
        assert all(post[i] == r for i,r in first.items() if i != edit)
        shutil.copy(migrations / r4, migrations / replay)
        no_writes(db)
    up()
    with closing(sqlite3.connect(dbfile)) as db:
        assert history(db) == base_history + [r4,replay] and rows(db) == post and metadata(db) == meta
        end_no_writes(db)
    down(replay)
    with closing(sqlite3.connect(dbfile)) as db:
        rolled = rows(db)
        expected = with_keys(post,{boundary:old_title_key, deleted:old_title_key, nul:"OAK\0LANTERN",
                                   edit:old_title_key, added["id"]:"ASH\0WICKER"})
        assert rolled == expected and metadata(db) == base_meta
        assert all(rolled[i] == r for i,r in initial.items() if i != edit)
        no_writes(db)
    down(r4)
    with closing(sqlite3.connect(dbfile)) as db:
        assert rows(db) == rolled and metadata(db) == base_meta and history(db) == base_history
        end_no_writes(db)
    (migrations / replay).unlink()
    up()
    with closing(sqlite3.connect(dbfile)) as db:
        assert rows(db) == post and metadata(db) == meta and history(db) == base_history + [r4]
        assert db.execute("SELECT * FROM folders WHERE id=?", (folder["id"],)).fetchone() == original_folder
    print(f"Down and reapply: {sum(r['search_key'] != rolled[i]['search_key'] for i,r in post.items())} changed keys, "
          f"{len(post)} complete post-save rows matched, both target replays wrote zero keys")
    with server():
        token = login("users", "r1@example.test")
        owner_hits(token, True)
        check_hits(token,"WICKER",{added["id"]:"wicker"})
    shutil.copy(migrations/"1795000100_ensure_default_folders.js", migrations/"9999999999_replay_default_folders.js")
    up()
    with closing(sqlite3.connect(dbfile)) as db:
        assert defaults(db) == upgraded and rows(db) == post
        assert db.execute("SELECT count(*) FROM folders").fetchone() == (3,), "Unexpected folder or superuser default"
        assert not db.execute("SELECT id FROM _collections WHERE name='entries' OR id='pbc_3165375535'").fetchall()
        assert not db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").fetchall()

    with closing(sqlite3.connect(bad_dir/"data.db")) as bad:
        bad.execute("UPDATE notes SET search_key=? WHERE id=?", ("OAK\0WRONG",nul))
        bad.commit()
        before = rows(bad), metadata(bad), list(bad.execute("SELECT * FROM _migrations ORDER BY file"))
        assert before[0][boundary]["search_key"] == old_title_key and boundary < nul
        assert before[0][nul]["search_key"].encode() == b"OAK\0WRONG"
    bad_pb = [f"--dir={bad_dir}" if a.startswith("--dir=") else a for a in offline]
    failure = subprocess.run([*bad_pb,"migrate","up"],capture_output=True,text=True)
    assert failure.returncode != 0 and nul in failure.stderr + failure.stdout, (failure.returncode, failure.stderr, failure.stdout)
    with closing(sqlite3.connect(bad_dir/"data.db")) as bad:
        after = rows(bad), metadata(bad), list(bad.execute("SELECT * FROM _migrations ORDER BY file"))
        assert after == before, {
            "changed note columns": {i:[k for k in r if r[k] != after[0].get(i,{}).get(k)] for i,r in before[0].items()},
            "index metadata before/after": (before[1][2:], after[1][2:]),
            "migration history before/after": (before[2],after[2]),
        }
    print("Atomic failure:",nul,"exit",failure.returncode,"all rows, index definitions and migration history identical")
    with server():
        token = login("users", "r1@example.test")
        original_filter = urlencode({"filter": f'id = "{note["id"]}"'})
        page = api("collections/notes/records?fields=id,excerpt&"+original_filter, token=token)
        assert page["items"] == [{"id": note["id"], "excerpt": "R1 body"}], page
        listed = api("collections/notes/records?"+original_filter, token=token)["items"][0]
        assert "fixture_private" not in listed and "search_key" not in listed, listed
        assert listed["excerpt"] == "R1 body"
        fresh = user(admin, "r2@example.test")
        folders = api("collections/folders/records", token=login("users", "r2@example.test"))["items"]
        assert [(f["user"], f["name_key"], f["is_default"]) for f in folders] == [(fresh, "NOTES", True)]
    print("PASS staged upgrade, stable defaults after replay, unchanged custom folder and R1 note, "
          "projected R1 preview, entries removed, superusers excluded, fresh user provisioned")
PY
