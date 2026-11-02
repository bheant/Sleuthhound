import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

type Props = { ready: boolean; nextRun: string | null; aiName: string };

// Before the first run: what happens once services are connected, and the
// one way forward.
export function FirstVisit({ ready, nextRun, aiName }: Props) {
  return (
    <section aria-labelledby="first-h" className="sh-in sh-d2 mx-gutter mt-[120px] pt-8">
      <h2 id="first-h" className="m-0 text-[15px] leading-[22px] font-normal text-ink-secondary">
        Nothing has run yet
      </h2>
      <p className="mt-5 mb-0 max-w-[880px] text-[clamp(28px,3vw,40px)] leading-[1.2] font-light tracking-[-0.02em]">
        {ready
          ? `Companies House and ${aiName} are connected. The first run starts ${nextRun ? `at ${nextRun}` : "on the hour"}, or press Run now. A summary of each run will appear here.`
          : "Connect Companies House and one AI, and Sleuthhound will look for new companies every hour. A summary of each run will appear here."}
      </p>
      {ready ? null : (
        <Link
          href="/connections"
          className={buttonClasses({ variant: "solid", size: "lg", className: "mt-10 text-[17px]! no-underline" })}
        >
          Go to connections
        </Link>
      )}
    </section>
  );
}
