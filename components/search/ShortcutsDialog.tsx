"use client";

import { useEffect, useRef } from "react";

// The keyboard shortcuts panel, opened with ?.

type Key = { key: string } | { sep: string };

const GROUPS: Array<{ label: string; rows: Array<{ label: string; keys: Key[] }> }> = [
  {
    label: "Anywhere",
    rows: [
      { label: "Search companies, conversations and clients", keys: [{ key: "⌘" }, { key: "K" }, { sep: "or" }, { key: "/" }] },
      { label: "Show these shortcuts", keys: [{ key: "?" }] },
      { label: "Close a panel, menu or search", keys: [{ key: "Esc" }] },
    ],
  },
  {
    label: "In the list",
    rows: [
      { label: "Next or previous item", keys: [{ key: "J" }, { sep: "and" }, { key: "K" }] },
      { label: "Open the selected item", keys: [{ key: "Enter" }] },
      { label: "Keep", keys: [{ key: "Y" }] },
      { label: "Discard", keys: [{ key: "N" }] },
      { label: "Undo the last decision", keys: [{ key: "U" }] },
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-heading"
        className="relative max-h-[calc(100vh-32px)] w-[min(560px,100%)] overflow-y-auto border border-strong bg-field px-8 pt-7 pb-8"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="shortcuts-heading" className="m-0 text-[28px] leading-9 font-light tracking-[-0.01em]">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close shortcuts"
            title="Close (Esc)"
            onClick={onClose}
            className="press flex size-9 cursor-pointer items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        {GROUPS.map((g) => (
          <section key={g.label} className="mt-7">
            <h3 className="m-0 mb-1 text-[14px] leading-5 font-normal text-ink-muted">{g.label}</h3>
            <dl className="m-0">
              {g.rows.map((row) => (
                <div key={row.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-faint">
                  <dt className="text-[15px] text-ink">{row.label}</dt>
                  <dd className="m-0 flex items-center gap-1.5 text-[13px] text-ink-muted">
                    {row.keys.map((k, i) =>
                      "key" in k ? (
                        <kbd key={i} className="sh-key">
                          {k.key}
                        </kbd>
                      ) : (
                        <span key={i}>{k.sep}</span>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="mt-5 mb-0 text-[13px] leading-5 text-ink-muted">
          On Windows, use Ctrl in place of ⌘. Shortcuts pause while you’re typing in a field.
        </p>
      </div>
    </div>
  );
}
