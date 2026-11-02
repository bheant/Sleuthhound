"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { formatWhen } from "@/lib/format/time";
import { backupDue, readBackup } from "@/lib/vault/backup";
import { vaultMeta } from "@/lib/vault/session";
import { exportBackup, importBackup } from "@/lib/vault/settings-actions";
import { LabelledInput, Notice, Section } from "./Section";

// Backup: Export downloads one encrypted .sleuthhound file; Import replaces
// everything here with a file's contents, once its password opens it.

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BackupSection({ email }: { email: string }) {
  const [last, setLast] = useState<{ at: string | null; due: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [file, setFile] = useState<{ name: string; text: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const readMeta = () =>
    void vaultMeta().then((m) => m && setLast({ at: m.lastBackupAt, due: backupDue(m.lastBackupAt, m.createdAt) }));
  useEffect(readMeta, []);

  async function onExport() {
    setBusy(true);
    setNotice(null);
    const res = await exportBackup();
    setBusy(false);
    if (!res.ok) return setNotice({ text: res.message, error: true });
    download(res.text, res.fileName);
    setNotice({ text: `Saved ${res.fileName}. Keep it somewhere safe: it opens with your password.`, error: false });
    readMeta();
  }

  async function onChoose(chosen: File | undefined) {
    setNotice(null);
    if (!chosen) return;
    const text = await chosen.text();
    const parsed = readBackup(text);
    if (!parsed) return setNotice({ text: "That isn’t a Sleuthhound backup file.", error: true });
    setFile({ name: chosen.name, text, email: parsed.email });
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!file || !password) return;
    setBusy(true);
    const res = await importBackup(file.text, password);
    setBusy(false);
    setPassword("");
    setNotice({ text: res.message ?? "Restored.", error: !res.ok });
    if (res.ok) setFile(null);
  }

  return (
    <Section id="backup" title="Backup" lede="One encrypted file with everything in this browser. It opens with the password you had when you made it." className="mt-32 max-md:mt-16">
      <p className="m-0 text-[15px] leading-[22px] tabular-nums">
        {last === null ? " " : last.at ? `Last exported ${formatWhen(last.at)}` : "Not exported yet"}
      </p>
      {last?.due ? <p className="mt-1 mb-0 text-[14px] leading-5 text-ink-secondary">It’s been a while. Export one now so a cleared browser can’t lose your work.</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={onExport} className={buttonClasses({ variant: "primary" })}>
          Export
        </button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClasses()}>
          Import
        </button>
        <input ref={input} type="file" accept=".sleuthhound,application/json" className="sr-only" tabIndex={-1} onChange={(e) => void onChoose(e.target.files?.[0])} />
      </div>

      {file ? (
        <form onSubmit={onImport} noValidate className="sh-swap mt-8 flex max-w-[360px] flex-col">
          <p className="m-0 mb-5 text-[14px] leading-5 text-ink-secondary">
            Importing {file.name} replaces everything in this browser{file.email !== email ? `, with data from ${file.email}` : ""}.
          </p>
          <input type="email" autoComplete="username" value={file.email} readOnly hidden />
          <LabelledInput id="backup-password" label={`Password for ${file.email} when it was made`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={busy || !password} className={buttonClasses({ variant: "primary" })}>
              {busy ? "Restoring…" : "Restore"}
            </button>
            <button type="button" onClick={() => setFile(null)} className={buttonClasses()}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <Notice text={notice?.text ?? null} error={notice?.error} />
    </Section>
  );
}
