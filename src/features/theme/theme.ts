import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

/**
 * localStorage key. The inline script in index.html reads the same key before
 * first paint; keep the two in sync.
 */
export const THEME_STORAGE_KEY = "theme";

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "system";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function stored(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    /* storage blocked: follow the system */
    return "system";
  }
}

let theme = stored();

function apply() {
  const dark = theme === "dark" || (theme === "system" && media.matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function update(next: Theme) {
  theme = next;
  apply();
  for (const listener of listeners) listener();
}

export function setTheme(next: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  update(next);
}

/** follow live OS changes while the preference is "system" */
media.addEventListener("change", apply);

/** keep other tabs in step */
window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY || event.key === null) update(stored());
});

apply();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  return { theme: useSyncExternalStore(subscribe, () => theme), setTheme };
}
