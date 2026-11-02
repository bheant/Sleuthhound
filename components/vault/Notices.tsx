"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { backupDue } from "@/lib/vault/backup";
import { vaultMeta } from "@/lib/vault/session";
import { InstallPrompt } from "./InstallPrompt";

const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] leading-5 text-ink-secondary hover:text-ink";

// Quiet lines above the page: a save that failed, a backup that's due, and
// the one-time offer to install Sleuthhound.
export function Notices({ saveError }: { saveError: string | null }) {
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void vaultMeta().then((m) => setDue(Boolean(m && backupDue(m.lastBackupAt, m.createdAt))));
  }, []);

  return (
    <div className="mx-gutter mt-6 flex flex-col gap-2 text-[14px] leading-5 empty:hidden">
      {saveError ? (
        <p role="alert" className="m-0 border-l border-error pl-4 text-ink">
          {saveError}
        </p>
      ) : null}
      {due && !dismissed ? (
        <p role="status" className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-rule pl-4 text-ink-secondary">
          It’s been over two weeks since your last backup.
          <Link href="/settings#backup" onClick={() => setDismissed(true)} className={`${quiet} no-underline`}>
            Export one
          </Link>
          <button type="button" onClick={() => setDismissed(true)} className={quiet}>
            Not now
          </button>
        </p>
      ) : null}
      <InstallPrompt />
    </div>
  );
}
