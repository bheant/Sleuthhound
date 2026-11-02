import Link from "next/link";
import { StatusDot, type DotStatus } from "@/components/ui/StatusDot";
import type { ServiceItem } from "@/lib/home/services";

const TONE: Record<DotStatus, string> = {
  ok: "text-ink-muted",
  off: "text-ink-muted",
  testing: "text-ink-muted",
  error: "text-error-ink",
  awaiting: "text-overdue",
};

// Every source and service with its status in words beside the dot.
export function ServicesLine({ services }: { services: ServiceItem[] }) {
  return (
    <section
      aria-label="Sources and services"
      className="sh-in sh-d4 mx-gutter mt-36 flex flex-col items-start gap-4 pt-6 text-[14px] leading-5 max-md:mt-20 max-md:border-t max-md:border-subtle max-md:pt-8"
    >
      <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-3 p-0 max-md:flex-col">
        {services.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <StatusDot status={s.dot} />
            <span>{s.name}</span>
            <span className={TONE[s.dot]}>{s.text}</span>
          </li>
        ))}
      </ul>
      <Link href="/connections" className="link-quiet">
        Manage connections
      </Link>
    </section>
  );
}
