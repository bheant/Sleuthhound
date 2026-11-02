"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const base = "press flex size-[52px] cursor-pointer items-center justify-center border border-l-0";

// The Settings button: white while the Settings page is open.
export function SettingsButton() {
  const here = usePathname() === "/settings";
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={here ? "page" : undefined}
      className={`${base} ${here ? "border-ink bg-ink text-black" : "border-bright bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black"}`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4.75" y="2.75" width="3.5" height="3.5" fill="currentColor" />
        <rect x="10.25" y="7.25" width="3.5" height="3.5" fill="currentColor" />
        <rect x="6.25" y="11.75" width="3.5" height="3.5" fill="currentColor" />
      </svg>
    </Link>
  );
}
