import { pb } from "@/services/pocketbase";
import type { EntriesResponse } from "@/services/pocketbase-types";
import type { NodeJSON } from "prosekit/core";

export type Entry = EntriesResponse<NodeJSON>;
export type View = "all" | "note" | "journal" | "favorites";
export type EntrySearch = { view: View; q: string; date: string; page: number };
export const emptyBody: NodeJSON = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function parseSearch(search: Record<string, unknown>): EntrySearch {
  const view = ["all", "note", "journal", "favorites"].includes(
    String(search.view),
  )
    ? (search.view as View)
    : "all";
  return {
    view,
    q: String(search.q || "").slice(0, 160),
    date:
      view === "journal" && validDate(String(search.date))
        ? String(search.date)
        : "",
    page: Math.max(1, Math.min(100000, Math.floor(Number(search.page) || 1))),
  };
}
export function bodyText(body: NodeJSON | null): string {
  if (!body) return "";
  if (body.text) return body.text;
  return (body.content || [])
    .map(bodyText)
    .join(body.type === "paragraph" || body.type === "heading" ? "" : " ");
}
export function listEntries(search: EntrySearch) {
  const filters: string[] = [];
  if (search.view === "note" || search.view === "journal")
    filters.push(pb.filter("kind = {:kind}", { kind: search.view }));
  if (search.view === "favorites") filters.push("favorite = true");
  if (search.q) filters.push(pb.filter("title ~ {:q}", { q: search.q }));
  if (search.view === "journal" && search.date)
    filters.push(pb.filter("journal_date = {:date}", { date: search.date }));
  return pb.collection("entries").getList<Entry>(search.page, 20, {
    filter: filters.join(" && "),
    sort:
      search.view === "journal" ? "-journal_date,-updated,-id" : "-updated,-id",
    requestKey: null,
  });
}
export function getEntry(id: string) {
  return pb.collection("entries").getOne<Entry>(id, { requestKey: null });
}
