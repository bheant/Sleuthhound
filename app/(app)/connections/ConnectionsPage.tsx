"use client";

import { ActivityLog } from "@/components/connections/ActivityLog";
import { ConnectionsBoard } from "@/components/connections/ConnectionsBoard";
import { RunFigures } from "@/components/connections/RunFigures";
import { PhoneRunNow } from "@/components/header/PhoneRunNow";
import { buttonClasses } from "@/components/ui/Button";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { useWorkspaceId } from "@/components/vault/useVault";
import { WizardProvider } from "@/components/wizard/WizardProvider";
import { connectionsOverview } from "@/lib/connections/overview";
import { sourceDetails, sourceRows } from "@/lib/sources/detail";
import { catalogueData } from "@/lib/sources/wizard";
import { usePageData } from "@/lib/vault/live";

function read(workspaceId: string) {
  return {
    o: connectionsOverview(workspaceId),
    rows: sourceRows(workspaceId),
    details: sourceDetails(workspaceId),
    catalogue: catalogueData(workspaceId),
  };
}

export function ConnectionsPage() {
  const workspaceId = useWorkspaceId();
  const { o, rows, details, catalogue } = usePageData(() => read(workspaceId), workspaceId);

  return (
    <>
      {o.failed ? (
        <ErrorBlock
          className="sh-in mx-gutter mt-16"
          title={`The ${o.failed.at} run stopped at ${o.failed.actor}`}
          action={
            o.failed.keyAnchor ? (
              <a href={o.failed.keyAnchor} className={buttonClasses({ edge: "bright", className: "no-underline" })}>
                Replace key
              </a>
            ) : null
          }
        >
          {o.failed.keyAnchor ? "Replace the key below, then run again." : "See the activity below, then run again."}
        </ErrorBlock>
      ) : null}

      <section className={`px-gutter ${o.failed ? "pt-24 max-md:pt-10" : "pt-32 max-md:pt-14"}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-10 max-md:gap-y-4">
          <h1 className="sh-in type-page-title-xl m-0">Connections</h1>
          <p className="sh-in sh-d1 type-lede mt-2.5 mb-0 max-w-[540px]">
            The services Sleuthhound reads from and writes to. Companies House and one AI are enough to start.
          </p>
        </div>
        <RunFigures figures={o.figures} />
        <PhoneRunNow className="sh-in sh-d2 mt-10" />
      </section>

      <WizardProvider catalogue={catalogue}>
        <ConnectionsBoard
          keys={o.keys}
          defaultAi={o.defaultAi}
          sources={o.sources}
          sourceRows={rows}
          sourceDetails={details}
          showFirstRunBanner={o.showFirstRunBanner}
        />
      </WizardProvider>

      <ActivityLog rows={o.log} ready={o.ready} />
    </>
  );
}
