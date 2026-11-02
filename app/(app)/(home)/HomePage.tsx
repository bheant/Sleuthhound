"use client";

import { PhoneRunNow } from "@/components/header/PhoneRunNow";
import { FirstVisit } from "@/components/home/FirstVisit";
import { SetupChecklist } from "@/components/home/SetupChecklist";
import { HomeFigures } from "@/components/home/HomeFigures";
import { RunOverview } from "@/components/home/RunOverview";
import { RunSteps } from "@/components/home/RunSteps";
import { RunStopped } from "@/components/home/RunStopped";
import { ServicesLine } from "@/components/home/ServicesLine";
import { useVault, useWorkspaceId } from "@/components/vault/useVault";
import { defaultAiName } from "@/lib/ai/provider";
import { firstNameOf, formatLongDay, formatTime, formatWhen } from "@/lib/format/time";
import { setupChecklist } from "@/lib/home/checklist";
import { homePageData } from "@/lib/home/page";
import { canRunNow } from "@/lib/readiness";
import { homeRuns } from "@/lib/runs/home";
import { nextScheduledRun } from "@/lib/runs/status";
import { usePageData } from "@/lib/vault/live";

function upToDate(nextRunAt: string | null, now: Date): string {
  if (!nextRunAt) return "You’re up to date.";
  const when = formatWhen(nextRunAt, now);
  return `You’re up to date. Next run ${when.includes(" at ") ? "on" : "at"} ${when}.`;
}

function read(workspaceId: string) {
  const now = new Date();
  const next = nextScheduledRun(workspaceId);
  return {
    now,
    next,
    runs: homeRuns(workspaceId),
    data: homePageData(workspaceId, next, now),
    ready: canRunNow(workspaceId),
    aiName: defaultAiName(workspaceId),
    checklist: setupChecklist(workspaceId),
  };
}

export function HomePage() {
  const workspaceId = useWorkspaceId();
  const vault = useVault();
  const name = vault.user?.name;
  const firstName = name ? firstNameOf(name) : "";
  const { now, next, runs, data, ready, aiName, checklist } = usePageData(() => read(workspaceId), workspaceId);
  // New accounts only: the sample workspace has no account.
  const showChecklist = checklist.show && vault.status === "open";
  // Before setup nothing will run, so there's no run time to show.
  const idleLine = data.hasFinishedRun || ready ? runs.idleLine : null;

  return (
    <>
      <section className="px-gutter pt-24 max-md:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-8">
          <h1 className="sh-in type-page-title m-0">{data.hasFinishedRun ? "Welcome back" : "Welcome"}
            {firstName ? `, ${firstName}` : null}
          </h1>
          <div className="sh-in sh-d1 mt-1.5 max-w-[420px]">
            <p className="m-0 text-[clamp(20px,1.8vw,26px)] leading-[1.3] font-light">{formatLongDay(now)}</p>
            <RunSteps idle={idleLine ? <p className="mt-1.5 mb-0 text-ink-secondary tabular-nums">{idleLine}</p> : null} />
          </div>
        </div>
        {showChecklist ? <SetupChecklist checklist={checklist} /> : null}
        <PhoneRunNow className="sh-in sh-d1 mt-10" />
        {data.hasFinishedRun ? <HomeFigures figures={data.figures} /> : null}
      </section>

      {runs.stopped ? <RunStopped stopped={runs.stopped} /> : null}

      {data.hasFinishedRun ? (
        <>
          <RunOverview
            chart={data.chart}
            summaries={data.summaries}
            lastGoodId={data.lastGoodId}
            latestFailed={data.latestFailed}
            waiting={data.figures.waiting}
            conversations={data.figures.conversations}
            upToDate={upToDate(next, now)}
            afterStopped={runs.stopped !== null}
          />
          <ServicesLine services={data.services} />
        </>
      ) : (
        <FirstVisit ready={ready} nextRun={next ? formatTime(next) : null} aiName={aiName} />
      )}
    </>
  );
}
