"use client";

import { useState, useSyncExternalStore } from "react";
import { installWay, promptInstall, subscribeInstall } from "@/lib/pwa";

const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] leading-5 text-ink-secondary hover:text-ink";

// Offered once, after logging in. Installed, Sleuthhound opens like an app,
// and browsers are far less likely to clear an installed app's storage
// (Safari clears a site's data after a week without a visit otherwise).
const SEEN = "sleuthhound:install-prompt";

const INSTRUCTIONS = {
  "safari-mac": "In Safari, choose File, then Add to Dock.",
  "safari-ios": "Tap Share, then Add to Home Screen.",
} as const;

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // Storage blocked: it may show again next time.
  }
}

export function InstallPrompt() {
  const way = useSyncExternalStore(subscribeInstall, installWay, () => null);
  // Rendered only once the vault is open, never prerendered, so storage is there to read.
  const [seen, setSeen] = useState(readSeen);

  if (seen || !way) return null;
  const done = () => {
    markSeen();
    setSeen(true);
  };

  return (
    <p role="status" className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-rule pl-4 text-ink-secondary">
      <span>
        <span className="text-ink">Install Sleuthhound.</span> It opens like an app, and your browser is less likely to clear your data.
        {way !== "prompt" ? ` ${INSTRUCTIONS[way]}` : null}
      </span>
      {way === "prompt" ? (
        <button type="button" onClick={() => void promptInstall().then(done)} className={quiet}>
          Install
        </button>
      ) : null}
      <button type="button" onClick={done} className={quiet}>
        {way === "prompt" ? "Not now" : "Got it"}
      </button>
    </p>
  );
}
