import { formatDayTime, formatWhen, runName } from "@/lib/format/time";
import type { RunFigures } from "@/lib/targets/types";

// "New companies", the lede written from the real counts, and the run figures
// as plain numbers.

type Props = {
  figures: RunFigures;
  threshold: number;
  newCount: number;
  /** Of the new companies, how many the last run found. */
  fromLastRun: number;
  hasAny: boolean;
  showFigures: boolean;
  nowMs: number;
  className?: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function lede({ figures, threshold, newCount, fromLastRun, hasAny, nowMs }: Omit<Props, "showFigures" | "className">): string {
  const now = new Date(nowMs);
  const run = figures.lastRunAt ? runName(figures.lastRunAt, now) : null;
  if (!hasAny) {
    return run
      ? `Nothing from ${run} scored ${threshold} or more yet. The next run looks again.`
      : "No companies reviewed yet. Run now fetches new companies and reviews each one.";
  }
  if (newCount === 0) return run ? `Every company up to ${run} has a decision.` : "Every company has a decision.";
  const companies = plural(newCount, "company", "companies");
  const verb = `scored ${threshold} or more`;
  let text: string;
  if (run && fromLastRun === newCount) text = `${companies} from ${run} ${verb}.`;
  else if (run && fromLastRun > 0) text = `${companies} ${verb}, ${fromLastRun} of them from ${run}.`;
  else text = `${companies} from earlier runs ${verb}.`;
  return `${text} Keep the ones worth your time.`;
}

export function WorkspaceHeading(props: Props) {
  const { figures, showFigures, nowMs, className = "" } = props;
  const now = new Date(nowMs);
  const rows: Array<[string, string]> = [];
  if (figures.lastRunAt) rows.push(["Last run", formatDayTime(figures.lastRunAt, now)]);
  if (figures.scannedPerRun !== null) rows.push(["Scanned per run", String(figures.scannedPerRun)]);
  if (figures.matchesPerRun !== null) rows.push(["New matches per run", String(figures.matchesPerRun)]);
  if (figures.nextRunAt) rows.push(["Next run", formatWhen(figures.nextRunAt, now)]);

  return (
    <section className={`px-gutter pt-24 max-md:pt-14 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
        <h1 className="sh-in type-page-title m-0">New companies</h1>
        <div className="sh-in sh-d1 mt-1.5 max-w-[620px]">
          <p className="m-0 text-[clamp(20px,1.8vw,26px)] leading-[1.3] font-light">{lede(props)}</p>
          {showFigures && rows.length > 0 ? (
            <dl className="mt-4 mb-0 flex flex-wrap gap-x-10 gap-y-4 text-[14px] leading-5 max-md:hidden">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink-nav">{label}</dt>
                  <dd className="m-0 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {showFigures && figures.lastRunAt ? (
            <p className="mt-5 mb-0 text-[14px] leading-5 text-ink-secondary tabular-nums md:hidden">
              Last run {formatDayTime(figures.lastRunAt, now).replace(/^Today/, "today")}
              {figures.nextRunAt ? `, next ${formatWhen(figures.nextRunAt, now).includes(" at ") ? "on" : "at"} ${formatWhen(figures.nextRunAt, now)}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
