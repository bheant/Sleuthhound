"use client";

import { useEffect, useState, type FormEvent } from "react";
import { resetInfo } from "@/lib/account/api";
import { parseRecoveryCode } from "@/lib/account/keys";
import { exploreSample } from "@/lib/demo/open";
import {
  cancelReset,
  checkSession,
  discardStaleData,
  finishReset,
  logOutAccount,
  recoveryCodeSaved,
  takeOverTab,
  unlock,
  type VaultState,
} from "@/lib/vault/session";
import { InviteOnly, LogInForm, SignUp, usePageTitle } from "./AccountForms";
import { AuthHeading, AuthShell, primaryButton, quietLink, secondaryButton } from "./auth-ui";
import { Field, FormError, MIN_PASSWORD } from "./fields";

// What shows instead of the app while the vault isn't open.

export function VaultScreen({ state }: { state: VaultState }) {
  // Until the user switches, /signup and the sample's Create account open sign-up.
  const [picked, setMode] = useState<"login" | "signup" | null>(null);
  const mode = picked ?? (state.wantsSignUp ? "signup" : "login");
  return (
    <AuthShell>
      {state.status === "signed-out" ? (
        mode === "login" ? (
          <LogInForm onSignUp={() => setMode("signup")} />
        ) : state.inviteToken ? (
          <SignUp invite={state.inviteToken} onLogIn={() => setMode("login")} />
        ) : (
          <InviteOnly onLogIn={() => setMode("login")} />
        )
      ) : null}
      {state.status === "locked" && state.user ? <UnlockForm email={state.user.email} offline={state.offline} /> : null}
      {state.status === "reset" && state.resetToken ? <ResetForm token={state.resetToken} /> : null}
      {state.status === "stale" ? <StaleData /> : null}
      {state.status === "elsewhere" ? <Elsewhere /> : null}
      {state.status === "offline" ? (
        <>
          <AuthHeading title="Can’t reach Sleuthhound">Check your connection. Your data is safe in this browser.</AuthHeading>
          <button type="button" onClick={() => void checkSession()} className={`${primaryButton} mt-8 w-full`}>
            Try again
          </button>
          <button type="button" onClick={() => void exploreSample()} className={`${quietLink} mt-6`}>
            Explore a sample workspace
          </button>
        </>
      ) : null}
      {state.status === "unsupported" ? (
        <AuthHeading title="This browser can’t hold your data">
          Sleuthhound keeps your data encrypted in the browser. Try a current version of Chrome, Firefox, Safari or Edge, outside a private window.
        </AuthHeading>
      ) : null}
    </AuthShell>
  );
}

function UnlockForm({ email, offline }: { email: string; offline: boolean }) {
  usePageTitle("Sleuthhound");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [wrong, setWrong] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    const ok = await unlock(password).catch(() => false);
    if (ok) return;
    setBusy(false);
    setWrong(true);
    setPassword("");
    setAttempt((n) => n + 1);
  }

  const shake = !wrong ? "" : attempt % 2 ? "sh-shake-a" : "sh-shake-b";
  return (
    <>
      {/* Spaced like Log in: the email sits 32px under the crosshair where the
          first field would, then 16px to the password field. Screen readers
          still hear a heading. */}
      <h1 className="sr-only">Unlock</h1>
      <p className="mt-8 mb-0 text-center [overflow-wrap:anywhere] text-ink-soft max-md:text-[15px]">{email}</p>
      <form onSubmit={submit} noValidate className={`sh-in sh-d1 mt-4 flex w-full flex-col ${shake}`}>
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          first
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setWrong(false);
          }}
          disabled={busy}
          error={wrong ? "That password is wrong." : null}
        />
        <button type="submit" disabled={busy || !password} className={`${primaryButton} mt-4`}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      {offline ? (
        <p className="mt-6 mb-0 text-center text-[13px] leading-5 text-ink-soft">Offline. Your data unlocks here; anything that needs the internet waits until you’re back.</p>
      ) : (
        <button type="button" onClick={() => void logOutAccount()} className={`${quietLink} mt-6`}>
          Log out
        </button>
      )}
    </>
  );
}

type ResetAccount = { email: string; name: string; byRecovery: string };

function ResetForm({ token }: { token: string }) {
  const [info, setInfo] = useState<ResetAccount | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [noCode, setNoCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resetInfo(token).then((res) => {
      if (res.ok) setInfo({ email: res.email, name: res.name, byRecovery: res.wrapped.byRecovery });
      else setGone(res.message);
    });
  }, [token]);

  if (gone) {
    return (
      <>
        <AuthHeading title="Reset link not working">{gone}</AuthHeading>
        <button type="button" onClick={() => void cancelReset()} className={`${quietLink} mt-6`}>
          Back to log in
        </button>
      </>
    );
  }
  if (!info) return <AuthHeading title="Reset password">Checking the link…</AuthHeading>;

  const codeOk = noCode || parseRecoveryCode(code) !== null;
  const ready = password.length >= MIN_PASSWORD && confirm === password && codeOk;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || !info) return;
    setBusy(true);
    setError(null);
    const message = await finishReset({ email: info.email, password, byRecovery: info.byRecovery, recoveryCode: noCode ? null : code }).catch(
      () => "Something went wrong. Try again.",
    );
    if (!message) return;
    setBusy(false);
    setError(message);
  }

  return (
    <>
      <AuthHeading title="Set a new password">{info.email}</AuthHeading>
      <form onSubmit={submit} noValidate className="sh-in sh-d1 mt-8 flex w-full flex-col">
        <input type="email" autoComplete="username" value={info.email} readOnly hidden />
        <Field id="password" label="New password" type="password" autoComplete="new-password" first value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        <Field
          id="confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          error={confirm && confirm !== password ? "The passwords don’t match." : null}
        />
        {noCode ? (
          <p role="alert" className="mt-4 mb-0 border border-error px-3 py-2.5 text-[13px] leading-[18px] text-ink">
            Without the recovery code, everything this account saved in any browser can’t be opened again, and backup files made before won’t open either. You start
            with an empty workspace and a new recovery code.
          </p>
        ) : (
          <>
            <Field
              id="code"
              label="Recovery code"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              error={code && !parseRecoveryCode(code) ? "Recovery codes have 24 letters and numbers." : null}
            />
            <p className="mt-3 mb-0 text-[13px] leading-[18px] text-ink-soft">The code you saved when you created your account. It keeps your data readable.</p>
          </>
        )}
        <FormError message={error} />
        <button type="submit" disabled={busy || !ready} className={`${primaryButton} mt-4`}>
          {busy ? "Saving…" : noCode ? "Start fresh with a new password" : "Set new password"}
        </button>
      </form>
      <button type="button" onClick={() => setNoCode((v) => !v)} className={`${quietLink} mt-6`}>
        {noCode ? "I have my recovery code" : "I don’t have my recovery code"}
      </button>
    </>
  );
}

/** Shown once after sign-up or a fresh start, before the app opens. */
export function RecoveryCodeScreen({ code }: { code: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function download() {
    const text = `Sleuthhound recovery code\n\n${code}\n\nKeep this somewhere safe and private. With an admin's reset link, it opens your data if you forget your password.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "sleuthhound-recovery-code.txt" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthShell>
      <AuthHeading title="Save your recovery code">If you forget your password, this code and a reset link from your admin are the only way back to your data.</AuthHeading>
      {/* Two lines of three groups, so no group is split. */}
      <p className="sh-in sh-d1 mt-8 mb-0 w-full border border-strong px-3 py-4 text-center text-[17px] leading-7 tracking-[0.04em] tabular-nums select-all">
        <span className="block">{code.split("-").slice(0, 3).join("-")}-</span>
        <span className="block">{code.split("-").slice(3).join("-")}</span>
      </p>
      <div className="mt-3 grid w-full grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
          className={secondaryButton}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className={secondaryButton}>
          Download .txt
        </button>
      </div>
      <label className="mt-6 flex w-full cursor-pointer items-start gap-2 text-[13px] leading-5 text-ink-soft max-md:text-[14px]">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="m-0 mt-[3px] size-3.5 flex-none accent-primary-edge [color-scheme:light] max-md:size-[18px]" />
        I’ve saved my recovery code. It won’t be shown again.
      </label>
      <button type="button" disabled={!saved} onClick={recoveryCodeSaved} className={`${primaryButton} mt-4 w-full`}>
        Continue
      </button>
    </AuthShell>
  );
}

function StaleData() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <>
      <AuthHeading title="This browser’s data can’t be opened">
        It was saved before your account started fresh without its recovery code, so the key that sealed it is gone. Delete it here to start with an empty workspace.
      </AuthHeading>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await discardStaleData(password).catch(() => false);
          if (ok) return;
          setBusy(false);
          setWrong(true);
        }}
        className="mt-8 flex w-full flex-col"
      >
        <Field id="password" label="Password" type="password" autoComplete="current-password" first value={password} onChange={(e) => setPassword(e.target.value)} error={wrong ? "That password is wrong." : null} />
        <button type="submit" disabled={busy || !password} className={`${primaryButton} mt-4`}>
          Delete it and start empty
        </button>
      </form>
      <button type="button" onClick={() => void logOutAccount()} className={`${quietLink} mt-6`}>
        Log out
      </button>
    </>
  );
}

function Elsewhere() {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <AuthHeading title="Sleuthhound is open in another tab">It works in one tab at a time, so your data can’t be changed in two places at once.</AuthHeading>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void takeOverTab();
        }}
        className={`${primaryButton} mt-8 w-full`}
      >
        {busy ? "Switching…" : "Use here instead"}
      </button>
      <p className="mt-4 mb-0 text-center text-[13px] leading-5 text-ink-soft">The other tab saves its work and locks before this one opens.</p>
    </>
  );
}
