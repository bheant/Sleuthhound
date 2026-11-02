import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean };

// 44px square-cornered toggle with a small square marker. Selected: primary fill
// and border, data-coloured marker. Used for the default AI, roles and score steps.
export function Toggle({ pressed, className = "", children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      data-on={pressed}
      className={`group press flex h-11 w-full cursor-pointer items-center gap-2.5 border px-3.5 text-[14px] leading-5 whitespace-nowrap ${
        pressed
          ? "cursor-default border-primary-edge bg-primary text-ink"
          : "border-rule bg-transparent text-ink-secondary hover:border-control hover:text-ink"
      } ${className}`}
      {...rest}
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 border transition-colors duration-150 ${
          pressed ? "border-data bg-data" : "border-control group-hover:border-ink-secondary"
        }`}
      />
      {children}
    </button>
  );
}
