"use client";

import { useSearchParams } from "next/navigation";
import { CompaniesWorkspace } from "@/components/companies/CompaniesWorkspace";
import { useWorkspaceId } from "@/components/vault/useVault";
import type { Tab } from "@/lib/targets/filters";
import { companiesPageData } from "@/lib/targets/workspace";
import { usePageData } from "@/lib/vault/live";

const TABS = new Set<Tab>(["new", "kept", "discarded", "conversations"]);

export function CompaniesPage() {
  const params = useSearchParams();
  const c = params.get("c");
  const tab = params.get("tab");
  const workspaceId = useWorkspaceId();
  const data = usePageData(() => companiesPageData(workspaceId, c), `${workspaceId}:${c ?? ""}`);
  const startTab = tab && TABS.has(tab as Tab) ? (tab as Tab) : null;
  return <CompaniesWorkspace {...data} focusId={c} startTab={startTab} />;
}
