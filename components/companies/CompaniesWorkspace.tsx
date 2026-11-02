"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useCommands } from "@/components/search/CommandProvider";
import { isTyping } from "@/components/search/keys";
import { buttonClasses } from "@/components/ui/Button";
import { isPhone } from "@/components/ui/phone";
import { Toast } from "@/components/ui/Toast";
import { formatWhen } from "@/lib/format/time";
import { decideTarget, setDiscardReason, undoDecision } from "@/lib/targets/actions";
import { discardCountsLine, reasonForKey, type Reason } from "@/lib/targets/reasons";
import { formatAge } from "@/lib/targets/format";
import { activeFilterCount, filterChips, isNew, NO_FILTERS, removeChip, tabItems, visibleItems, type Filters, type Tab } from "@/lib/targets/filters";
import type { AppsConnected, ConversationItem, Decision, Network, RunFigures, WorkspaceItem } from "@/lib/targets/types";
import { CompanyTable } from "./CompanyTable";
import { ConversationsView } from "./ConversationsView";
import { DetailPanel } from "./DetailPanel";
import { PhoneBack, PhoneList } from "./PhoneList";
import { ReasonPicker } from "./ReasonPicker";
import { FiltersMenu } from "./FiltersMenu";
import { ViewsBand, type View } from "./ViewsBand";
import { WorkspaceHeading } from "./WorkspaceHeading";

// The New Companies workspace: tabs, the list filter and Filters menu, the
// views band, the table and the detail panel, all over one selection. Keep and
// Discard update here at once and save in the background; a failed save rolls
// back. Triage works from the keyboard: J, K, Enter, Y, N, U and Esc.

type Props = {
  items: WorkspaceItem[];
  network: Network;
  figures: RunFigures;
  threshold: number;
  conversations: ConversationItem[];
  /** Apollo and HubSpot, for the panel's Find email and Send to HubSpot. */
  apps: AppsConnected;
  /** A company to open, from search (?c=). */
  focusId: string | null;
  /** The tab to open on, from Home's conversation links (?tab=). */
  startTab: Tab | null;
  nowMs: number;
};

// A discard's toast also asks why: reason buttons with keys 1 to 5.
type ToastState = { n: number; id: string; text: string; discarded: boolean; reason: Reason | null; note: string | null; noteOpen: boolean };
type FocusRequest = { n: number; id: string; target: "row" | "heading" };

const LEAVE_MS = 170;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "new", label: "New" },
  { id: "kept", label: "Kept" },
  { id: "discarded", label: "Discarded" },
  { id: "conversations", label: "Conversations" },
];

function tabOf(item: WorkspaceItem): Tab {
  return item.decision ?? "new";
}

function startState(items: WorkspaceItem[], focusId: string | null, threshold: number) {
  const focus = focusId ? items.find((i) => i.id === focusId) : undefined;
  if (focus) return { tab: tabOf(focus), selId: focus.id };
  return { tab: "new" as Tab, selId: tabItems(items, "new", threshold)[0]?.id ?? null };
}

/** "at 15:00" today, otherwise "on 20 Oct at 08:00". */
function nextRunPhrase(iso: string, nowMs: number) {
  const when = formatWhen(iso, new Date(nowMs));
  return sameLocalDay(iso, nowMs) ? `at ${when}` : `on ${when}`;
}

function sameLocalDay(iso: string, nowMs: number) {
  return new Date(iso).toDateString() === new Date(nowMs).toDateString();
}

export function CompaniesWorkspace(props: Props) {
  const { figures, threshold, nowMs } = props;
  const commands = useCommands();
  const start = startState(props.items, props.focusId, threshold);

  const [items, setItems] = useState(props.items);
  const [seen, setSeen] = useState({ items: props.items, focusId: props.focusId });
  const [tab, setTab] = useState<Tab>(props.focusId ? start.tab : (props.startTab ?? start.tab));
  const [selId, setSelId] = useState<string | null>(start.selId);
  const [panelOpen, setPanelOpen] = useState(true);
  // On phone the detail is a full-screen view over the list. Desktop ignores it.
  const [phoneDetail, setPhoneDetail] = useState(props.focusId !== null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<View>("map");
  const [leaving, setLeaving] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<FocusRequest | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh server render (a run finished, or search opened a company) brings
  // the saved state; take it, and open the company search asked for.
  if (props.items !== seen.items) {
    setSeen({ items: props.items, focusId: props.focusId });
    setItems(props.items);
    if (props.focusId && props.focusId !== seen.focusId) {
      const next = startState(props.items, props.focusId, threshold);
      setTab(next.tab);
      setSelId(next.selId);
      setPanelOpen(true);
      setPhoneDetail(true);
      setQuery("");
      setFilters(NO_FILTERS);
      if (next.selId) setFocusReq((f) => ({ n: (f?.n ?? 0) + 1, id: next.selId!, target: "row" }));
    }
  }

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!focusReq) return;
    if (focusReq.target === "heading") headingRef.current?.focus();
    else document.querySelector<HTMLElement>(`[data-row-id="${focusReq.id}"] .sh-open`)?.focus();
  }, [focusReq]);

  const listed = useMemo(() => (tab === "conversations" ? [] : tabItems(items, tab, threshold)), [items, tab, threshold]);
  const visible = useMemo(
    () => (tab === "conversations" ? [] : visibleItems(items, tab, threshold, filters, query, nowMs)),
    [items, tab, threshold, filters, query, nowMs],
  );
  const selected = items.find((i) => i.id === selId) ?? null;

  const counts = useMemo(() => {
    const c = { new: 0, kept: 0, discarded: 0, keptToday: 0, discardedToday: 0, fromLastRun: 0 };
    for (const i of items) {
      if (isNew(i, threshold)) {
        c.new++;
        if (figures.lastRunId && i.runId === figures.lastRunId) c.fromLastRun++;
      } else if (i.decision) {
        c[i.decision]++;
        if (i.decidedAt && sameLocalDay(i.decidedAt, nowMs)) c[i.decision === "kept" ? "keptToday" : "discardedToday"]++;
      }
    }
    return c;
  }, [items, threshold, figures.lastRunId, nowMs]);

  const nFilters = activeFilterCount(filters);
  const chips = filterChips(filters);
  const boroughs = useMemo(() => [...new Set(listed.map((i) => i.borough).filter((b): b is string => Boolean(b)))].sort(), [listed]);

  // What the area under the tabs shows.
  const mode: "work" | "done" | "nothing" | "conversations" =
    tab === "conversations" ? "conversations" : tab === "new" && listed.length === 0 ? (items.length > 0 ? "done" : "nothing") : "work";
  const showPanel = mode === "work" && panelOpen && selected !== null;
  const inDetail = phoneDetail && showPanel;
  // What a full-screen detail hides on phone.
  const listOnly = inDetail ? "max-md:hidden" : "";

  function focus(id: string, target: FocusRequest["target"]) {
    setFocusReq((f) => ({ n: (f?.n ?? 0) + 1, id, target }));
  }

  function select(id: string, focusTarget?: FocusRequest["target"]) {
    setSelId(id);
    setPanelOpen(true);
    if (focusTarget) focus(id, focusTarget);
  }

  function openOnPhone(id: string) {
    select(id);
    setPhoneDetail(true);
    window.scrollTo(0, 0);
    focus(id, "heading");
  }

  function backToList() {
    setPhoneDetail(false);
    if (selected) focus(selected.id, "row");
  }

  function pickTab(next: Tab) {
    setTab(next);
    setPhoneDetail(false);
    setFiltersOpen(false);
    if (next !== "conversations") setSelId(visibleItems(items, next, threshold, filters, query, nowMs)[0]?.id ?? null);
  }

  // Filters and the list filter keep the selection in the list, so the table,
  // map and deadlines always show the same selected company.
  function refine(nextFilters: Filters, nextQuery: string) {
    setFilters(nextFilters);
    setQuery(nextQuery);
    const now = visibleItems(items, tab, threshold, nextFilters, nextQuery, nowMs);
    if (now.length > 0 && !now.some((i) => i.id === selId)) setSelId(now[0].id);
  }

  function setDecision(id: string, decision: Decision | null) {
    const decidedAt = decision ? new Date().toISOString() : null;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, decision, decidedAt, reason: null, reasonNote: null } : i)));
  }

  // Optional and after the fact, so triage never waits on it: the toast and
  // the item update at once and the save runs behind.
  function pickReason(id: string, reason: Reason, note: string | null) {
    const before = items.find((i) => i.id === id);
    const apply = (r: Reason | null, n: string | null) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, reason: r, reasonNote: n } : i)));
      setToast((t) => (t?.id === id ? { ...t, reason: r, note: n, noteOpen: false } : t));
    };
    apply(reason, note);
    const revert = (message: string) => {
      apply(before?.reason ?? null, before?.reasonNote ?? null);
      setError(message);
    };
    setDiscardReason(id, reason, note)
      .then((res) => {
        if (!res.ok) revert(res.message);
      })
      .catch(() => revert("That reason didn’t save. Check the app is still running, then try again."));
  }

  function rollback(id: string, message: string) {
    setDecision(id, null);
    setToast((t) => (t?.id === id ? null : t));
    setError(message);
  }

  function decide(id: string, decision: Decision) {
    const item = items.find((i) => i.id === id);
    if (leaving || !item || item.decision !== null) return;
    const i = visible.findIndex((x) => x.id === id);
    const next = i >= 0 ? (visible[i + 1] ?? visible[i - 1] ?? null) : item;
    setError(null);
    setLeaving(id);
    decideTarget(id, decision)
      .then((res) => {
        if (!res.ok) rollback(id, res.message);
      })
      .catch(() => rollback(id, "That decision didn’t save. Check the app is still running, then try again."));
    leaveTimer.current = setTimeout(() => {
      setLeaving(null);
      setDecision(id, decision);
      setSelId(next?.id ?? null);
      if (next && next.id !== id) focus(next.id, "row");
      setToast((t) => ({
        n: (t?.n ?? 0) + 1,
        id,
        text: decision === "kept" ? `Kept ${item.name}` : `Discarded ${item.name}. Why?`,
        discarded: decision === "discarded",
        reason: null,
        note: null,
        noteOpen: false,
      }));
    }, LEAVE_MS);
  }

  function moveBack(id: string) {
    setError(null);
    setDecision(id, null);
    undoDecision(id)
      .then((res) => {
        if (!res.ok) setError(res.message);
      })
      .catch(() => setError("That change didn’t save. Check the app is still running, then try again."));
  }

  function undo() {
    if (!toast) return;
    const { id } = toast;
    setToast(null);
    moveBack(id);
    setTab("new");
    select(id, "row");
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || commands.overlayOpen()) return;
    const typing = isTyping(e.target);
    if (e.key === "Escape") {
      if (filtersOpen) {
        e.preventDefault();
        setFiltersOpen(false);
        filtersButton.current?.focus();
      } else if (typing) {
        (e.target as HTMLElement).blur();
      } else if (showPanel && selected) {
        setPanelOpen(false);
        focus(selected.id, "row");
      }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || filtersOpen) return;
    // While a discard's toast shows, 1 to 5 give the reason; 5 opens the note.
    const reason = toast?.discarded && !e.repeat ? reasonForKey(e.key) : null;
    if (reason && toast) {
      e.preventDefault();
      if (reason === "other") setToast({ ...toast, noteOpen: true });
      else pickReason(toast.id, reason, null);
      return;
    }
    if (mode !== "work") return;
    const key = e.key.toLowerCase();
    const at = visible.findIndex((x) => x.id === selId);
    if (key === "j" || key === "k") {
      if (visible.length === 0) return;
      e.preventDefault();
      const to = at < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, at + (key === "j" ? 1 : -1)));
      select(visible[to].id, "row");
    } else if (e.key === "Enter") {
      // Buttons, links and tabs handle Enter themselves.
      if ((e.target as HTMLElement).closest?.("button, a, [role=tab]")) return;
      if (selected) {
        e.preventDefault();
        setPanelOpen(true);
        focus(selected.id, "heading");
      }
    } else if ((key === "y" || key === "n") && !e.repeat) {
      if (selected && selected.decision === null) {
        e.preventDefault();
        decide(selected.id, key === "y" ? "kept" : "discarded");
      }
    } else if (key === "u" && !e.repeat) {
      undo();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const tabCounts: Record<Tab, number> = {
    new: counts.new,
    kept: counts.kept,
    discarded: counts.discarded,
    conversations: props.conversations.filter((c) => c.decision === null).length,
  };
  const discardCounts = discardCountsLine(items.filter((i) => i.decision === "discarded").map((i) => i.reason));
  const caption =
    tab === "new"
      ? `Scoring ${threshold} or more, sorted by score`
      : tab === "kept"
        ? "Kept, sorted by score"
        : "Discarded, sorted by score. Any of them can be moved back.";

  return (
    <>
      <WorkspaceHeading
        figures={figures}
        threshold={threshold}
        newCount={counts.new}
        fromLastRun={counts.fromLastRun}
        hasAny={items.length > 0}
        showFigures={mode === "work" || mode === "conversations"}
        nowMs={nowMs}
        className={listOnly}
      />

      <div
        className={`sh-in sh-d2 relative z-20 mx-gutter flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-rule max-md:gap-y-0 max-md:border-b-0 ${
          mode === "work" || mode === "conversations" ? "mt-8" : "mt-24"
        } ${listOnly}`}
      >
        <div
          role="tablist"
          aria-label="Decision"
          className="flex flex-wrap gap-x-9 gap-y-2 max-md:-mx-gutter max-md:w-[calc(100%+2*var(--gutter))] max-md:flex-nowrap max-md:gap-x-6 max-md:overflow-x-auto max-md:px-gutter max-md:[scrollbar-width:none]"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pickTab(t.id)}
                className={`-mb-px shrink-0 cursor-pointer border-0 border-b bg-transparent px-0 pt-0 pb-4 font-sans text-[18px] leading-7 whitespace-nowrap transition-colors duration-150 max-md:mb-0 max-md:text-[16px] ${
                  active ? "border-ink text-ink" : "border-transparent text-ink-nav hover:text-ink"
                }`}
              >
                {t.label} <span className="ml-1 text-ink-muted tabular-nums">{tabCounts[t.id]}</span>
              </button>
            );
          })}
        </div>
        {mode === "work" ? (
          <div className="flex flex-wrap items-center gap-3 pb-4 max-md:w-full max-md:flex-nowrap max-md:gap-2 max-md:border-t max-md:border-rule max-md:pt-4 max-md:pb-0">
            <label htmlFor="list-filter" className="sr-only">
              Filter this list
            </label>
            <input
              id="list-filter"
              type="search"
              placeholder="Filter by name, number or note"
              value={query}
              onChange={(e) => refine(filters, e.target.value)}
              autoComplete="off"
              className="h-11 w-[300px] max-w-full border border-rule bg-transparent px-3.5 font-sans text-[15px] text-ink outline-none focus:border-focus max-md:min-w-0 max-md:flex-1 max-md:text-[16px] [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="relative">
              <button
                ref={filtersButton}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                aria-label={nFilters ? `Filters, ${nFilters} on` : "Filters"}
                onClick={() => setFiltersOpen((o) => !o)}
                className={`press flex h-11 cursor-pointer items-center gap-2.5 border px-5 font-sans text-[15px] text-ink hover:border-ink hover:bg-ink hover:text-black max-md:w-11 max-md:justify-center max-md:px-0 ${
                  filtersOpen ? "border-ink-secondary bg-faint" : nFilters ? "border-ink-secondary bg-transparent" : "border-control bg-transparent"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M1.5 3.5h13M4 8h8M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className="max-md:sr-only">Filters</span>
                {nFilters ? <span className="ml-0.5 text-data tabular-nums max-md:hidden">{nFilters}</span> : null}
              </button>
              {filtersOpen ? (
                <FiltersMenu
                  filters={filters}
                  onChange={(f) => refine(f, query)}
                  boroughs={boroughs}
                  shown={visible.length}
                  total={listed.length}
                  active={nFilters}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {filtersOpen ? <div aria-hidden className="fixed inset-0 z-[15]" onClick={() => setFiltersOpen(false)} /> : null}

      {mode === "work" && chips.length > 0 ? (
        <div className={`mx-gutter mt-4 flex flex-wrap items-center gap-2 ${listOnly}`}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={`Remove filter ${c.label}`}
              onClick={() => refine(removeChip(filters, c.key), query)}
              className="flex h-8 cursor-pointer items-center gap-2 border border-strong bg-transparent pr-2.5 pl-3 font-sans text-[14px] text-ink transition-colors duration-100 hover:border-ink-secondary"
            >
              {c.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2 2l6 6M8 2l-6 6" stroke="var(--text-secondary)" strokeWidth="1.3" />
              </svg>
            </button>
          ))}
          <button
            type="button"
            onClick={() => refine(NO_FILTERS, query)}
            className="link-quiet ml-2 cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {mode === "work" ? (
        <>
          <ViewsBand
            view={view}
            onView={setView}
            items={visible}
            network={props.network}
            selectedId={selId}
            onSelect={(id) => (isPhone() ? openOnPhone(id) : select(id))}
            nowMs={nowMs}
            className={listOnly}
          />
          <div className="sh-in sh-d3 mx-gutter flex flex-wrap items-start">
            <div className={`min-w-0 flex-[999_1_620px] pt-2 ${showPanel ? "pr-10 max-[1023px]:pr-0" : ""} ${listOnly}`}>
              {tab === "discarded" && counts.discarded > 0 ? (
                <p className="mt-4 mb-2 text-[15px] leading-[22px] text-ink-secondary tabular-nums max-md:mt-6">{discardCounts}</p>
              ) : null}
              {visible.length > 0 ? (
                <>
                  <p className="mt-6 mb-2 text-[14px] leading-5 text-ink-muted md:hidden">{caption}</p>
                  <PhoneList
                    label={tab === "new" ? "New companies" : tab === "kept" ? "Kept" : "Discarded"}
                    rows={visible.map((r) => ({
                      id: r.id,
                      score: r.score,
                      title: r.name,
                      summary: r.summary,
                      meta: [r.borough, formatAge(r.incorporatedOn, new Date(nowMs))].filter(Boolean).join(", "),
                      decided: r.decision !== null,
                    }))}
                    selectedId={selId}
                    leavingId={leaving}
                    onOpen={openOnPhone}
                    onDecide={decide}
                  />
                  <div className="max-md:hidden">
                    <CompanyTable
                      label={tab === "new" ? "New companies" : tab === "kept" ? "Kept" : "Discarded"}
                      rows={visible}
                      selectedId={selId}
                      leavingId={leaving}
                      nowMs={nowMs}
                      onOpen={(id, fromKeyboard) => select(id, fromKeyboard ? "heading" : undefined)}
                      onDecide={decide}
                    />
                    <p className="m-0 pt-4 text-[14px] leading-5 text-ink-muted">{caption}</p>
                    <p className="m-0 pt-1 text-[14px] leading-5 text-ink-muted">
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
                </>
              ) : (
                <EmptyList
                  tab={tab}
                  query={query.trim()}
                  filtered={nFilters > 0}
                  onClearQuery={() => refine(filters, "")}
                  onClearFilters={() => refine(NO_FILTERS, query)}
                />
              )}
            </div>
            {showPanel ? (
              <div className={`min-w-0 max-w-[440px] flex-[1_1_380px] max-[1023px]:max-w-none ${inDetail ? "" : "max-md:hidden"}`}>
                <PhoneBack
                  label="All companies"
                  position={visible.some((i) => i.id === selected.id) ? `${visible.findIndex((i) => i.id === selected.id) + 1} of ${visible.length}` : null}
                  onBack={backToList}
                />
                <DetailPanel
                  key={selected.id}
                  item={selected}
                  items={visible}
                  network={props.network}
                  apps={props.apps}
                  onUpdate={(patch) => setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)))}
                  nowMs={nowMs}
                  headingRef={headingRef}
                  onClose={() => {
                    setPanelOpen(false);
                    focus(selected.id, "row");
                  }}
                  onDecide={(d) => decide(selected.id, d)}
                  onRestore={() => moveBack(selected.id)}
                  onReason={(r, note) => pickReason(selected.id, r, note)}
                  onShowConnections={() => {
                    setView("graph");
                    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    document.getElementById("views")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                  }}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {mode === "done" ? (
        <section role="status" className="mx-gutter pt-[120px]">
          <p className="m-0 text-[clamp(32px,3.4vw,48px)] leading-[1.15] font-light tracking-[-0.02em]">
            You’re up to date.{figures.nextRunAt ? ` Next run ${nextRunPhrase(figures.nextRunAt, nowMs)}.` : ""}
          </p>
          <p className="mt-4 mb-0 text-[18px] leading-7 text-ink-secondary">
            {counts.keptToday} kept and {counts.discardedToday} discarded today.
          </p>
          <button
            type="button"
            onClick={() => pickTab(counts.kept > 0 || counts.discarded === 0 ? "kept" : "discarded")}
            className={buttonClasses({ size: "lg", edge: "bright", className: "mt-10 text-[17px]!" })}
          >
            {counts.kept > 0 || counts.discarded === 0 ? "See what you kept" : "See what you discarded"}
          </button>
        </section>
      ) : null}

      {mode === "nothing" ? (
        <section className="mx-gutter pt-20">
          <p className="m-0 max-w-[640px] text-[26px] leading-[34px] font-light">Nothing to review yet.</p>
          <p className="mt-3 mb-0 max-w-[640px] text-ink-secondary">
            Companies scoring {threshold} or more appear here after a run. Run now is at the top of the page once Companies House and an AI are connected.
          </p>
        </section>
      ) : null}

      {mode === "conversations" ? (
        <ConversationsView
          conversations={props.conversations}
          mapItems={tabItems(items, "new", threshold)}
          threshold={threshold}
          nowMs={nowMs}
          phoneDetail={phoneDetail}
          onPhoneDetail={setPhoneDetail}
        />
      ) : null}

      {toast ? (
        <Toast key={toast.n} message={toast.text} durationMs={toast.discarded ? 6000 : 5000} onUndo={undo} onDone={() => setToast(null)}>
          {toast.discarded ? (
            <div className="mt-3">
              <ReasonPicker
                keys
                label="Why it was discarded"
                chosen={toast.reason}
                note={toast.note}
                noteOpen={toast.noteOpen}
                onNoteOpen={(open) => setToast((t) => (t ? { ...t, noteOpen: open } : t))}
                onPick={(r, note) => pickReason(toast.id, r, note)}
              />
            </div>
          ) : null}
        </Toast>
      ) : null}
      {error ? (
        <div role="alert" className="fixed bottom-28 right-gutter z-10 flex max-w-[480px] items-center gap-6 border border-error bg-field py-3.5 pr-4 pl-5">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="press h-8 cursor-pointer border border-control bg-transparent px-3 font-sans text-[14px] text-ink hover:border-ink hover:bg-ink hover:text-black"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}

function EmptyList(props: { tab: Tab; query: string; filtered: boolean; onClearQuery: () => void; onClearFilters: () => void }) {
  const line = "m-0 text-[22px] leading-[30px] font-light";
  const block = "flex flex-wrap items-center gap-6 border-b border-faint pt-16 pb-20";
  if (props.query) {
    return (
      <div className={block}>
        <p className={line}>Nothing matches “{props.query}”.</p>
        <button type="button" onClick={props.onClearQuery} className={buttonClasses()}>
          Clear search
        </button>
      </div>
    );
  }
  if (props.filtered) {
    return (
      <div className={block}>
        <p className={line}>No companies match these filters.</p>
        <button type="button" onClick={props.onClearFilters} className={buttonClasses()}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className={block}>
      <p className={line}>{props.tab === "kept" ? "Nothing kept yet." : "Nothing discarded yet."}</p>
    </div>
  );
}
