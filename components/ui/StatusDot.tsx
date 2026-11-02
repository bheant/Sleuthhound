export type DotStatus = "ok" | "off" | "testing" | "error" | "awaiting";

const looks: Record<DotStatus, string> = {
  ok: "bg-ok border-ok",
  off: "bg-transparent border-control",
  testing: "bg-ink-secondary border-ink-secondary sh-pulse",
  error: "bg-error border-error",
  awaiting: "bg-transparent border-overdue",
};

type Props = { status: DotStatus; label?: string; className?: string };

// 8px status light. Never the only signal: pass `label` when no text sits beside it.
export function StatusDot({ status, label, className = "" }: Props) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} title={label}>
      <span aria-hidden className={`block size-2 rounded-full border ${looks[status]}`} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
