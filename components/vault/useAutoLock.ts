"use client";

import { useEffect } from "react";
import { isHeldOpen, lockVault, vaultMeta } from "@/lib/vault/session";

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const CHECK_MS = 15_000;

// Locks the vault after the chosen minutes without a click, key or scroll.
// A run in progress holds it open until it ends.
export function useAutoLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let minutes = 30;
    // Read each time, so a change in Settings applies without a reload.
    const readMinutes = () =>
      void vaultMeta().then((meta) => {
        if (meta) minutes = meta.autoLockMinutes;
      });
    readMinutes();
    const seen = () => (last = Date.now());
    for (const e of EVENTS) window.addEventListener(e, seen, { passive: true });
    const timer = setInterval(() => {
      readMinutes();
      if (Date.now() - last < minutes * 60_000) return;
      if (isHeldOpen()) return;
      void lockVault();
    }, CHECK_MS);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, seen);
      clearInterval(timer);
    };
  }, [enabled]);
}
