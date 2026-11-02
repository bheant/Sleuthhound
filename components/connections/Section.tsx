import type { ReactNode } from "react";

type Props = { id: string; title: string; lede: string; children: ReactNode; className?: string };

// A Connections section: a rule, the heading and lede on the left, the rows on the right.
export function Section({ id, title, lede, children, className = "mt-40" }: Props) {
  return (
    <section aria-labelledby={id} className={`mx-gutter flex flex-wrap gap-x-12 border-t border-rule max-md:mt-24 ${className}`}>
      <div className="max-w-[400px] flex-[1_1_280px] pt-6">
        <h2 id={id} className="m-0 text-[32px] leading-10 font-light tracking-[-0.01em] max-md:text-[30px]">
          {title}
        </h2>
        <p className="mt-3 mb-0 text-ink-secondary">{lede}</p>
      </div>
      <div className="min-w-0 flex-[999_1_640px]">{children}</div>
    </section>
  );
}

type RowProps = { name: ReactNode; purpose: string; field: ReactNode; status: ReactNode; extra?: ReactNode };

// Name, key field, status and an optional fourth column (the default AI toggle).
// On phone: name and status share the first line, then the field and the
// toggle full width, with a rule between rows.
export function ServiceRow({ name, purpose, field, status, extra }: RowProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 py-6 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:border-b max-md:border-subtle">
      <div className="flex-[0_0_180px] max-md:min-w-0">
        {typeof name === "string" ? <div className="text-[20px] leading-7">{name}</div> : name}
        <div className="mt-0.5 text-[14px] leading-5 text-ink-secondary">{purpose}</div>
      </div>
      <div className="min-w-0 flex-[1_1_320px] max-md:col-span-2">{field}</div>
      <div className="flex min-h-11 flex-[0_0_200px] flex-col justify-center max-md:col-start-2 max-md:row-start-1 max-md:min-h-0 max-md:items-end max-md:justify-start max-md:pt-1 max-md:text-right">
        {status}
      </div>
      <div className="flex min-h-11 flex-[0_0_144px] items-center max-md:col-span-2 max-md:empty:hidden">{extra}</div>
    </div>
  );
}
