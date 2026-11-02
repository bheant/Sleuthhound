"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { search, type SearchGroup, type SearchResult } from "@/lib/search/search";
import { requireWorkspace } from "@/lib/vault/workspace";
import { ScoreFigure } from "@/components/companies/ScoreFigure";

// One input, results grouped New companies and Clients, Recent when empty.
// Arrow keys move the highlight, Enter opens, Esc closes.

const RECENT_KEY = "sleuthhound.recent-search";
const RECENT_MAX = 5;

function readRecent(): SearchResult[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as SearchResult[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function remember(item: SearchResult) {
  try {
    const next = [item, ...readRecent().filter((r) => r.id !== item.id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private window or storage blocked: Recent just stays empty.
  }
}

export function SearchDialog({ onClose }: { onClose: (restoreFocus?: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [found, setFound] = useState<{ q: string; groups: SearchGroup[] } | null>(null);
  const [recent] = useState(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const timer = setTimeout(() => {
      try {
        setFound({ q: query, groups: search(requireWorkspace(), query.slice(0, 100)) });
      } catch {
        // Locked mid-search: the vault screen takes over.
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [q]);

  const query = q.trim();
  const groups = useMemo<SearchGroup[]>(() => {
    if (!query) return recent.length ? [{ label: "Recent", items: recent }] : [];
    return found?.groups ?? [];
  }, [query, recent, found]);
  const flat = groups.flatMap((g) => g.items);
  const settled = !query || found?.q === query;
  const active = Math.min(hi, Math.max(flat.length - 1, 0));

  function pick(item: SearchResult) {
    remember(item);
    onClose(false);
    router.push(item.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setHi((active + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) pick(flat[active]);
    }
  }

  let index = 0;
  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-scrim" onClick={() => onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative mx-auto mt-24 w-[min(880px,calc(100%-32px))] border border-strong bg-field"
      >
        <div className="flex h-14 items-center gap-3.5 border-b border-subtle pr-4 pl-5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="flex-none text-ink-secondary">
            <circle cx="10.5" cy="7.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6.8 11.2 2 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <label htmlFor="global-search" className="sr-only">
            Search companies and clients
          </label>
          <input
            ref={inputRef}
            id="global-search"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-list"
            aria-activedescendant={flat.length ? `sr-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search companies, directors, clients"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={onKeyDown}
            className="h-[54px] min-w-0 flex-auto border-0 bg-transparent p-0 font-sans text-[20px] font-light text-ink outline-none focus-visible:outline-none"
          />
          <span className="sh-key" aria-hidden>
            Esc
          </span>
        </div>
        <div id="global-search-list" role="listbox" aria-label="Results" className="max-h-[min(520px,calc(100vh-260px))] overflow-y-auto py-2">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p aria-hidden className="m-0 px-5 pt-3 pb-1.5 text-[13px] leading-[18px] text-ink-muted">
                {g.label}
              </p>
              {g.items.map((it) => {
                const i = index++;
                const on = i === active;
                return (
                  <div
                    key={`${g.label}-${it.id}`}
                    id={`sr-${i}`}
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(it)}
                    onMouseEnter={() => setHi(i)}
                    className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-5 py-[9px] ${on ? "bg-primary" : ""}`}
                  >
                    <span className="truncate text-[16px] leading-6 text-ink">{it.name}</span>
                    <span className="row-span-2 text-[17px]">{it.score !== null ? <ScoreFigure score={it.score} /> : null}</span>
                    <span className="truncate text-[13px] leading-[18px] text-ink-secondary">{it.sub}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {query && settled && flat.length === 0 ? (
            <div className="px-5 pt-8 pb-7">
              <p className="m-0 text-[18px] leading-[26px] font-light">Nothing matches “{query}”.</p>
              <p className="mt-1.5 mb-0 text-[14px] text-ink-secondary">Try a company name, number, director or borough.</p>
            </div>
          ) : null}
          {!query && flat.length === 0 ? (
            <p className="m-0 px-5 pt-6 pb-5 text-[14px] text-ink-secondary">Type a company name, number, director or borough.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-subtle px-5 py-3 text-[13px] leading-6 text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="sh-key" aria-hidden>
              ↑
            </span>
            <span className="sh-key" aria-hidden>
              ↓
            </span>
            Move
          </span>
          <span className="flex items-center gap-1.5">
            <span className="sh-key" aria-hidden>
              Enter
            </span>
            Open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="sh-key" aria-hidden>
              Esc
            </span>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
