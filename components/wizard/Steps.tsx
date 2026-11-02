"use client";

import { useState } from "react";
import { useBusinessName } from "@/components/vault/useBusinessName";
import { salesOf } from "@/lib/business/name";
import type { MappingRow } from "@/lib/connectors/types";
import type { CatalogueData, ConnectorInfo, PreviewResult, Schedule, Weight } from "@/lib/sources/types";
import { fieldClass, FieldError, FieldLabel, Segmented, StepHeading, StepLede } from "./fields";

// The wizard's simpler steps: Pick, the fixed Map, Preview and Schedule.

const GROUP_ORDER = ["Registers", "Communities", "Hiring", "News", "Your files", "Custom"] as const;

type PickProps = { catalogue: CatalogueData; picked: string | null; onPick: (key: string) => void };

export function PickStep({ catalogue, picked, onPick }: PickProps) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const entries = [
    ...catalogue.connectors.map((c) => ({ ...c, soon: false })),
    ...catalogue.comingSoon.map((c) => ({ ...c, soon: true, added: false, catalogueNote: null as string | null })),
  ].filter((e) => !query || `${e.label} ${e.description} ${e.group}`.toLowerCase().includes(query));

  return (
    <>
      <StepHeading>Pick a source</StepHeading>
      <StepLede>
        Every source also uses your default AI to review what it finds, about £{catalogue.perItemGbp.toFixed(3)} an item (an estimate).
      </StepLede>
      <label htmlFor="cat-q" className="sr-only">
        Search sources
      </label>
      <div className="relative mt-5">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden className="absolute top-3.5 left-3.5 text-ink-muted">
          <circle cx="10.5" cy="7.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.8 11.2 2 16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input id="cat-q" type="search" placeholder="Search sources" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className={`${fieldClass} pl-10`} />
      </div>
      {GROUP_ORDER.map((group) => {
        const items = entries.filter((e) => e.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="mt-6">
            <h4 className="m-0 mb-1 text-[13px] leading-[18px] font-normal text-ink-secondary">{group}</h4>
            <ul className="m-0 list-none p-0">
              {items.map((it) => {
                const on = picked === it.key;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={it.soon}
                      onClick={() => onPick(it.key)}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border px-4 py-3.5 text-left font-sans text-ink transition-colors duration-100 ${
                        on ? "border-primary-edge bg-primary" : "border-transparent border-b-faint"
                      } ${it.soon ? "cursor-default" : "cursor-pointer hover:bg-field"}`}
                    >
                      <span className={`text-[16px] leading-6 ${it.soon ? "text-ink-secondary" : ""}`}>
                        {it.label}
                        {it.added ? <span className="ml-2.5 text-[13px] text-ink-muted">Added</span> : null}
                      </span>
                      <span className="text-[13px] leading-6 whitespace-nowrap text-ink-secondary">{it.soon ? "Coming soon" : it.costNote}</span>
                      <span className="col-span-2 text-[14px] leading-5 text-ink-secondary">{it.description}</span>
                      {it.catalogueNote ? <span className="col-span-2 mt-1.5 text-[13px] leading-[18px] text-ink-muted">{it.catalogueNote}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {entries.length === 0 ? <p className="mt-8 mb-0 text-ink-secondary">No sources match “{q.trim()}”.</p> : null}
    </>
  );
}

const MAP_GROUPS: Array<{ name: MappingRow["group"]; hint: string }> = [
  { name: "Target", hint: "the thing you might act on" },
  { name: "Signal", hint: "a dated event that makes it worth acting on now" },
  { name: "Person", hint: "someone linked to the target" },
  { name: "Place", hint: "where it is, for the map" },
];

export function FixedMapStep({ connector }: { connector: ConnectorInfo }) {
  const [open, setOpen] = useState(false);
  const conversation = connector.group === "Communities";
  return (
    <>
      <StepHeading>Map fields</StepHeading>
      <StepLede>{connector.label} is a built-in source, so its fields map to Sleuthhound automatically. Nothing to set here.</StepLede>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="link-quiet mt-4 cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink"
      >
        {open ? "Hide field mapping" : "See how fields map"}
      </button>
      {open ? (
        <div className="sh-swap mt-3">
          {MAP_GROUPS.map((g) => {
            const rows = connector.fixedMapping.filter((r) => r.group === g.name);
            const note =
              g.name === "Target" && conversation
                ? "If the AI matches the post to a company, the company becomes the target instead."
                : g.name === "Place" && conversation
                  ? `${connector.label} posts rarely say where the author is, so there’s no place.`
                  : null;
            if (rows.length === 0 && !note) return null;
            return (
              <section key={g.name} className="mt-4">
                <h4 className="m-0 text-[15px] leading-[22px] font-normal">
                  {g.name} <span className="text-[13px] text-ink-muted">{g.hint}</span>
                </h4>
                {rows.map((r) => (
                  <div key={r.from} className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 border-b border-faint py-2 text-[14px] leading-5">
                    <span className="text-ink-secondary">{r.from}</span>
                    <span aria-hidden className="text-control">
                      →
                    </span>
                    <span>{r.to}</span>
                  </div>
                ))}
                {note ? <p className="mt-2 mb-0 text-[13px] leading-[18px] text-ink-muted">{note}</p> : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

type PreviewProps = {
  result: PreviewResult | null;
  emptyLine: string;
  onAdjust: () => void;
  onRetry: () => void;
};

function summaryLine(rows: Extract<PreviewResult, { ok: true }>["rows"]): string {
  const n = (o: string) => rows.filter((r) => r.outcome === o).length;
  const parts = [
    `${n("new")} new ${n("new") === 1 ? "target" : "targets"}`,
    `${n("signal")} ${n("signal") === 1 ? "signal" : "signals"} on existing targets`,
    `${n("filtered")} filtered out`,
  ];
  return `Of ${rows.length} ${rows.length === 1 ? "item" : "items"}: ${parts.join(", ")}.`;
}

export function PreviewStep({ result, emptyLine, onAdjust, onRetry }: PreviewProps) {
  const adjust = (
    <button type="button" onClick={onAdjust} className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink">
      Adjust filters
    </button>
  );
  return (
    <>
      <StepHeading>Preview</StepHeading>
      {!result ? (
        <p role="status" className="sh-pulse mt-2.5 mb-0 text-[14px] leading-5">
          Fetching a few real items…
        </p>
      ) : !result.ok ? (
        <div className="mt-6 border border-strong px-6 py-7">
          <p className="m-0 text-[18px] leading-[26px] font-light">{result.message}</p>
          <button type="button" onClick={onRetry} className="press mt-5 h-11 cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:border-ink hover:bg-ink hover:text-black">
            Try again
          </button>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="mt-6 border border-strong px-6 py-7">
          <p className="m-0 text-[18px] leading-[26px] font-light">{emptyLine}</p>
          <button type="button" onClick={onAdjust} className="press mt-5 h-11 cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:border-ink hover:bg-ink hover:text-black">
            Adjust filters
          </button>
        </div>
      ) : (
        <>
          <StepLede>
            {result.rows.length} real {result.rows.length === 1 ? "item" : "items"} from {result.source}, fetched just now. Nothing reaches your feed until you save.
          </StepLede>
          <p className="mt-5 mb-0 text-[17px] leading-[26px] tabular-nums">{summaryLine(result.rows)}</p>
          <ul className="mt-4 mb-0 list-none border-t border-subtle p-0">
            {result.rows.map((r, i) => {
              const out = r.outcome === "filtered";
              return (
                <li key={i} className="border-b border-faint py-3.5">
                  <span className={`text-[13px] leading-[18px] ${out ? "text-ink-muted" : "text-ink-secondary"}`}>{r.label}</span>
                  <p className={`mt-1 mb-0 text-[15px] leading-[22px] ${out ? "text-ink-muted" : ""}`}>{r.title}</p>
                  {r.meta ? <p className="mt-0.5 mb-0 text-[13px] leading-[18px] text-ink-muted">{r.meta}</p> : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 mb-0 text-[14px] text-ink-secondary">Not what you expected? {adjust}</p>
        </>
      )}
    </>
  );
}

export type ScheduleState = { schedule: Schedule; maxItems: string; cap: string; weight: Weight; rights: boolean };

const RUNS_PER_MONTH: Record<Schedule, number> = { hourly: 720, every_6_hours: 120, daily: 30 };

const WEIGHT_LINES: Record<Weight, string> = {
  low: "Low: a match here counts for less than one from other sources.",
  normal: "Normal: a match here counts the same as any other source.",
  high: "High: a match here counts for more than one from other sources.",
};

type ScheduleProps = {
  state: ScheduleState;
  onChange: (next: Partial<ScheduleState>) => void;
  once: boolean;
  perItemGbp: number;
  reviewCap: number;
  error: string | null;
};

function money(n: number): string {
  return n < 1 ? `£${n.toFixed(2)}` : `£${Math.round(n).toLocaleString("en-GB")}`;
}

export function ScheduleStep({ state, onChange, once, perItemGbp, reviewCap, error }: ScheduleProps) {
  const business = useBusinessName();
  const max = Number(state.maxItems) || 0;
  const cap = state.cap.trim() === "" ? null : Number(state.cap);
  // The most it could cost: every item new and reviewed, every run.
  const perRun = Math.min(max, reviewCap) * perItemGbp;
  const monthly = once ? perRun : perRun * RUNS_PER_MONTH[state.schedule];
  const estimate = once
    ? `About ${money(monthly)} to review ${Math.min(max, reviewCap)} rows a run, an estimate.`
    : `Up to about ${money(monthly)} a month at these settings if every item is new, an estimate. Most runs find far fewer.`;
  return (
    <>
      <StepHeading>Schedule and limits</StepHeading>
      {once ? (
        <p className="mt-6 mb-0 text-[15px] leading-[22px] text-ink-secondary">A file is imported once. Upload a new file to add more.</p>
      ) : (
        <div className="mt-6">
          <FieldLabel>How often</FieldLabel>
          <Segmented
            label="How often"
            value={state.schedule}
            options={[
              { value: "hourly", label: "Hourly" },
              { value: "every_6_hours", label: "Every 6 hours" },
              { value: "daily", label: "Daily" },
            ]}
            onChange={(v) => onChange({ schedule: v as Schedule })}
          />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-5">
        <div>
          <FieldLabel htmlFor="maxi">Maximum items per run</FieldLabel>
          <input id="maxi" inputMode="numeric" className={fieldClass.replace("w-full", "w-[120px]")} value={state.maxItems} onChange={(e) => onChange({ maxItems: e.target.value.replace(/[^\d]/g, "") })} />
        </div>
        <div>
          <FieldLabel htmlFor="cap">Monthly spend cap</FieldLabel>
          <div className="flex h-11 w-[140px] items-center border border-rule focus-within:border-focus">
            <span aria-hidden className="pl-3.5 text-ink-secondary">
              £
            </span>
            <input
              id="cap"
              inputMode="decimal"
              value={state.cap}
              onChange={(e) => onChange({ cap: e.target.value.replace(/[^\d.]/g, "") })}
              className="h-[42px] min-w-0 flex-auto border-0 bg-transparent pr-3 pl-1 font-sans text-[15px] text-ink outline-none"
            />
          </div>
        </div>
      </div>
      <p className="mt-2.5 mb-0 text-[14px] leading-5 text-ink-secondary">{estimate}</p>
      {cap !== null && monthly > cap ? (
        <p className="sh-swap mt-1 mb-0 text-[14px] leading-5 text-overdue">That’s above your cap, so the source pauses once the cap is reached.</p>
      ) : null}
      <div className="mt-7">
        <FieldLabel>Signal weight</FieldLabel>
        <Segmented
          label="Signal weight"
          value={state.weight}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
          onChange={(v) => onChange({ weight: v as Weight })}
        />
        <p className="mt-2.5 mb-0 text-[14px] leading-5 text-ink-secondary">{WEIGHT_LINES[state.weight]}</p>
      </div>
      <label className="mt-8 flex cursor-pointer items-start gap-3 border border-strong px-[18px] py-4 text-[15px] leading-[22px]">
        <input type="checkbox" checked={state.rights} onChange={(e) => onChange({ rights: e.target.checked })} className="m-0 mt-[3px] size-4 flex-none accent-primary-edge" />
        <span>I have the right to use data from this source for {salesOf(business)}.</span>
      </label>
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}
