"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  message: string;
  onUndo: () => void;
  onDone: () => void;
  durationMs?: number;
  /** A second row under the message, such as the discard reasons. */
  children?: ReactNode;
};

// Shown after Keep or Discard: the message and Undo for 5 seconds, paused while
// the pointer or focus is on it. Render it with a fresh key for each action.
// The live region mounts empty and the message lands a tick later, because
// screen readers skip a region that arrives already filled.
export function Toast({ message, onUndo, onDone, durationMs = 5000, children }: Props) {
  const [paused, setPaused] = useState(false);
  const [spoken, setSpoken] = useState("");
  const remaining = useRef(durationMs);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timer = setTimeout(() => setSpoken(message), 50);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDoneRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="sh-toast fixed right-gutter bottom-8 z-10 max-w-[calc(100vw-2*var(--gutter))] border border-strong bg-field py-3.5 pr-4 pl-5 max-md:left-gutter max-md:bottom-4"
    >
      <div className="flex items-center justify-between gap-6">
        <span aria-hidden className="min-w-0">
          {message}
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {spoken}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="press flex h-8 shrink-0 cursor-pointer items-center gap-2 border border-control bg-transparent px-3 text-[14px] text-ink hover:border-ink hover:bg-ink hover:text-black max-md:h-11"
        >
          Undo <kbd className="font-sans text-[12px] text-ink-secondary max-md:hidden">U</kbd>
        </button>
      </div>
      {children}
    </div>
  );
}
