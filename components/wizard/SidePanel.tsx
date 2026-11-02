"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  closing: boolean;
  onClose: () => void;
  children: ReactNode;
  labelId: string;
  /** How far through a wizard, 0 to 1: a thin line under the title on phone. */
  progress?: number;
};

// A full-height panel from the right, about 640px wide, so the page stays
// visible behind it. Used by the Add source wizard and the source detail.
// Esc closes it; focus moves to the title when it opens. On phone it's a
// full-screen sheet.
export function SidePanel({ title, subtitle, closing, onClose, children, labelId, progress }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
      className="sh-panel fixed inset-y-0 right-0 z-30 flex w-full max-w-[640px] flex-col border-l border-strong bg-canvas max-md:z-50 max-md:max-w-none max-md:border-l-0"
      style={closing ? { transform: "translateX(100%)" } : undefined}
    >
      <div className="flex flex-none items-start justify-between gap-4 border-b border-subtle px-8 pt-7 pb-6 max-md:border-b-0 max-md:px-4 max-md:pt-4 max-md:pb-2">
        <div className="min-w-0 flex-auto">
          <h2 id={labelId} ref={heading} tabIndex={-1} className="m-0 text-[28px] leading-9 font-light tracking-[-0.01em] outline-none max-md:text-[24px] max-md:leading-8">
            {title}
          </h2>
          {subtitle ? <div className="mt-1 flex items-center gap-2.5 text-[14px] leading-5 text-ink-secondary">{subtitle}</div> : null}
          {progress !== undefined ? (
            <div aria-hidden className="mt-3 h-px w-3/4 bg-subtle md:hidden">
              <div className="h-px origin-left bg-ink transition-transform duration-200" style={{ transform: `scaleX(${progress})` }} />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="press flex size-10 flex-none cursor-pointer max-md:size-11 items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

/** Open and close state with the 240ms slide-out before unmounting. */
export function closeAfterSlide(setClosing: (v: boolean) => void, done: () => void) {
  setClosing(true);
  setTimeout(() => {
    setClosing(false);
    done();
  }, 240);
}
