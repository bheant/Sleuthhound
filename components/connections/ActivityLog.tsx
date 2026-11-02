import type { LogRow } from "@/lib/connections/overview";
import { Section } from "./Section";

type Props = { rows: LogRow[]; ready: boolean };

// The run_log of the last two runs, oldest first.
export function ActivityLog({ rows, ready }: Props) {
  return (
    <Section id="log-h" title="Activity" lede="What the last two runs did, newest at the bottom.">
      {rows.length === 0 ? (
        <p className="mt-6 mb-0 text-ink-secondary">
          {ready
            ? "Nothing has run yet. Press Run now to start the first run."
            : "Nothing has run yet. The first run starts as soon as Companies House and one AI are connected."}
        </p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-8 gap-y-1 py-5 max-md:grid max-md:grid-cols-[72px_minmax(0,1fr)] max-md:gap-x-4 max-md:py-3.5">
              <span className="flex-[0_0_88px] text-ink-muted tabular-nums max-md:row-span-2 max-md:text-[14px]">{r.at}</span>
              <span className="flex-[0_0_180px] max-md:text-[15px]">{r.actor}</span>
              <span className={`flex-[1_1_280px] max-md:text-[15px] ${r.error ? "text-error-ink" : "text-ink-secondary"}`}>{r.message}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
