import type { TypedPocketBase } from "@/services/pocketbase-types";
import PocketBase from "pocketbase";

/**
 * PocketBase client, typed per collection via generated types
 * (`bun run pb:codegen` after schema changes).
 */
const pb = new PocketBase(
  import.meta.env.VITE_PB_URL || "/",
) as TypedPocketBase;

export { pb };
