type Props = { size: number; label?: string; className?: string };

// The Sleuthhound mark: a grey crosshair.
export function Crosshair({ size, label, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-300 -300 600 600"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle r="206" fill="none" stroke="var(--logo)" strokeWidth="52" />
      <path
        fill="var(--logo)"
        d="M-26.5 -294h53v186h-53zM-26.5 108h53v186h-53zM-294 -26.5h186v53h-186zM108 -26.5h186v53h-186z"
      />
    </svg>
  );
}
