"use client";

import { useState, useTransition } from "react";
import { KeyField } from "@/components/ui/KeyField";
import { StatusDot } from "@/components/ui/StatusDot";
import { saveKey, removeKey } from "@/lib/credentials/actions";
import type { KeyService } from "@/lib/credentials/services";
import type { ConnectorInfo } from "@/lib/sources/types";
import { fieldClass, StepHeading, StepLede } from "./fields";

export type KeyState = { status: ConnectorInfo["keyStatus"]; last4: string | null };

type Props = {
  connector: ConnectorInfo;
  keyState: KeyState;
  onKeyState: (state: KeyState) => void;
};

const HELP: Record<string, string> = {
  companies_house: "Paste a REST key from your Companies House developer account. The Companies House row on Connections uses the same key.",
  reddit: "Create a script app in your Reddit account’s app settings, then paste its client ID and secret.",
};

// Connect: the same key field and Test as on Connections. Reddit takes a
// client ID and a secret, stored together, and then waits for approval.
export function ConnectStep({ connector, keyState, onKeyState }: Props) {
  const [, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const service = connector.credentialService as KeyService;

  function test(apiKey: string) {
    setTesting(true);
    setError(null);
    startTransition(async () => {
      const result = await saveKey(service, apiKey);
      setTesting(false);
      setError(result.ok ? null : result.message);
      onKeyState({ status: result.ok ? "connected" : "rejected", last4: apiKey.slice(-4) });
    });
  }

  const reddit = connector.key === "reddit";
  const connected = keyState.status === "connected";
  const awaiting = connector.availability === "needs_approval";

  return (
    <>
      <StepHeading>Connect {connector.label}</StepHeading>
      <StepLede>{HELP[connector.key] ?? `Paste the ${connector.label} key, then Test.`}</StepLede>

      {reddit ? (
        <>
          <label htmlFor="k-id" className="mt-6 mb-2 block text-[14px] text-ink-secondary">
            Client ID
          </label>
          <input id="k-id" className={fieldClass} autoComplete="off" spellCheck={false} placeholder="Paste the app’s client ID" value={clientId} disabled={testing} onChange={(e) => setClientId(e.target.value.trim())} />
          <label htmlFor="k-key" className="mt-5 mb-2 block text-[14px] text-ink-secondary">
            Secret
          </label>
          <form
            className="m-0 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (clientId && secret) test(`${clientId}:${secret}`);
            }}
          >
            <input id="k-key" type="password" className={`${fieldClass} min-w-0 flex-auto`} autoComplete="off" spellCheck={false} placeholder={keyState.last4 ? `Stored, ends ${keyState.last4}` : "Paste the secret"} value={secret} disabled={testing} onChange={(e) => setSecret(e.target.value.trim())} />
            <button
              type="submit"
              disabled={testing || !clientId || !secret}
              className="press h-11 min-w-[104px] flex-none cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-45"
            >
              {testing ? "Testing…" : "Test"}
            </button>
          </form>
        </>
      ) : (
        <div className="mt-6">
          <KeyField
            id={`wiz-key-${service}`}
            serviceName={connector.label}
            placeholder={keyState.last4 ? "Paste a new key" : "Paste API key"}
            status={testing ? "testing" : keyState.status === "testing" ? "rejected" : keyState.status}
            last4={keyState.last4}
            error={error}
            removeNote="Runs that use this key stop until it’s replaced."
            onTest={test}
            onRemove={() =>
              startTransition(async () => {
                await removeKey(service);
                onKeyState({ status: "off", last4: null });
              })
            }
          />
        </div>
      )}

      <div className="mt-3.5 flex items-center gap-2.5" role="status">
        {testing ? (
          <>
            <StatusDot status="testing" />
            <span className="text-[15px]">Testing…</span>
          </>
        ) : connected && awaiting ? (
          <>
            <StatusDot status="awaiting" />
            <span className="text-[15px] text-overdue">Awaiting approval</span>
          </>
        ) : connected ? (
          <>
            <StatusDot status="ok" />
            <span className="text-[15px]">Connected</span>
          </>
        ) : keyState.status === "rejected" ? (
          <>
            <StatusDot status="error" />
            <span className="text-[15px] text-error-ink">Key rejected</span>
          </>
        ) : (
          <>
            <StatusDot status="off" />
            <span className="text-[15px] text-ink-secondary">Not connected</span>
          </>
        )}
      </div>
      {reddit && error ? (
        <p role="alert" className="sh-swap mt-2 mb-0 text-[14px] leading-5 text-error-ink">
          {error}
        </p>
      ) : null}
      {awaiting ? (
        <div className="sh-swap mt-5 border border-strong px-5 py-[18px]">
          <p className="m-0 text-[15px] leading-[22px]">
            {connected ? `Keys accepted. ${connector.label} hasn’t approved commercial use yet.` : `${connector.label} hasn’t approved commercial use yet.`}
          </p>
          <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-secondary">
            You can finish setting this source up now{connected ? "" : ", and add the keys later"}. It’s saved but won’t run until {connector.label} grants access.
          </p>
        </div>
      ) : null}
    </>
  );
}
