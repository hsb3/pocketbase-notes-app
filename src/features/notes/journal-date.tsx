import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDate, validDate } from "./data";

// Local noon: parsing the bare day would read UTC midnight and show the previous day west of UTC.
export function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// shortcut: the platform date input, not the old calendar grid (needs react-day-picker); swap here if the owner adds it.
export function JournalDateDialog({
  day,
  choose,
  close,
}: {
  day: string;
  choose: (day: string) => void;
  close: () => void;
}) {
  const [value, setValue] = useState(day || localDate());
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("note-actions")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Journal date</DialogTitle>
          <DialogDescription>
            A calendar day for this note in Journal.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (validDate(value)) choose(value);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="journal-date">Journal date</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="journal-date"
                ref={input}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                className="w-auto min-w-0 flex-1"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setValue(localDate())}
              >
                Today
              </Button>
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            {day && (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto"
                onClick={() => choose("")}
              >
                Remove date
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!validDate(value)}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
