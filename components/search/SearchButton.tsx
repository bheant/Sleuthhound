"use client";

import { useCommands } from "./CommandProvider";

export function SearchButton({ className }: { className: string }) {
  const { openSearch } = useCommands();
  return (
    <button
      type="button"
      aria-label="Search"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K /"
      onClick={openSearch}
      className={className}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <circle cx="10.5" cy="7.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.8 11.2 2 16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
