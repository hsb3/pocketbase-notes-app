"use client";

import { AutocompleteEmpty } from "prosekit/react/autocomplete";

export default function SlashMenuEmpty() {
  return (
    <AutocompleteEmpty className="relative box-border flex min-w-32 cursor-default scroll-my-1 items-center justify-between rounded-md px-3 py-1.5 text-sm whitespace-nowrap outline-hidden select-none data-highlighted:bg-gray-100 dark:data-highlighted:bg-gray-800">
      <span>No results</span>
    </AutocompleteEmpty>
  );
}
