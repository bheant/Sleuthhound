"use client";

import { CSV_FIELDS, FIELD_GROUP, type CsvField } from "@/lib/connectors/csv/fields";
import type { DuplicateCheck } from "@/lib/sources/types";
import { Select, Suggested } from "./fields";
import type { UploadInfo } from "./CsvUpload";

// The Map step for a CSV: each column with a sample value, the Sleuthhound
// field it becomes (the AI's guesses marked), and the duplicate check.

const GROUPS = [
  { name: "Target", hint: "the thing you might act on" },
  { name: "Signal", hint: "a dated event that makes it worth acting on now" },
  { name: "Person", hint: "someone linked to the target" },
  { name: "Place", hint: "where it is, for the map" },
  { name: "Not imported", hint: "columns left out" },
] as const;

type Props = {
  upload: UploadInfo;
  mapping: Record<string, CsvField>;
  /** Each column's group when the mapping was suggested, so rows don't jump as fields change. */
  groups: Record<string, string>;
  suggested: ReadonlySet<string>;
  message: string | null;
  dup: DuplicateCheck | null;
  dupOpen: keyof DuplicateCheck | null;
  onDupOpen: (which: keyof DuplicateCheck | null) => void;
  onChange: (column: string, field: CsvField) => void;
  noun: string;
};

const OPTIONS = CSV_FIELDS.map((f) => ({ value: f, label: f }));

export function groupFor(field: CsvField): string {
  return FIELD_GROUP[field] ?? "Not imported";
}

export function CsvMap({ upload, mapping, groups, suggested, message, dup, dupOpen, onDupOpen, onChange, noun }: Props) {
  const sample = (column: string) => upload.samples.find((r) => r[column])?.[column] ?? "";
  const named = Object.values(mapping).includes("Target name");
  const list = dup && dupOpen ? dup[dupOpen] : [];
  const dupLink = (which: keyof DuplicateCheck, text: string, tone: string) => (
    <button
      type="button"
      aria-expanded={dupOpen === which}
      onClick={() => onDupOpen(dupOpen === which ? null : which)}
      className={`link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] ${tone}`}
    >
      {text}
    </button>
  );

  return (
    <>
      {message ? <p className="mt-4 mb-0 text-[14px] leading-5 text-overdue">{message}</p> : null}
      {GROUPS.map((g) => {
        const columns = upload.headers.filter((h) => (groups[h] ?? "Not imported") === g.name);
        if (columns.length === 0) return null;
        return (
          <section key={g.name} className="mt-6">
            <h4 className="m-0 text-[15px] leading-[22px] font-normal">
              {g.name} <span className="text-[13px] text-ink-muted">{g.hint}</span>
            </h4>
            {columns.map((column) => (
              <div key={column} className="grid grid-cols-[minmax(0,1fr)_20px_196px] items-center gap-2 border-b border-faint py-2">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-[22px]">{column}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-ink-muted">{sample(column) || "Empty in the first rows"}</span>
                </span>
                <span aria-hidden className="text-control">
                  →
                </span>
                <span>
                  <Select label={`Sleuthhound field for ${column}`} value={mapping[column] ?? "Ignore"} options={OPTIONS} onChange={(v) => onChange(column, v as CsvField)} />
                  {suggested.has(column) ? (
                    <span className="mt-0.5 block">
                      <Suggested />
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {!named ? <p className="mt-4 mb-0 text-[14px] leading-5 text-error-ink">Map one column to Target name, so each row has a name.</p> : null}

      {dup ? (
        <section className="mt-8 border border-strong p-5">
          <h4 className="m-0 text-[15px] leading-[22px] font-normal">Duplicate check</h4>
          <p className="mt-2 mb-0 text-[15px] leading-6 tabular-nums">
            {dupLink("fresh", `${dup.fresh.length} new`, "text-ink hover:text-white")}
            <span aria-hidden className="inline-block w-4" />
            {dupLink("match", `${dup.match.length} match existing ${noun} and will be merged`, "text-ink hover:text-white")}
            <span aria-hidden className="inline-block w-4" />
            {dupLink("problems", `${dup.problems.length} have problems`, dup.problems.length ? "text-overdue" : "text-ink")}
          </p>
          {dupOpen ? (
            <div className="sh-swap mt-4 border-t border-subtle">
              {list.length === 0 ? <p className="m-0 py-2.5 text-[14px] text-ink-secondary">None.</p> : null}
              {list.slice(0, 50).map((d, i) => (
                <div key={`${d.name}-${i}`} className="flex justify-between gap-4 border-b border-faint py-2.5 text-[14px] leading-5">
                  <span>{d.name}</span>
                  <span className={`text-right ${dupOpen === "problems" ? "text-overdue" : "text-ink-secondary"}`}>{d.note}</span>
                </div>
              ))}
              <p className="mt-2.5 mb-0 text-[13px] leading-[18px] text-ink-muted">
                {dupOpen === "problems"
                  ? "Rows with problems are skipped. Fix them in the file and upload it again to include them."
                  : list.length > 50
                    ? `Showing 50 of ${list.length}.`
                    : dupOpen === "match"
                      ? "Merged rows add to the company Sleuthhound already has; nothing is lost."
                      : "New rows become companies and are checked at Companies House when they have a number."}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
