"use client";

import { refresh } from "@/lib/vault/live";
import { useEffect, useRef, type ReactNode } from "react";
import { useRunStatus } from "@/components/header/RunStatusProvider";
import { formatDate } from "@/lib/format/time";
import type { ClientRow } from "@/lib/clients/types";

// Your clients: the list with why each signed, and the selected client's
// panel. While a run is matching and analysing them, the page refreshes every
// few seconds so each row fills in as it's done. On phone the list stacks and
// the panel sits under it in a box; picking a client scrolls to it.

const GRID = "grid grid-cols-[minmax(220px,1fr)_120px_96px_96px_56px] items-center gap-5 px-3";
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

const signed = (iso: string | null) => (iso ? monthFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : "");

function useRefreshWhileRunning(pending: number) {
  const { status } = useRunStatus();
  const running = status.active !== null;
  useEffect(() => {
    if (!running || pending === 0) return;
    const timer = setInterval(() => refresh(), 4000);
    return () => clearInterval(timer);
  }, [running, pending]);
  return running;
}

function WhyLine({ row, running }: { row: ClientRow; running: boolean }) {
  if (row.chMatch === "none" && !row.companyNumber) {
    return <span className="text-overdue">No match at Companies House. Add the company number.</span>;
  }
  if (!row.analysedAt) {
    return running ? <span className="sh-pulse">Analysing…</span> : <span>Analysed in the next run</span>;
  }
  return (
    <>
      {row.whySigned}{" "}
      <span className={row.whySource && row.whySource !== "inferred" ? "text-data" : ""}>({row.whySource === "inferred" || !row.whySource ? "inferred" : row.whySource})</span>
    </>
  );
}

type Props = {
  clients: ClientRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ClientsWorkspace({ clients, selectedId, onSelect }: Props) {
  const pending = clients.filter((c) => !c.analysedAt && c.chMatch !== "none").length;
  const running = useRefreshWhileRunning(pending);
  const selected = clients.find((c) => c.id === selectedId) ?? clients[0] ?? null;
  const heading = useRef<HTMLHeadingElement>(null);

  return (
    <section aria-labelledby="clients-h" className="mx-gutter mt-[144px] max-md:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
        <h2 id="clients-h" className="m-0 text-[40px] leading-[44px] font-light tracking-[-0.02em] max-md:text-[32px] max-md:leading-10">
          Your clients
        </h2>
        {pending > 0 ? (
          <p role="status" className="m-0 text-[14px] leading-5 text-ink-secondary tabular-nums">
            {running ? `Matching and analysing: ${clients.length - pending} of ${clients.length} done` : `${pending} waiting to be analysed in the next run`}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start">
        <div className="min-w-0 flex-[999_1_620px] pr-10 max-[1023px]:pr-0">
          <ul aria-label="Your clients" className="m-0 list-none p-0 md:hidden">
            {clients.map((row) => (
              <li key={row.id} data-sel={row.id === selected?.id} className="sh-row -mx-3 border-b border-subtle px-3 py-4">
                <button
                  type="button"
                  aria-current={row.id === selected?.id ? "true" : undefined}
                  onClick={() => {
                    onSelect(row.id);
                    requestAnimationFrame(() => {
                      heading.current?.closest("aside")?.scrollIntoView({ block: "start" });
                      heading.current?.focus({ preventScroll: true });
                    });
                  }}
                  className="sh-open block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[17px] leading-6 text-ink"
                >
                  {row.name}
                </button>
                <p className="mt-0.5 mb-0 text-[14px] leading-5 text-ink-secondary">
                  <WhyLine row={row} running={running} />
                </p>
                <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-secondary tabular-nums">
                  {[row.segment, row.signedOn ? `signed ${signed(row.signedOn)}` : null].filter(Boolean).join(", ")}
                  <br />
                  <span className="text-ink">{row.leads}</span> lookalike {row.leads === 1 ? "lead" : "leads"} in 8 weeks, {row.kept} kept
                </p>
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto max-md:hidden">
            <div role="table" aria-label="Your clients" className="min-w-[640px] tabular-nums">
              <div role="row" className={`${GRID} h-10 border-b border-rule text-[13px] leading-5 text-ink-muted`}>
                <span role="columnheader">Client and why they signed</span>
                <span role="columnheader">Type</span>
                <span role="columnheader">Signed</span>
                <span role="columnheader">Leads, 8 weeks</span>
                <span role="columnheader">Kept</span>
              </div>
              {clients.map((row) => (
                <div key={row.id} role="row" data-sel={row.id === selected?.id} aria-selected={row.id === selected?.id} className={`sh-row ${GRID} min-h-[60px] py-2`}>
                  <span role="cell" className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        onSelect(row.id);
                        if (e.detail === 0) requestAnimationFrame(() => heading.current?.focus());
                      }}
                      className="sh-open block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans text-[16px] leading-6 text-ink"
                    >
                      {row.name}
                    </button>
                    <span className="block truncate text-[13px] leading-5 text-ink-secondary">
                      <WhyLine row={row} running={running} />
                    </span>
                  </span>
                  <span role="cell" className="truncate text-[15px] text-ink-secondary">
                    {row.segment ?? ""}
                  </span>
                  <span role="cell" className="text-[15px] text-ink-secondary">
                    {signed(row.signedOn)}
                  </span>
                  <span role="cell" className="text-[15px]">
                    {row.leads}
                  </span>
                  <span role="cell" className="text-[15px] text-ink-secondary">
                    {row.kept}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="m-0 pt-4 text-[14px] leading-5 text-ink-muted max-md:hidden">Leads are companies found as lookalikes of each client.</p>
        </div>
        {selected ? <ClientPanel key={selected.id} row={selected} running={running} headingRef={heading} /> : null}
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h4 className="m-0 text-[13px] leading-5 font-normal text-ink-muted">{title}</h4>
      {children}
    </section>
  );
}

function ClientPanel({ row, running, headingRef }: { row: ClientRow; running: boolean; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const meta = [row.segment, row.signedOn ? `signed ${signed(row.signedOn)}` : null].filter(Boolean).join(", ");
  return (
    <aside aria-labelledby="client-name" className="sh-swap max-w-[400px] min-w-0 flex-[1_1_340px] border-l border-subtle pt-6 pl-10 max-[1023px]:max-w-none max-[1023px]:border-l-0 max-[1023px]:pl-0 max-md:mt-14 max-md:scroll-mt-4 max-md:border max-md:border-strong max-md:px-4 max-md:pt-5 max-md:pb-6">
      {meta ? <p className="m-0 text-[13px] leading-5 text-ink-muted">{meta}</p> : null}
      <h3 id="client-name" ref={headingRef} tabIndex={-1} className="mt-1 mb-0 text-[28px] leading-9 font-light tracking-[-0.01em] outline-none">
        {row.name}
      </h3>
      <p className="mt-1 mb-0 text-[14px] text-ink-secondary">
        {row.leads} lookalike {row.leads === 1 ? "lead" : "leads"} in 8 weeks, {row.kept} kept
      </p>

      <Section title="Why they signed">
        {row.analysedAt ? (
          <>
            <p className="mt-2 mb-0">{row.whySigned}</p>
            <p className="mt-1 mb-0 text-[13px] leading-5 text-data">{row.whySource && row.whySource !== "inferred" ? `From ${row.whySource}` : `Inferred by ${row.analysedBy}`}</p>
          </>
        ) : (
          <p className="mt-2 mb-0 text-ink-secondary">
            <WhyLine row={row} running={running} />
          </p>
        )}
      </Section>
      {row.whatTheyDo ? (
        <Section title="What they do">
          <p className="mt-2 mb-0">{row.whatTheyDo}</p>
        </Section>
      ) : null}
      {row.directors.length ? (
        <Section title="Directors">
          <p className="mt-2 mb-0">{row.directors.join(", ")}</p>
        </Section>
      ) : null}
      {row.sources.length ? (
        <Section title="Sources">
          <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
            {row.sources.map((s) => (
              <li key={s.url} className="min-w-0 truncate">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-quiet text-ink hover:text-white">
                  {s.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <p className="mt-10 mb-0 text-[13px] leading-5 text-ink-muted">
        {row.analysedAt ? `Analysed by ${row.analysedBy} on ${formatDate(row.analysedAt)}` : "Not analysed yet"}
        {row.isDemo ? <span className="ml-4">Demo data</span> : null}
      </p>
    </aside>
  );
}
