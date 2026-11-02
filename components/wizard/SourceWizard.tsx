"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CsvField } from "@/lib/connectors/csv/fields";
import {
  checkCsvDuplicates,
  checkSourceScope,
  describeSource,
  previewNewSource,
  saveSource,
  suggestCsvMapping,
} from "@/lib/sources/actions";
import type { CatalogueData, DuplicateCheck, PreviewResult, WizardConfig, WizardStart } from "@/lib/sources/types";
import { ConnectStep, type KeyState } from "./ConnectStep";
import { CsvMap, groupFor } from "./CsvMap";
import { CsvUpload, type UploadInfo } from "./CsvUpload";
import { StepHeading, StepLede } from "./fields";
import { ScopeForm } from "./ScopeForm";
import { SidePanel } from "./SidePanel";
import { FixedMapStep, PickStep, PreviewStep, ScheduleStep, type ScheduleState } from "./Steps";

// The Add source wizard: a step list down the left, driven by the picked
// connector. Connect is hidden when no key is needed; uploading clients skips
// Pick and Describe; editing opens at Scope. Save writes the source and a
// version and queues its first run.

type StepId = "pick" | "connect" | "describe" | "scope" | "map" | "preview" | "schedule";

const LABELS: Record<StepId, string> = {
  pick: "Pick",
  connect: "Connect",
  describe: "Describe",
  scope: "Scope",
  map: "Map",
  preview: "Preview",
  schedule: "Schedule",
};

const LOOK_BACKS: Record<string, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

type Props = {
  catalogue: CatalogueData;
  start: WizardStart;
  closing: boolean;
  onClose: () => void;
  onSaved: (message: string | null) => void;
};

function stepsFor(needsKey: boolean, mode: WizardStart["mode"]): StepId[] {
  const all: StepId[] = ["pick", "connect", "describe", "scope", "map", "preview", "schedule"];
  return all.filter((s) => (s !== "connect" || needsKey) && !(mode === "clients" && (s === "pick" || s === "describe")));
}

function initialSchedule(start: WizardStart): ScheduleState {
  if (start.mode === "edit") {
    const c = start.config;
    return { schedule: c.schedule, maxItems: String(c.max_items), cap: c.spend_cap_gbp == null ? "" : String(c.spend_cap_gbp), weight: c.weight, rights: true };
  }
  // Daily by default, so a new source doesn't run reviews every hour unasked.
  return { schedule: "daily", maxItems: start.mode === "clients" ? "500" : "50", cap: "10", weight: "normal", rights: false };
}

export function SourceWizard({ catalogue, start, closing, onClose, onSaved }: Props) {
  const editing = start.mode === "edit";
  const startKey = start.mode === "edit" ? start.connector : start.mode === "clients" ? "csv" : null;
  const [connectorKey, setConnectorKey] = useState<string | null>(startKey);
  const connector = catalogue.connectors.find((c) => c.key === connectorKey) ?? null;
  const steps = stepsFor(connector?.needsKey ?? true, start.mode);
  const [step, setStep] = useState<StepId>(editing ? "scope" : steps[0]);
  const [done, setDone] = useState<Set<StepId>>(() => new Set(editing ? (["pick", "connect", "describe"] as StepId[]) : []));
  const [keyState, setKeyState] = useState<KeyState>({ status: connector?.keyStatus ?? "off", last4: connector?.key4 ?? null });

  const [describeText, setDescribeText] = useState(start.mode === "edit" ? (start.config.describe_text ?? "") : "");
  const [scope, setScope] = useState<Record<string, unknown>>(() =>
    start.mode === "edit" ? start.config.scope : start.mode === "clients" ? { ...(connector?.defaultScope ?? {}), purpose: "clients" } : {},
  );
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<Record<string, string>>({});

  // CSV
  const editScope = start.mode === "edit" ? start.config.scope : null;
  const [upload, setUpload] = useState<UploadInfo | null>(() =>
    editScope && start.mode === "edit" && start.connector === "csv"
      ? { ok: true, uploadId: String(editScope.uploadId), fileName: String(editScope.fileName), rowCount: Number(editScope.rowCount), headers: Object.keys(start.config.mapping ?? {}), samples: [] }
      : null,
  );
  const [mapping, setMapping] = useState<Record<string, CsvField>>(start.mode === "edit" ? (start.config.mapping ?? {}) : {});
  const [mapGroups, setMapGroups] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(start.mode === "edit" ? (start.config.mapping ?? {}) : {}).map(([c, f]) => [c, groupFor(f)])),
  );
  const [mapSuggested, setMapSuggested] = useState<Set<string>>(new Set());
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [mappedUpload, setMappedUpload] = useState<string | null>(upload?.uploadId ?? null);
  const [dup, setDup] = useState<DuplicateCheck | null>(null);
  const [dupOpen, setDupOpen] = useState<keyof DuplicateCheck | null>(null);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [schedule, setSchedule] = useState<ScheduleState>(() => initialSchedule(start));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const body = useRef<HTMLDivElement>(null);

  const isCsv = connectorKey === "csv";
  const purpose = scope.purpose === "clients" ? "clients" : "targets";
  const at = steps.indexOf(step);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);

  function go(next: StepId) {
    setError(null);
    setDone((d) => new Set([...d, step]));
    setStep(next);
    if (next === "preview") runPreview();
  }

  function config(): WizardConfig {
    const cap = schedule.cap.trim();
    return {
      scope,
      mapping: isCsv ? mapping : null,
      schedule: schedule.schedule,
      max_items: Math.max(1, Math.min(1000, Number(schedule.maxItems) || 50)),
      spend_cap_gbp: cap === "" ? null : Number(cap),
      weight: schedule.weight,
      describe_text: describeText.trim() || null,
    };
  }

  function runPreview() {
    setPreview(null);
    if (!connectorKey) return;
    startTransition(async () => {
      try {
        setPreview(await previewNewSource(connectorKey, scope, isCsv ? mapping : null));
      } catch {
        setPreview({ ok: false, message: "The preview didn’t load. Check the app is still running, then try again." });
      }
    });
  }

  function pick(key: string) {
    if (key === connectorKey) return;
    const info = catalogue.connectors.find((c) => c.key === key);
    setConnectorKey(key);
    setScope({ ...(info?.defaultScope ?? {}) });
    setSuggested(new Set());
    setIssues({});
    setKeyState({ status: info?.keyStatus ?? "off", last4: info?.key4 ?? null });
    setUpload(null);
    setMapping({});
    setDup(null);
    setDone(new Set());
  }

  function setScopeValue(key: string, value: unknown) {
    setScope((s) => ({ ...s, [key]: value }));
    setSuggested((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
    setIssues((i) => {
      const next = { ...i };
      delete next[key];
      return next;
    });
  }

  function refreshDuplicates(uploadId: string, map: Record<string, CsvField>) {
    startTransition(async () => setDup(await checkCsvDuplicates(uploadId, map)));
  }

  function setColumn(column: string, field: CsvField) {
    // A field other than Ignore belongs to one column at a time.
    const next = { ...mapping };
    if (field !== "Ignore") for (const c of Object.keys(next)) if (next[c] === field) next[c] = "Ignore";
    next[column] = field;
    setMapping(next);
    setMapSuggested((s) => {
      const n = new Set(s);
      n.delete(column);
      return n;
    });
    if (upload && !editing) refreshDuplicates(upload.uploadId, next);
  }

  async function continueFrom() {
    setError(null);
    if (step === "pick") return go(steps[1]);
    if (step === "connect") return go("describe");
    if (step === "describe") {
      const text = describeText.trim();
      if (!text || !connector?.describable) return go("scope");
      setBusy("Setting up…");
      const result = await describeSource(connector.key, text, scope);
      setBusy(null);
      if (result.ok) {
        setScope(result.scope);
        setSuggested(new Set(result.suggested));
      } else setError(result.message);
      return go("scope");
    }
    if (step === "scope") {
      if (isCsv && !upload) return setError("Upload a file first.");
      if (!isCsv) {
        setBusy("Checking…");
        const check = await checkSourceScope(connectorKey!, scope);
        setBusy(null);
        if (!check.ok) {
          setIssues(check.issues);
          return setError(check.message);
        }
      }
      if (isCsv && upload && mappedUpload !== upload.uploadId) {
        setBusy("Mapping fields…");
        const result = await suggestCsvMapping(upload.uploadId, purpose);
        setBusy(null);
        setMapping(result.mapping);
        setMapGroups(Object.fromEntries(Object.entries(result.mapping).map(([c, f]) => [c, groupFor(f)])));
        setMapSuggested(new Set(result.ok ? result.suggested : []));
        setMapMessage(result.ok ? null : result.message);
        setMappedUpload(upload.uploadId);
        refreshDuplicates(upload.uploadId, result.mapping);
      }
      return go("map");
    }
    if (step === "map") {
      if (isCsv && !Object.values(mapping).includes("Target name")) return setError("Map one column to Target name.");
      return go(editing && isCsv ? "schedule" : "preview");
    }
    if (step === "preview") return go("schedule");
    if (step === "schedule") {
      if (!schedule.rights) return;
      setBusy(editing ? "Saving…" : "Saving…");
      const result = await saveSource(connectorKey!, config(), start.mode === "edit" ? start.sourceId : null);
      setBusy(null);
      if (result.ok) onSaved(result.message);
      else setError(result.message);
    }
  }

  const nextLabel = busy ?? (step === "schedule" ? (editing ? "Save changes" : connector?.availability === "needs_approval" ? "Save" : "Save and run") : "Continue");
  const cannotNext =
    Boolean(busy) || (step === "pick" && !connector) || (step === "schedule" && !schedule.rights) || (step === "scope" && isCsv && !upload);
  const title = start.mode === "edit" ? `Edit ${start.name}` : start.mode === "clients" ? "Upload clients" : "Add source";
  const subtitle = start.mode === "clients" ? "CSV upload" : connector?.label;
  const lookBack = LOOK_BACKS[String(scope.lookBack)];

  return (
    <SidePanel title={title} subtitle={subtitle} closing={closing} onClose={onClose} labelId="wiz-title" progress={(at + 1) / steps.length}>
      <div className="flex min-h-0 flex-auto">
        <nav aria-label="Steps" className="w-[152px] flex-none pt-7 pl-8 max-sm:hidden">
          <ol className="m-0 list-none p-0">
            {steps.map((s, i) => {
              const current = s === step;
              const isDone = done.has(s) && !current;
              const reachable = isDone && !(editing && (s === "pick" || s === "connect" || s === "describe")) && !busy;
              const cls = `flex min-h-9 w-full items-center gap-2 border-0 border-l bg-transparent py-0 pr-0 pl-3.5 text-left font-sans text-[14px] ${
                current ? "border-ink text-ink" : "border-subtle"
              }`;
              return (
                <li key={s}>
                  {reachable ? (
                    <button type="button" className={`${cls} cursor-pointer text-bright hover:text-ink`} onClick={() => go(s)}>
                      <Tick />
                      {LABELS[s]}
                      <span className="sr-only">, done</span>
                    </button>
                  ) : (
                    <span className={`${cls} ${current ? "" : isDone ? "text-bright" : "text-ink-muted"}`} aria-current={current ? "step" : undefined}>
                      {isDone ? <Tick /> : null}
                      {LABELS[s]}
                      <span className="sr-only">{`, step ${i + 1} of ${steps.length}`}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div ref={body} key={step} className="sh-swap min-w-0 flex-auto overflow-y-auto pt-7 pr-8 pb-12 pl-4 max-md:px-4 max-md:pt-5">
          <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
            Step {at + 1} of {steps.length}
          </p>

          {step === "pick" ? <PickStep catalogue={catalogue} picked={connectorKey} onPick={pick} /> : null}

          {step === "connect" && connector ? <ConnectStep connector={connector} keyState={keyState} onKeyState={setKeyState} /> : null}

          {step === "describe" && connector ? (
            <>
              <StepHeading>What should this source look for?</StepHeading>
              <label htmlFor="desc" className="sr-only">
                What should {connector.label} look for?
              </label>
              <textarea
                id="desc"
                rows={6}
                value={describeText}
                disabled={Boolean(busy)}
                onChange={(e) => setDescribeText(e.target.value)}
                placeholder={connector.key === "csv" ? "Who’s on this list, for example people we met at SaaStock London." : "Posts from UK founders asking for an accountant, or complaining about their current one."}
                className="mt-5 w-full resize-y rounded-none border border-rule bg-transparent p-3.5 font-sans text-[17px] leading-[26px] text-ink outline-none focus:border-focus"
              />
              {busy ? (
                <p role="status" className="sh-pulse mt-2.5 mb-0 text-[14px] leading-5">
                  Setting up filters…
                </p>
              ) : (
                <p className="mt-2.5 mb-0 text-[14px] leading-5 text-ink-secondary">
                  {connector.describable
                    ? "Sleuthhound will turn this into the settings on the next step. You can change any of them."
                    : "Kept with the source, so you can tell your lists apart later. Optional."}
                </p>
              )}
            </>
          ) : null}

          {step === "scope" && connector ? (
            <>
              <StepHeading>{isCsv ? (purpose === "clients" ? "Your client list" : "Upload a file") : "Scope"}</StepHeading>
              <StepLede>
                {isCsv
                  ? editing
                    ? "A file is imported once. To add more rows, upload a new file as a new source."
                    : "Upload the file. Sleuthhound checks it before anything is imported."
                  : editing
                    ? `Change what ${connector.label} looks for. The next run uses the new settings.`
                    : suggested.size
                      ? "Filled in from your description. Values marked suggested came from the AI; change any of them."
                      : "What this source looks for. Change any of these."}
              </StepLede>
              {isCsv ? (
                <CsvUpload
                  upload={upload}
                  locked={editing}
                  purpose={purpose}
                  onUploaded={(u) => {
                    setUpload(u);
                    setScope((s) => ({ ...s, uploadId: u.uploadId, fileName: u.fileName, rowCount: u.rowCount, purpose }));
                    setDup(null);
                    setError(null);
                  }}
                />
              ) : (
                <ScopeForm fields={connector.scopeFields} scope={scope} suggested={suggested} issues={issues} onChange={setScopeValue} />
              )}
            </>
          ) : null}

          {step === "map" && connector ? (
            connector.mappingMode === "fixed" ? (
              <FixedMapStep connector={connector} />
            ) : upload ? (
              <>
                <StepHeading>Map fields</StepHeading>
                <StepLede>How each column becomes part of Sleuthhound. The AI’s guesses are marked; change any that look wrong.</StepLede>
                <CsvMap
                  upload={upload}
                  mapping={mapping}
                  groups={mapGroups}
                  suggested={mapSuggested}
                  message={mapMessage}
                  dup={editing ? null : dup}
                  dupOpen={dupOpen}
                  onDupOpen={setDupOpen}
                  onChange={setColumn}
                  noun={purpose === "clients" ? "companies" : "companies"}
                />
              </>
            ) : null
          ) : null}

          {step === "preview" ? (
            <PreviewStep
              result={preview}
              emptyLine={lookBack ? `Nothing matched in the last ${lookBack}. Try a longer look back or broader keywords.` : "Nothing matched. Try broader settings."}
              onAdjust={() => go("scope")}
              onRetry={runPreview}
            />
          ) : null}

          {step === "schedule" ? (
            <ScheduleStep
              state={schedule}
              onChange={(n) => setSchedule((s) => ({ ...s, ...n }))}
              once={isCsv}
              perItemGbp={catalogue.perItemGbp}
              reviewCap={catalogue.reviewCap}
              error={null}
            />
          ) : null}

          {error ? (
            <p role="alert" className="sh-swap mt-5 mb-0 text-[14px] leading-5 text-error-ink">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-none items-center justify-between gap-4 border-t border-subtle bg-canvas px-8 py-4 max-md:gap-2 max-md:px-4 max-md:py-3">
        <span className="max-md:flex max-md:flex-1 max-md:empty:hidden">
          {at > 0 && !(editing && step === "scope") ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => go(steps[at - 1])}
              className="press h-11 min-w-[104px] cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-45 max-md:h-[52px] max-md:flex-1 max-md:text-[16px]"
            >
              Back
            </button>
          ) : null}
        </span>
        <button
          type="button"
          disabled={cannotNext}
          onClick={() => void continueFrom()}
          className="press h-11 min-w-[160px] cursor-pointer border border-primary-edge bg-primary px-7 font-sans text-[15px] font-medium text-white hover:enabled:bg-primary-hover disabled:cursor-default disabled:opacity-45 max-md:h-[52px] max-md:min-w-0 max-md:flex-1 max-md:text-[16px]"
        >
          {nextLabel}
        </button>
      </div>
    </SidePanel>
  );
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="flex-none">
      <path d="M2 6.5 4.8 9 10 3" stroke="var(--status-ok)" strokeWidth="1.5" />
    </svg>
  );
}
