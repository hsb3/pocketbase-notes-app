import { expect, test } from "bun:test";

for (const script of ["test-entries.ts", "test-attachments.ts"]) {
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
