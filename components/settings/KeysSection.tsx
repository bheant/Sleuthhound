"use client";

import { useKeyRows } from "@/components/connections/useKeyRows";
import type { KeyRowData } from "@/components/connections/ConnectionsBoard";
import { KeyField } from "@/components/ui/KeyField";
import { KEY_PAGES, SERVICE_VENDOR } from "@/lib/credentials/services";
import { Section } from "./Section";

// API keys: one field per provider, the same as on Connections. A key is
// stored only in this browser's encrypted vault and goes only to its own
// provider (Apollo and HubSpot by way of Sleuthhound's pass-through, as they
// block browsers).

const NAMES: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  xai: "Grok",
  companies_house: "Companies House",
  apollo: "Apollo",
  hubspot: "HubSpot",
};

export function KeysSection({ rows }: { rows: KeyRowData[] }) {
  const { fieldStatus, errorFor, test, remove } = useKeyRows();
  return (
    <Section
      id="keys"
      title="API keys"
      lede="Stored encrypted in this browser and sent only to the service each belongs to. Paste a key, then Test."
      className="mt-32 max-md:mt-16"
    >
      <ul className="m-0 flex list-none flex-col gap-8 p-0">
        {rows.map((row) => (
          <li key={row.service} className="max-w-[560px]">
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <p className="m-0 text-[15px] leading-[22px]">
                {NAMES[row.service]}
                {SERVICE_VENDOR[row.service] !== NAMES[row.service] ? <span className="text-ink-secondary"> ({SERVICE_VENDOR[row.service]})</span> : null}
              </p>
              <a
                href={KEY_PAGES[row.service]}
                target="_blank"
                rel="noopener noreferrer"
                className="link-quiet shrink-0 text-[14px] leading-5 text-ink-secondary hover:text-ink"
              >
                {row.last4 ? "Manage keys" : "Get a key"}
                <span className="sr-only"> at {SERVICE_VENDOR[row.service]} (opens in a new tab)</span>
              </a>
            </div>
            <KeyField
              id={`settings-key-${row.service}`}
              serviceName={NAMES[row.service]}
              placeholder={row.last4 ? "Paste a new key" : "Paste API key"}
              status={fieldStatus(row)}
              last4={row.last4}
              error={errorFor(row)}
              removeNote="The key is deleted from this browser. Anything that needs it stops until a key is added again."
              onTest={(key) => test(row.service, key)}
              onRemove={() => remove(row.service)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
