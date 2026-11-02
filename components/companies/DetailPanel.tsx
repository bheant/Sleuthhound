"use client";

import Link from "next/link";
import { useState, type ReactNode, type RefObject } from "react";
import { layoutGraph } from "@/components/viz/graph-layout";
import { formatDate, formatTime } from "@/lib/format/time";
import { formatAge } from "@/lib/targets/format";
import type { AppsConnected, Network, WorkspaceItem } from "@/lib/targets/types";
import type { Reason } from "@/lib/targets/reasons";
import { DirectorEmails, HubSpotSend } from "./AppActions";
import { ReasonPicker } from "./ReasonPicker";
import { scoreColour } from "./ScoreFigure";

// The selected company beside the list: score, name, tags, Keep and Discard
// (or its decision with Move back to New), the review, the Companies House
// facts and every source. AI conclusions are attributed at the foot. With
// Apollo connected, directors of a corporate body get Find email; with HubSpot
// connected, a kept company gets Send to HubSpot. On phone it's a full-screen
// view: no close button, facts stacked, and the graph's notes as Worth knowing,
// since the graph itself isn't shown there.

type Props = {
  item: WorkspaceItem;
  /** The listed companies and the director network, for Worth knowing on phone. */
  items: WorkspaceItem[];
  network: Network;
  apps: AppsConnected;
  nowMs: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onDecide: (decision: "kept" | "discarded") => void;
  onRestore: () => void;
  onShowConnections: () => void;
  /** Saves what an app action found back into the workspace's items. */
  onUpdate: (patch: Partial<WorkspaceItem>) => void;
  /** Sets or changes why a discarded company was discarded. */
  onReason: (reason: Reason, note: string | null) => void;
};

const sectionHeading = "m-0 text-[14px] leading-5 font-normal text-ink-muted";
const linkClass = "link-quiet text-ink hover:text-white";

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 pt-5">
      <h3 className={sectionHeading}>{title}</h3>
      {children}
    </section>
  );
}

export function DetailPanel({ item, items, network, apps, nowMs, headingRef, onClose, onDecide, onRestore, onShowConnections, onUpdate, onReason }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const now = new Date(nowMs);
  const meta = [item.sector, formatAge(item.incorporatedOn, now), item.borough].filter(Boolean).join(", ");
  const reviewed = new Date(item.reviewedAt);
  const findEmails = apps.apollo && item.corporate && item.directors.length > 0;
  const offerApollo = !apps.apollo && item.corporate && item.directors.length > 0;
  const worthKnowing = layoutGraph(item, items, network).notes.filter((n) => !n.quiet);
  // A skipped company has no review, so no time to show.
  const reviewedWhen = !item.reviewedAt
    ? ""
    : sameDay(reviewed, now)
      ? `at ${formatTime(item.reviewedAt)}`
      : `on ${formatDate(item.reviewedAt)} at ${formatTime(item.reviewedAt)}`;

  return (
    <aside
      key={item.id}
      aria-labelledby="panel-name"
      className="sh-swap max-w-[440px] min-w-0 flex-[1_1_380px] border-l border-subtle pt-8 pl-10 max-[1023px]:max-w-none max-[1023px]:border-l-0 max-[1023px]:pl-0 max-md:pt-7"
    >
      <div className="flex items-start justify-between gap-4">
        {item.skipped ? (
          <span className="pt-2 text-[14px] text-ink-muted">Not reviewed</span>
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="text-[14px] text-ink-muted">Score</span>
            <span className={`text-[32px] leading-9 font-light tabular-nums ${scoreColour(item.score)}`}>{item.score}</span>
          </div>
        )}
        <button
          type="button"
          aria-label="Close panel"
          title="Close (Esc)"
          onClick={onClose}
          className="press flex size-9 cursor-pointer max-md:hidden items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <h2
        id="panel-name"
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 mb-0 text-[32px] leading-[38px] font-light tracking-[-0.015em] outline-none max-md:mt-3 max-md:text-[30px] max-md:leading-9"
      >
        {item.name}
      </h2>
      {meta ? <p className="mt-2 mb-0 text-ink-secondary">{meta}</p> : null}
      {item.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <span
              key={tag.text}
              className={`border px-2.5 py-[3px] text-[13px] leading-5 ${tag.overdue ? "border-overdue-edge text-overdue" : "border-strong text-bright"}`}
            >
              {tag.text}
            </span>
          ))}
        </div>
      ) : null}

      {item.skipped ? (
        <p role="status" className="mt-7 mb-0 border border-strong px-4 py-3">
          Not reviewed: {item.skipped}
        </p>
      ) : item.decision === null ? (
        <div className="mt-7 flex gap-2">
          <button
            type="button"
            onClick={() => onDecide("kept")}
            className="press flex h-12 flex-1 cursor-pointer items-center justify-between border-0 bg-primary-edge px-4 font-sans text-[16px] font-medium text-white hover:bg-primary-hover max-md:h-[52px] max-md:justify-center"
          >
            Keep
            <kbd className="max-md:hidden border border-data px-1.5 font-sans text-[12px] leading-[18px] font-normal">Y</kbd>
          </button>
          <button
            type="button"
            onClick={() => onDecide("discarded")}
            className="press group flex h-12 flex-1 cursor-pointer items-center justify-between border border-control bg-transparent px-4 font-sans text-[16px] text-ink hover:border-ink hover:bg-ink hover:text-black max-md:h-[52px] max-md:justify-center"
          >
            Discard
            <kbd className="max-md:hidden border border-strong px-1.5 font-sans text-[12px] leading-[18px] text-ink-secondary group-hover:text-black">N</kbd>
          </button>
        </div>
      ) : (
        <div className="mt-7 flex gap-2">
          <div role="status" className={`flex h-12 flex-1 items-center gap-2.5 border px-4 ${item.decision === "kept" ? "border-ok" : "border-ink-muted"}`}>
            <span aria-hidden className={`size-2 rounded-full ${item.decision === "kept" ? "bg-ok" : "bg-ink-muted"}`} />
            <span>{item.decision === "kept" ? "Kept" : "Discarded"}</span>
          </div>
          <button
            type="button"
            onClick={onRestore}
            className="press h-12 flex-1 cursor-pointer border border-control bg-transparent px-4 font-sans text-[16px] text-ink hover:border-ink hover:bg-ink hover:text-black"
          >
            Move back to New
          </button>
        </div>
      )}
      {item.decision === "kept" && apps.hubspot ? <HubSpotSend item={item} nowMs={nowMs} onUpdate={onUpdate} /> : null}
      {item.decision === "discarded" ? (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[14px] leading-5 text-ink-muted">
            {item.reason ? "Why it was discarded" : "Why was it discarded? Optional, and it teaches the review."}
          </p>
          <ReasonPicker
            label="Why it was discarded"
            chosen={item.reason}
            note={item.reasonNote}
            noteOpen={noteOpen}
            onNoteOpen={setNoteOpen}
            onPick={onReason}
          />
        </div>
      ) : null}

      <div className="mt-2">
        {item.trading ? (
          <Section title="Trading">
            <p className="mt-2 mb-0">
              {{ yes: "Yes", no: "No", unclear: "Unclear" }[item.trading.trading]}, {item.trading.evidence.charAt(0).toLowerCase() + item.trading.evidence.slice(1).replace(/\.$/, "")}
              <span className="text-ink-muted">
                {" "}
                (checked by {item.trading.by} {sameDay(new Date(item.trading.checkedAt), now) ? "at" : "on"}{" "}
                {sameDay(new Date(item.trading.checkedAt), now) ? formatTime(item.trading.checkedAt) : formatDate(item.trading.checkedAt)})
              </span>
            </p>
            {item.trading.sources.length > 0 ? (
              <ul className="mt-1.5 mb-0 flex list-none flex-col gap-1 p-0">
                {item.trading.sources.map((s) => (
                  <li key={s.url} className="min-w-0 truncate">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {s.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        ) : null}
        {!item.skipped && item.whatTheyDo ? (
          <Section title="What they do">
            <p className="mt-2 mb-0">{item.whatTheyDo}</p>
          </Section>
        ) : null}
        {!item.skipped && item.whyFit ? (
          <Section title="Why it fits">
            <p className="mt-2 mb-0">{item.whyFit}</p>
          </Section>
        ) : null}
        {!item.skipped && item.whyNow ? (
          <Section title="Why now">
            <p className="mt-2 mb-0">{item.whyNow}</p>
          </Section>
        ) : null}
        {worthKnowing.length > 0 ? (
          <div className="md:hidden">
            <Section title="Worth knowing">
              {worthKnowing.map((n) => (
                <p key={n.text} className="mt-2 mb-0">
                  {n.text}
                </p>
              ))}
            </Section>
          </div>
        ) : null}
        {item.posts.length > 0 ? (
          <Section title="Asked online">
            <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
              {item.posts.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {p.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {item.filings.length > 0 ? (
          <Section title="Filings">
            <ul className="mt-2 mb-0 flex list-none flex-col gap-2 p-0">
              {item.filings
                .filter((f, i, all) => all.findIndex((g) => g.type === f.type && g.occurredAt === f.occurredAt && g.title === f.title) === i)
                .map((f) => (
                <li key={`${f.type}${f.occurredAt}${f.title}`}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} ${f.negative ? "text-overdue" : ""}`}>
                      {f.title} ↗
                    </a>
                  ) : (
                    <span>{f.title}</span>
                  )}
                  {f.inferred && f.basis.length > 0 ? (
                    <span className="mt-0.5 block text-[13px] leading-5 text-ink-secondary">
                      From{" "}
                      {f.basis.map((b, i) => (
                        <span key={b.title}>
                          {i > 0 ? ", " : ""}
                          {b.url ? (
                            <a href={b.url} target="_blank" rel="noopener noreferrer" className="link-quiet text-ink-secondary hover:text-ink">
                              {b.title.charAt(0).toLowerCase() + b.title.slice(1)}
                            </a>
                          ) : (
                            b.title.charAt(0).toLowerCase() + b.title.slice(1)
                          )}
                        </span>
                      ))}
                      , and the allotment above
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="Companies House">
          <dl className="mt-3 mb-0 grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px] leading-[22px] tabular-nums max-md:grid-cols-1 max-md:gap-y-0">
            {item.companyNumber ? <Fact label="Company number">{item.companyNumber}</Fact> : null}
            {item.incorporatedOn ? <Fact label="Incorporated">{formatDate(item.incorporatedOn)}</Fact> : null}
            {item.industries.length > 0 ? (
              <Fact label="Industry">
                {item.industries.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </Fact>
            ) : null}
            {item.registeredOffice ? <Fact label="Registered office">{item.registeredOffice}</Fact> : null}
            {item.accountsDue ? (
              <Fact label="Accounts due" overdue={item.accountsDue.overdue}>
                {item.accountsDue.text}
              </Fact>
            ) : null}
            {item.confirmation ? (
              <Fact label="Confirmation" overdue={item.confirmation.overdue}>
                {item.confirmation.text}
              </Fact>
            ) : null}
            {item.directors.length > 0 && !findEmails ? <Fact label="Directors">{item.directors.map((d) => d.name).join(", ")}</Fact> : null}
          </dl>
          {offerApollo ? (
            <Link href="/connections#key-apollo" className="link-quiet mt-4 inline-block text-[14px] text-ink-secondary hover:text-ink">
              Connect Apollo to find directors’ emails
            </Link>
          ) : null}
        </Section>
        {findEmails ? (
          <Section title="Directors">
            <DirectorEmails item={item} onUpdate={onUpdate} />
          </Section>
        ) : null}
        {item.sources.length > 0 ? (
          <Section title="Sources">
            <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
              {item.sources.map((s) => (
                <li key={s.url} className="min-w-0 truncate">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
      {item.skipped ? null : (
        <p className="mt-8 mb-0 pt-5 text-[13px] leading-5 text-ink-muted">
          Reviewed by {item.reviewedBy} {reviewedWhen}
          <span aria-hidden className="inline-block w-4 max-md:hidden" />
          <button
            type="button"
            onClick={onShowConnections}
            className="link-quiet cursor-pointer max-md:hidden border-0 bg-transparent p-0 font-sans text-[13px] text-ink-secondary hover:text-ink"
          >
            See its connections
          </button>
          {item.isDemo ? <span className="ml-4">Demo data</span> : null}
        </p>
      )}
    </aside>
  );
}

function Fact({ label, overdue = false, children }: { label: string; overdue?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-secondary max-md:pt-3 max-md:text-[13px] max-md:leading-5">{label}</dt>
      <dd className={`m-0 min-w-0 break-words max-md:border-b max-md:border-subtle max-md:pt-0.5 max-md:pb-3 ${overdue ? "text-overdue" : ""}`}>{children}</dd>
    </>
  );
}
