import { Monitor, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Theme, useTheme } from "@/features/theme/theme";

export const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const satisfies readonly { value: Theme; label: string; icon: unknown }[];

/** Light / Dark / System switch for screens without the user menu. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Theme"
      className={className}
      value={theme}
      /** radix reports "" when the active item is pressed again: keep it */
      onValueChange={(value) => value && setTheme(value as Theme)}
    >
      {themeOptions.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          title={option.label}
        >
          <option.icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
