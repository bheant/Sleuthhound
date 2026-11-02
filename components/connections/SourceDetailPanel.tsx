"use client";

import { useState, useTransition } from "react";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { StatusDot, type DotStatus } from "@/components/ui/StatusDot";
import { SidePanel } from "@/components/wizard/SidePanel";
import { deleteSource, pauseSource, restoreSourceVersion, retryNow } from "@/lib/sources/actions";
import type { SourceDetail, WizardStart } from "@/lib/sources/types";

// A source's detail, from its row on Connections: status, last and next run,
// items fetched over the last 14 runs, this week's funnel, the settings with
// Edit, the history with Restore, Pause (no confirm) and Remove (inline confirm).

type Props = {
  detail: SourceDetail;
  closing: boolean;
  onClose: () => void;
  onEdit: (start: WizardStart) => void;
  onRemoved: () => void;
};

const DOT: Record<SourceDetail["status"], DotStatus> = { connected: "ok", paused: "off", failed: "error", awaiting_approval: "awaiting" };

/** A round top for the chart's axis, so the middle label is whole: 2, 4, 10, 20, 40, 100… */
function axisMax(values: number[]): number {
  const max = Math.max(2, ...values);
  const scale = 10 ** Math.floor(Math.log10(max));
  return [2, 4, 10, 20].map((m) => m * scale).find((top) => top >= max) ?? 20 * scale;
}

const SLOTS = 14;

function RunsChart({ detail }: { detail: SourceDetail }) {
  const runs = detail.runs;
  // Always 14 slots, newest on the right, so one run reads as one bar.
  const slots: Array<SourceDetail["runs"][number] | null> = [...Array<null>(Math.max(0, SLOTS - runs.length)).fill(null), ...runs];
  const top = axisMax(runs.map((r) => r.fetched));
  const aria = runs.map((r) => `${r.when}: ${r.fetched}`).join(", ");
  return (
    <section aria-labelledby="runs-h" className="mt-9">
      <h3 id="runs-h" className="m-0 text-[15px] leading-[22px] font-normal">
        Items fetched per run, last 14 runs
      </h3>
      {runs.length === 0 ? (
        <p className="mt-3 mb-0 text-[14px] text-ink-secondary">No runs yet. The chart fills in after the first run.</p>
      ) : (
        <>
          <div role="img" aria-label={`Items fetched per run: ${aria}`} className="mt-4 grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
            <div aria-hidden className="relative h-40 text-right text-[11px] leading-3 text-ink-muted tabular-nums">
              <span className="absolute -top-1.5 right-0">{top}</span>
              <span className="absolute top-[74px] right-0">{top / 2}</span>
              <span className="absolute right-0 -bottom-1.5">0</span>
            </div>
            <div aria-hidden className="relative h-40 border-b border-l border-strong">
              <span className="absolute inset-x-0 top-0 border-t border-faint" />
              <span className="absolute inset-x-0 top-20 border-t border-faint" />
              <div className="absolute inset-x-1 inset-y-0 flex items-end gap-1.5">
                {slots.map((r, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
                    {r ? (
                      <>
                        <span className="text-[11px] leading-[14px] text-ink-secondary tabular-nums">{r.fetched}</span>
                        <span className="sh-bar w-full bg-data" style={{ height: `${(r.fetched / top) * 100}%`, animationDelay: `${i * 30}ms` }} />
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <span />
            <div aria-hidden className="flex gap-1.5 px-1 pt-1.5 text-[11px] leading-[14px] text-ink-muted">
              {slots.map((r, i) => (
                <span key={i} className="flex-1 text-center whitespace-nowrap">
                  {r && (i % 2 === slots.length % 2 || runs.length < 8) ? r.label : ""}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-2 mb-0 ml-9 text-[12px] leading-4 text-ink-muted">{detail.runsNote}</p>
        </>
      )}
    </section>
  );
}

function Funnel({ week }: { week: SourceDetail["week"] }) {
  const base = Math.max(1, week.fetched, week.targets);
  const share = week.fetched ? Math.round((week.targets / week.fetched) * 100) : 0;
  const keptLine = week.targets
    ? week.kept
      ? `1 in ${Math.max(1, Math.round(week.targets / week.kept))} targets was kept`
      : "none kept yet"
    : null;
  const rows = [
    { label: "Fetched", n: week.fetched, opacity: 0.35 },
    { label: "Became targets", n: week.targets, opacity: 0.65 },
    { label: "Kept", n: week.kept, opacity: 1 },
  ];
  return (
    <section aria-labelledby="wk-h" className="mt-9">
      <h3 id="wk-h" className="m-0 text-[15px] leading-[22px] font-normal">
        Results this week
      </h3>
      <div className="mt-3.5 grid grid-cols-[132px_minmax(0,1fr)_40px] items-center gap-x-3 gap-y-2.5 text-[14px] leading-5 tabular-nums">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-ink-secondary">{r.label}</span>
            <span className="h-3.5">
              <span className="block h-full bg-data" style={{ width: `${(r.n / base) * 100}%`, opacity: r.opacity }} />
            </span>
            <span className="text-right">{r.n}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 mb-0 text-[13px] leading-[18px] text-ink-muted">
        {week.fetched ? `${share}% of fetched items became targets${keptLine ? `; ${keptLine}` : ""}.` : "Nothing fetched this week yet."}
      </p>
    </section>
  );
}

export function SourceDetailPanel({ detail, closing, onClose, onEdit, onRemoved }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: boolean; message: string | null }>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setMessage(result.message);
      else after?.();
    });
  }

  const paused = detail.status === "paused";
  const subtitle = (
    <>
      <StatusDot status={DOT[detail.status]} />
      <span>{detail.statusLine}</span>
    </>
  );

  return (
    <SidePanel title={detail.name} subtitle={subtitle} closing={closing} onClose={onClose} labelId="src-title">
      <div className="min-h-0 flex-auto overflow-y-auto px-8 pt-7 pb-10">
        <dl className="m-0 flex flex-wrap gap-x-10 gap-y-4 text-[14px] leading-5">
          <div>
            <dt className="text-ink-nav">Last run</dt>
            <dd className="m-0 tabular-nums">{detail.lastRun}</dd>
          </div>
          <div>
            <dt className="text-ink-nav">Next run</dt>
            <dd className="m-0 tabular-nums">{detail.nextRun}</dd>
          </div>
          <div>
            <dt className="text-ink-nav">Schedule</dt>
            <dd className="m-0">{detail.scheduleText}</dd>
          </div>
        </dl>

        {detail.error ? (
          <div className={`mt-6 border px-5 py-4 text-[14px] leading-5 ${detail.status === "failed" ? "border-error text-error-ink" : "border-strong"}`}>
            <p className="m-0">{detail.error}</p>
            {detail.status === "failed" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => retryNow(detail.id))}
                className="press mt-3 h-11 cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black"
              >
                Retry now
              </button>
            ) : paused && detail.error.startsWith("Paused:") ? (
              <button type="button" onClick={() => onEdit({ ...detail.start })} className="link-quiet mt-2 cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink">
                Raise cap
              </button>
            ) : null}
          </div>
        ) : null}

        <RunsChart detail={detail} />
        <Funnel week={detail.week} />

        <section aria-labelledby="set-h" className="mt-9 border-t border-subtle pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 id="set-h" className="m-0 text-[15px] leading-[22px] font-normal">
              Settings
            </h3>
            <button type="button" onClick={() => onEdit(detail.start)} className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink">
              Edit
            </button>
          </div>
          <dl className="mt-3 mb-0 text-[14px] leading-5">
            {detail.settings.map((row) => (
              <div key={row.label} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 border-b border-faint py-2">
                <dt className="text-ink-secondary">{row.label}</dt>
                <dd className="m-0 min-w-0 break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="hist-h" className="mt-8">
          <h3 id="hist-h" className="m-0 text-[15px] leading-[22px] font-normal">
            History
          </h3>
          <ul className="mt-3 mb-0 list-none p-0 text-[14px] leading-5">
            {detail.history.map((h) => (
              <li key={h.version} className="grid grid-cols-[112px_minmax(0,1fr)_auto] gap-3 border-b border-faint py-2.5">
                <span className="text-ink-muted tabular-nums">{h.when}</span>
                <span>{h.change}</span>
                {h.current ? (
                  <span className="text-ink-muted">Current</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => restoreSourceVersion(detail.id, h.version))}
                    className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink"
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 border-t border-subtle pt-5">
          {confirming ? (
            <InlineConfirm
              question={`Remove ${detail.name}?`}
              note={`It stops fetching straight away. The ${detail.week.targets === 1 ? "target" : "targets"} it found stay where they are.`}
              busy={pending}
              onCancel={() => setConfirming(false)}
              onConfirm={() => act(() => deleteSource(detail.id), onRemoved)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {detail.status !== "awaiting_approval" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => pauseSource(detail.id, !paused))}
                  className="press h-11 min-w-[120px] cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-50"
                >
                  {paused ? "Resume" : "Pause"}
                </button>
              ) : null}
              <button type="button" onClick={() => setConfirming(true)} className="link-quiet ml-3 cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink">
                Remove
              </button>
            </div>
          )}
          {message ? (
            <p role="alert" className="mt-3 mb-0 text-[14px] leading-5 text-error-ink">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </SidePanel>
  );
}
