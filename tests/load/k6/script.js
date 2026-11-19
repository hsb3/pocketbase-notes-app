// k6 load test for one PocketBase Notes instance. Run through tests/load/run.sh.
// The R2 workload uses projected active-note lists, revisioned writes and protected files.
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
const SMOKE = ENV.WORKLOAD_SMOKE === "1";
const RATE_LIMITS = ENV.RATE_LIMITS === "on";
const PASSWORD = "load-test-password-123";
const OPS = [
  "login",
  "list",
  "list_filtered",
  "folders",
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
const thresholds = SMOKE
  ? { checks: ["rate==1"], http_req_failed: ["rate==0"] }
  : {};
STAGES.forEach((vus, index) => {
  const name = stageName(index);
  scenarios[name] = {
    executor: "constant-vus",
    vus,
    duration: `${STAGE_SECONDS}s`,
    startTime: `${index * (STAGE_SECONDS + GAP_SECONDS)}s`,
    gracefulStop: "5s",
  };
  // Export per-stage metrics even when the capacity campaign has no pass/fail target.
  thresholds[`app_latency{scenario:${name}}`] = ["max>=0"];
  thresholds[`empty_filter_latency{scenario:${name}}`] = ["max>=0"];
  thresholds[`http_req_failed{scenario:${name}}`] = ["rate>=0"];
  thresholds[`http_reqs{scenario:${name}}`] = ["count>=0"];
  thresholds[`iterations{scenario:${name}}`] = ["count>=0"];
  for (const op of OPS) {
    thresholds[`app_latency{scenario:${name},op:${op}}`] = ["max>=0"];
    if (SMOKE) thresholds[`http_reqs{scenario:${name},op:${op}}`] = ["count>0"];
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
// The first paragraph supplies the title of the 2–5 KB rich document.
function documentBody() {
  const content = [{ type: "paragraph", content: [text(words(4))] }];
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
function noteFields(user, folder) {
  return {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 15),
    user,
    folder,
    body: documentBody(),
    attachments: [],
  };
}
// Small attachments. PocketBase sniffs the type from content: a PDF header or plain text.
const PDF_FILE = `%PDF-1.4\n${"0123456789abcdef".repeat(4096)}\n%%EOF\n`; // ~64 KB
const TEXT_FILE = `${SENTENCES.join("\n")}\n`.repeat(24); // ~16 KB

const records = (collection) => `${BASE}/api/collections/${collection}/records`;
const detailFields =
  "fields=id,user,folder,title,body,attachments,revision,updated,deleted";
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

  const owners = [];
  for (const user of users) {
    const folders = listFolders(user.token);
    const defaults = folders.filter(
      (folder) => folder.user === user.id && folder.is_default,
    );
    if (defaults.length !== 1) throw Error("Expected one owned default folder");
    user.folder = defaults[0].id;
    for (let i = 0; i < ENTRIES_PER_USER; i++) owners.push(user);
  }
  for (const group of chunks(owners, 16))
    http
      .batch(
        group.map((user) => [
          "POST",
          records("notes"),
          JSON.stringify(noteFields(user.id, user.folder)),
          params("seed", user.token, true),
        ]),
      )
      .forEach((response) => must(response, "seed note"));

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
    seededNotes: owners.length,
  };
}

// Per-VU state. `mine` holds note IDs this VU created, so concurrent VUs that share
// an account never save over each other (which would be a legitimate 409).
const state = { token: null, scenario: "", mine: [] };

function listFolders(token) {
  const response = http.get(
    `${records("folders")}?${query({
      page: 1,
      perPage: 500,
      sort: "-is_default,name_key,id",
      fields: "id,user,name,is_default",
    })}`,
    params("folders", token),
  );
  return ok(response, "folders") ? response.json("items") : [];
}
function listNotes(token, folder, page) {
  const op = folder ? "list_filtered" : "list";
  const response = http.get(
    `${records("notes")}?${query({
      page,
      perPage: 20,
      fields: "id,folder,title,updated,excerpt",
      filter: folder ? `deleted = "" && folder = "${folder}"` : 'deleted = ""',
      sort: "-updated,-id",
    })}`,
    params(op, token),
  );
  const items = response.status === 200 ? response.json("items") : [];
  ok(response, op, response.status === 200 && !items.length);
  return items;
}
function openNote(token, id) {
  const response = http.get(
    `${records("notes")}/${id}?${detailFields}`,
    params("open", token),
  );
  return ok(response, "open") ? response.json() : null;
}
function createNote(token, user, attachments) {
  const fields = noteFields(user.id, user.folder);
  if (attachments) fields.attachments = attachments;
  const response = http.post(
    `${records("notes")}?${detailFields}`,
    JSON.stringify(fields),
    params("create", token, true),
  );
  if (!ok(response, "create")) return null;
  const saved = response.json();
  check(saved, {
    "stable ID and initial revision": (r) =>
      r.id === fields.id && r.revision === 1,
  });
  state.mine.push(saved.id);
  if (state.mine.length > 20) state.mine.shift();
  return saved;
}

function browse(token, folder) {
  const items = listNotes(token, folder, Math.random() < 0.25 ? 2 : 1);
  if (items.length && Math.random() < 0.7) {
    sleep(between(0.3, 1));
    openNote(token, pick(items).id);
  }
}
function updateNote(token, id) {
  const current = openNote(token, id);
  if (!current) return;
  sleep(between(0.5, 1.5));
  const response = http.patch(
    `${records("notes")}/${id}?${detailFields}`,
    JSON.stringify({
      body: documentBody(),
      revision: current.revision,
    }),
    params("update", token, true),
  );
  if (ok(response, "update"))
    check(response, {
      "revision advanced": (r) => r.json("revision") === current.revision + 1,
    });
}
function attach(token, user) {
  const pdf = Math.random() < 0.5;
  const name = pdf ? "report.pdf" : "notes.txt";
  const data = pdf ? PDF_FILE : TEXT_FILE;
  const upload = http.post(
    records("attachments"),
    {
      user: user.id,
      name,
      file: http.file(data, name, pdf ? "application/pdf" : "text/plain"),
    },
    params("upload", token),
  );
  if (!ok(upload, "upload")) return;
  const attachment = upload.json();
  sleep(between(0.3, 1));
  if (!createNote(token, user, [attachment.id])) return;
  sleep(between(0.3, 1));
  // Read the record, get a short-lived file token, then fetch the bytes.
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
// Fresh login uses LOGIN_SHARE. The rest browse lists, change folder, write or attach.
export default function (data) {
  const user = data.users[(exec.vu.idInTest - 1) % data.users.length];
  if (SMOKE && exec.scenario.iterationInTest === 0) {
    const token = login(user.email);
    if (!token) return;
    listFolders(token);
    for (const folder of [null, user.folder]) {
      const rows = listNotes(token, folder, 1);
      check(rows, {
        "seeded list has projected summaries": (items) =>
          items.length > 0 &&
          items.every(
            (r) =>
              Object.keys(r).sort().join(",") ===
                "excerpt,folder,id,title,updated" &&
              (!folder || r.folder === folder),
          ),
      });
    }
    const saved = createNote(token, user);
    if (saved) updateNote(token, saved.id);
    attach(token, user);
    return;
  }
  if (state.scenario !== exec.scenario.name) {
    state.scenario = exec.scenario.name;
    sleep(between(0, 3)); // spread the VUs of a new stage instead of starting in lockstep
  }
  if (!state.token) state.token = user.token;
  const roll = Math.random();
  if (Math.random() < LOGIN_SHARE)
    state.token = login(user.email) || user.token;
  else if (roll < 0.47) browse(state.token, null);
  else if (roll < 0.63) {
    listFolders(state.token);
    browse(state.token, user.folder);
  } else if (roll < 0.895) {
    if (!state.mine.length || Math.random() < 0.4)
      createNote(state.token, user);
    else updateNote(state.token, pick(state.mine));
  } else attach(state.token, user);
  sleep(between(0.5, 1.5));
}

const fixed = (value, digits) =>
  value === undefined || value === null ? "-" : Number(value).toFixed(digits);
export function handleSummary(data) {
  if (!data.setup_data) return { stdout: "Workload setup failed.\n" };
  const out = SMOKE ? "/tmp/results" : "/results";
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
    `accounts: ${data.setup_data.users.length}, seeded notes: ${data.setup_data.seededNotes}`,
    `login share of actions: ${LOGIN_SHARE}`,
    `stage length: ${STAGE_SECONDS}s, checks passed: ${fixed((metric("checks").rate || 0) * 100, 2)}%`,
  ];
  const opsTable = `${opLines.join("\n")}\n`;
  return {
    stdout: `\n${info.join("\n")}\n\n${lines.join("\n")}\n\np50 / p95 ms per operation:\n\n${opsTable}`,
    [`${out}/summary.json`]: JSON.stringify({
      ...data,
      setup_data: { ...data.setup_data, users: undefined },
    }),
    [`${out}/stages.tsv`]: `${stageRows.join("\n")}\n`,
    [`${out}/ops.md`]: opsTable,
    [`${out}/info.txt`]: `${info.join("\n")}\n`,
    [`${out}/rate-limits.json`]: JSON.stringify(
      data.setup_data.rateLimits,
      null,
      2,
    ),
  };
}
