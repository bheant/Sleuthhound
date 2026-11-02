"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import type { RunBar, RunSummaryView } from "@/lib/home/page";
import type { Segment } from "@/lib/home/summary-text";
import { RunsChart } from "./RunsChart";

type Props = {
  chart: { title: string; bars: RunBar[] };
  summaries: Record<string, RunSummaryView>;
  lastGoodId: string | null;
  latestFailed: boolean;
  waiting: number;
  conversations: number;
  /** "You're up to date. Next run at 15:00." when nothing is waiting. */
  upToDate: string;
  /** Sits under the stopped-run block, so a little closer. */
  afterStopped: boolean;
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// For a run with no stored summary: what it found and what's been decided.
function plainSummary(bar: RunBar): Segment[][] {
  const found = `The ${bar.time} run found ${plural(bar.total, "company", "companies")}`;
  if (bar.total === 0) return [[`${found}.`]];
  const waiting = bar.waiting ? `, ${bar.waiting} waiting for you` : "";
  return [[`${found}: ${bar.kept} kept, ${bar.discarded} discarded${waiting}.`]];
}

function Paragraph({ segments, lede, first }: { segments: Segment[]; lede: boolean; first?: boolean }) {
  const content = segments.map((s, i) =>
    typeof s === "string" ? (
      s
    ) : (
      <Link key={i} href={`/companies?c=${s.id}`} className="sh-ent">
        {s.text}
      </Link>
    ),
  );
  return lede ? (
    <p className="mt-5 mb-0 text-[clamp(24px,2.3vw,32px)] leading-[1.3] font-light tracking-[-0.01em]">{content}</p>
  ) : (
    <p className={`mb-0 text-[20px] leading-[1.5] font-light text-bright ${first ? "mt-7" : "mt-5"}`}>{content}</p>
  );
}

// The selected run's summary beside the runs chart. Home opens on the last
// run that finished; clicking a bar switches to that run.
export function RunOverview(props: Props) {
  const { chart, summaries, lastGoodId, latestFailed, waiting, conversations } = props;
  const [selectedId, setSelectedId] = useState(lastGoodId);
  const [seenLastGood, setSeenLastGood] = useState(lastGoodId);

  // A new run finished and the page refreshed: open on its summary.
  if (lastGoodId !== seenLastGood) {
    setSeenLastGood(lastGoodId);
    setSelectedId(lastGoodId);
  }

  const bar = chart.bars.find((b) => b.id === selectedId);
  const summary = selectedId ? summaries[selectedId] : undefined;
  const paragraphs = summary?.paragraphs ?? (bar ? plainSummary(bar) : []);
  const lastGoodTime = lastGoodId ? summaries[lastGoodId]?.time : undefined;
  const [lede, ...rest] = paragraphs;
  const showBack = Boolean(lastGoodId && lastGoodTime && selectedId !== lastGoodId);

  return (
    <div
      className={`sh-in mx-gutter flex flex-wrap gap-x-20 gap-y-16 pt-8 ${props.afterStopped ? "sh-d4 mt-24 max-md:mt-14" : "sh-d3 mt-[120px] max-md:mt-16"}`}
    >
      <article aria-labelledby="sum-h" className="min-w-0 flex-[999_1_560px]">
        <h2 id="sum-h" className="sr-only">
          Run summary
        </h2>
        {latestFailed && selectedId === lastGoodId && lastGoodTime ? (
          <p className="m-0 text-[15px] leading-[22px] text-ink-secondary">From the {lastGoodTime} run, the last one that finished</p>
        ) : null}
        <div key={selectedId ?? "none"} aria-live="polite" className="sh-swap">
          {lede ? <Paragraph segments={lede} lede /> : null}
          {rest.map((p, i) => (
            <Paragraph key={i} segments={p} lede={false} first={i === 0} />
          ))}
        </div>

        {waiting === 0 && conversations === 0 ? <p className="mt-10 mb-0 text-ink-secondary">{props.upToDate}</p> : null}
        {showBack || waiting > 0 || conversations > 0 ? (
          <div className="mt-10 flex flex-wrap gap-3">
            {waiting > 0 ? (
              <Link href="/companies" className={buttonClasses({ variant: "solid", size: "lg", className: "text-[17px]! no-underline hover:text-white max-md:w-full" })}>
                Review {plural(waiting, "new company", "new companies")}
              </Link>
            ) : null}
            {conversations > 0 ? (
              <Link
                href="/companies?tab=conversations"
                className={buttonClasses({ size: "lg", className: "px-6 text-[16px]! text-ink no-underline max-md:w-full" })}
              >
                Read {plural(conversations, "conversation", "conversations")}
              </Link>
            ) : null}
            {showBack ? (
              <button
                type="button"
                onClick={() => setSelectedId(lastGoodId)}
                className={buttonClasses({ size: "lg", className: "px-6 text-[16px]! max-md:w-full" })}
              >
                Back to the {lastGoodTime} summary
              </button>
            ) : null}
          </div>
        ) : null}
      </article>

      <RunsChart title={chart.title} bars={chart.bars} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
