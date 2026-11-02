import type { CSSProperties } from "react";

type Props = { className?: string; style?: CSSProperties; label?: string };

// A field-coloured block that pulses slowly while content loads. Size it with className.
export function LoadingBlock({ className = "", style, label }: Props) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={`sh-loading block border border-faint bg-field ${className}`}
      style={style}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
