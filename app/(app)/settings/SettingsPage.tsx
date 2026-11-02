"use client";

import { useState } from "react";
import { BackupSection } from "@/components/settings/BackupSection";
import { BusinessSection } from "@/components/settings/BusinessSection";
import { BrowserSection } from "@/components/settings/BrowserSection";
import { DangerSection } from "@/components/settings/DangerSection";
import { KeysSection } from "@/components/settings/KeysSection";
import { Section } from "@/components/settings/Section";
import { YouSection } from "@/components/settings/YouSection";
import { buttonClasses } from "@/components/ui/Button";
import { useVault, useWorkspaceId } from "@/components/vault/useVault";
import { keyRows } from "@/lib/connections/overview";
import { restartSample } from "@/lib/demo/open";
import { usePageData } from "@/lib/vault/live";
import { leaveDemo } from "@/lib/vault/session";

export function SettingsPage() {
  const vault = useVault();
  const workspaceId = useWorkspaceId();
  const rows = usePageData(() => keyRows(workspaceId), workspaceId);

  return (
    <>
      <section className="px-gutter pt-32 max-md:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-10 max-md:gap-y-4">
          <h1 className="sh-in type-page-title-xl m-0">Settings</h1>
          <p className="sh-in sh-d1 type-lede mt-2.5 mb-0 max-w-[540px]">
            {vault.user ? "Your account, your keys, and the data this browser keeps for you." : "The sample workspace is made-up data that never leaves this browser."}
          </p>
        </div>
      </section>
      {vault.user ? (
        <>
          <YouSection user={vault.user} />
          <BusinessSection />
          <KeysSection rows={rows} />
          <BrowserSection />
          <BackupSection email={vault.user.email} />
          <DangerSection user={vault.user} />
        </>
      ) : (
        <SampleSettings />
      )}
    </>
  );
}

function SampleSettings() {
  const [busy, setBusy] = useState(false);
  return (
    <Section id="sample" title="Sample workspace" lede="Nothing here reaches the network, and no keys can be added." className="mt-32 max-md:mt-16">
      <p className="m-0 max-w-[560px] text-[15px] leading-[22px]">Create an account to find real leads with your own keys. Your data stays encrypted in your browser.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => void leaveDemo({ signUp: true })} className={buttonClasses({ variant: "primary" })}>
          Create account
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await restartSample();
            setBusy(false);
          }}
          className={buttonClasses()}
        >
          {busy ? "Restarting…" : "Start the sample again"}
        </button>
      </div>
    </Section>
  );
}
