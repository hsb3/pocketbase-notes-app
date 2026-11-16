// k6 load test for one PocketBase Notes instance. Run through tests/load/run.sh.
// Requests mirror the frontend: src/features/entries/data.ts (lists, open),
// entry-editor.tsx (create/update with revision), attachments.ts (upload, protected download)
// and src/features/tasks/data.ts (Open tasks view).
import exec from "k6/execution";
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// k6 injects __ENV as a global; read it via globalThis so linting needs no global config.
const ENV = globalThis.__ENV;
const BASE = ENV.BASE_URL || "http://pocketbase:8080";
const STAGES = (ENV.STAGES || "50,100,200,300,400,500,650")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => value > 0);
const STAGE_SECONDS = Number(ENV.STAGE_SECONDS || 60);
// Pause between stages: lets in-flight requests finish and the app settle.
const GAP_SECONDS = 10;
const USERS = Number(ENV.USERS || 200);
const ENTRIES_PER_USER = Number(ENV.ENTRIES_PER_USER || 40);
const LOGIN_SHARE = Number(ENV.LOGIN_SHARE || 0.05);
const RATE_LIMITS = ENV.RATE_LIMITS === "on";
const PASSWORD = "load-test-password-123";
const OPS = [
  "login",
  "list",
  "list_filtered",
  "open_tasks",
  "search",
  "open",
  "create",
  "update",
  "upload",
  "attachment_meta",
  "file_token",
  "download",
];

// PocketBase sleeps up to 500 ms on repeated empty filtered lists (anti-enumeration),
// so those responses are timed separately from the latency the app actually works for.
const latency = new Trend("app_latency", true);
const emptyFilterLatency = new Trend("empty_filter_latency", true);
const rateLimited = new Counter("rate_limited");

const stageName = (index) => `s${index + 1}_${STAGES[index]}vus`;

const scenarios = {};
const thresholds = {};
STAGES.forEach((vus, index) => {
  const name = stageName(index);
  scenarios[name] = {
    executor: "constant-vus",
    vus,
    duration: `${STAGE_SECONDS}s`,
    startTime: `${index * (STAGE_SECONDS + GAP_SECONDS)}s`,
    gracefulStop: "5s",
  };
  // Always-true thresholds: they only make k6 report these per-stage sub-metrics.
  thresholds[`app_latency{scenario:${name}}`] = ["max>=0"];
  thresholds[`empty_filter_latency{scenario:${name}}`] = ["max>=0"];
  thresholds[`http_req_failed{scenario:${name}}`] = ["rate>=0"];
  thresholds[`http_reqs{scenario:${name}}`] = ["count>=0"];
  thresholds[`iterations{scenario:${name}}`] = ["count>=0"];
  for (const op of OPS) {
    thresholds[`app_latency{scenario:${name},op:${op}}`] = ["max>=0"];
    thresholds[`http_req_failed{scenario:${name},op:${op}}`] = ["rate>=0"];
  }
});

export const options = {
  scenarios,
  thresholds,
  setupTimeout: "5m",
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"],
  // Record a URL per operation, not per record id, to keep metric cardinality flat.
  systemTags: ["status", "method", "name", "scenario", "expected_response"],
};

const WORDS =
  "morning walk garden reading kitchen project meeting travel budget recipe letter music winter summer plan idea review draft quiet harbor window paper coffee river mountain lesson repair journal sketch budget market family weekend library notebook".split(
    " ",
  );
const SENTENCES = [
  "I took a walk before opening my laptop and it made the rest of the morning feel less hurried.",
  "A lamp, a shelf, and room to pause make picking up a book the easiest thing to do.",
  "We agreed to ship the smaller version first and revisit the rest after two weeks of real use.",
  "The first cool morning of the season arrived and the whole street smelled like wood smoke.",
  "Remember to compare the three quotes side by side before committing to any of them.",
  "Most of the afternoon went to untangling one stubborn problem that turned out to be a typo.",
  "A long conversation over dinner covered more ground than a month of short messages.",
  "The list keeps growing, so the plan is to pick the three that matter and drop the rest.",
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);
const words = (count) =>
  Array.from({ length: count }, () => pick(WORDS)).join(" ");
const text = (value, marks) =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const paragraph = () => ({
  type: "paragraph",
  content: [
    text(
      Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () =>
        pick(SENTENCES),
      ).join(" "),
    ),
    text(` ${words(3)}.`, [{ type: "bold" }]),
  ],
});
// A realistic entry: about 2-5 KB of ProseKit JSON that passes pb/hooks/entry-validation.js.
function documentBody() {
  const content = [];
  for (let section = 0; section < 2; section++) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [text(words(3))],
    });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++)
      content.push(paragraph());
    for (let i = 0; i < 3; i++)
      content.push({
        type: "list",
        attrs:
          section === 0
            ? { kind: "bullet" }
            : { kind: "task", checked: Math.random() < 0.6 },
        content: [{ type: "paragraph", content: [text(pick(SENTENCES))] }],
      });
  }
  content.push({
    type: "blockquote",
    content: [
      {
        type: "paragraph",
        content: [
          text("See "),
          text("the reference", [
            { type: "link", attrs: { href: "https://example.com/reference" } },
          ]),
        ],
      },
    ],
  });
  return { type: "doc", content };
}
const journalDate = () =>
  `2026-${pick(["10", "11"])}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
function entryFields(userId) {
  const journal = Math.random() < 0.4;
  return {
    user: userId,
    kind: journal ? "journal" : "note",
    title: words(3 + Math.floor(Math.random() * 2)),
    journal_date: journal ? journalDate() : "",
    favorite: Math.random() < 0.15,
    body: documentBody(),
    attachments: [],
    revision: 1,
  };
}
// Small attachments. PocketBase sniffs the type from content: a PDF header or plain text.
const PDF_FILE = `%PDF-1.4\n${"0123456789abcdef".repeat(4096)}\n%%EOF\n`; // ~64 KB
const TEXT_FILE = `${SENTENCES.join("\n")}\n`.repeat(24); // ~16 KB

const records = (collection) => `${BASE}/api/collections/${collection}/records`;
const query = (params) =>
  Object.keys(params)
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");
function params(op, token, json) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (json) headers["Content-Type"] = "application/json";
  return { headers, tags: { op, name: op }, timeout: "30s" };
}
function ok(response, op, emptyFilter) {
  if (response.status === 429) rateLimited.add(1);
  if (emptyFilter) emptyFilterLatency.add(response.timings.duration);
  else latency.add(response.timings.duration, { op });
  return check(response, {
    [`${op} ok`]: (r) => r.status >= 200 && r.status < 300,
  });
}
function login(email) {
  const response = http.post(
    `${records("users").replace("/records", "")}/auth-with-password`,
    JSON.stringify({ identity: email, password: PASSWORD }),
    params("login", null, true),
  );
  return ok(response, "login") ? response.json("token") : null;
}

function must(response, what) {
  if (response.status < 200 || response.status >= 300)
    throw new Error(`${what} failed: HTTP ${response.status} ${response.body}`);
  return response;
}
export function setup() {
  const admin = must(
    http.post(
      `${BASE}/api/collections/_superusers/auth-with-password`,
      JSON.stringify({ identity: ENV.PB_EMAIL, password: ENV.PB_PASSWORD }),
      { headers: { "Content-Type": "application/json" } },
    ),
    "superuser login",
  ).json("token");
  const json = {
    headers: { Authorization: admin, "Content-Type": "application/json" },
  };
  const chunks = (list, size) =>
    Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
      list.slice(i * size, (i + 1) * size),
    );

  const emails = Array.from(
    { length: USERS },
    (_, i) => `load-${String(i).padStart(4, "0")}@example.test`,
  );
  const users = [];
  for (const group of chunks(emails, 8)) {
    const responses = http.batch(
      group.map((email) => [
        "POST",
        records("users"),
        JSON.stringify({
          email,
          password: PASSWORD,
          passwordConfirm: PASSWORD,
          name: "Load User",
          verified: true,
        }),
        json,
      ]),
    );
    responses.forEach((response, i) =>
      users.push({
        email: group[i],
        id: must(response, "create user").json("id"),
      }),
    );
  }

  const owners = [];
  for (const user of users)
    for (let i = 0; i < ENTRIES_PER_USER; i++) owners.push(user.id);
  for (const group of chunks(owners, 16))
    http
      .batch(
        group.map((id) => [
          "POST",
          records("entries"),
          JSON.stringify(entryFields(id)),
          json,
        ]),
      )
      .forEach((response) => must(response, "seed entry"));

  for (const group of chunks(users, 8)) {
    const responses = http.batch(
      group.map((user) => [
        "POST",
        `${BASE}/api/collections/users/auth-with-password`,
        JSON.stringify({ identity: user.email, password: PASSWORD }),
        { headers: { "Content-Type": "application/json" } },
      ]),
    );
    responses.forEach((response, i) => {
      group[i].token = must(response, "user login").json("token");
    });
  }

  let settings = must(
    http.get(`${BASE}/api/settings`, json),
    "read settings",
  ).json();
  const stackRateLimits = settings.rateLimits.enabled;
  if (RATE_LIMITS && !stackRateLimits)
    settings = must(
      http.patch(
        `${BASE}/api/settings`,
        JSON.stringify({
          rateLimits: { ...settings.rateLimits, enabled: true },
        }),
        json,
      ),
      "enable rate limits",
    ).json();
  return {
    users,
    start: Date.now(),
    stackRateLimits,
    rateLimits: settings.rateLimits,
    s3: settings.s3.enabled,
    seededEntries: owners.length,
  };
}

// Per-VU state. `mine` holds entries this VU created, so concurrent VUs that share
// an account never save over each other (which would be a legitimate 409).
const state = { token: null, scenario: "", mine: [] };

function listEntries(token, view, q, page) {
  const filters = [];
  if (view === "note" || view === "journal") filters.push(`kind = '${view}'`);
  if (view === "favorites") filters.push("favorite = true");
  if (q) filters.push(`title ~ '${q}'`);
  if (view === "journal" && page === 0)
    filters.push(`journal_date = '${journalDate()}'`);
  const op = q ? "search" : view === "all" ? "list" : "list_filtered";
  const response = http.get(
    `${records("entries")}?${query({
      page: page || 1,
      perPage: 20,
      filter: filters.join(" && "),
      sort: view === "journal" ? "-journal_date,-updated,-id" : "-updated,-id",
    })}`,
    params(op, token),
  );
  const items = response.status === 200 ? response.json("items") : [];
  ok(
    response,
    op,
    response.status === 200 && filters.length > 0 && !items.length,
  );
  return items;
}
// src/features/tasks/data.ts: the Open tasks view reads the server-derived index only.
function listOpenTasks(token) {
  const response = http.get(
    `${records("entries")}?${query({
      page: 1,
      perPage: 200,
      skipTotal: 1,
      filter: "open_tasks > 0",
      sort: "-created,-id",
      fields: "id,title,kind,journal_date,created,revision,open_tasks,tasks",
    })}`,
    params("open_tasks", token),
  );
  ok(response, "open_tasks");
}
function openEntry(token, id) {
  const response = http.get(
    `${records("entries")}/${id}`,
    params("open", token),
  );
  return ok(response, "open") ? response.json() : null;
}
function createEntry(token, userId, attachments) {
  const fields = entryFields(userId);
  if (attachments) fields.attachments = attachments;
  const response = http.post(
    records("entries"),
    JSON.stringify(fields),
    params("create", token, true),
  );
  if (!ok(response, "create")) return null;
  const saved = response.json();
  state.mine.push({ id: saved.id, revision: saved.revision });
  if (state.mine.length > 20) state.mine.shift();
  return saved;
}

function browse(token) {
  if (Math.random() < 0.1) return listOpenTasks(token);
  const view = pick([
    "all",
    "all",
    "all",
    "all",
    "all",
    "all",
    "note",
    "journal",
    "favorites",
  ]);
  const items = listEntries(token, view, "", Math.random() < 0.25 ? 2 : 1);
  if (items.length && Math.random() < 0.7) {
    sleep(between(0.3, 1));
    openEntry(token, pick(items).id);
  }
}
function search(token) {
  const view = pick(["all", "all", "all", "note", "journal"]);
  // Journal view with page 0 adds the date filter the calendar applies.
  if (view === "journal" && Math.random() < 0.5)
    return listEntries(token, "journal", "", 0);
  const items = listEntries(token, view, pick(WORDS), 1);
  if (items.length && Math.random() < 0.5) {
    sleep(between(0.3, 1));
    openEntry(token, pick(items).id);
  }
}
function write(token, userId) {
  if (!state.mine.length || Math.random() < 0.4)
    return createEntry(token, userId);
  const own = pick(state.mine);
  const current = openEntry(token, own.id);
  if (!current) return;
  sleep(between(0.5, 1.5));
  const response = http.patch(
    `${records("entries")}/${own.id}`,
    JSON.stringify({
      user: userId,
      kind: current.kind,
      title: current.title,
      journal_date: current.journal_date,
      favorite: Math.random() < 0.2 ? !current.favorite : current.favorite,
      body: documentBody(),
      attachments: current.attachments,
      revision: current.revision,
    }),
    params("update", token, true),
  );
  if (ok(response, "update")) own.revision = response.json("revision");
}
function attach(token, userId) {
  const pdf = Math.random() < 0.5;
  const name = pdf ? "report.pdf" : "notes.txt";
  const data = pdf ? PDF_FILE : TEXT_FILE;
  const upload = http.post(
    records("attachments"),
    {
      user: userId,
      name,
      file: http.file(data, name, pdf ? "application/pdf" : "text/plain"),
    },
    params("upload", token),
  );
  if (!ok(upload, "upload")) return;
  const attachment = upload.json();
  sleep(between(0.3, 1));
  if (!createEntry(token, userId, [attachment.id])) return;
  sleep(between(0.3, 1));
  // attachments.ts: read the record, get a short-lived file token, then fetch the bytes.
  const meta = http.get(
    `${records("attachments")}/${attachment.id}`,
    params("attachment_meta", token),
  );
  if (!ok(meta, "attachment_meta")) return;
  const fileToken = http.post(
    `${BASE}/api/files/token`,
    null,
    params("file_token", token),
  );
  if (!ok(fileToken, "file_token")) return;
  const download = http.get(
    `${BASE}/api/files/${attachment.collectionId}/${attachment.id}/${attachment.file}?token=${fileToken.json("token")}`,
    { ...params("download", null), responseType: "binary" },
  );
  latency.add(download.timings.duration, { op: "download" });
  check(download, {
    "download ok": (r) => r.status === 200 && r.body.byteLength === data.length,
  });
}

// One iteration is one user action followed by think time. Mix by weight:
// fresh login LOGIN_SHARE (5%); the rest is browse 47%, search 16%, write 26.5%, attach 10.5%.
export default function (data) {
  const user = data.users[(exec.vu.idInTest - 1) % data.users.length];
  if (state.scenario !== exec.scenario.name) {
    state.scenario = exec.scenario.name;
    sleep(between(0, 3)); // spread the VUs of a new stage instead of starting in lockstep
  }
  if (!state.token) state.token = user.token;
  const roll = Math.random();
  if (Math.random() < LOGIN_SHARE)
    state.token = login(user.email) || user.token;
  else if (roll < 0.47) browse(state.token);
  else if (roll < 0.63) search(state.token);
  else if (roll < 0.895) write(state.token, user.id);
  else attach(state.token, user.id);
  sleep(between(0.5, 1.5));
}

const fixed = (value, digits) =>
  value === undefined || value === null ? "-" : Number(value).toFixed(digits);
export function handleSummary(data) {
  const metric = (name) =>
    data.metrics[name] ? data.metrics[name].values : {};
  const start = Math.round(data.setup_data.start / 1000);
  const stageRows = [];
  const lines = [
    "| Stage | VUs | req/s | p50 ms | p95 ms | p99 ms | errors % |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  STAGES.forEach((vus, index) => {
    const name = stageName(index);
    const duration = metric(`app_latency{scenario:${name}}`);
    const requests = metric(`http_reqs{scenario:${name}}`).count || 0;
    const failed =
      (metric(`http_req_failed{scenario:${name}}`).rate || 0) * 100;
    const from = start + index * (STAGE_SECONDS + GAP_SECONDS);
    const row = [
      name,
      vus,
      from,
      from + STAGE_SECONDS,
      requests,
      fixed(requests / STAGE_SECONDS, 1),
      fixed(duration.med, 1),
      fixed(duration["p(95)"], 1),
      fixed(duration["p(99)"], 1),
      fixed(failed, 2),
      metric(`iterations{scenario:${name}}`).count || 0,
    ];
    stageRows.push(row.join("\t"));
    lines.push(
      `| ${index + 1} | ${vus} | ${row[5]} | ${row[6]} | ${row[7]} | ${row[8]} | ${row[9]} |`,
    );
  });
  const opLines = [
    `| Operation | ${STAGES.map((vus) => `${vus} VUs`).join(" | ")} |`,
    `| --- | ${STAGES.map(() => "---:").join(" | ")} |`,
  ];
  for (const op of OPS)
    opLines.push(
      `| ${op} | ${STAGES.map((_, index) => {
        const name = stageName(index);
        const duration = metric(`app_latency{scenario:${name},op:${op}}`);
        const failed =
          (metric(`http_req_failed{scenario:${name},op:${op}}`).rate || 0) *
          100;
        if (!duration.count) return "-";
        return `${fixed(duration.med, 0)} / ${fixed(duration["p(95)"], 0)}${failed >= 0.005 ? ` (${fixed(failed, 1)}% err)` : ""}`;
      }).join(" | ")} |`,
    );
  opLines.push(
    `| empty filtered list (deliberate delay) | ${STAGES.map((_, index) => {
      const duration = metric(
        `empty_filter_latency{scenario:${stageName(index)}}`,
      );
      return duration.count
        ? `${fixed(duration.med, 0)} / ${fixed(duration["p(95)"], 0)}`
        : "-";
    }).join(" | ")} |`,
  );
  const emptyShare =
    (100 * (metric("empty_filter_latency").count || 0)) /
    (metric("http_reqs").count || 1);
  const info = [
    `HTTP 429 (rate limited) responses: ${metric("rate_limited").count || 0} of ${metric("http_reqs").count || 0} requests`,
    `empty filtered lists (timed separately, see docs): ${fixed(emptyShare, 1)}% of requests`,
    `rate limiting in the stack as started: ${data.setup_data.stackRateLimits ? "on" : "off"}`,
    `rate limiting during this run: ${data.setup_data.rateLimits.enabled ? "on" : "off"}`,
    `file storage: ${data.setup_data.s3 ? "S3 (RustFS)" : "local disk"}`,
    `accounts: ${data.setup_data.users.length}, seeded entries: ${data.setup_data.seededEntries}`,
    `login share of actions: ${LOGIN_SHARE}`,
    `stage length: ${STAGE_SECONDS}s, checks passed: ${fixed((metric("checks").rate || 0) * 100, 2)}%`,
  ];
  const opsTable = `${opLines.join("\n")}\n`;
  return {
    stdout: `\n${info.join("\n")}\n\n${lines.join("\n")}\n\np50 / p95 ms per operation:\n\n${opsTable}`,
    "/results/summary.json": JSON.stringify({
      ...data,
      setup_data: { ...data.setup_data, users: undefined },
    }),
    "/results/stages.tsv": `${stageRows.join("\n")}\n`,
    "/results/ops.md": opsTable,
    "/results/info.txt": `${info.join("\n")}\n`,
    "/results/rate-limits.json": JSON.stringify(
      data.setup_data.rateLimits,
      null,
      2,
    ),
  };
}
