"use client";

import { useEffect, type ReactNode } from "react";
import { Footer } from "@/components/header/Footer";
import { Header } from "@/components/header/Header";
import { RunStatusProvider } from "@/components/header/RunStatusProvider";
import { CommandProvider } from "@/components/search/CommandProvider";
import { canRunNow } from "@/lib/readiness";
import { startRunner } from "@/lib/runs/runner";
import { runStatus } from "@/lib/runs/status";
import { usePageData } from "@/lib/vault/live";
import { exploreSample } from "@/lib/demo/open";
import { startPwa } from "@/lib/pwa";
import { getVaultState, startVault } from "@/lib/vault/session";
import { Notices } from "./Notices";
import { useAutoLock } from "./useAutoLock";
import { useVault } from "./useVault";
import { RecoveryCodeScreen, VaultScreen } from "./VaultScreen";

// Every app page sits inside this. Until the vault is open it shows the vault
// screen instead, so no page reads the database before there is one.
export function AppShell({ children }: { children: ReactNode }) {
  const vault = useVault();
  useEffect(() => {
    startPwa();
    void startVault().then(() => {
      // /sample opens the sample workspace straight away, for sharing.
      const { status } = getVaultState();
      if (window.location.pathname.replace(/\/$/, "") === "/sample" && status !== "open" && status !== "elsewhere") void exploreSample();
    });
  }, []);
  useAutoLock(vault.status === "open");

  if ((vault.status !== "open" && vault.status !== "demo") || !vault.workspaceId) return <VaultScreen state={vault} />;
  if (vault.recoveryCode) return <RecoveryCodeScreen code={vault.recoveryCode} />;
  return (
    <OpenApp key={vault.user?.id ?? "sample"} workspaceId={vault.workspaceId} demo={vault.status === "demo"} saveError={vault.saveError}>
      {children}
    </OpenApp>
  );
}

type OpenProps = { workspaceId: string; demo: boolean; saveError: string | null; children: ReactNode };

function OpenApp({ workspaceId, demo, saveError, children }: OpenProps) {
  // The sample workspace never runs: it has no keys and no network.
  useEffect(() => (demo ? undefined : startRunner()), [demo]);
  const { status, canRun } = usePageData(() => ({ status: runStatus(workspaceId), canRun: canRunNow(workspaceId) }), workspaceId);
  return (
    <RunStatusProvider initial={status} canRun={canRun}>
      <CommandProvider>
        <div className="flex min-h-screen flex-col">
          <Header demo={demo} />
          {demo ? null : <Notices saveError={saveError} />}
          <main className="flex-1">{children}</main>
          <Footer demo={demo} />
        </div>
      </CommandProvider>
    </RunStatusProvider>
  );
}
