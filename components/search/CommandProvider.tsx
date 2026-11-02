"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isTyping } from "./keys";
import { SearchDialog } from "./SearchDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";

// Search and the shortcuts panel, on every page. / and ⌘K open search, ? opens
// the shortcuts, Esc closes either. Both open from the keyboard, so they open
// and close instantly. Page shortcuts (J, K, Y, N…) check overlayOpen() and
// stand down while either is open.

type Value = {
  openSearch: () => void;
  openHelp: () => void;
  /** Read at event time, so a page's key handler sees the latest state. */
  overlayOpen: () => boolean;
};

const CommandContext = createContext<Value | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<"search" | "help" | null>(null);
  const openRef = useRef(open);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const show = useCallback((which: "search" | "help") => {
    if (!openRef.current && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    openRef.current = which;
    setOpen(which);
  }, []);

  // After opening a search result, the page it opens takes focus instead.
  const close = useCallback((restoreFocus = true) => {
    openRef.current = null;
    setOpen(null);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (restoreFocus && el?.isConnected) setTimeout(() => el.focus(), 0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current === "search") close();
        else show("search");
        return;
      }
      if (openRef.current === "help") {
        if (e.key === "Escape" || e.key === "?") {
          e.preventDefault();
          close();
        }
        return;
      }
      if (openRef.current || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        show("search");
      } else if (e.key === "?") {
        e.preventDefault();
        show("help");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, close]);

  const value = useMemo<Value>(
    () => ({ openSearch: () => show("search"), openHelp: () => show("help"), overlayOpen: () => openRef.current !== null }),
    [show],
  );

  return (
    <CommandContext.Provider value={value}>
      {children}
      {open === "search" ? <SearchDialog onClose={close} /> : null}
      {open === "help" ? <ShortcutsDialog onClose={() => close()} /> : null}
    </CommandContext.Provider>
  );
}

export function useCommands(): Value {
  const value = useContext(CommandContext);
  if (!value) throw new Error("useCommands must be used inside CommandProvider.");
  return value;
}
