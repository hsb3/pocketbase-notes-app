import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const script of ["test-notes.ts", "test-attachments.ts", "seed.ts"]) {
  test(`${script} rejects non-loopback targets before authentication`, async () => {
    let requests = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        requests++;
        return new Response("{}", { status: 503 });
      },
    });
    try {
      const child = Bun.spawn([process.execPath, `scripts/${script}`], {
        env: {
          ...process.env,
          VITE_PB_URL: `http://0.0.0.0:${server.port}`,
          PB_URL: `http://0.0.0.0:${server.port}`,
          TEST_PB_URL: `http://0.0.0.0:${server.port}`,
          PB_EMAIL: "guard@example.invalid",
          PB_PASSWORD: "not-a-real-secret",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const error = await new Response(child.stderr).text();
      expect(await child.exited).not.toBe(0);
      expect(requests).toBe(0);
      expect(error).toContain("local");
    } finally {
      server.stop(true);
    }
  });
}

test("seed.sh rejects remote targets before invoking Docker", async () => {
  const directory = mkdtempSync(join(tmpdir(), "seed-guard-"));
  const marker = join(directory, "docker-called");
  writeFileSync(
    join(directory, "docker"),
    '#!/bin/sh\nprintf called > "$SEED_DOCKER_MARKER"\nexit 1\n',
    { mode: 0o700 },
  );
  try {
    const child = Bun.spawn(["sh", "scripts/seed.sh"], {
      env: {
        ...process.env,
        PB_URL: "https://example.invalid",
        PATH: directory + ":" + process.env.PATH,
        SEED_DOCKER_MARKER: marker,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(error).toContain("local");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployment drills require explicit opt-in before contacting a local target", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      return Response.json({}, { status: 503 });
    },
  });
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        'import { deploymentAdmin } from "./deploy/railway/verification"; await deploymentAdmin();',
      ],
      {
        env: {
          ...process.env,
          PB_URL: `http://127.0.0.1:${server.port}`,
          DEPLOY_ALLOW_LOCAL: "false",
          PB_ADMIN_EMAIL: "guard@example.invalid",
          PB_ADMIN_PASSWORD: "not-a-real-secret",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(requests).toBe(0);
    expect(error).toContain("DEPLOY_ALLOW_LOCAL");
  } finally {
    server.stop(true);
  }
});

test("deployment scripts refuse a remote target that was not confirmed by hostname", async () => {
  for (const [url, confirm] of [
    ["https://notes.example.invalid", ""],
    ["https://notes.example.invalid", "other.example.invalid"],
    ["http://notes.example.invalid", "notes.example.invalid"],
  ]) {
    const child = Bun.spawn(
      [process.execPath, "-e", 'import "./deploy/railway/verification";'],
      {
        env: {
          ...process.env,
          PB_URL: url,
          DEPLOY_CONFIRM: confirm,
          DEPLOY_ALLOW_LOCAL: "true",
          PB_ADMIN_EMAIL: "guard@example.invalid",
          PB_ADMIN_PASSWORD: "not-a-real-secret",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(error).toContain("DEPLOY_CONFIRM");
  }
});
