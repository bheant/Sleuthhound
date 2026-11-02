"use client";

import { useRef, useState } from "react";
import { uploadCsvFile } from "@/lib/connectors/csv/uploads";
import type { UploadResult } from "@/lib/sources/types";

export type UploadInfo = Extract<UploadResult, { ok: true }>;

type Props = {
  upload: UploadInfo | null;
  /** Editing a saved source: the file is fixed. */
  locked: boolean;
  purpose: "targets" | "clients";
  onUploaded: (upload: UploadInfo) => void;
};

// The CSV drop zone: drop or choose a file, which is parsed in the browser.
export function CsvUpload({ upload, locked, purpose, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadCsvFile(file);
      if (result.ok) onUploaded(result);
      else setError(result.message);
    } catch {
      setError("That file couldn’t be read. Check it’s a CSV, then try again.");
    } finally {
      setBusy(false);
    }
  }

  if (upload) {
    return (
      <div className="mt-6 flex items-center justify-between gap-4 border border-dashed border-strong px-5 py-[18px]">
        <span className="flex min-w-0 items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-ink-secondary">
            <path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="truncate">{upload.fileName}</span>
          <span className="text-ink-secondary tabular-nums">
            {upload.rowCount.toLocaleString("en-GB")} {upload.rowCount === 1 ? "row" : "rows"}
          </span>
        </span>
        {locked ? null : (
          <button type="button" onClick={() => input.current?.click()} className="link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink">
            Replace file
          </button>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      </div>
    );
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void send(file);
        }}
        className={`mt-6 flex flex-col items-center gap-3.5 border border-dashed px-6 py-10 text-center transition-colors duration-150 ${over ? "border-focus" : "border-strong"}`}
      >
        <p className="m-0 text-[17px]">{busy ? "Reading the file…" : "Drop a CSV file here"}</p>
        <p className="m-0 text-[14px] text-ink-secondary">
          {purpose === "clients"
            ? "One client per row. A company name or company number is needed; notes on why they signed make the analysis sharper."
            : "Up to 5,000 rows. The first row should be the column names."}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="press h-11 cursor-pointer border border-control bg-transparent px-6 font-sans text-[15px] text-ink hover:enabled:border-ink hover:enabled:bg-ink hover:enabled:text-black disabled:opacity-50"
        >
          Choose file
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      </div>
      {error ? (
        <p role="alert" className="mt-3 mb-0 text-[14px] leading-5 text-error-ink">
          {error}
        </p>
      ) : null}
    </>
  );
}
