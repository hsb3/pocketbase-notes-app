import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_library/folders/$folderId",
)({
  validateSearch: (search): { page?: number } => {
    const page = Number(search.page);
    return Number.isSafeInteger(page) && page > 1 ? { page } : {};
  },
});
