"use client";

import { useState, type FormEvent } from "react";
import { InlineConfirm } from "./InlineConfirm";

export type KeyStatus = "off" | "testing" | "connected" | "rejected";

type Props = {
  id: string;
  serviceName: string;
  placeholder?: string;
  status: KeyStatus;
  /** Last four characters of the stored key. The full key never reaches the browser. */
  last4?: string | null;
  error?: string | null;
  removeNote: string;
  onTest: (key: string) => void;
  onRemove: () => void;
};

const linkButton =
  "link-quiet cursor-pointer bg-transparent p-0 text-[14px] text-ink-secondary hover:text-ink";

// 44px password-style input with Test. A stored key shows as "•••• 4f2a" with
// Replace and Remove; a rejected key can be removed straight away.
export function KeyField({ id, serviceName, placeholder, status, last4, error, removeNote, onTest, onRemove }: Props) {
  const [draft, setDraft] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busy = status === "testing";
  const stored = status === "connected" && last4 && !replacing;

  function submit(e: FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key || busy) return;
    onTest(key);
    setDraft("");
    setReplacing(false);
  }

  if (confirming) {
    return (
      <InlineConfirm
        question={`Remove the ${serviceName} key?`}
        note={removeNote}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onRemove();
        }}
      />
    );
  }

  if (stored) {
    return (
      <div className="sh-swap flex h-11 items-center justify-between gap-4 border border-subtle px-3.5">
        <span className="tracking-[0.04em] text-ink-secondary">•••• {last4}</span>
        <span className="flex items-center gap-5">
          <button type="button" className={linkButton} onClick={() => setReplacing(true)}>
            Replace
          </button>
          <button
            type="button"
            className={linkButton}
            aria-label={`Remove ${serviceName}`}
            onClick={() => setConfirming(true)}
          >
            Remove
          </button>
        </span>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={submit} className="sh-swap m-0 flex gap-2">
        <label htmlFor={id} className="sr-only">
          {serviceName} API key
        </label>
        <input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          className="h-11 min-w-0 flex-auto rounded-none border border-rule bg-transparent px-3.5 text-[15px] text-ink outline-none focus:border-focus focus:shadow-[0_0_0_1px_var(--focus)] max-md:text-[16px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="press h-11 min-w-[104px] shrink-0 cursor-pointer border border-control bg-transparent px-6 text-[15px] max-md:min-w-0 max-md:px-5 text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-50"
        >
          {busy ? "Testing…" : "Test"}
        </button>
      </form>
      {error ? (
        <>
          <p role="alert" className="sh-swap mt-2 mb-0 text-[14px] leading-5 text-error-ink">
            {error}
          </p>
          {status === "rejected" ? (
            <button type="button" className={`${linkButton} mt-2`} onClick={onRemove}>
              Remove key
            </button>
          ) : null}
        </>
      ) : null}
      {replacing ? (
        <button type="button" className={`${linkButton} mt-2`} onClick={() => setReplacing(false)}>
          Keep the current key
        </button>
      ) : null}
    </div>
  );
}
