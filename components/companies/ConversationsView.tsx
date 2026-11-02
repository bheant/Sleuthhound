"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { useCommands } from "@/components/search/CommandProvider";
import { isTyping } from "@/components/search/keys";
import { buttonClasses } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { LondonMap } from "@/components/viz/LondonMap";
import { formatDate, formatTime } from "@/lib/format/time";
import { confirmMatch, rejectMatch } from "@/lib/targets/conversation-actions";
import { decideTarget, undoDecision } from "@/lib/targets/actions";
import type { ConversationItem, Decision, WorkspaceItem } from "@/lib/targets/types";
import { PhoneBack, PhoneList } from "./PhoneList";
import { ScoreFigure, scoreColour } from "./ScoreFigure";

// The Conversations tab: threads where someone may need an accountant, with
// the same table and panel layout as companies. Keep means "I'll reply to
// this"; kept threads stay at the foot of the list. J, K, Enter, Y, N and U
// work as on the other tabs. On phone the map goes, the list is the phone list
// and a thread opens full screen with a back link.

type Props = {
  conversations: ConversationItem[];
  mapItems: WorkspaceItem[];
  threshold: number;
  nowMs: number;
  /** The workspace's full-screen-detail flag, shared so it can hide the tabs. */
  phoneDetail: boolean;
  onPhoneDetail: (open: boolean) => void;
};

const GRID = "grid grid-cols-[56px_minmax(160px,1fr)_minmax(0,1.2fr)_84px_120px_76px] items-center gap-5 px-3";
const LEAVE_MS = 170;
const actButton =
  "press flex size-8 cursor-pointer items-center justify-center border border-strong bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black";

/** "3 h ago", "1 d ago". */
export function postedAgo(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function ConversationsView({ conversations, mapItems, threshold, nowMs, phoneDetail, onPhoneDetail }: Props) {
  const commands = useCommands();
  const [items, setItems] = useState(conversations);
  const [seen, setSeen] = useState(conversations);
  const [selId, setSelId] = useState<string | null>(conversations[0]?.id ?? null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ n: number; id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  if (conversations !== seen) {
    setSeen(conversations);
    setItems(conversations);
  }

  const visible = useMemo(() => items.filter((i) => i.decision !== "discarded"), [items]);
  const selected = visible.find((i) => i.id === selId) ?? null;
  const strong = visible.filter((i) => i.decision === null && i.score >= threshold).length;

  function focusRow(id: string) {
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-id="${id}"] .sh-open`)?.focus());
  }

  function setDecision(id: string, decision: Decision | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, decision } : i)));
  }

  function decide(id: string, decision: Decision) {
    const item = items.find((i) => i.id === id);
    if (leaving || !item || item.decision !== null) return;
    const open = visible.filter((i) => i.decision === null);
    const at = open.findIndex((i) => i.id === id);
    const next = open[at + 1] ?? open[at - 1] ?? null;
    setError(null);
    setLeaving(id);
    decideTarget(id, decision)
      .then((res) => {
        if (!res.ok) {
          setDecision(id, null);
          setError(res.message);
        }
      })
      .catch(() => {
        setDecision(id, null);
        setError("That decision didn’t save. Check the app is still running, then try again.");
      });
    setTimeout(() => {
      setLeaving(null);
      setDecision(id, decision);
      setSelId(next?.id ?? id);
      if (next) focusRow(next.id);
      setToast((t) => ({
        n: (t?.n ?? 0) + 1,
        id,
        text: `${decision === "kept" ? "Kept" : "Discarded"} “${item.title.slice(0, 40)}${item.title.length > 40 ? "…" : ""}”`,
      }));
    }, LEAVE_MS);
  }

  function moveBack(id: string) {
    setDecision(id, null);
    undoDecision(id).then((res) => {
      if (!res.ok) setError(res.message);
    });
  }

  function undo() {
    if (!toast) return;
    const { id } = toast;
    setToast(null);
    moveBack(id);
    setSelId(id);
    focusRow(id);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || commands.overlayOpen()) return;
    if (e.key === "Escape") {
      if (isTyping(e.target)) return;
      if (panelOpen && selected) {
        setPanelOpen(false);
        focusRow(selected.id);
      }
      return;
    }
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const at = visible.findIndex((x) => x.id === selId);
    if (key === "j" || key === "k") {
      if (!visible.length) return;
      e.preventDefault();
      const to = at < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, at + (key === "j" ? 1 : -1)));
      setSelId(visible[to].id);
      setPanelOpen(true);
      focusRow(visible[to].id);
    } else if (e.key === "Enter") {
      if ((e.target as HTMLElement).closest?.("button, a, [role=tab]")) return;
      if (selected) {
        e.preventDefault();
        setPanelOpen(true);
        requestAnimationFrame(() => heading.current?.focus());
      }
    } else if ((key === "y" || key === "n") && !e.repeat && selected?.decision === null) {
      e.preventDefault();
      decide(selected.id, key === "y" ? "kept" : "discarded");
    } else if (key === "u" && !e.repeat) {
      undo();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const empty = visible.length === 0;
  const showPanel = panelOpen && selected !== null;
  const inDetail = phoneDetail && showPanel;
  const listOnly = inDetail ? "max-md:hidden" : "";

  function openOnPhone(id: string) {
    setSelId(id);
    setPanelOpen(true);
    onPhoneDetail(true);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => heading.current?.focus());
  }

  return (
    <>
      <section aria-label="Map" className="sh-in sh-d3 mx-gutter mt-3 max-md:hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 border-b border-subtle">
          <span className="-mb-px border-b border-ink pt-2 pb-2.5 text-[15px] leading-[22px]">Map</span>
          <p className="m-0 pb-2.5 text-[13px] leading-[18px] text-ink-muted">Registered offices of today’s companies</p>
        </div>
        <div className="relative mt-2 overflow-hidden border border-faint bg-plate" style={{ height: 240 }}>
          <div aria-hidden className="pointer-events-none opacity-30">
            <LondonMap items={mapItems} selectedId={null} onSelect={() => {}} height={240} />
          </div>
          <p className="absolute top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 border border-strong bg-canvas px-4 py-2.5 text-[15px] whitespace-nowrap">
            {empty ? "Conversations have no location, so they don’t appear on the map." : "Conversations have no location. Pick one in the list to read it."}
          </p>
        </div>
      </section>

      {empty ? (
        <section className="mx-gutter border-b border-faint pt-[72px] pb-[88px]">
          <p className="m-0 max-w-[640px] text-[26px] leading-[34px] font-light">
            No conversations yet. Add a community source on Connections to find people asking for help.
          </p>
          <Link href="/connections" className={buttonClasses({ className: "mt-7 no-underline" })}>
            Go to Connections
          </Link>
        </section>
      ) : (
        <div className="sh-in sh-d3 mx-gutter flex flex-wrap items-start">
          <div className={`min-w-0 flex-[999_1_620px] pt-2 ${showPanel ? "pr-10 max-[1023px]:pr-0" : ""} ${listOnly}`}>
            <p className="mt-6 mb-2 text-[14px] leading-5 text-ink-muted md:hidden">Threads where someone needs an accountant, sorted by score</p>
            <PhoneList
              label="Conversations"
              rows={visible.map((r) => ({
                id: r.id,
                score: r.score,
                title: r.title,
                summary: r.summary,
                meta: [r.where, postedAgo(r.postedAt, nowMs), r.possibleCompany ? `may be ${r.possibleCompany.name}` : null].filter(Boolean).join(", "),
                decided: r.decision !== null,
                decidedLabel: "Kept",
              }))}
              selectedId={selId}
              leavingId={leaving}
              onOpen={openOnPhone}
              onDecide={decide}
            />
            <p className="mt-6 mb-0 text-[14px] leading-5 text-ink-muted md:hidden">Keep means you’ll reply to the thread.</p>
            <div className="overflow-x-auto max-md:hidden">
              <div role="table" aria-label="Conversations" className="min-w-[680px] tabular-nums">
                <div role="row" className={`${GRID} h-10 border-b border-rule text-[13px] leading-5 text-ink-muted`}>
                  <span role="columnheader" aria-sort="descending">
                    Score ↓
                  </span>
                  <span role="columnheader">Conversation</span>
                  <span role="columnheader">Why</span>
                  <span role="columnheader">Posted</span>
                  <span role="columnheader">Where</span>
                  <span role="columnheader">
                    <span className="sr-only">Decide</span>
                  </span>
                </div>
                {visible.map((row) => (
                  <div
                    key={row.id}
                    role="row"
                    data-row-id={row.id}
                    data-sel={row.id === selId}
                    data-leaving={row.id === leaving}
                    aria-selected={row.id === selId}
                    className={`sh-row ${GRID} min-h-14`}
                  >
                    <span role="cell" className="text-[17px]">
                      <ScoreFigure score={row.score} />
                    </span>
                    <span role="cell" className="min-w-0">
                      <button
                        type="button"
                        aria-label={`${row.title}, score ${row.score}`}
                        onClick={(e) => {
                          setSelId(row.id);
                          setPanelOpen(true);
                          if (e.detail === 0) requestAnimationFrame(() => heading.current?.focus());
                        }}
                        className="sh-open block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[16px] leading-6 text-ink"
                      >
                        {row.title}
                      </button>
                    </span>
                    <span role="cell" className="truncate text-[15px] text-ink-secondary" title={row.summary}>
                      {row.summary}
                    </span>
                    <span role="cell" className="text-[15px] text-ink-secondary">
                      {postedAgo(row.postedAt, nowMs)}
                    </span>
                    <span role="cell" className="truncate text-[15px] text-ink-secondary">
                      {row.where}
                    </span>
                    <span role="cell" className={row.decision === null ? "sh-acts flex justify-end gap-1" : "flex justify-end text-[14px] text-ok"}>
                      {row.decision === null ? (
                        <>
                          <button type="button" aria-label={`Keep ${row.title}`} title="Keep (Y)" onClick={() => decide(row.id, "kept")} className={actButton}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M2 7.5 5.5 11 12 3.5" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label={`Discard ${row.title}`}
                            title="Discard (N)"
                            onClick={() => decide(row.id, "discarded")}
                            className={actButton}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        "Kept"
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="m-0 pt-4 text-[14px] leading-5 text-ink-muted max-md:hidden">
              Threads where someone may need an accountant, sorted by score. {strong} scored {threshold} or more.
            </p>
            <p className="m-0 pt-1 text-[14px] leading-5 text-ink-muted max-md:hidden">
              J and K move, Enter opens, Y keeps, N discards, U undoes
              <span aria-hidden className="inline-block w-4" />
              <button
                type="button"
                onClick={commands.openHelp}
                className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink"
              >
                All shortcuts
              </button>
            </p>
          </div>
          {showPanel ? (
            <div className={`min-w-0 max-w-[440px] flex-[1_1_380px] max-[1023px]:max-w-none ${inDetail ? "" : "max-md:hidden"}`}>
              <PhoneBack
                label="All conversations"
                position={`${visible.findIndex((i) => i.id === selected.id) + 1} of ${visible.length}`}
                onBack={() => {
                  onPhoneDetail(false);
                  focusRow(selected.id);
                }}
              />
              <ConversationPanel
                item={selected}
                nowMs={nowMs}
                headingRef={heading}
                onClose={() => {
                  setPanelOpen(false);
                  focusRow(selected.id);
                }}
                onDecide={(d) => decide(selected.id, d)}
                onRestore={() => moveBack(selected.id)}
                onSettled={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
                onUnlinked={(id) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, possibleCompany: null } : i)))}
              />
            </div>
          ) : null}
        </div>
      )}

      {toast ? <Toast key={toast.n} message={toast.text} onUndo={undo} onDone={() => setToast(null)} /> : null}
      {error ? (
        <div role="alert" className="fixed right-gutter bottom-28 z-10 flex max-w-[480px] items-center gap-6 border border-error bg-field py-3.5 pr-4 pl-5">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className={buttonClasses({ size: "sm" })}>
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}

const sectionHeading = "m-0 text-[14px] leading-5 font-normal text-ink-muted";

function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="mt-7 pt-5">
      <h3 className={`${sectionHeading} flex items-center gap-2.5`}>
        {title}
        {extra}
      </h3>
      {children}
    </section>
  );
}

type PanelProps = {
  item: ConversationItem;
  nowMs: number;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onDecide: (d: Decision) => void;
  onRestore: () => void;
  onSettled: (id: string) => void;
  onUnlinked: (id: string) => void;
};

function clipQuote(text: string): string {
  const s = text.trim();
  return s.length > 420 ? `${s.slice(0, 419).replace(/\s+\S*$/, "")}…` : s;
}

function ConversationPanel({ item, nowMs, headingRef, onClose, onDecide, onRestore, onSettled, onUnlinked }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const today = (iso: string) => new Date(iso).toDateString() === new Date(nowMs).toDateString();
  const when = (iso: string) => (today(iso) ? `at ${formatTime(iso)}` : `on ${formatDate(iso)}`);
  const company = item.possibleCompany;

  async function settle(confirm: boolean) {
    setMatchBusy(true);
    const result = confirm ? await confirmMatch(item.id) : await rejectMatch(item.id);
    setMatchBusy(false);
    setMatchNote(result.message);
    if (result.ok) {
      if (confirm) setTimeout(() => onSettled(item.id), 1600);
      else onUnlinked(item.id);
    }
  }

  async function copy() {
    if (!item.suggestedReply) return;
    try {
      await navigator.clipboard.writeText(item.suggestedReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside
      key={item.id}
      aria-labelledby="conv-name"
      className="sh-swap max-w-[440px] min-w-0 flex-[1_1_380px] border-l border-subtle pt-8 pl-10 max-[1023px]:max-w-none max-[1023px]:border-l-0 max-[1023px]:pl-0 max-md:pt-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[14px] text-ink-muted">Score</span>
          <span className={`text-[32px] leading-9 font-light tabular-nums ${scoreColour(item.score)}`}>{item.score}</span>
        </div>
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
      <h2 id="conv-name" ref={headingRef} tabIndex={-1} className="mt-5 mb-0 text-[26px] leading-[34px] font-light tracking-[-0.01em] outline-none">
        {item.title}
      </h2>
      <p className="mt-2 mb-0 text-ink-secondary">{[item.where, postedAgo(item.postedAt, nowMs)].filter(Boolean).join(", ")}</p>

      {item.decision === null ? (
        <>
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
          <p className="mt-2 mb-0 text-[13px] leading-5 text-ink-muted">Keep means you’ll reply to this thread.</p>
        </>
      ) : (
        <div className="mt-7 flex gap-2">
          <div role="status" className="flex h-12 flex-1 items-center gap-2.5 border border-ok px-4">
            <span aria-hidden className="size-2 rounded-full bg-ok" />
            <span>Kept, to reply to</span>
          </div>
          <button
            type="button"
            onClick={onRestore}
            className="press h-12 flex-1 cursor-pointer border border-control bg-transparent px-4 font-sans text-[16px] text-ink hover:border-ink hover:bg-ink hover:text-black"
          >
            Move back
          </button>
        </div>
      )}

      <div className="mt-2">
        {item.quote ? (
          <Section title="What they asked">
            {item.thread ? <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-secondary">A reply on “{item.thread}”</p> : null}
            <p className="mt-2 mb-0 text-[16px] leading-[26px] whitespace-pre-line">“{clipQuote(item.quote)}”</p>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="link-quiet mt-3 inline-block text-[14px] text-ink hover:text-white">
                Open the thread ↗
              </a>
            ) : null}
          </Section>
        ) : null}
        {item.whyFit ? (
          <Section title="Why it fits">
            <p className="mt-2 mb-0">{item.whyFit}</p>
          </Section>
        ) : null}
        {company ? (
          <Section title="Possible company">
            <div className="mt-3 border border-strong p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[17px]">{company.name}</span>
                {company.score !== null ? <ScoreFigure score={company.score} className="text-[17px]" /> : null}
              </div>
              {company.meta ? <p className="mt-1 mb-0 text-[13px] leading-5 text-ink-secondary">{company.meta}</p> : null}
              {company.whatTheyDo ? <p className="mt-3 mb-0 text-[14px] leading-[22px]">{company.whatTheyDo}</p> : null}
              {matchNote ? (
                <p role="status" className="mt-4 mb-0 text-[14px] leading-5">
                  {matchNote}
                </p>
              ) : (
                <>
                  <p className="mt-4 mb-0 text-[14px]">Is this them?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={matchBusy}
                      onClick={() => void settle(true)}
                      className={buttonClasses({ className: "h-10 min-w-0 flex-1" })}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={matchBusy}
                      onClick={() => void settle(false)}
                      className={buttonClasses({ className: "h-10 min-w-0 flex-1" })}
                    >
                      Not them
                    </button>
                  </div>
                  <p className="mt-2 mb-0 text-[12px] leading-[18px] text-ink-muted">Confirm moves this post onto the company’s record as a signal.</p>
                </>
              )}
            </div>
          </Section>
        ) : null}
        {item.suggestedReply ? (
          <Section title="Suggested reply" extra={<span className="border border-strong px-1.5 text-[12px] leading-[18px] text-bright">Draft</span>}>
            <div className="mt-3 border border-subtle bg-field p-4 text-[15px] leading-6 whitespace-pre-line">{item.suggestedReply}</div>
            <p className="mt-2 mb-0 text-[13px] leading-5 text-ink-secondary">Check {item.where}’s rules on self-promotion before posting.</p>
            <button type="button" onClick={() => void copy()} className={buttonClasses({ className: "mt-3 h-10 max-md:h-[52px] max-md:w-full" })}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M4.5 4.5h7v7h-7z M2.5 9.5v-7h7" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span aria-live="polite">{copied ? "Copied" : "Copy reply"}</span>
            </button>
          </Section>
        ) : null}
        {item.sources.length > 0 ? (
          <Section title="Sources">
            <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
              {item.sources.map((s) => (
                <li key={s.url} className="min-w-0 truncate">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-quiet text-ink hover:text-white">
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
      <p className="mt-8 mb-0 pt-5 text-[13px] leading-5 text-ink-muted">
        Found by the {item.foundBy} source {when(item.foundAt)}, reviewed by {item.reviewedBy} {when(item.reviewedAt)}
        {item.isDemo ? <span className="ml-4">Demo data</span> : null}
      </p>
    </aside>
  );
}
