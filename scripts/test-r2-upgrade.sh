#!/bin/sh
# The API runner supplies the pinned binary and a separate, disposable database.
set -eu
[ "${CONTAINED_TEST:-}" = 1 ] && [ -f /.dockerenv ] && [ -x /pb/pocketbase ] || exit 2
exec python3 - <<'PY'
from contextlib import closing, contextmanager
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
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
        raw = response.read()
        if response.status == 204:
            assert raw == b"", (path,raw)
            return None
        assert response.status == 200, (path,response.status)
        return json.loads(raw)

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
            jobs = api("crons", token=login("_superusers", os.environ["PB_EMAIL"]))
            assert all(job["id"] != "expired-notes" for job in jobs), jobs
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
    for name in ["attachment-cleanup.js", "attachments.pb.js", "capabilities.pb.js", "comparison-key.js",
                 "entry-validation.js", "folders.pb.js", "mfa.pb.js", "note-search.js", "notes.pb.js", "signup.pb.js"]:
        shutil.copy(Path("/pb/pb_hooks") / name, hooks)
    shutil.copy("/pb/pb_hooks/note-lifecycle.js", hooks)
    shutil.copy("/pb/pb_hooks/note-notice.js", hooks)
    (hooks / "00-fixture.pb.js").write_text("""
    onRecordsListRequest((e) => {
      for (const note of e.records) note.set("fixture_private", "must stay hidden");
      e.next();
    }, "notes");""")

    def check_page_plan(token, active_rule):
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
        extra_rule = " AND (`notes`.`deleted` = '' OR `notes`.`deleted` IS NULL)" if active_rule else ""
        expected = f"""SELECT `notes`.* FROM `notes` WHERE (('users' = 'users' AND `notes`.`user` = '{current}'{extra_rule})) AND (((`notes`.`deleted` = '' OR `notes`.`deleted` IS NULL) AND `notes`.`search_key` LIKE '%LANTERN%' ESCAPE '\\')) ORDER BY `notes`.`updated` DESC, `notes`.`id` DESC LIMIT 20"""
        assert sql == expected, ("Unexpected statement for the marked owner page", sql, expected)
        plan = api("sql", {"query":"EXPLAIN QUERY PLAN " + sql}, admin)["rows"]
        version = api("sql", {"query":"SELECT sqlite_version()"}, admin)["rows"][0][0]
        assert any("SEARCH" in r[-1] and index + " (user=?)" in r[-1] for r in plan), plan
        assert not any("TEMP B-TREE" in r[-1] for r in plan), plan
        print("Owner page SQL:",sql,"\nSQLite:",version,"plan:",plan)

    with server():
        token = login("users", "r1@example.test")
        owner_hits(token)
        check_page_plan(token, False)
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

    r5 = "1795000400_active_notes_and_purge.js"
    purge = "idx_notes_purge"
    definition = "CREATE INDEX `idx_notes_purge` ON `notes` (deleted, id) WHERE deleted > ''"
    owner_rule = '@request.auth.collectionName = "users" && user = @request.auth.id'
    active_rule = owner_rule + ' && deleted = ""'

    def snapshot():
        with closing(sqlite3.connect(dbfile)) as db:
            related = [db.execute(f"SELECT * FROM {name} ORDER BY id").fetchall()
                       for name in ("folders", "attachments")]
            related_meta = db.execute("""SELECT fields,listRule,viewRule,createRule,updateRule,deleteRule,indexes
                FROM _collections WHERE name IN ('folders','attachments') ORDER BY name""").fetchall()
            related_indexes = db.execute("""SELECT name,sql FROM sqlite_master WHERE type='index'
                AND tbl_name IN ('folders','attachments') ORDER BY name""").fetchall()
            return (rows(db), related), (metadata(db), related_meta, related_indexes), history(db)

    def listed(token):
        page = api("collections/notes/records?fields=id&perPage=100", token=token)
        assert page["totalItems"] == len(page["items"])
        return sorted(r["id"] for r in page["items"])

    before_rows, before_schema, before_history = snapshot()
    r4_meta = before_schema[0]
    assert before_rows[0] == post and r4_meta == meta
    assert r4_meta[1][0] == owner_rule and purge not in r4_meta[3]
    assert before_rows[0][deleted]["deleted"] == date
    with server():
        token = login("users", "r1@example.test")
        ids = listed(token)
        assert ids == sorted(post) and boundary in ids and deleted in ids, ids
        print("R4 unfiltered owner list:", ids, "deleted:", deleted, date,
              "rule:", r4_meta[1][0], "purge index:", r4_meta[3].get(purge), flush=True)
        if not (source / r5).exists():
            assert deleted not in ids, ("R5 expected exclusion on R4", deleted, ids)

    shutil.copy("/pb/pb_hooks/note-actions.pb.js", hooks)
    shutil.copy(source / r5, migrations)
    up()
    same_rows, r5_schema, r5_history = snapshot()
    r5_meta = r5_schema[0]
    assert same_rows == before_rows and r5_history == before_history + [r5]
    assert r5_schema[1:] == before_schema[1:]
    fields, rules, indexes, physical = r5_meta
    assert fields == r4_meta[0] and rules == [active_rule, *r4_meta[1][1:]]
    assert indexes == r4_meta[2] + [definition]
    assert {n:s for n,s in physical.items() if n != purge} == r4_meta[3]
    assert physical[purge].split(" WHERE ")[1] == "deleted > ''", physical[purge]
    with closing(sqlite3.connect(dbfile)) as db:
        [idx] = [r for r in db.execute("PRAGMA index_list(notes)") if r[1] == purge]
        assert idx[2:] == (0,"c",1), idx
        assert [(r[2],r[3],r[4]) for r in db.execute("PRAGMA index_xinfo(idx_notes_purge)") if r[5]] == [
            ("deleted",0,"BINARY"), ("id",0,"BINARY")]

    with server():
        token = login("users", "r1@example.test")
        assert listed(token) == sorted(set(post) - {deleted})
        check_page_plan(token, True)
        created = create("notes", token, user=current, folder=folder["id"], body=body("R5 create"))
        updated = api("collections/notes/records/" + edit,
                      {"revision":post[edit]["revision"], "body":body("R5 edit\nUnderstory")}, token, "PATCH")
        for row, expected_rev in [(created,1), (updated,post[edit]["revision"] + 1)]:
            assert row["revision"] == expected_rev
            assert api("collections/notes/records/" + row["id"], token=token) == row
        check_hits(token, "UNDERSTORY", {edit:"Understory"})
        custom = create("folders", token, user=current, name="Post up")
        member = create("notes", token, user=current, folder=folder["id"], body=body("Folder survivor"))
        mid = member["id"]
        for verb, rev, args in [("move",1,{"folder":custom["id"]}), ("delete",2,{}), ("restore",3,{})]:
            changed = api(f"notebook/notes/{mid}/{verb}", {"revision":rev, **args}, token)
            assert changed["revision"] == rev+1 and changed["folder"] == custom["id"]
        fid = custom["id"]
        digest = hashlib.sha256(json.dumps([fid,[[mid,4,""]]],separators=(",",":")).encode()).hexdigest()
        path = f"collections/folders/records/{fid}?snapshot={digest}"
        preview = api(f"notebook/folders/{fid}/delete-preview", token=token)
        assert preview == {"id":fid,"name":"Post up","activeCount":1,"snapshot":digest}
        assert api(path, token=token, method="DELETE") is None
        after_member = api(f"collections/notes/records/{mid}", token=token)
        assert after_member["folder"] == "" and after_member["revision"] == 5 and after_member["deleted"]
        with closing(sqlite3.connect(dbfile)) as db:
            assert not db.execute("SELECT id FROM folders WHERE id=?", (fid,)).fetchall()
        print("Confirmed folder removed", fid, "surviving tombstone", mid, after_member["deleted"], flush=True)
        retained_date = "2026-03-01 01:02:03.456Z"
        created_id = created["id"]
        assert re.fullmatch("[a-z0-9]{15}",created_id)
        assert api("sql", {"query":f"UPDATE notes SET deleted='{retained_date}' WHERE id='{created_id}'"}, admin)["affectedRows"] == 1
        assert api("collections/notes/records/" + created_id, token=token)["deleted"] == retained_date

    saved_rows, saved_schema, saved_history = snapshot()
    saved = saved_rows[0]
    assert saved_schema == r5_schema and saved_history == r5_history
    assert set(saved) == set(post) | {created_id,mid}
    assert saved[edit]["search_key"] == "R5 EDIT\nUNDERSTORY" and saved[created_id]["search_key"] == "R5 CREATE"
    assert saved[created_id]["deleted"] == retained_date
    assert all(saved[i] == r for i,r in post.items() if i != edit)
    assert saved_rows[1] == before_rows[1]

    # Run bound queries in PocketBase's SQLite engine. Its admin SQL HTTP endpoint takes no bindings.
    with closing(sqlite3.connect(dbfile)) as db:
        assert db.execute("UPDATE notes SET deleted='zz-invalid' WHERE id=? AND deleted=''",(boundary,)).rowcount == 1
        db.commit()
    scan_hook = hooks / "01-scan-fixture.pb.js"
    scan_hook.write_text("""
    onBootstrap((e) => {
      e.next();
      const [owner, expired, retained, invalid, expiredDate, retainedDate, folderMember] = FIXTURES;
      const cutoff = "2026-02-01 00:00:00.000Z";
      const valid = "(deleted <> '0001-01-01 00:00:00.000Z' AND COALESCE(strftime('%Y-%m-%d %H:%M:%fZ',deleted,'+0 days') = deleted COLLATE BINARY, 0))";
      function query(sql, params, shape) {
        const rows = arrayOf(new DynamicModel(shape));
        e.app.db().newQuery(sql).bind(params).all(rows);
        return rows;
      }
      function equal(actual, expected) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(JSON.stringify({actual, expected}));
      }
      for (const [range, hit, stamp, bounds] of [
        ["deleted <= {:cutoff}", expired, expiredDate, "(deleted>? AND deleted<?)"],
        ["deleted > {:cutoff} AND NOT " + valid, invalid, "zz-invalid", "(deleted>?)"],
      ]) {
        const sql = "SELECT deleted,id FROM notes WHERE deleted > '' AND " + range +
          " AND (deleted,id) > ({:lastDeleted},{:lastId}) ORDER BY deleted,id LIMIT 100";
        for (const [lastDeleted,lastId,expected] of [["","",[hit]], [stamp,hit,[]]]) {
          const params = {cutoff,lastDeleted,lastId};
          equal(query(sql, params, {deleted:"",id:""}).map(r => r.id), expected);
          const plan = query("EXPLAIN QUERY PLAN " + sql, params, {id:0,parent:0,notused:0,detail:""}).map(r => r.detail);
          if (!plan.some(p => p.includes("USING COVERING INDEX idx_notes_purge " + bounds)) ||
              plan.some(p => p.includes("TEMP B-TREE"))) throw Error(JSON.stringify(plan));
          console.log("R5 bound scan",JSON.stringify({sql,params,plan,expected}));
        }
      }
      const where = " FROM notes WHERE user={:owner} AND deleted>{:cutoff} AND " + valid;
      const params = {owner,cutoff};
      equal(query("SELECT count(*) AS n" + where, params, {n:0})[0].n, 2);
      const page = query("SELECT id,folder,title,revision,deleted" + where + " ORDER BY deleted DESC,id DESC LIMIT 20",
        params, {id:"",folder:"",title:"",revision:0,deleted:""});
      equal(page.map(r => [r.id,r.deleted]), [folderMember,[retained,retainedDate]]);
      console.log("PASS R5 bound plans and valid trash count/page");
    });""".replace("FIXTURES",json.dumps([current,deleted,created_id,boundary,date,retained_date,[mid,after_member["deleted"]]])))
    offset = trace.stat().st_size
    try:
        with server():
            pass
    finally:
        with trace.open("rb") as log:
            log.seek(offset)
            scan_lines = [line for line in log.read().decode().splitlines()
                          if "R5 bound" in line or "Error" in line or "error" in line.lower() and "fixture" in line]
            print("\n".join(scan_lines), flush=True)
    assert any("PASS R5 bound plans and valid trash count/page" in line for line in scan_lines)
    scan_hook.unlink()
    with closing(sqlite3.connect(dbfile)) as db:
        assert db.execute("UPDATE notes SET deleted='' WHERE id=? AND deleted='zz-invalid'",(boundary,)).rowcount == 1
        db.commit()
    assert snapshot() == (saved_rows, r5_schema, r5_history)

    down(r5)
    assert snapshot() == (saved_rows, before_schema, before_history)
    # An unexpected same-name index must abort up without overwriting the operator's metadata.
    wrong = definition.replace("deleted, id", "id, deleted")
    with closing(sqlite3.connect(dbfile)) as db:
        db.execute("UPDATE _collections SET indexes=? WHERE name='notes'", (json.dumps(r4_meta[2] + [wrong]),))
        db.execute(wrong)
        db.commit()
    unexpected = snapshot()
    failed = subprocess.run([*offline,"migrate","up"], capture_output=True,text=True)
    assert failed.returncode != 0 and purge in failed.stdout + failed.stderr, (failed.returncode,failed.stdout,failed.stderr)
    assert snapshot() == unexpected
    with closing(sqlite3.connect(dbfile)) as db:
        db.execute("DROP INDEX idx_notes_purge")
        db.execute("UPDATE _collections SET indexes=? WHERE name='notes'", (json.dumps(r4_meta[2]),))
        db.commit()
    assert snapshot() == (saved_rows, before_schema, before_history)
    up()
    assert snapshot() == (saved_rows, r5_schema, r5_history)
    with server():
        token = login("users", "r1@example.test")
        assert listed(token) == sorted(set(saved) - {deleted,created_id,mid})
        check_hits(token, "UNDERSTORY", {edit:"Understory"})
    print("R5 post-write down/up:", len(saved), "complete rows, edit revision", updated["revision"],
          "retained", created_id, retained_date, "unexpected index refusal exit", failed.returncode)

    def set_raw(ident, value):
        with closing(sqlite3.connect(dbfile)) as db:
            assert db.execute("UPDATE notes SET deleted=? WHERE id=?", (value,ident)).rowcount == 1
            db.commit()
            assert db.execute("SELECT deleted FROM notes WHERE id=?", (ident,)).fetchone() == (value,)

    def stored(ident):
        with closing(sqlite3.connect(dbfile)) as db:
            return rows(db)[ident]

    def request(path, data=None, method=None):
        try:
            return 200, api(path, data, token, method)
        except HTTPError as err:
            return err.code, json.load(err)

    with server():
        actor = user(admin, "r5-dates@example.test")
        token = login("users", "r5-dates@example.test")
        home = api("collections/folders/records",token=token)["items"][0]["id"]
        target = create("folders",token,user=actor,name="Date controls")["id"]
        # This staged database uses local file storage, so inspect the file independently of HTTP.
        form = ("--r5\r\nContent-Disposition: form-data; name=\"user\"\r\n\r\n" + actor +
                "\r\n--r5\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nprivate.txt" +
                "\r\n--r5\r\nContent-Disposition: form-data; name=\"file\"; filename=\"private.txt\"" +
                "\r\nContent-Type: text/plain\r\n\r\nprivate reserved bytes\r\n--r5--\r\n")
        upload = Request(origin+"/api/collections/attachments/records", data=form.encode(),
                         headers={"Authorization":token,"Content-Type":"multipart/form-data; boundary=r5"})
        with urlopen(upload,timeout=5) as response:
            file = json.load(response)
        key = root / "data/storage" / file["collectionId"] / file["id"] / file["file"]
        def file_state():
            with closing(sqlite3.connect(dbfile)) as db:
                return db.execute("SELECT * FROM attachments WHERE id=?", (file["id"],)).fetchone(), key.read_bytes()
        attachment = file_state()
        assert attachment[0] and attachment[1] == b"private reserved bytes"

        assert listed(token) == []
        def fixture(label, date):
            row = create("notes", token, user=actor, folder=home, body=body(label), attachments=[file["id"]])
            set_raw(row["id"],date)
            return row["id"]

        empty = fixture("Active control", "")
        expired_id = fixture("Expired control", "2020-01-01 00:00:00.001Z")
        recent = fixture("Retained control", time.strftime("%Y-%m-%d %H:%M:%S",time.gmtime(time.time()-86400))+".000Z")
        bad_dates = ["0001-01-01 00:00:00.000Z","0000-invalid","2099-02-30 00:00:00.000Z","zz-invalid"]
        bad = [fixture("Corrupt control", value) for value in bad_dates]
        patch_control = fixture("Independent malformed PATCH", bad_dates[1])
        assert listed(token) == [empty]
        assert request("collections/notes/records/"+empty)[1]["deleted"] == ""
        assert request("collections/notes/records/"+expired_id)[1]["deleted"] == stored(expired_id)["deleted"]

        errors = []
        def check(ident, verb, code, payload=None):
            before = stored(ident)
            path = ("collections/notes/records/"+ident if verb in ("GET","PATCH")
                    else "notebook/notes/"+ident+"/"+verb)
            status, result = request(path, payload, verb if verb in ("GET","PATCH") else "POST")
            after = stored(ident)
            actual = (status, before == after, file_state() == attachment)
            evidence = {"path":path,"verb":verb,"request":payload,"expected":code,"actual":status,
                        "response":result,"before":before,"after":after,"fileUnchanged":actual[2]}
            print("R5 fixture", json.dumps(evidence,default=lambda x:x.hex()), flush=True)
            if actual != (code,True,True):
                errors.append((ident,verb,code,actual))

        def transition(verb, revision, destination):
            payload = {"revision":revision, **({"folder":destination} if verb == "move" else {})}
            before = stored(empty)
            status, result = request("notebook/notes/"+empty+"/"+verb, payload, "POST")
            after = stored(empty)
            print("R5 successful fixture action",verb,status,result,flush=True)
            assert status == 200 and result == {"id":empty,"user":actor,"revision":revision+1,
                "folder":destination,"deleted":after["deleted"]}, result
            assert after == dict(before, folder=destination, deleted=result["deleted"], revision=revision+1)
            assert bool(result["deleted"]) == (verb == "delete")

        transition("move",1,target)
        check(empty,"move",409,{"revision":1,"folder":home})
        check(empty,"delete",409,{"revision":1})
        transition("delete",2,target)
        check(empty,"restore",409,{"revision":2})
        transition("restore",3,target)
        check(expired_id,"restore",410,{"revision":1})
        for ident in bad:
            check(ident,"restore",409,{"revision":2})
            check(ident,"GET",500)
            check(ident,"move",500,{"revision":1,"folder":target})
            check(ident,"delete",500,{"revision":1})
            check(ident,"restore",500,{"revision":1})
            check(ident,"PATCH",500,{"revision":1,"body":body("Integrity edit")})
        check(patch_control,"PATCH",500,{"revision":1,"body":body("Independent edit")})
        trash_status, trash = request("notebook/recently-deleted")
        assert not errors, errors
        assert trash_status == 200 and trash["totalItems"] == 1 and [r["id"] for r in trash["items"]] == [recent], trash
    trace_text = trace.read_text()
    for ident in [*bad,patch_control]:
        assert re.search(r"Invalid note deletion timestamp[^\n]*"+ident, trace_text), ident

    with (hooks/"00-fixture.pb.js").open("a") as out:
        out.write("""
    onBootstrap((e) => {
      e.next();
      const life = require(`${__hooks}/note-lifecycle.js`);
      for (const [start,end] of [
        ["2026-03-01 13:14:15.123Z","2026-03-31T13:14:15.123Z"],
        ["2026-10-15 13:14:15.123Z","2026-11-14T13:14:15.123Z"],
        ["2024-02-01 13:14:15.123Z","2024-03-02T13:14:15.123Z"],
      ]) {
        const deadline = life.deadline(start);
        const fixed = Date.parse(end);
        const allowed = [-1,0,1].map(delta => life.canRestore(start,fixed+delta));
        console.log("R5 fixed UTC boundary",start,new Date(deadline).toISOString(),JSON.stringify(allowed));
        if (deadline !== fixed || JSON.stringify(allowed) !== "[true,false,false]") throw Error("R5 UTC boundary");
      }
      console.log("PASS R5 production UTC boundaries");
    });""")
    offset = trace.stat().st_size
    try:
        with server():
            pass
    finally:
        segment = trace.read_bytes()[offset:].decode()
        print("\n".join(l for l in segment.splitlines() if "R5 " in l or "Error:" in l),flush=True)
    assert "PASS R5 production UTC boundaries" in segment

    r7 = "1795000500_note_pins.js"
    pins = "idx_notes_user_pinned_updated_id"
    r5_create = owner_rule + ' && @request.body.deleted:isset = false'
    r5_update = (owner_rule + ' && @request.body.user:changed = false && @request.body.folder:changed = false'
                 ' && @request.body.deleted:changed = false')
    pre_rows, pre_schema, pre_history = snapshot()
    pre_fields, pre_rules, pre_indexes, pre_physical = pre_schema[0]
    assert pre_rules[2:4] == [r5_create, r5_update] and pins not in pre_physical, pre_rules
    shutil.copy(source / r7, migrations)
    up()
    pin_rows, pin_schema, pin_history = snapshot()
    fields, rules, indexes, physical = pin_schema[0]
    assert pin_history == pre_history + [r7] and pin_schema[1:] == pre_schema[1:]
    assert {i: {k: v for k, v in r.items() if k != "pinned"} for i, r in pin_rows[0].items()} == pre_rows[0]
    assert {r["pinned"] for r in pin_rows[0].values()} == {0} and pin_rows[1] == pre_rows[1]
    assert [(f["type"], f["required"]) for f in json.loads(fields) if f["name"] == "pinned"] == [("bool", False)]
    assert [f for f in json.loads(fields) if f["name"] != "pinned"] == json.loads(pre_fields)
    assert rules == [*pre_rules[:2], r5_create + ' && @request.body.pinned:isset = false',
                     r5_update + ' && @request.body.pinned:changed = false', pre_rules[4]], rules
    assert indexes == pre_indexes + ["CREATE INDEX `" + pins + "` ON `notes` (user, pinned, updated, id)"]
    assert {n: s for n, s in physical.items() if n != pins} == pre_physical
    assert " WHERE " not in physical[pins], physical[pins]
    with closing(sqlite3.connect(dbfile)) as db:
        assert [r[2] for r in db.execute(f"PRAGMA index_xinfo({pins})") if r[5]] == ["user", "pinned", "updated", "id"]

    down(r7)
    assert snapshot() == (pre_rows, pre_schema, pre_history)
    # A same-name index that predates R7 must abort up and leave the operator's metadata alone.
    wrong = "CREATE INDEX `" + pins + "` ON `notes` (user, updated)"
    with closing(sqlite3.connect(dbfile)) as db:
        db.execute("UPDATE _collections SET indexes=? WHERE name='notes'", (json.dumps(pre_indexes + [wrong]),))
        db.execute(wrong)
        db.commit()
    unexpected = snapshot()
    failed = subprocess.run([*offline, "migrate", "up"], capture_output=True, text=True)
    assert failed.returncode != 0 and pins in failed.stdout + failed.stderr, (failed.returncode, failed.stdout, failed.stderr)
    assert snapshot() == unexpected
    with closing(sqlite3.connect(dbfile)) as db:
        db.execute(f"DROP INDEX {pins}")
        db.execute("UPDATE _collections SET indexes=? WHERE name='notes'", (json.dumps(pre_indexes),))
        db.commit()
    assert snapshot() == (pre_rows, pre_schema, pre_history)
    up()
    assert snapshot() == (pin_rows, pin_schema, pin_history)
    print("PASS R7 up/down/up: rows byte-equal apart from pinned=0, R5 rules restored, unexpected index refusal exit",
          failed.returncode, flush=True)

    with server():
        token = login("users", "r1@example.test")
        assert request("collections/notes/records", {"user": current, "folder": folder["id"],
                       "body": body("Forged pin"), "pinned": True}, "POST")[0] == 400
        assert request("collections/notes/records", {"user": current, "folder": folder["id"],
                       "body": body("Forged pin"), "pinned": False}, "POST")[0] == 400
        assert request("collections/notes/records/" + edit, {"pinned": True}, "PATCH")[0] == 404
        status, pinned = request(f"notebook/notes/{edit}/pin", {"pinned": True}, "POST")
        assert status == 200 and pinned["pinned"] is True, (status, pinned)
        assert stored(edit) == dict(pin_rows[0][edit], pinned=1)
        offset = trace.stat().st_size
        shapes = {
            "folder": ("deleted = \"\" && folder = '" + folder["id"] + "'", "-pinned,-updated,-id"),
            "all": ("deleted = \"\"", "-pinned,-updated,-id"),
            "pinned": ("deleted = \"\" && pinned = true", "-updated,-id"),
        }
        for label, (where, order) in shapes.items():
            page = api("collections/notes/records?" + urlencode({"filter": where, "sort": order, "perPage": 20,
                       "fields": "id,pinned"}), token=token)
            if label == "pinned":
                assert [r["id"] for r in page["items"]] == [edit], page
            else:
                assert page["items"][0]["id"] == edit and all(not r["pinned"] for r in page["items"][1:]), page
        with trace.open("rb") as log:
            log.seek(offset)
            segment = re.sub(r"\x1b\[[0-9;]*m", "", log.read().decode())
        pages = [sql for sql in re.findall(r"^\[\d+\.\d+ms\] (.+)$", segment, re.MULTILINE)
                 if sql.startswith("SELECT `notes`.*") and "LIMIT 20" in sql]
        assert len(pages) == 3, pages
        for label, sql in zip(shapes, pages):
            plan = [r[-1] for r in api("sql", {"query": "EXPLAIN QUERY PLAN " + sql}, admin)["rows"]]
            print("R7", label, "SQL:", sql, "\nplan:", plan, flush=True)
            assert any(pins in p for p in plan) and not any("TEMP B-TREE" in p for p in plan), plan
    print("PASS R7 forged pins refused, pin verb wrote only pinned, list plans recorded", flush=True)
PY
