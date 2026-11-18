import assert from "node:assert/strict";

export async function assertStorageObject(key: string, message: string) {
  if (process.env.CONTAINED_TEST === "1") {
    const bucket = new Bun.S3Client({
      endpoint: "http://rustfs:9000",
      bucket: process.env.RUSTFS_BUCKET,
      accessKeyId: process.env.RUSTFS_ACCESS_KEY,
      secretAccessKey: process.env.RUSTFS_SECRET_KEY,
      region: "us-east-1",
    });
    assert(await bucket.exists(key), message);
    return;
  }
  const probe = Bun.spawnSync([
    "docker",
    "compose",
    "--project-directory",
    ".",
    "-f",
    process.env.COMPOSE_FILE || "deploy/local/docker-compose-full.yml",
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "/bin/sh",
    "storage-init",
    "-ec",
    'rc alias set local http://rustfs:9000 "$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" >/dev/null; rc object stat "local/$RUSTFS_BUCKET/$1" >/dev/null',
    "probe",
    key,
  ]);
  assert.equal(probe.exitCode, 0, message);
}
