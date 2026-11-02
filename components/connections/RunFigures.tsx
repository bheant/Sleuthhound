import type { RunFigures as Figures } from "@/lib/connections/overview";

// The quiet row under the title: last run, scanned, new matches, next run.
export function RunFigures({ figures }: { figures: Figures }) {
  const items: Array<[string, string, boolean]> = [
    ["Last run", figures.lastRun, figures.lastRunFailed],
    ["Scanned", figures.scanned, false],
    ["New matches", figures.newMatches, false],
    ["Next run", figures.nextRun, false],
  ];
  return (
    <dl className="sh-in sh-d2 mt-28 mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5 max-md:mt-12 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-5">
      {items.map(([label, value, error]) => (
        <div key={label} className="pl-4 max-md:pl-0">
          <dt className="text-ink-nav">{label}</dt>
          <dd className={`m-0 ${error ? "text-error-ink" : "text-ink"}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
