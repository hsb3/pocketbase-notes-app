import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconCalendar } from "@tabler/icons-react";
import { useState } from "react";
import { localDate } from "./data";

export function DatePicker({
  value,
  onChange,
  clearable = false,
  disabled = false,
}: {
  value: string;
  onChange: (date: string) => void;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label="Choose journal date"
        >
          <IconCalendar data-icon="inline-start" />
          {selected
            ? selected.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Any date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) onChange(localDate(date));
            else if (clearable) onChange("");
            setOpen(false);
          }}
        />
        <div className="flex justify-between gap-2 border-t p-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(localDate());
              setOpen(false);
            }}
          >
            Today
          </Button>
          {clearable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
