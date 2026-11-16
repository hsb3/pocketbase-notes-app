# AI Context Router: shared installs and mounts

Not used in this repo today. Read with the `ai-context` topic when setting either up.

## Shared installation (optional)

By default, copy the script to `scripts/ai-context.py`: the root is its parent's parent, and the config is `<root>/.agents/context/ai-context.json`. A symlink to that copy outside a `scripts/` directory, for example on PATH, uses the target's parent's parent when its own has no `wiki/ai-context.json` and `AI_CONTEXT_CONFIG` is unset. A shared script needs no local `scripts/` directory:

```sh
AI_CONTEXT_ROOT=/work/repo AI_CONTEXT_CONFIG=/work/settings/router.json \
  python3 /opt/tools/ai-context.py check
```

Use the same environment and script path for `list`, topic commands and CI/hooks; update commands in the kernel, this manual and the wiki index accordingly. When using an external config, replace their default config references with the selected path, including source-of-truth statements and topic-edit steps. `AI_CONTEXT_ROOT` alone uses that root's default config. `AI_CONTEXT_CONFIG` alone keeps the script-derived root. Empty or unset overrides use the defaults. Both selections are canonicalized; relative overrides resolve independently from invocation cwd, without tilde or shell-variable expansion by the script. Relative paths inside the config resolve from the selected root, even with an external config.

## Mount an existing contained router

To consume an independent router tree already inside the project, add this optional field to the active outer config:

```json
"mounts": {
  "kb": { "root": "modules/kb-core" }
}
```

The tree must already have its own config with a `topics` object, string descriptions and source lists, plus its own instructions and router index.

Each topic's `sources` is a list of objects with a nonempty `path` and optional string `heading` and boolean `frontmatter` (default `false`). Optional path settings are nonempty strings, `indexed`/`skipDirs` are string lists, and `unrouted` is an object. Root/default/per-topic byte caps are nonnegative integers, excluding booleans. Ordinary unknown config fields remain accepted; unknown declaration fields do not.

Select it through the project router:

```sh
python3 scripts/ai-context.py list
python3 scripts/ai-context.py kb/guide
python3 scripts/ai-context.py build-deploy kb/guide
python3 scripts/ai-context.py check
```

Use the same selected script/environment as the shared-installation commands above. The router reads data only: it neither acquires a module nor runs a script from it.

### Names and paths

- A mount declaration has required nonempty string `root`, optional nonempty string `config`, and no other fields. `config` defaults to `wiki/ai-context.json`; for another location use, for example, `"config": "context/router.json"`.
- Mount names are single nonempty segments: no slash, backslash, whitespace, control characters, `.` or `..`. A name reserves its entire `name/` prefix even when unavailable. A local `kb` can coexist with mount `kb`, but local `kb/guide` collides. Inner topic names may contain `/`; `kb/ops/guide` selects inner `ops/guide`.
- Relative mount roots resolve from the selected outer root, not cwd or the outer config's directory. Relative mount config paths and document paths resolve from the mounted root. Backslashes normalize to `/`; the router expands neither `~` nor environment variables.
- A mounted root must be a strict physical descendant of the outer root. Root-equal paths, prefix siblings and escaping symlinks fail. Config, instructions, sources, checked relative links and inventory scans stay physically inside their own root. Contained absolute paths and symlink aliases are accepted; config and content files must be regular files. Relative links retain each source's lexical directory, even for aliases to one physical file.
- Mounted configs may omit `mounts` or set it to `{}`. Nonempty inner mounts are rejected; declarations are never followed recursively. A mount root cannot contain the outer wiki or history directory, selected config or root instructions, and one mount root cannot be a strict ancestor of another. Two names for the same contained physical root are allowed and checked independently.

### Each root owns its checks

`list` keeps local rows first, then namespaced mounted rows in declaration/topic order, with origin such as `[modules/kb-core]`. Mounted source comments show outer-relative paths such as `<!-- modules/kb-core/wiki/guide.md -->`.

`check` visits the outer root and every available mount using each root's own `rootInstructions`, budgets, `wikiDir`, `historyDir`, `routerFile`, `indexed`, `skipDirs` and `unrouted`. Outer discovery tables never need to copy inner topics: the inner kernel names unqualified `guide`, and the caller selects `kb/guide`. Parent or sibling references, exceptions and budgets cannot satisfy an inner requirement. Change a mounted topic in its own config and local tables.

Topic byte caps measure the root's native render, including its native source comments, rather than the longer mounted display paths or combined invocation. Kernel counts retain unstripped UTF-8 text, including trailing whitespace. Mounting the same tree under a longer project path cannot inflate its native topic size. Split over-budget topics rather than raising caps.

Outer automatic orphan/indexed/wiki-link inventories exclude contained mounted physical trees and file/directory aliases, including modules under the outer wiki. A safely resolved root retains that ownership even when its config is invalid. Explicit outer sources and the explicit outer router file still get full ordinary checks. An outer relative link may enter a mount, but an inner relative link cannot escape to the outer project. External, absolute and fragment-only Markdown destinations retain their existing exclusions. Referenced indexed candidates still fail if outside the owner or not regular files.

### Failures and output

- A contained missing root produces one path-bearing `NOTICE mount kb: missing root ...` on `list` stdout; status is 0 if nothing else failed. `check` and a requested `kb/guide` fail for that missing root.
- Invalid declarations, collisions, outside roots, roots containing outer routing files or the outer wiki/history directories, ancestor/descendant mount roots, unreadable/missing/invalid configs, and nested mounts are errors. `list` reports them on stderr and continues healthy rows with status 1. `check` reports owner-qualified errors on stdout, continues other topics/roots and ends with one `ok` or `<N> root(s) failed`; each failing root counts once. Missing config is an error, not a missing-root notice.
- Topic calls load only selected mounted configs; an unavailable unrelated mount does not block a healthy request. Every requested name and body must succeed before any content prints. A late missing source, unknown topic, encoding/read failure or missing/duplicate heading leaves stdout empty, with status 1 and a requested-topic diagnostic on stderr. Topic rendering does not implicitly run `check`.
- Absent `mounts` and `"mounts": {}` preserve single-root behavior. `--version` stays config-free. Updating a skill does not update copied scripts: compare local customizations and deliberately replace the selected router before using new fields, retaining project config/docs.
