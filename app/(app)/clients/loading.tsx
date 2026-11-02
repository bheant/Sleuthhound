import { LoadingBlock } from "@/components/ui/LoadingBlock";

// Clients while it loads: the real headings stay, everything else pulses.
export default function ClientsLoading() {
  return (
    <div role="status" aria-label="Loading clients">
      <section className="px-gutter pt-32">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-10">
          <h1 className="type-page-title-xl m-0">Clients</h1>
          <p className="type-lede mt-2.5 mb-0 max-w-[540px]">What your clients have in common, and which of them today’s leads resemble.</p>
        </div>
        <dl className="mt-20 mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5">
          {["Clients", "Lookalike leads, last 8 weeks", "Kept", "Client list uploaded"].map((label) => (
            <div key={label} className="pl-4">
              <dt className="text-ink-nav">{label}</dt>
              <dd className="m-0 pt-1">
                <LoadingBlock className="h-3 w-16" />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mx-gutter mt-16 border border-strong px-8 pt-6 pb-8">
        <p className="m-0 text-[14px] text-ink-secondary">Ideal client</p>
        <LoadingBlock className="mt-6 h-5 w-[70%]" />
        <LoadingBlock className="mt-3 h-5 w-[64%]" />
        <LoadingBlock className="mt-3 h-5 w-[38%]" />
      </section>
      <section className="mx-gutter mt-[120px]">
        <h2 className="m-0 border-b border-rule pb-3 text-[40px] leading-[44px] font-light tracking-[-0.02em]">Client universe</h2>
        <div className="relative mt-4 flex h-[420px] items-center justify-center border border-faint bg-plate">
          <p className="m-0 text-[13px] text-ink-secondary">Loading clients…</p>
        </div>
      </section>
      <section className="mx-gutter mt-[120px]">
        <h2 className="m-0 border-b border-rule pb-3 text-[40px] leading-[44px] font-light tracking-[-0.02em]">Your clients</h2>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-10 border-b border-faint py-4">
            <div className="flex-[0_0_280px]">
              <LoadingBlock className="h-3 w-40" />
              <LoadingBlock className="mt-2 h-3 w-56" />
            </div>
            <LoadingBlock className="h-3 w-16" />
            <LoadingBlock className="h-3 w-14" />
            <LoadingBlock className="h-3 w-8" />
          </div>
        ))}
      </section>
    </div>
  );
}
