"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useWizard } from "@/components/wizard/WizardProvider";
import { applyIdealSuggestion, dismissIdealSuggestion, saveIdealClient } from "@/lib/clients/actions";
import type { IdealClient } from "@/lib/clients/types";

// The ideal-client description the AI scores every lead against. It saves as
// you type (600ms after the last key) and is then yours: Claude's rewrites
// from the clients come back as a suggestion with Apply.

const SAVE_AFTER_MS = 600;

export function IdealClientBox({ ideal }: { ideal: IdealClient }) {
  const wizard = useWizard();
  const [text, setText] = useState(ideal.text);
  const [seen, setSeen] = useState(ideal.text);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A rewrite from the server (after a run, or Apply) replaces the text.
  if (ideal.text !== seen) {
    setSeen(ideal.text);
    setText(ideal.text);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Grow with the text, so it reads as a paragraph rather than a form field.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  function change(next: string) {
    setText(next);
    setStatus({ text: "Saving…", error: false });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await saveIdealClient(next);
          setStatus(result.ok ? { text: result.meta, error: false } : { text: result.message, error: true });
        } catch {
          setStatus({ text: "That didn’t save. Check the app is still running.", error: true });
        }
      });
    }, SAVE_AFTER_MS);
  }

  return (
    <section aria-labelledby="ideal-h" className="sh-in sh-d2 mx-gutter mt-16 border border-strong px-8 pt-6 pb-8 max-md:mt-14 max-md:flex max-md:flex-col max-sm:px-4">
      {/* On phone the buttons drop below the text, as two equal halves. */}
      <div className="flex flex-wrap items-start justify-between gap-4 max-md:contents">
        <div>
          <h2 id="ideal-h" className="m-0 text-[14px] leading-5 font-normal text-ink-secondary">
            <label htmlFor="ideal-text">Ideal client</label>
          </h2>
          <p className="mt-0.5 mb-0 text-[13px] leading-[18px] text-ink-muted" aria-live="polite">
            {status ? <span className={status.error ? "text-error-ink" : ""}>{status.text}</span> : ideal.meta}
          </p>
        </div>
        <div className="flex gap-2 max-md:order-1 max-md:mt-6 max-md:grid max-md:grid-cols-2">
          <button type="button" onClick={() => area.current?.focus()} className={buttonClasses({ size: "sm", className: "h-10 px-4 max-md:h-11" })}>
            Edit
          </button>
          <button type="button" onClick={() => wizard.open({ mode: "clients" })} className={buttonClasses({ size: "sm", edge: "bright", className: "h-10 px-4 max-md:h-11" })}>
            Upload clients
          </button>
        </div>
      </div>
      <textarea
        ref={area}
        id="ideal-text"
        rows={2}
        value={text}
        onChange={(e) => change(e.target.value)}
        className="mt-6 block w-full max-w-[1000px] resize-none overflow-hidden border-0 border-b border-transparent bg-transparent p-0 font-sans text-[clamp(20px,2vw,28px)] leading-[1.35] font-light text-ink outline-none focus:border-focus"
      />
      {ideal.suggestion ? (
        <div className="sh-swap mt-8 border-t border-subtle pt-5 max-md:order-2">
          <p className="m-0 text-[14px] leading-5 text-ink-secondary">
            Your edit is kept. Suggested update: <span className="text-ink-muted">{ideal.suggestion.meta}</span>
          </p>
          <p className="mt-2 mb-0 max-w-[900px] text-[18px] leading-[26px] font-light">{ideal.suggestion.text}</p>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => startTransition(async () => void (await applyIdealSuggestion()))} className={buttonClasses({ size: "sm", className: "h-10 px-4" })}>
              Apply
            </button>
            <button
              type="button"
              onClick={() => startTransition(async () => void (await dismissIdealSuggestion()))}
              className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink"
            >
              Keep mine
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
