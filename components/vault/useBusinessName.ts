"use client";

import { getBusinessName } from "@/lib/business/store";
import { usePageData } from "@/lib/vault/live";
import { useWorkspaceId } from "./useVault";

/** The business name from Settings, or null. Updates as soon as it's saved. */
export function useBusinessName(): string | null {
  const workspaceId = useWorkspaceId();
  return usePageData(() => getBusinessName(workspaceId), workspaceId);
}
