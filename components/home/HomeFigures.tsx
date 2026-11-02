import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeFigures as Figures } from "@/lib/home/page";

// One quiet row of the day's counts under the welcome line. "Kept today", so
// it doesn't clash with the all-time Kept count on New Companies.
export function HomeFigures({ figures }: { figures: Figures }) {
  const rows: Array<[string, ReactNode]> = [
    ["Runs today", figures.runsToday],
    ["Companies found", figures.found],
    ["Kept today", figures.keptToday],
    ["Waiting for you", figures.waiting],
  ];
  if (figures.conversations > 0) {
    rows.push([
      "Conversations",
      <Link key="c" href="/companies?tab=conversations" className="link-quiet text-ink decoration-control">
        {figures.conversations} new
      </Link>,
    ]);
  }
  return (
    <dl className="sh-in sh-d2 mt-[72px] mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5 tabular-nums max-md:mt-12 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-5">
      {rows.map(([label, value]) => (
        <div key={label} className="pl-4 max-md:pl-0">
          <dt className="text-ink-nav">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
