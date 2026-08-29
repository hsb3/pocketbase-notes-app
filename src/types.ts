import type { UsersResponse } from "@/services/pocketbase-types";

export type User = Pick<
  UsersResponse,
  "id" | "name" | "email" | "avatar" | "verified" | "updated" | "created"
>;
