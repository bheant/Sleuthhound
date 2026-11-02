"use client";

import { useState } from "react";
import { NOTE_MAX, REASON_LABELS, REASONS, type Reason } from "@/lib/targets/reasons";

// The five discard reasons as small secondary buttons, used in the discard
// toast (with their number keys) and in a discarded company's panel. Other
// opens a one-line note: Enter saves it, Escape closes it unsaved. The chosen
// reason uses the selected style; yellow stays for the current selection.

type Props = {
  chosen: Reason | null;
  /** Saved with Other. */
  note: string | null;
  /** Whether the Other note field shows. The toast opens it from the 5 key. */
  noteOpen: boolean;
  onNoteOpen: (open: boolean) => void;
  /** Picks a reason; for Other, with its note. */
  onPick: (reason: Reason, note: string | null) => void;
  /** Show 1 to 5 beside the labels. */
  keys?: boolean;
  label: string;
};

export function ReasonPicker({ chosen, note, noteOpen, onNoteOpen, onPick, keys = false, label }: Props) {
  const [draft, setDraft] = useState(note ?? "");

  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {REASONS.map((r, i) => {
          const on = chosen === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              aria-keyshortcuts={keys ? String(i + 1) : undefined}
              onClick={() => (r === "other" ? onNoteOpen(true) : onPick(r, null))}
              className={`press flex h-8 cursor-pointer items-center gap-2 border px-2.5 font-sans text-[13px] whitespace-nowrap max-md:h-11 max-md:px-3 max-md:text-[14px] ${
                on ? "border-primary-edge bg-primary text-ink" : "border-control bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black"
              }`}
            >
              {keys ? <kbd className="font-sans text-[12px] text-ink-secondary max-md:hidden">{i + 1}</kbd> : null}
              {REASON_LABELS[r]}
            </button>
          );
        })}
      </div>
      {noteOpen ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onPick("other", draft.trim() || null);
            onNoteOpen(false);
          }}
        >
          <label htmlFor="reason-note" className="sr-only">
            Why, in a few words
          </label>
          <input
            id="reason-note"
            autoFocus
            value={draft}
            maxLength={NOTE_MAX}
            placeholder="Why, in a few words. Enter saves"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              e.stopPropagation();
              setDraft(note ?? "");
              onNoteOpen(false);
            }}
            className="h-8 min-w-0 flex-1 border border-rule bg-transparent px-2.5 font-sans text-[14px] text-ink outline-none focus:border-focus max-md:h-11 max-md:text-[16px]"
          />
          <button
            type="submit"
            className="press h-8 cursor-pointer border border-control bg-transparent px-3 font-sans text-[13px] text-ink hover:border-ink hover:bg-ink hover:text-black max-md:h-11"
          >
            Save
          </button>
        </form>
      ) : chosen === "other" && note ? (
        <p className="mt-2 mb-0 text-[13px] leading-5 text-ink-secondary">{note}</p>
      ) : null}
    </div>
  );
}
