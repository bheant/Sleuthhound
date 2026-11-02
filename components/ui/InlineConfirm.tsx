"use client";

import { useEffect, useRef } from "react";

type Props = {
  question: string;
  note: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// For anything destructive: the row becomes the question with Cancel and a red
// outline button, plus one line saying what changes. No modals.
export function InlineConfirm({ question, note, confirmLabel = "Remove", busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label={question}
      className="sh-swap"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="flex min-h-11 items-center justify-between gap-4 border border-strong pl-3.5">
        <span className="text-ink">{question}</span>
        <span className="flex self-stretch">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="link-quiet cursor-pointer px-5 text-[14px] text-ink-secondary hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="press -my-px -mr-px min-w-[104px] cursor-pointer border border-error bg-transparent px-6 text-[15px] text-error-ink hover:bg-error hover:text-black disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </span>
      </div>
      <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-secondary">{note}</p>
    </div>
  );
}
