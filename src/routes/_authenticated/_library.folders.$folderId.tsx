import { createFileRoute } from "@tanstack/react-router";
import { searchTerm } from "@/features/notes/data";

function pageNumber(value: unknown) {
  const page = typeof value === "string" ? Number(value) : value;
  return typeof page === "number" && Number.isSafeInteger(page) && page > 1
    ? page
    : undefined;
}

export const Route = createFileRoute(
  "/_authenticated/_library/folders/$folderId",
)({
  validateSearch: (search): { page?: number; q?: string; sp?: number } => {
    const q = searchTerm(search.q) || undefined;
    return {
      page: pageNumber(search.page),
      q,
      sp: q ? pageNumber(search.sp) : undefined,
    };
  },
});
