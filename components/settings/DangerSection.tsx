"use client";

import { useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import type { User } from "@/lib/account/api";
import { resetLocalData } from "@/lib/vault/session";
import { deleteMyAccount } from "@/lib/vault/settings-actions";
import { LabelledInput, Notice, Section } from "./Section";

// Reset this browser's data, or delete the account. Both need the word typed
// out, since neither can be undone.

function Confirm({ word, label, note, password, onConfirm }: { word: string; label: string; note: string; password?: { email: string }; onConfirm: (pw: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toLowerCase() === word && (!password || pw) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const message = await onConfirm(pw);
    setBusy(false);
    setError(message);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses({ variant: "danger" })}>
        {label}
      </button>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="sh-swap flex max-w-[360px] flex-col">
      <p className="m-0 mb-5 text-[14px] leading-5 text-ink-secondary">{note}</p>
      {password ? (
        <>
          <input type="email" autoComplete="username" value={password.email} readOnly hidden />
          <LabelledInput id={`${word}-password`} label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </>
      ) : null}
      <LabelledInput id={`${word}-typed`} label={`Type ${word} to confirm`} autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
      <Notice text={error} error />
      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={!ready} className={buttonClasses({ variant: "danger" })}>
          {busy ? "Working…" : label}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClasses()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DangerSection({ user }: { user: User }) {
  return (
    <Section id="danger" title="Reset and delete" className="mt-32 max-md:mt-16">
      <div className="flex flex-col gap-10">
        <div>
          <h3 className="m-0 mb-1 text-[17px] leading-6 font-normal">Reset this browser</h3>
          <p className="m-0 mb-4 max-w-[560px] text-[14px] leading-5 text-ink-secondary">
            Deletes everything Sleuthhound keeps in this browser for {user.email}: leads, keys, sources and files. Your account stays. Export a backup first if you might want it back.
          </p>
          <Confirm
            word="reset"
            label="Reset this browser"
            note="This can’t be undone. You’ll unlock into an empty workspace."
            onConfirm={async () => {
              await resetLocalData();
              return null;
            }}
          />
        </div>
        <div>
          <h3 className="m-0 mb-1 text-[17px] leading-6 font-normal">Delete account</h3>
          <p className="m-0 mb-4 max-w-[560px] text-[14px] leading-5 text-ink-secondary">
            Deletes your name, email, company and sign-in history from Sleuthhound, and everything in this browser. Data in other browsers stays there, unreadable.
          </p>
          <Confirm
            word="delete"
            label="Delete account"
            note="This can’t be undone."
            password={{ email: user.email }}
            onConfirm={async (pw) => {
              const res = await deleteMyAccount(pw);
              return res.ok ? null : res.message;
            }}
          />
        </div>
      </div>
    </Section>
  );
}
