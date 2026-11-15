import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { isAbsolute } from "node:path";

const directory = process.env.DEPLOY_EVIDENCE_DIR;
assert(
  directory && isAbsolute(directory),
  "Set DEPLOY_EVIDENCE_DIR to an absolute private output directory.",
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
export const evidenceDirectory = directory;
