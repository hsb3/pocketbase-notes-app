import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { entriesRoute } from "@/features/entries/workspace";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { completeTask, TaskConflict, type TaskEntry } from "./data";

export function OpenTasks({ entries }: { entries: TaskEntry[] }) {
  const search = entriesRoute.useSearch();
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function complete(entry: TaskEntry, path: number[]) {
    const key = `${entry.id}:${path.join(".")}`;
    setPending(key);
    setError("");
    try {
      await completeTask(entry, path);
    } catch (failure) {
      setError(
        failure instanceof TaskConflict
          ? `“${entry.title}” changed since this list loaded. The list is refreshed; nothing was overwritten.`
          : "Could not save. Check the connection and try again.",
      );
    } finally {
      await router.invalidate();
      setPending("");
    }
  }

  if (!entries.length)
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>No open tasks</EmptyTitle>
          <EmptyDescription>
            Add a checklist to any note or journal entry with the Task List
            button in the editor toolbar. Unchecked items show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <h1 className="font-semibold text-xl">Open tasks</h1>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {entries.map((entry) => (
        <section
          key={entry.id}
          aria-labelledby={`tasks-${entry.id}`}
          className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id={`tasks-${entry.id}`} className="min-w-0 font-medium">
              <Link
                to="/entries/$entryId"
                params={{ entryId: entry.id }}
                search={search}
                className="block truncate underline-offset-4 hover:underline"
              >
                {entry.title}
              </Link>
            </h2>
            <span className="shrink-0 text-muted-foreground text-xs">
              {entry.kind === "journal"
                ? `Journal · ${entry.journal_date}`
                : "Note"}{" "}
              · {entry.open_tasks} open
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {(entry.tasks || []).map((task) => {
              const key = `${entry.id}:${task.path.join(".")}`;
              return (
                <li key={key}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={pending === key}
                      disabled={!!pending}
                      onChange={() => void complete(entry, task.path)}
                    />
                    <span
                      className={pending === key ? "line-through" : undefined}
                    >
                      {task.text || "(empty task)"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {(entry.open_tasks || 0) > (entry.tasks?.length || 0) && (
            <p className="text-muted-foreground text-xs">
              More open items in this entry. Open it to see them all.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
