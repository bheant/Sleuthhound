import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { formatLongDay } from "@/lib/format/time";

// Home while its data loads: the welcome line and date stay real; figures,
// summary, chart and sources line are loading blocks.

const FIGURES: Array<[string, number]> = [
  ["Runs today", 28],
  ["Companies found", 36],
  ["Kept today", 24],
  ["Waiting for you", 28],
];

export default function HomeLoading() {
  return (
    <div aria-busy="true">
      <section className="px-gutter pt-24">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
          <h1 className="type-page-title m-0">Welcome back</h1>
          <div className="mt-1.5 max-w-[420px]">
            <p className="m-0 text-[clamp(20px,1.8vw,26px)] leading-[1.3] font-light">{formatLongDay()}</p>
            <p role="status" className="mt-1.5 mb-0 text-ink-muted">
              Loading today’s runs…
            </p>
          </div>
        </div>
        <dl aria-hidden className="mt-[72px] mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5">
          {FIGURES.map(([label, w]) => (
            <div key={label} className="pl-4">
              <dt className="text-ink-nav">{label}</dt>
              <dd className="mx-0 mt-1 mb-0">
                <LoadingBlock style={{ width: w, height: 16 }} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div aria-hidden className="mx-gutter mt-[120px] flex flex-wrap gap-x-20 gap-y-16 pt-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col">
          <LoadingBlock className="mt-6 h-[30px] w-[96%]" />
          <LoadingBlock className="mt-3 h-[30px] w-[88%]" />
          <LoadingBlock className="mt-3 h-[30px] w-[52%]" />
          <LoadingBlock className="mt-9 h-5 w-[92%]" />
          <LoadingBlock className="mt-2.5 h-5 w-[70%]" />
          <LoadingBlock className="mt-10 h-[52px] w-[260px]" />
        </div>
        <section className="min-w-0 flex-[1_1_420px]">
          <h2 className="m-0 text-[15px] leading-[22px] font-normal text-ink-secondary">Leads found per run today</h2>
          <div className="mt-6 flex h-[220px] items-end gap-1.5 border-b border-strong">
            {Array.from({ length: 12 }, (_, i) => (
              <LoadingBlock key={i} className="h-12 flex-[1_1_0] border-b-0" />
            ))}
          </div>
        </section>
      </div>

      <div aria-hidden className="mx-gutter mt-36 flex flex-wrap gap-x-8 gap-y-3 pt-6">
        <LoadingBlock className="h-5 w-[220px]" />
        <LoadingBlock className="h-5 w-[240px]" />
        <LoadingBlock className="h-5 w-[180px]" />
      </div>
    </div>
  );
}
