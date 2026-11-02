"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { KeyField, type KeyStatus } from "@/components/ui/KeyField";
import { Toggle } from "@/components/ui/Toggle";
import type { DotStatus } from "@/components/ui/StatusDot";
import { setDefaultAi } from "@/lib/credentials/actions";
import type { AiProvider } from "@/lib/ai/provider";
import type { BoardKey } from "@/lib/connections/overview";
import type { KeyService } from "@/lib/credentials/services";
import type { SourceDetail, SourceRow } from "@/lib/sources/types";
import { closeAfterSlide } from "@/components/wizard/SidePanel";
import { useWizard } from "@/components/wizard/WizardProvider";
import { HubDiagram } from "./HubDiagram";
import { HubTree } from "./HubTree";
import { buildHub, type HubSourceInput } from "./hub-model";
import { Section, ServiceRow } from "./Section";
import { ServiceStatus } from "./ServiceStatus";
import { SourceDetailPanel } from "./SourceDetailPanel";
import { SourceRowItem } from "./SourceRows";
import { useKeyRows } from "./useKeyRows";

// The interactive part of Connections: the hub, the AI rows and the Data and
// apps rows share one view of each key (useKeyRows), including "testing" and
// "removing" while an action is in flight. Pages only ever see last4.

export type KeyRowData = {
  service: KeyService;
  status: "off" | "testing" | "connected" | "rejected";
  last4: string | null;
  message: string | null;
  /** "Key rejected" or "Test failed". */
  failedLabel: string;
  /** "Last used 14:03" or "Tested 14:03". */
  sub: string | null;
};

type Props = {
  keys: Record<BoardKey, KeyRowData>;
  defaultAi: AiProvider;
  sources: HubSourceInput[];
  sourceRows: SourceRow[];
  sourceDetails: SourceDetail[];
  showFirstRunBanner: boolean;
};

const REMOVE_NOTES: Partial<Record<KeyService, string>> = {
  companies_house: "Runs pause until Companies House is reconnected. Public register checks stop too.",
  apollo: "Find email stops working. Emails already found are kept.",
  hubspot: "Send to HubSpot stops working. Companies already sent stay in HubSpot.",
};

const AIS: { id: AiProvider; name: string; vendor: string }[] = [
  { id: "anthropic", name: "Claude", vendor: "Anthropic" },
  { id: "openai", name: "ChatGPT", vendor: "OpenAI" },
  { id: "xai", name: "Grok", vendor: "xAI" },
];

const DOT: Record<KeyStatus, DotStatus> = { off: "off", testing: "testing", connected: "ok", rejected: "error" };

export function ConnectionsBoard({ keys, defaultAi, sources, sourceRows, sourceDetails, showFirstRunBanner }: Props) {
  const [, startTransition] = useTransition();
  const wizard = useWizard();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailOpener = useRef<HTMLElement | null>(null);
  const detail = sourceDetails.find((d) => d.id === detailId) ?? null;

  function openDetail(id: string) {
    detailOpener.current = document.activeElement as HTMLElement | null;
    setDetailId(id);
  }

  function closeDetail(then?: () => void) {
    closeAfterSlide(setDetailClosing, () => {
      setDetailId(null);
      if (then) then();
      else detailOpener.current?.focus();
    });
  }
  const { keyState, fieldStatus, errorFor, test, remove } = useKeyRows();
  const [shownDefault, setShownDefault] = useOptimistic(defaultAi);

  function makeDefault(id: AiProvider) {
    startTransition(async () => {
      setShownDefault(id);
      await setDefaultAi(id);
    });
  }

  function removeNote(service: KeyService): string {
    if (service in REMOVE_NOTES) return REMOVE_NOTES[service] ?? "";
    return service === shownDefault
      ? "Reviews move to another connected AI, or runs pause until one is connected."
      : "It stops being on standby. The default AI carries on with every review.";
  }

  function statusFor(row: KeyRowData) {
    const s = fieldStatus(row);
    const text = { off: "Not connected", testing: "Testing…", connected: "Connected", rejected: row.failedLabel }[s];
    return <ServiceStatus dot={DOT[s]} text={text} sub={s === "connected" ? row.sub : null} />;
  }

  function keyField(row: KeyRowData, name: string) {
    return (
      <div id={`key-${row.service}`}>
        <KeyField
          id={`key-input-${row.service}`}
          serviceName={name}
          placeholder={row.last4 ? "Paste a new key" : "Paste API key"}
          status={fieldStatus(row)}
          last4={row.last4}
          error={errorFor(row)}
          removeNote={removeNote(row.service)}
          onTest={(key) => test(row.service, key)}
          onRemove={() => remove(row.service)}
        />
      </div>
    );
  }

  const hubKey = (row: KeyRowData) => ({ state: keyState(row), failedLabel: row.failedLabel, sub: row.sub });
  const hubNodes = buildHub({
    ais: AIS.map((ai) => ({ id: ai.id, name: ai.name, key: hubKey(keys[ai.id]), isDefault: ai.id === shownDefault })),
    companiesHouse: hubKey(keys.companies_house),
    apollo: hubKey(keys.apollo),
    hubspot: hubKey(keys.hubspot),
    sources,
  });

  const services = [...Object.values(keys).map((k) => fieldStatus(k) === "connected"), ...sources.map((s) => s.state === "connected")];
  const hubSummary = `${services.filter(Boolean).length} of ${services.length} services connected, public registers need no key`;

  return (
    <>
      <HubDiagram nodes={hubNodes} />
      <HubTree nodes={hubNodes} summary={hubSummary} />

      {showFirstRunBanner ? (
        <div role="status" className="sh-swap mx-gutter mt-24 border border-strong px-8 py-7 max-md:mt-10 max-md:px-4 max-md:py-5">
          <p className="m-0 text-[22px] leading-[30px] font-light max-md:text-[19px] max-md:leading-7">Connect Companies House and one AI to start the first run.</p>
        </div>
      ) : null}

      <Section id="ai-h" title="AI" lede="Reviews each new company and finds lookalikes of your clients. The default does every review.">
        {AIS.map((ai) => {
          const row = keys[ai.id];
          const isDefault = ai.id === shownDefault;
          return (
            <ServiceRow
              key={ai.id}
              name={ai.name}
              purpose={ai.vendor}
              field={keyField(row, ai.name)}
              status={statusFor(row)}
              extra={
                fieldStatus(row) === "connected" ? (
                  <Toggle pressed={isDefault} onClick={() => !isDefault && makeDefault(ai.id)}>
                    {isDefault ? "Default" : "Make default"}
                  </Toggle>
                ) : null
              }
            />
          );
        })}
      </Section>

      <Section
        id="data-h"
        title="Data and apps"
        lede="Where new companies and conversations come from, and where kept ones go. Public registers need no key and show up in the activity below."
      >
        <div className="flex justify-end pt-6">
          <Button onClick={() => wizard.open({ mode: "new" })} className="gap-2.5 px-5 max-md:h-[52px] max-md:w-full">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Add source
          </Button>
        </div>
        <ServiceRow
          name="Companies House"
          purpose="Company data (required)"
          field={keyField(keys.companies_house, "Companies House")}
          status={statusFor(keys.companies_house)}
        />
        {sourceRows.map((row) => (
          <SourceRowItem key={row.id} row={row} start={sourceDetails.find((d) => d.id === row.id)?.start ?? null} onOpen={() => openDetail(row.id)} />
        ))}
        <ServiceRow
          name="Apollo"
          purpose="Directors’ emails (optional)"
          field={keyField(keys.apollo, "Apollo")}
          status={statusFor(keys.apollo)}
        />
        <ServiceRow
          name="HubSpot"
          purpose="Sends kept companies (optional)"
          field={keyField(keys.hubspot, "HubSpot")}
          status={statusFor(keys.hubspot)}
        />
      </Section>

      {detail ? (
        <SourceDetailPanel
          key={detail.id}
          detail={detail}
          closing={detailClosing}
          onClose={() => closeDetail()}
          onEdit={(start) => closeDetail(() => wizard.open(start))}
          onRemoved={() => closeDetail()}
        />
      ) : null}
    </>
  );
}
