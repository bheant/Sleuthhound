"use client";

import { useState, useTransition } from "react";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import type { DotStatus } from "@/components/ui/StatusDot";
import { useWizard } from "@/components/wizard/WizardProvider";
import { deleteSource, retryNow } from "@/lib/sources/actions";
import type { SourceRow, WizardStart } from "@/lib/sources/types";
import { ServiceRow } from "./Section";
import { ServiceStatus } from "./ServiceStatus";

// Each added source on Connections: name and type, a quiet key box with Edit
// and Remove, the week's result line, and its status. Failed sources offer
// Retry now; a source paused at its cap says so. The name opens the detail.

const DOT: Record<SourceRow["status"], DotStatus> = { connected: "ok", paused: "off", failed: "error", awaiting_approval: "awaiting" };
const TEXT: Record<SourceRow["status"], string> = { connected: "Connected", paused: "Paused", failed: "Failed", awaiting_approval: "Awaiting approval" };

const linkButton = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink";

type Props = { row: SourceRow; start: WizardStart | null; onOpen: () => void };

export function SourceRowItem({ row, start, onOpen }: Props) {
  const wizard = useWizard();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: boolean; message: string | null }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setMessage(result.message);
    });
  }

  const name = (
    <button type="button" onClick={onOpen} className="group cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-[20px] leading-7 text-ink">
      <span className="group-hover:underline group-hover:decoration-control group-hover:underline-offset-4">{row.name}</span>
      <span aria-hidden className="ml-2 text-[15px] text-ink-secondary">
        ›
      </span>
      <span className="sr-only">, open details</span>
    </button>
  );

  const field = confirming ? (
    <InlineConfirm
      question={`Remove ${row.name}?`}
      note="It stops fetching straight away. What it found stays where it is."
      busy={pending}
      onCancel={() => setConfirming(false)}
      onConfirm={() => act(() => deleteSource(row.id))}
    />
  ) : (
    <div>
      <div className="flex h-11 items-center justify-between gap-4 border border-subtle px-3.5">
        <span className="text-ink-secondary">{row.keyText}</span>
        <span className="flex items-center gap-5">
          {start ? (
            <button type="button" className={linkButton} onClick={() => wizard.open(start)}>
              Edit
            </button>
          ) : null}
          <button type="button" className={linkButton} aria-label={`Remove ${row.name}`} onClick={() => setConfirming(true)}>
            Remove
          </button>
        </span>
      </div>
      {row.error ? (
        <p className={`mt-2 mb-0 text-[14px] leading-5 ${row.status === "failed" ? "text-error-ink" : "text-ink-secondary"}`}>{row.error}</p>
      ) : row.result ? (
        <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-secondary">{row.result}</p>
      ) : null}
      {row.status === "failed" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => retryNow(row.id))}
          className="press mt-3 h-11 cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-50"
        >
          {pending ? "Starting…" : "Retry now"}
        </button>
      ) : row.capReached && start ? (
        <button type="button" className={`${linkButton} mt-1`} onClick={() => wizard.open(start)}>
          Raise cap
        </button>
      ) : null}
      {message ? (
        <p role="alert" className="mt-2 mb-0 text-[14px] leading-5 text-error-ink">
          {message}
        </p>
      ) : null}
    </div>
  );

  return (
    <ServiceRow
      name={name}
      purpose={row.line}
      field={field}
      status={<ServiceStatus dot={DOT[row.status]} text={TEXT[row.status]} sub={row.sub} />}
    />
  );
}
