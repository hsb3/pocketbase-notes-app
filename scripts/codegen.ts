// Regenerate PocketBase record types (pocketbase-typegen). Bun auto-loads .env into
// the runtime, so the credentials are read from process.env here rather than
// shell-expanded in a script (bun run does NOT inject .env into a script's shell).
// Run: `bun run pb:codegen`.
import { $ } from "bun";

const { VITE_PB_URL, PB_EMAIL, PB_PASSWORD } = process.env;
if (!VITE_PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  throw new Error("Set VITE_PB_URL, PB_EMAIL, PB_PASSWORD in .env");
}

await $`pocketbase-typegen --url ${VITE_PB_URL} --email ${PB_EMAIL} --password ${PB_PASSWORD} --out ./src/services/pocketbase-types.ts`;
