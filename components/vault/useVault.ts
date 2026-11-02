"use client";

import { useSyncExternalStore } from "react";
import { getServerVaultState, getVaultState, subscribeVault, type VaultState } from "@/lib/vault/session";

export function useVault(): VaultState {
  return useSyncExternalStore(subscribeVault, getVaultState, getServerVaultState);
}

/** The open workspace's ID. Only for components inside AppShell, which renders them only while one is open. */
export function useWorkspaceId(): string {
  const { workspaceId } = useVault();
  if (!workspaceId) throw new Error("The vault is locked.");
  return workspaceId;
}
