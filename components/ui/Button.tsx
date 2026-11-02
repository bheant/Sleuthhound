import type { ComponentPropsWithRef } from "react";

type Variant = "outline" | "primary" | "solid" | "danger";
type Size = "sm" | "md" | "lg";
type Edge = "control" | "bright";

const base =
  "press inline-flex items-center justify-center gap-2 rounded-none border font-sans whitespace-nowrap cursor-pointer disabled:cursor-default";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[14px]",
  md: "h-11 min-w-[104px] px-6 text-[15px]",
  lg: "h-[52px] px-7 text-[18px]",
};

const outlineEdges: Record<Edge, string> = {
  control: "border-control",
  bright: "border-bright",
};

function variantClasses(variant: Variant, edge: Edge): string {
  switch (variant) {
    case "primary":
      return "bg-primary border-primary-edge text-white font-medium hover:not-disabled:bg-primary-hover disabled:opacity-45";
    case "solid":
      return "bg-primary-edge border-primary-edge text-white font-medium hover:not-disabled:bg-primary-hover hover:not-disabled:border-primary-hover disabled:opacity-45";
    case "danger":
      return "bg-transparent border-error text-error-ink hover:not-disabled:bg-error hover:not-disabled:border-error hover:not-disabled:text-black";
    default:
      return `bg-transparent ${outlineEdges[edge]} text-ink hover:not-disabled:bg-ink hover:not-disabled:border-ink hover:not-disabled:text-black disabled:opacity-50`;
  }
}

export function buttonClasses({
  variant = "outline",
  size = "md",
  edge = "control",
  className = "",
}: { variant?: Variant; size?: Size; edge?: Edge; className?: string } = {}): string {
  return `${base} ${sizes[size]} ${variantClasses(variant, edge)} ${className}`.trim();
}

type Props = ComponentPropsWithRef<"button"> & { variant?: Variant; size?: Size; edge?: Edge };

// Outline buttons invert on hover. Primary is the deep blue main action;
// solid is the filled blue call to action on Home ("Replace the key…").
export function Button({ variant, size, edge, className, type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClasses({ variant, size, edge, className })} {...rest} />;
}
