"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchButton } from "@/components/search/SearchButton";
import { Crosshair } from "@/components/ui/Crosshair";
import { SessionLinks } from "./Footer";
import { isCurrent, useLinks } from "./NavLinks";

// The phone header: the name, then Search and Menu as 44px squares. Menu opens
// a full-screen sheet with the pages, Settings, and the email with Log out. Run now moves
// into the pages that have it.

const square =
  "press flex size-11 cursor-pointer items-center justify-center border border-bright bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-black";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
      <Crosshair size={22} />
      <span className="text-[18px] leading-6 tracking-[-0.01em]">Sleuthhound</span>
    </Link>
  );
}

export function PhoneHeader({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  const links = useLinks();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // Following a link closes the sheet.
  if (open && pathname !== openedAt) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const button = menuButton.current;
    sheet.current?.querySelector<HTMLElement>("nav a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      button?.focus();
    };
  }, [open]);

  function toggle() {
    setOpenedAt(pathname);
    setOpen((o) => !o);
  }

  // The same bar tops the page and the sheet; only the page's Menu button
  // holds the ref, so focus goes back to it when the sheet closes.
  const bar = (inSheet: boolean) => (
    <div className="flex h-11 items-center justify-between">
      <Brand />
      <div className="flex">
        <SearchButton className={square} />
        <button
          ref={inSheet ? undefined : menuButton}
          type="button"
          aria-label={open ? "Close menu" : "Menu"}
          aria-expanded={open}
          aria-controls="phone-menu"
          onClick={toggle}
          className={`${square} border-l-0`}
        >
          {open ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <header className="px-gutter pt-4 md:hidden">
      {bar(false)}
      {open ? (
        <div
          id="phone-menu"
          ref={sheet}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="sh-fade fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black px-gutter pt-4 pb-8"
        >
          {bar(true)}
          <nav aria-label="Main" className="mt-14">
            <ul className="m-0 list-none border-t border-subtle p-0">
              {links.map(({ href, label }) => {
                const current = isCurrent(pathname, href);
                return (
                  <li key={href} className="border-b border-subtle">
                    <Link
                      href={href}
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex h-[68px] items-center justify-between text-[28px] leading-9 font-light no-underline ${
                        current ? "text-ink" : "text-ink-nav hover:text-ink"
                      }`}
                    >
                      {label}
                      {current ? <span aria-hidden className="size-2 bg-data" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-auto pt-16">
            <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3.5 text-[17px] text-ink no-underline hover:text-white">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" />
                <rect x="4.75" y="2.75" width="3.5" height="3.5" fill="currentColor" />
                <rect x="10.25" y="7.25" width="3.5" height="3.5" fill="currentColor" />
                <rect x="6.25" y="11.75" width="3.5" height="3.5" fill="currentColor" />
              </svg>
              Settings
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-4 text-[14px] leading-5 text-ink-muted">
              <SessionLinks demo={demo} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
