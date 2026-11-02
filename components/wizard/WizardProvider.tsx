"use client";

import { refresh } from "@/lib/vault/live";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CatalogueData, WizardStart } from "@/lib/sources/types";
import { closeAfterSlide } from "./SidePanel";
import { SourceWizard } from "./SourceWizard";

// Opens the Add source wizard from anywhere on a page: Add source, a source's
// Edit, or Upload clients. After a save it says what happens next.

type Value = { open: (start: WizardStart) => void };

const WizardContext = createContext<Value | null>(null);

export function WizardProvider({ catalogue, children }: { catalogue: CatalogueData; children: ReactNode }) {
  const [start, setStart] = useState<WizardStart | null>(null);
  const [n, setN] = useState(0);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function open(next: WizardStart) {
    opener.current = document.activeElement as HTMLElement | null;
    setNotice(null);
    setN((x) => x + 1);
    setStart(next);
  }

  function close(message?: string | null) {
    closeAfterSlide(setClosing, () => {
      setStart(null);
      opener.current?.focus();
      if (message) setNotice(message);
      refresh();
    });
  }

  return (
    <WizardContext.Provider value={{ open }}>
      {children}
      {start ? (
        <SourceWizard key={n} catalogue={catalogue} start={start} closing={closing} onClose={() => close()} onSaved={(message) => close(message)} />
      ) : null}
      {notice ? (
        <div role="status" className="sh-toast fixed bottom-8 left-gutter z-40 max-w-[520px] border border-strong bg-field px-5 py-4 text-[15px] leading-[22px]">
          {notice}
        </div>
      ) : null}
    </WizardContext.Provider>
  );
}

export function useWizard(): Value {
  const value = useContext(WizardContext);
  if (!value) throw new Error("useWizard must be used inside WizardProvider.");
  return value;
}
