import { Suspense, use } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import type { NoteDraft } from "./draft";

type EditorModule = typeof import("@/components/editor/examples/full/editor");
let warmed: EditorModule | undefined;
let loading: Promise<EditorModule> | undefined;

export function preloadEditor() {
  return (loading ??= import("@/components/editor/examples/full/editor").then(
    (module) => {
      warmed = module;
      return module;
    },
  ));
}

function EditingSurface({ draft }: { draft: NoteDraft }) {
  const { default: Editor } = warmed ?? use(preloadEditor());
  return (
    <Editor initialBody={draft.body} onChange={(body) => draft.edit(body)} />
  );
}

export function NoteEditor({
  draft,
  selected,
  unavailable,
  back,
}: {
  draft?: NoteDraft;
  selected: boolean;
  unavailable: boolean;
  back: () => void;
}) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
        {selected && (
          <Button variant="ghost" size="sm" aria-label="Back" onClick={back}>
            <ChevronLeft /> Back
          </Button>
        )}
        {draft && (
          <span role="status" className="text-xs text-muted-foreground">
            {draft.error || (draft.status === "Idle" ? "" : draft.status)}
          </span>
        )}
      </header>
      {draft ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl px-2 py-4 md:px-5 md:py-6">
            <Suspense fallback={<p>Loading editor…</p>}>
              <EditingSurface key={draft.id} draft={draft} />
            </Suspense>
          </div>
        </div>
      ) : (
        <Empty>
          <EmptyTitle>
            {unavailable
              ? "Note unavailable"
              : selected
                ? "Loading note…"
                : "Select or compose a note"}
          </EmptyTitle>
        </Empty>
      )}
    </>
  );
}
