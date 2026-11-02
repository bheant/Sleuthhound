"use client";

import { useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { MIN_PASSWORD } from "@/components/vault/fields";
import type { User } from "@/lib/account/api";
import { logOutAccount } from "@/lib/vault/session";
import { changeMyPassword } from "@/lib/vault/settings-actions";
import { LabelledInput, Notice, Section } from "./Section";

// You: name, email and company, Change password and Log out. A new password
// only re-wraps the key that seals the data, so nothing needs re-encrypting.

export function YouSection({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const ready = current && next.length >= MIN_PASSWORD && confirm === next && !busy;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const res = await changeMyPassword(current, next);
    setBusy(false);
    setNotice({ text: res.message ?? "", error: !res.ok });
    if (res.ok) {
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <Section id="you" title="You" className="mt-32 max-md:mt-16">
      <dl className="m-0 flex flex-wrap gap-x-14 gap-y-4">
        {[
          ["Name", user.name],
          ["Email", user.email],
          ["Company", user.company],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[14px] leading-5 text-ink-secondary">{label}</dt>
            <dd className="m-0 mt-1 text-[20px] leading-7 [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>

      {open ? (
        <form onSubmit={save} noValidate className="sh-swap mt-10 flex max-w-[360px] flex-col">
          <input type="email" autoComplete="username" value={user.email} readOnly hidden />
          <LabelledInput id="pw-current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <LabelledInput id="pw-new" label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <LabelledInput
            id="pw-confirm"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            aria-invalid={confirm !== "" && confirm !== next}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="mt-2 mb-0 text-[14px] leading-5 text-ink-muted">At least {MIN_PASSWORD} characters. Your recovery code stays the same.</p>
          <Notice text={notice?.error ? notice.text : null} error />
          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={!ready} className={buttonClasses({ variant: "primary" })}>
              {busy ? "Saving…" : "Change password"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClasses()}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
            className={buttonClasses()}
          >
            Change password
          </button>
          <button type="button" onClick={() => void logOutAccount()} className={buttonClasses()}>
            Log out
          </button>
        </div>
      )}
      {!open ? <Notice text={notice?.text ?? null} error={notice?.error} /> : null}
    </Section>
  );
}
