# AI Context Router

This page is the in-repo manual for keeping the agent docs routed and true. It works without any skill installed. In this repo the router's wiki directory is `.agents/context/`, its index is `.agents/README.md`, and the copied script's default config is `.agents/context/ai-context.json` (a one-line local customization marked in `scripts/ai-context.py`; keep it when replacing the script). Mounted routers still default to their own `wiki/ai-context.json`. Load it with `python3 scripts/ai-context.py ai-context`.

Run `python3 scripts/ai-context.py --version` to identify the copied router's source release; no config is required. Updating the skill does not update this copy. Compare local customizations before replacing the script, and retain the repo's config and docs.

## Layers

1. **Kernel:** root `AGENTS.md`, loaded by every agent on every task. It holds only rules that every task needs, plus the one-line triggers that say which topic to load.
2. **Scoped instructions:** optional nested `AGENTS.md` files for one package or app. Map each to a topic, or add a reason-bearing `"unrouted"` exception when agents already load it by cwd.
3. **Topics:** the active config (`.agents/context/ai-context.json` by default, or the file selected by `AI_CONTEXT_CONFIG`) maps each topic to whole files or exact headings. `scripts/ai-context.py <topic>` prints only those sections.
4. **History:** `.agents/context/history/` (none yet), holding milestone logs in their original language. They are never loaded by default and are indexed in `.agents/README.md`.

The active config owns this root's local topics: `<root>/.agents/context/ai-context.json` by default, or the file selected by `AI_CONTEXT_CONFIG`. The tables in `AGENTS.md` and `.agents/README.md` mirror those local topics. Mounted roots keep their own config, instructions and index; use `list` for the combined catalog.

Shared installation and mounting another router tree are documented in `.agents/context/ai-context-advanced.md` (topic `ai-context-advanced`); this repo uses neither.

## When docs must change

Update docs **in the same change** that makes them stale:

| You did this | Update this |
|---|---|
| Changed behaviour a topic describes | That topic's page |
| Found a descriptive claim that contradicts code/tests | Verify and fix the stale description; report the evidence |
| Code conflicts with a hard limit, safety rule or intended requirement | Surface the conflict to the owner; do not weaken the rule to match code |
| Learned a lesson the hard way | Keep it in its topic; promote a one-line kernel rule only if every task needs it |
| Finished a milestone | Add `.agents/context/history/<milestone>.md` and one index row in `.agents/README.md` |
| Added a new kind of recurring task | Add a new topic: page, JSON entry, and both tables |
| Added a nested `AGENTS.md` | Map it in some topic, or record a reason-bearing exception if loaded by cwd |

Leave volatile state out of the docs: progress counts, who is doing what this week, today's blocker. Those belong in the tracker.

## Evidence and review

For consequential claims (safety, compatibility, limits or verification), keep a nearby source path/heading, test or decision reference, its revision/date when relevant, and status: observed, intended, inferred or unresolved. Distinguish a recorded test result from a current guarantee. Reuse existing evidence; no new metadata system is needed.

When a topic is incomplete, stale or contradictory, follow its source comments and inspect the relevant raw file, code, tests or decision. Load only what resolves the gap. Record unresolved conflicts rather than silently treating implementation as policy.

After a change, render the affected topics and review their claims against those sources. Check moved material for lost hard limits and missing task triggers. Review unchanged pages only when a changed claim depends on them; this is not a whole-wiki audit.

## Adding or changing a topic

1. Put the content in `.agents/context/<page>.md`. Keep it a short pointer page: facts belong in the human doc, and doc paths belong in `.agents/context/docs.md`. A topic should be a recognizable kind of work, not a single ticket or file.
2. Map it in the active config: `<root>/.agents/context/ai-context.json` by default, or the file selected by `AI_CONTEXT_CONFIG`. Reference exact headings for large pages.
3. Add a row to this root's local topic tables in `AGENTS.md` and `.agents/README.md`; mounted topics belong to their owner's tables.
4. Run `python3 scripts/ai-context.py check`, then render the topic and read it as an agent would.

For a heading source, `"frontmatter": true` skips a closed leading envelope; default/false keeps legacy behavior. First line must be `---` (optional BOM); closure is column-zero `---` or `...`. Trailing spaces/tabs are allowed. No YAML validation occurs. No closer means legacy headings. Whole-file output stays unchanged; sections add no metadata.

## What check enforces

- Every configured content path stays inside its owning root and exists, and every heading matches exactly once.
- Relative Markdown links and images resolve from their containing page to files inside the repo, including after symlink resolution. This is always checked in complete routed sources, every wiki Markdown page (the router index, history and `"unrouted"` exceptions included), and `.md` pages matched by optional `indexed` patterns.
- Nested and multiline inline destinations and used reference definitions are checked; reference errors point to the definition line. Unused definitions, fenced/indented/inline code, HTML comments/raw HTML, escaped markup, external URLs, absolute paths and fragment-only links are skipped. Markdown escapes and HTML entities are decoded before removing queries/fragments and percent-decoding filenames. Heading fragments are not validated.
- `AGENTS.md` and every topic stay under their byte budgets. Over budget means split the topic. Do not raise the cap.
- Every topic is listed in its own root instructions (`AGENTS.md` by default).
- **No orphans:**
  - every `.agents/context/` page (history excluded) is loaded by some topic;
  - every history file is indexed in `.agents/README.md`;
  - every nested `AGENTS.md` is loaded by some topic.

  A deliberate exception goes under `"unrouted"` in the JSON, with a reason, including scoped instructions agents already load by cwd. Keys accept exact paths or case-sensitive fnmatch globs; backslashes normalize to `/`. For example, `"projects/*/AGENTS.md": "Loaded by cwd."` matches both `projects/api/AGENTS.md` and `projects/team/api/AGENTS.md`: `*` crosses `/`, and `**` has no special recursive meaning. `?` and bracket classes also work. Keys match themselves and also act as patterns, regardless of file existence: `wiki/file[1].md` exempts both itself and `wiki/file1.md`. Use `wiki/file[[]1].md` to exempt the literal bracketed filename without also exempting `wiki/file1.md`. Unmatched orphans still fail.

Optional `"indexed"` patterns (a list of strings, default `[]`) check discovery of `.md` pages across repo directories, including hidden, dependency, and build directories but excluding `.git` metadata, for example `"indexed": ["projects/*/*-runbook.md"]`. Directory symlinks are not followed; patterns and references use real repo-relative paths, and files in real directories are inspected once without alias traversal. Use forward-slash repo-relative patterns. Python `fnmatch` lets `*` cross `/`; matching is case-sensitive on POSIX and follows platform normalization on Windows.

An indexed page must be a topic source, including a heading-selected source, or have its full repo-relative path named in root instructions, the configured router file, or a topic's successfully rendered text. Only selected sections count, and a basename or relative link without the full string does not. Fix a failure by naming the path in a topic page, routing the page as a source, or listing an exact path or matching case-sensitive glob under `"unrouted"` with a nonblank string reason. If multiple exceptions match, any nonblank string reason exempts the page from the indexed check. Blank or non-string reasons still exempt legacy orphans, but do not satisfy an indexed check. These references do not exempt pages from the existing wiki, history, or nested-instructions rules.

Optional `"skipDirs"` (a list of strings, default `[]`) keeps `check` out of bulky trees that hold no instructions, such as generated output or evidence dumps: exact repo-relative directory paths or case-sensitive fnmatch globs, matched like `"unrouted"` keys. Pages inside a skipped directory are checked only when a topic routes them or the path is the explicit router file. The owner's wiki is always walked except for mounted trees, which get their own checks as described above.

`check` runs in CI to catch structural drift. Passing does not establish factual accuracy, policy compliance, freshness or complete task coverage; the targeted review above is still needed.

## Combining topics

`python3 scripts/ai-context.py --dedupe a b` prints each identical source entry (same root, path, heading and options) once, under its first topic. Every source is still validated; single-topic output and `check` budgets are unchanged. A local topic named `--dedupe` takes precedence.

## Skills

Skills are workflow adapters. They may call `ai-context.py`, run checks and shorten steps, but no rule may live only in a skill. With no skill installed, this page and the kernel must still be enough.
