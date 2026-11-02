"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { lockVault, vaultMeta } from "@/lib/vault/session";
import { setAutoLock } from "@/lib/vault/settings-actions";
import type { VaultMeta } from "@/lib/vault/storage";
import { inputClass, labelClass, Notice, Section } from "./Section";

// This browser: when it locks, Lock now, and whether the browser agreed to
// keep the data when space runs low.

const CHOICES = [5, 15, 30, 60, 120, 240];

const label = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`);

export function BrowserSection() {
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void vaultMeta().then((m) => setMeta(m ?? null));
  }, []);

  return (
    <Section id="browser" title="This browser" lede="Your data lives here, encrypted, and nowhere else. It locks itself when you step away." className="mt-32 max-md:mt-16">
      <div className="flex max-w-[360px] flex-col">
        <label htmlFor="auto-lock" className={labelClass}>
          Lock after no activity for
        </label>
        <select
          id="auto-lock"
          value={meta?.autoLockMinutes ?? 30}
          disabled={!meta}
          onChange={async (e) => {
            const minutes = Number(e.target.value);
            setMeta((m) => (m ? { ...m, autoLockMinutes: minutes } : m));
            const res = await setAutoLock(minutes);
            setSaved(res.ok ? "Saved" : res.message);
          }}
          className={`${inputClass} mt-2 cursor-pointer bg-black`}
        >
          {CHOICES.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
        <Notice text={saved} />
        <p className="mt-3 mb-0 text-[14px] leading-5 text-ink-muted">A run in progress keeps it unlocked until the run ends.</p>
      </div>
      <button type="button" onClick={() => void lockVault()} className={buttonClasses({ className: "mt-8" })}>
        Lock now
      </button>
      {meta?.persisted === false ? (
        <p className="mt-8 mb-0 max-w-[560px] border-l border-error pl-4 text-[14px] leading-5 text-ink-secondary">
          This browser hasn’t promised to keep Sleuthhound’s data if disk space runs low. Export a backup now and then, below, so nothing is lost.
        </p>
      ) : null}
    </Section>
  );
}
