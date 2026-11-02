import type { ReactNode } from "react";

type Props = { title: string; children?: ReactNode; action?: ReactNode; className?: string };

// A 1px error border, no red fill: what happened, then one action.
export function ErrorBlock({ title, children, action, className = "" }: Props) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border border-error px-7 py-6 ${className}`}
    >
      <div className="flex min-w-0 items-baseline gap-4">
        <span aria-hidden className="size-2 shrink-0 -translate-y-[3px] rounded-full bg-error" />
        <div>
          <p className="m-0 text-[22px] leading-[30px] font-light">{title}</p>
          {children ? <p className="mt-1 mb-0 text-ink-secondary">{children}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
