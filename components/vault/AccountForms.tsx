"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { inviteInfo } from "@/lib/account/api";
import { exploreSample } from "@/lib/demo/open";
import { OPERATOR } from "@/lib/site";
import { logIn, signUp } from "@/lib/vault/session";
import { AuthHeading, primaryButton, quietLink } from "./auth-ui";
import { Field, FormError, MIN_PASSWORD } from "./fields";

// Log in and Create account, on the black sign-in column. Both derive the
// keys in the browser; the password itself is never sent.

// The log-in page shows only the form for now. Sign-up (/signup), the sample
// workspace (/sample) and /privacy stay live at their own addresses, and the
// Forgot password note stays here, ready to show again: set this to true.
const SHOW_LOGIN_LINKS = false;

function Shake({ attempt, children }: { attempt: number; children: React.ReactNode }) {
  const shake = attempt === 0 ? "" : attempt % 2 ? "sh-shake-a" : "sh-shake-b";
  return <div className={`w-full ${shake}`}>{children}</div>;
}

/** sample: show the link to the sample workspace, which also opens at /sample. */
function Footnote({ onSwitch, switchLabel, sample = true }: { onSwitch: () => void; switchLabel: string; sample?: boolean }) {
  const [opening, setOpening] = useState(false);
  return (
    <div className="mt-6 flex w-full flex-col items-center gap-3">
      <button type="button" onClick={onSwitch} className={quietLink}>
        {switchLabel}
      </button>
      {sample ? (
        <button
          type="button"
          disabled={opening}
          onClick={() => {
            setOpening(true);
            void exploreSample();
          }}
          className={quietLink}
        >
          {opening ? "Opening the sample…" : "Explore a sample workspace"}
        </button>
      ) : null}
      <Link href="/privacy" className={`${quietLink} no-underline`}>
        Privacy
      </Link>
    </div>
  );
}

export function LogInForm({ onSignUp }: { onSignUp: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forgot, setForgot] = useState(false);
  usePageTitle("Sleuthhound");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const message = await logIn(email, password).catch(() => "Something went wrong. Try again.");
    if (!message) return;
    setBusy(false);
    setError(message);
    setPassword("");
    setAttempt((n) => n + 1);
  }

  return (
    <>
      {/* No visible heading. As in the design: 32px from the crosshair to the
          first field, 12px between fields, 16px above the button. */}
      <h1 className="sr-only">Log in</h1>
      <Shake attempt={attempt}>
        <form onSubmit={submit} noValidate className="sh-in sh-d1 mt-8 flex w-full flex-col">
          <Field id="email" label="Email" type="email" autoComplete="username" spellCheck={false} first value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            disabled={busy}
            error={error}
          />
          {SHOW_LOGIN_LINKS ? (
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setForgot((f) => !f)} className={quietLink}>
                Forgot password?
              </button>
            </div>
          ) : null}
          {forgot ? (
            <p className="mt-2 mb-0 text-[13px] leading-[18px] text-ink-soft">
              Ask your Sleuthhound admin for a reset link. Your recovery code then keeps your data readable.
            </p>
          ) : null}
          <button type="submit" disabled={busy || !email.trim() || !password} className={`${primaryButton} mt-4`}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
      </Shake>
      {SHOW_LOGIN_LINKS ? <Footnote onSwitch={onSignUp} switchLabel="Create account" /> : null}
    </>
  );
}

/** Names the tab while this screen shows, whatever the address, then puts it back. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** Sleuthhound is invite-only: without an invite link, sign-up says so. */
export function InviteOnly({ onLogIn }: { onLogIn: () => void }) {
  return (
    <>
      <AuthHeading title="Sleuthhound is invite-only">
        Contact{" "}
        <a href={`mailto:${OPERATOR.email}`} className="text-ink-soft hover:text-ink">
          {OPERATOR.email}
        </a>
      </AuthHeading>
      <Footnote onSwitch={onLogIn} switchLabel="Log in instead" sample={false} />
    </>
  );
}

type InviteCheck = { state: "checking" } | { state: "gone"; message: string } | { state: "ok"; email: string | null };

/** Checks the invite from the link, then shows the form, with the email fixed when the invite names one. */
export function SignUp({ invite, onLogIn }: { invite: string; onLogIn: () => void }) {
  const [check, setCheck] = useState<InviteCheck>({ state: "checking" });
  useEffect(() => {
    let live = true;
    void inviteInfo(invite).then((res) => {
      if (live) setCheck(res.ok ? { state: "ok", email: res.email } : { state: "gone", message: res.message });
    });
    return () => {
      live = false;
    };
  }, [invite]);

  if (check.state === "checking") return <AuthHeading title="Create account">Checking your invite…</AuthHeading>;
  if (check.state === "gone") {
    return (
      <>
        <AuthHeading title="Invite not working">{check.message}</AuthHeading>
        <Footnote onSwitch={onLogIn} switchLabel="Log in instead" sample={false} />
      </>
    );
  }
  return <SignUpForm invitedEmail={check.email} onLogIn={onLogIn} />;
}

function SignUpForm({ invitedEmail, onLogIn }: { invitedEmail: string | null; onLogIn: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const short = password.length < MIN_PASSWORD;
  const mismatch = confirm !== "" && confirm !== password;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = name.trim() && emailOk && company.trim() && !short && confirm === password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const message = await signUp({ name: name.trim(), email, company: company.trim(), password }).catch(() => "Something went wrong. Try again.");
    if (!message) return;
    setBusy(false);
    setError(message);
  }

  return (
    <>
      <AuthHeading title="Create account" />
      <form onSubmit={submit} noValidate className="sh-in sh-d1 mt-8 flex w-full flex-col">
        <Field id="name" label="Name" autoComplete="name" first value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          readOnly={invitedEmail !== null}
          title={invitedEmail ? "Your invite is for this address" : undefined}
        />
        <Field id="company" label="Company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        <Field
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          error={mismatch ? "The passwords don’t match." : null}
        />
        <p className="mt-3 mb-0 text-[13px] leading-[18px] text-ink-soft">
          At least {MIN_PASSWORD} characters. Sleuthhound never sees it and can’t recover it.
        </p>
        <FormError message={error} />
        <button type="submit" disabled={busy || !ready} className={`${primaryButton} mt-4`}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <Footnote onSwitch={onLogIn} switchLabel="Log in instead" sample={false} />
    </>
  );
}
