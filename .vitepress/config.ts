import fs from "node:fs";
import path from "node:path";
import { renderMermaidSVG } from "beautiful-mermaid";
import { defineConfig } from "vitepress";

// The site's source is the repository itself: docs/, deploy/*.md and the root
// guides render in place, so nothing is copied and every link works on GitHub too.
const repo = "https://github.com/hsb3/pocketbase-notes-app";
const root = path.resolve(import.meta.dirname, "..");

// Markdown that is not part of the site (agent context, generated or tool output).
const excluded = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agents",
  ".claude",
  ".codex",
  ".github",
  ".opencode",
  ".specify",
  "specs",
  "src",
  "tests",
  "scripts",
  "pb",
  "test-results",
  "playwright-report",
  "ci-artifacts",
];
const isExcluded = (rel: string) =>
  excluded.some((e) => rel === e || rel.startsWith(`${e}/`));

// Sidebar entries appear only once their page exists, so slots can be reserved.
const page = (text: string, file: string) =>
  fs.existsSync(path.join(root, file))
    ? [
        {
          text,
          link: file === "README.md" ? "/" : `/${file.replace(/\.md$/, "")}`,
        },
      ]
    : [];

// GitHub-style heading ids, so anchors match between github.com and the site.
const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

export default defineConfig({
  title: "PocketBase Notes",
  description:
    "Private notes and journaling app on React, TanStack Router and PocketBase.",
  base: "/pocketbase-notes-app/",
  srcDir: ".",
  srcExclude: [...excluded.map((e) => (e.endsWith(".md") ? e : `${e}/**`))],
  rewrites: { "README.md": "index.md" },
  cacheDir: "node_modules/.cache/vitepress",
  lastUpdated: false,
  vite: { configFile: false },
  markdown: {
    anchor: { slugify },
    config(md) {
      // Relative links to repository files that are not site pages (code, config,
      // LICENSE, folders) point at GitHub; links to missing targets fail the build.
      md.core.ruler.push("repo-links", (state) => {
        const from = state.env.realPath ?? state.env.path;
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== "link_open") continue;
            const href = token.attrGet("href") ?? "";
            if (!href || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
            const [target, hash = ""] = href.split(/(?=#)/);
            const abs = path.resolve(path.dirname(from), decodeURI(target));
            const rel = path.relative(root, abs);
            if (!fs.existsSync(abs)) {
              throw new Error(
                `Dead link in ${path.relative(root, from)}: ${href}`,
              );
            }
            if (rel.endsWith(".md") && !isExcluded(rel)) continue;
            if (rel.endsWith(".html")) {
              // Standalone HTML (wireframes) is copied as-is in buildEnd; a new tab
              // keeps the site router from treating it as a missing page.
              token.attrSet("target", "_blank");
              continue;
            }
            const kind = fs.statSync(abs).isDirectory() ? "tree" : "blob";
            token.attrSet("href", `${repo}/${kind}/main/${rel}${hash}`);
          }
        }
      });
      // Render ```mermaid fences as inline SVG that follows the site theme.
      const fence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, ...rest) => {
        const token = tokens[idx];
        if (token.info.trim() !== "mermaid") {
          return fence ? fence(tokens, idx, ...rest) : "";
        }
        const svg = renderMermaidSVG(token.content, {
          bg: "var(--vp-c-bg)",
          fg: "var(--vp-c-text-1)",
          transparent: true,
        });
        // Vue drops <style> inside page templates, so move the diagram's CSS
        // variables onto the <svg> itself (this also drops its Google Fonts import).
        const vars = (svg.match(/svg\s*\{([^}]*)\}/)?.[1] ?? "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s+/g, " ")
          .trim();
        const local = svg
          .replace(/<style>[\s\S]*?<\/style>/, "")
          .replace(
            / width="[\d.]+" height="[\d.]+" style="/,
            ` style="max-width:100%;height:auto;font-family:var(--vp-font-family-base);${vars}`,
          );
        return `<div class="mermaid-diagram">${local}</div>`;
      };
    },
  },
  async buildEnd({ outDir }) {
    for (const file of fs.globSync("docs/**/*.html", { cwd: root })) {
      const html = fs
        .readFileSync(path.join(root, file), "utf8")
        .replace(/href="([^":#]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"');
      fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
      fs.writeFileSync(path.join(outDir, file), html);
    }
  },
  themeConfig: {
    nav: [
      { text: "Get started", link: "/docs/development/setup" },
      { text: "Tech stack", link: "/docs/architecture/tech-stack" },
      { text: "Deploy", link: "/deploy/README" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          ...page("Overview", "README.md"),
          ...page("Development setup", "docs/development/setup.md"),
          ...page("Root config files", "docs/development/root-files.md"),
          ...page("Contributing", "CONTRIBUTING.md"),
        ],
      },
      {
        text: "Architecture",
        items: [
          ...page("Tech stack", "docs/architecture/tech-stack.md"),
          ...page("Product spec", "docs/architecture/spec.md"),
          ...page(
            "Technology evaluations",
            "docs/architecture/evaluations/index.md",
          ),
        ],
      },
      {
        text: "Features",
        items: [
          ...page("Authentication", "docs/features/auth.md"),
          ...page("Attachments", "docs/features/attachments.md"),
          ...page("Notes", "docs/features/notes.md"),
          ...page("Folders", "docs/features/folders.md"),
          ...page("Tasks", "docs/features/tasks.md"),
        ],
      },
      {
        text: "Testing",
        items: [
          ...page("Verification", "docs/testing/verification.md"),
          ...page("Load testing", "docs/testing/load-testing.md"),
        ],
      },
      {
        text: "CI and releasing",
        items: [
          ...page("Checks and repository rules", "docs/ci/checks-and-rules.md"),
          ...page("Releasing", "docs/ci/releasing.md"),
          ...page("Changelog", "CHANGELOG.md"),
          ...page("Security policy", "SECURITY.md"),
        ],
      },
      {
        text: "Deployment",
        items: [
          ...page("Overview", "deploy/README.md"),
          ...page("Local stacks", "deploy/LOCAL.md"),
          ...page("Shared image", "deploy/IMAGE.md"),
          ...page("Self-host on Railway", "deploy/RAILWAY.md"),
          ...page("Operations", "deploy/OPERATIONS.md"),
        ],
      },
      {
        text: "Design history",
        items: [
          ...page("Notes and journal brief", "docs/design/notes-journal.md"),
          ...page("Wireframes", "docs/design/wireframes.md"),
          ...page("Adopted prebuilt UI", "docs/design/prebuilt-ui.md"),
        ],
      },
    ],
    search: { provider: "local" },
    editLink: {
      pattern: `${repo}/edit/main/:path`,
      text: "Edit this page on GitHub",
    },
    socialLinks: [{ icon: "github", link: repo }],
    outline: [2, 3],
  },
});
