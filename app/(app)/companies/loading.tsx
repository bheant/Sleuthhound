import { LoadingBlock } from "@/components/ui/LoadingBlock";

// New Companies while its data loads: real headings and tabs stay, the lede,
// figures, table and panel are loading blocks, and the map plate says so.

const ROWS = [
  [124, 202],
  [96, 162],
  [140, 183],
  [110, 228],
  [132, 147],
  [88, 193],
  [116, 172],
  [100, 213],
];

const GRID = "grid grid-cols-[56px_minmax(180px,1.1fr)_minmax(0,1.4fr)_84px_130px_76px] items-center gap-5 px-3";

export default function Loading() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading today’s companies
      </p>
      <section className="px-gutter pt-24">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
          <h1 className="type-page-title m-0">New companies</h1>
          <div className="mt-1.5 w-[620px] max-w-full">
            <div className="flex flex-col gap-3">
              <LoadingBlock className="h-[22px] w-full" />
              <LoadingBlock className="h-[22px] w-[62%]" />
            </div>
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-[14px] leading-5">
              {["Last run", "Scanned per run", "New matches per run", "Next run"].map((label) => (
                <div key={label}>
                  <p className="m-0 text-ink-nav">{label}</p>
                  <LoadingBlock className="mt-0.5 h-4 w-10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-gutter mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-rule">
        <div className="flex flex-wrap gap-x-9 gap-y-2 text-[18px] leading-7">
          <span className="-mb-px border-b border-ink pb-4">New</span>
          <span className="pb-4 text-ink-nav">Kept</span>
          <span className="pb-4 text-ink-nav">Discarded</span>
          <span className="pb-4 text-ink-nav">Conversations</span>
        </div>
        <div className="flex gap-3 pb-4">
          <LoadingBlock className="h-11 w-[300px]" />
          <LoadingBlock className="h-11 w-28" />
        </div>
      </div>

      <section aria-label="Views" className="mx-gutter mt-3">
        <div className="flex gap-7 border-b border-subtle text-[15px] leading-[22px]">
          <span className="-mb-px border-b border-ink pt-2 pb-2.5">Map</span>
          <span className="pt-2 pb-2.5 text-ink-muted">Connections</span>
          <span className="pt-2 pb-2.5 text-ink-nav">Deadlines</span>
        </div>
        <div className="relative mt-2 h-[240px] overflow-hidden border border-faint bg-plate">
          <p className="absolute top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 bg-plate px-3 py-1.5 text-[15px] leading-[22px] whitespace-nowrap text-ink-secondary">
            Loading today’s companies…
          </p>
        </div>
      </section>

      <div aria-hidden className="mx-gutter flex flex-wrap items-start">
        <div className="min-w-0 flex-[999_1_620px] pt-2 pr-10">
          <div className={`${GRID} h-10 border-b border-rule text-[13px] leading-5 text-ink-muted`}>
            <span>Score ↓</span>
            <span>Company</span>
            <span>Why</span>
            <span>Age</span>
            <span>Borough</span>
            <span />
          </div>
          {ROWS.map(([a, b], i) => (
            <div key={i} className={`${GRID} min-h-14`}>
              <LoadingBlock className="h-4 w-7" />
              <LoadingBlock className="h-4" style={{ width: a }} />
              <LoadingBlock className="h-3.5" style={{ width: b }} />
              <LoadingBlock className="h-3.5 w-14" />
              <LoadingBlock className="h-3.5 w-[72px]" />
              <span />
            </div>
          ))}
        </div>
        <div className="flex max-w-[440px] min-w-0 flex-[1_1_380px] flex-col border-l border-subtle pt-8 pl-10">
          <LoadingBlock className="h-8 w-24" />
          <LoadingBlock className="mt-6 h-8 w-4/5" />
          <LoadingBlock className="mt-3 h-4 w-[55%]" />
          <div className="mt-7 flex gap-2">
            <LoadingBlock className="h-12 flex-1" />
            <LoadingBlock className="h-12 flex-1" />
          </div>
          <LoadingBlock className="mt-10 h-3.5 w-[30%]" />
          <LoadingBlock className="mt-3 h-4 w-full" />
          <LoadingBlock className="mt-2 h-4 w-[70%]" />
          <LoadingBlock className="mt-8 h-3.5 w-[30%]" />
          <LoadingBlock className="mt-3 h-4 w-full" />
          <LoadingBlock className="mt-2 h-4 w-[82%]" />
        </div>
      </div>
    </div>
  );
}
