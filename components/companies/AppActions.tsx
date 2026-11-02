"use client";

import { useState, useTransition } from "react";
import { findDirectorEmail, sendToHubSpot } from "@/lib/apps/actions";
import { formatDate, formatTime } from "@/lib/format/time";
import type { WorkspaceItem } from "@/lib/targets/types";

// The company panel's two app actions. Neither runs on its own: Find email
// spends Apollo credits and Send to HubSpot writes to the CRM, so both wait
// for a press. Results go back into the workspace's items through onUpdate.

type Director = WorkspaceItem["directors"][number];

const quietButton =
  "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] text-ink-secondary hover:text-ink disabled:cursor-default disabled:no-underline";

function DirectorRow({ targetId, director, onFound }: { targetId: string; director: Director; onFound: (d: Director) => void }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  function find() {
    setNote(null);
    startTransition(async () => {
      const result = await findDirectorEmail(targetId, director.id);
      if (result.ok) onFound({ ...director, email: { address: result.email, source: "Apollo", foundOn: result.foundOn } });
      else setNote({ text: result.message, error: !result.notFound });
    });
  }

  return (
    <li className="flex flex-col gap-0.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>{director.name}</span>
        {director.email ? (
          <a href={`mailto:${director.email.address}`} className="link-quiet min-w-0 break-all text-ink hover:text-white">
            {director.email.address}
          </a>
        ) : (
          <button type="button" onClick={find} disabled={pending} className={quietButton}>
            {pending ? "Finding…" : "Find email"}
          </button>
        )}
      </div>
      {director.email ? (
        <span className="text-[13px] leading-5 text-ink-muted">
          Work email from {director.email.source}
          {director.email.foundOn ? `, ${formatDate(director.email.foundOn)}` : ""}
        </span>
      ) : null}
      {note ? (
        <span role="status" className={`text-[13px] leading-5 ${note.error ? "text-error-ink" : "text-ink-secondary"}`}>
          {note.text}
        </span>
      ) : null}
    </li>
  );
}

export function DirectorEmails({ item, onUpdate }: { item: WorkspaceItem; onUpdate: (patch: Partial<WorkspaceItem>) => void }) {
  return (
    <>
      <ul className="mt-1 mb-0 list-none p-0">
        {item.directors.map((d) => (
          <DirectorRow
            key={d.id}
            targetId={item.id}
            director={d}
            onFound={(found) => onUpdate({ directors: item.directors.map((x) => (x.id === found.id ? found : x)) })}
          />
        ))}
      </ul>
      <p className="mt-1 mb-0 text-[13px] leading-5 text-ink-muted">Find email asks Apollo. Each lookup uses Apollo credits.</p>
    </>
  );
}

export function HubSpotSend({ item, nowMs, onUpdate }: { item: WorkspaceItem; nowMs: number; onUpdate: (patch: Partial<WorkspaceItem>) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sent = item.hubspotSentAt;

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendToHubSpot(item.id);
      if (result.ok) onUpdate({ hubspotSentAt: result.sentAt });
      else setError(result.message);
    });
  }

  const when = sent
    ? new Date(sent).toDateString() === new Date(nowMs).toDateString()
      ? `at ${formatTime(sent)}`
      : `on ${formatDate(sent)}`
    : "";

  return (
    <div className="mt-2">
      {sent ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-subtle px-4 py-2">
          <span role="status" className="flex items-center gap-2.5">
            <span aria-hidden className="size-2 rounded-full bg-ok" />
            Sent to HubSpot {when}
          </span>
          <button type="button" onClick={send} disabled={pending} className={quietButton}>
            {pending ? "Sending…" : "Send again"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="press h-11 w-full cursor-pointer border border-control bg-transparent px-4 font-sans text-[15px] text-ink hover:not-disabled:border-ink hover:not-disabled:bg-ink hover:not-disabled:text-black disabled:cursor-default disabled:text-ink-secondary"
        >
          {pending ? "Sending to HubSpot…" : "Send to HubSpot"}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-2 mb-0 text-[13px] leading-5 text-error-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
