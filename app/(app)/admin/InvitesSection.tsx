"use client";

import { useEffect, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { listInvites, makeInvite, type AdminInvite } from "@/lib/account/admin";
import { formatWhen } from "@/lib/format/time";

// Invites: sign-up only works with one. Each is single-use and lasts 7 days,
// and can be for one email. The link shows once, here, to send yourself.

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink";
const input =
  "h-11 min-w-0 flex-[1_1_260px] rounded-none border border-rule bg-transparent px-3.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-focus";

function statusText(i: AdminInvite): string {
  if (i.status === "used") return i.usedBy ? `Used by ${i.usedBy}` : "Used, account since deleted";
  if (i.status === "expired") return "Expired";
  return "Unused";
}

export function InvitesSection() {
  const [invites, setInvites] = useState<AdminInvite[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ link: string; email: string | null; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (res: Awaited<ReturnType<typeof listInvites>>) => (res.ok ? setInvites(res.invites) : setError(res.message));
  useEffect(() => {
    let live = true;
    void listInvites().then((res) => {
      if (live) show(res);
    });
    return () => {
      live = false;
    };
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await makeInvite(email);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setMade({ link: res.link, email: res.email, expiresAt: res.expiresAt });
    setEmail("");
    show(await listInvites());
  }

  return (
    <section aria-labelledby="invites-h" className="mx-gutter mt-24 border-t border-rule pt-6 max-md:mt-14">
      <h2 id="invites-h" className="m-0 text-[32px] leading-10 font-light tracking-[-0.01em]">
        Invites
      </h2>
      <p className="mt-3 mb-0 max-w-[560px] text-ink-secondary">Sign-up needs an invite. Each works once, for 7 days, and can be for one email address.</p>

      <form onSubmit={create} noValidate className="mt-6 flex max-w-[640px] flex-wrap gap-3">
        <label htmlFor="invite-email" className="sr-only">
          Email for this invite, optional
        </label>
        <input
          id="invite-email"
          type="email"
          placeholder="Email, optional"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <button type="submit" disabled={busy} className={buttonClasses({ variant: "primary" })}>
          {busy ? "Creating…" : "Create invite"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 mb-0 text-[14px] text-error-ink">
          {error}
        </p>
      ) : null}
      {made ? (
        <div className="sh-swap mt-6 max-w-[720px]">
          <p className="m-0 text-ink">
            Send this link {made.email ? `to ${made.email}` : "to the person you’re inviting"} yourself. It works once, until {day.format(new Date(made.expiresAt))}, and isn’t shown
            again.
          </p>
          <p className="mt-2 mb-0 border border-strong px-3 py-2.5 text-[13px] break-all select-all">{made.link}</p>
          <div className="mt-2 flex gap-5">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(made.link)} className={quiet}>
              Copy
            </button>
            <button type="button" onClick={() => setMade(null)} className={quiet}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {invites === null && !error ? <p className="mt-6 mb-0 text-ink-muted">Loading invites…</p> : null}
      {invites?.length === 0 ? <p className="mt-6 mb-0 text-ink-muted">No invites yet.</p> : null}
      {invites?.length ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[14px] leading-5 tabular-nums">
            <thead>
              <tr className="border-b border-rule text-ink-secondary">
                <th scope="col" className="py-3 pr-5 font-normal">
                  For
                </th>
                <th scope="col" className="py-3 pr-5 font-normal">
                  Created
                </th>
                <th scope="col" className="py-3 pr-5 font-normal">
                  Expires
                </th>
                <th scope="col" className="py-3 font-normal">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className={`border-b border-subtle ${i.status === "unused" ? "" : "text-ink-muted"}`}>
                  <td className="py-3.5 pr-5 [overflow-wrap:anywhere]">{i.email ?? "Anyone with the link"}</td>
                  <td className="py-3.5 pr-5 whitespace-nowrap">{formatWhen(i.createdAt)}</td>
                  <td className="py-3.5 pr-5 whitespace-nowrap">{day.format(new Date(i.expiresAt))}</td>
                  <td className="py-3.5 [overflow-wrap:anywhere]">{statusText(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
