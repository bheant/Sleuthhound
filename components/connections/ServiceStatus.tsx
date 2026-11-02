import { StatusDot, type DotStatus } from "@/components/ui/StatusDot";

type Props = { dot: DotStatus; text: string; sub?: string | null };

const TEXT_TONE: Record<DotStatus, string> = {
  ok: "text-ink",
  off: "text-ink-secondary",
  testing: "text-ink",
  error: "text-error-ink",
  awaiting: "text-overdue",
};

// The status column: a dot, what it means in words, and an optional quiet line.
export function ServiceStatus({ dot, text, sub }: Props) {
  return (
    <>
      <div className="flex items-center gap-2.5" aria-live="polite">
        <StatusDot status={dot} />
        <span className={`text-[15px] ${TEXT_TONE[dot]}`}>{text}</span>
      </div>
      {sub ? <span className="ml-[18px] text-[13px] leading-[18px] text-ink-muted">{sub}</span> : null}
    </>
  );
}
