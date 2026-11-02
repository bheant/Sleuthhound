"use client";

import { useSearchParams } from "next/navigation";
import { ClientsBody } from "@/components/clients/ClientsBody";
import { IdealClientBox } from "@/components/clients/IdealClientBox";
import { LookalikesControl } from "@/components/clients/LookalikesControl";
import { UploadClientsButton } from "@/components/clients/UploadClientsButton";
import { PhoneRunNow } from "@/components/header/PhoneRunNow";
import { useBusinessName } from "@/components/vault/useBusinessName";
import { useWorkspaceId } from "@/components/vault/useVault";
import { WizardProvider } from "@/components/wizard/WizardProvider";
import { clientsOf } from "@/lib/business/name";
import { clientsPage } from "@/lib/clients/page";
import { formatWhen } from "@/lib/format/time";
import { getSetting } from "@/lib/settings";
import { catalogueData } from "@/lib/sources/wizard";
import { usePageData } from "@/lib/vault/live";

function read(workspaceId: string) {
  const lastSearch = getSetting(workspaceId, "lookalikes_last_at");
  return {
    data: clientsPage(workspaceId),
    catalogue: catalogueData(workspaceId),
    daily: getSetting(workspaceId, "lookalikes_daily"),
    lastAt: lastSearch ? formatWhen(lastSearch) : null,
  };
}

export function ClientsPage() {
  const c = useSearchParams().get("c");
  const workspaceId = useWorkspaceId();
  const business = useBusinessName();
  const { data, catalogue, daily, lastAt } = usePageData(() => read(workspaceId), workspaceId);
  const f = data.figures;
  const figures: Array<[string, string]> = [
    ["Clients", String(f.clients)],
    ["Lookalike leads, last 8 weeks", String(f.leads)],
    ["Kept", f.kept],
    ["Client list uploaded", f.uploaded ?? "Not yet"],
  ];

  return (
    <WizardProvider catalogue={catalogue}>
      <section className="px-gutter pt-32 max-md:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-10 max-md:gap-y-4">
          <h1 className="sh-in type-page-title-xl m-0">Clients</h1>
          <p className="sh-in sh-d1 type-lede mt-2.5 mb-0 max-w-[540px]">
            What {clientsOf(business)} have in common, and which of them today’s leads resemble.
          </p>
        </div>
        {f.clients > 0 ? (
          <dl className="sh-in sh-d2 mt-20 mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5 tabular-nums max-md:mt-12 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-5">
            {figures.map(([label, value]) => (
              <div key={label} className="pl-4 max-md:pl-0">
                <dt className="text-ink-nav">{label}</dt>
                <dd className="m-0">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <PhoneRunNow className="sh-in sh-d2 mt-10" />
      </section>

      {f.clients === 0 ? (
        <section className="mx-gutter mt-32 border-t border-rule pt-14 pb-10 max-md:mt-16 max-md:pt-10">
          <p className="sh-in m-0 max-w-[780px] text-[clamp(28px,3vw,44px)] leading-[1.2] font-light">
            Upload your client list to teach the AI what a good client looks like.
          </p>
          <p className="sh-in sh-d1 mt-5 mb-0 text-ink-secondary">Until then, leads are scored on general signs of needing an accountant.</p>
          <UploadClientsButton />
        </section>
      ) : (
        <>
          <IdealClientBox ideal={data.ideal} />
          <ClientsBody
            clients={data.clients}
            universe={data.universe}
            focusId={c}
            action={<LookalikesControl daily={daily} lastAt={lastAt} analysed={data.clients.filter((x) => x.analysedAt && !x.isDemo).length} />}
          />
        </>
      )}
    </WizardProvider>
  );
}
