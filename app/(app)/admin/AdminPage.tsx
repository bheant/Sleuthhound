"use client";

import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { useVault } from "@/components/vault/useVault";
import { actOnUser, listUsers, usersCsv, type AdminUser } from "@/lib/account/admin";
import { formatWhen } from "@/lib/format/time";
import { InvitesSection } from "./InvitesSection";

// Who uses Sleuthhound: identity and sign-in history only. The server checks
// the admin role on every call; this page only decides what to show.

type SortKey = "name" | "email" | "company" | "createdAt" | "lastSeenAt" | "loginCount" | "country";

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "createdAt", label: "Signed up" },
  { key: "lastSeenAt", label: "Last seen" },
  { key: "loginCount", label: "Logins", numeric: true },
  { key: "country", label: "Country" },
];

const signedUp = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function compare(a: AdminUser, b: AdminUser, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-GB", { sensitivity: "base" });
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminPage() {
  const isAdmin = useVault().user?.role === "admin";
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "createdAt", desc: true });

  const [recent, setRecent] = useState(0);

  const show = (res: Awaited<ReturnType<typeof listUsers>>) => {
    if (!res.ok) return setError(res.message);
    setError(null);
    setUsers(res.users);
    setMe(res.me);
    const weekAgo = Date.now() - 7 * 864e5;
    setRecent(res.users.filter((u) => u.lastSeenAt && Date.parse(u.lastSeenAt) > weekAgo).length);
  };

  const load = async () => show(await listUsers());

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    void listUsers().then((res) => {
      if (live) show(res);
    });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (users ?? []).filter((u) => !q || [u.name, u.email, u.company, u.country ?? ""].some((v) => v.toLowerCase().includes(q)));
    return list.sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key));
  }, [users, query, sort]);

  if (!isAdmin) {
    return (
      <section className="px-gutter pt-32 max-md:pt-14">
        <h1 className="type-page-title-xl m-0">Admin</h1>
        <p className="type-lede mt-6 mb-0">Only admins can see this page.</p>
      </section>
    );
  }

  return (
    <>
      <section className="px-gutter pt-32 max-md:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-16 gap-y-10 max-md:gap-y-4">
          <h1 className="sh-in type-page-title-xl m-0">Admin</h1>
          <p className="sh-in sh-d1 type-lede mt-2.5 mb-0 max-w-[540px]">Who uses Sleuthhound, and who’s invited. Their leads and keys stay in their own browsers, out of reach.</p>
        </div>
        {users ? (
          <dl className="sh-in sh-d2 mt-20 mb-0 flex flex-wrap gap-x-14 gap-y-6 text-[14px] leading-5 tabular-nums max-md:mt-12">
            {[
              ["Accounts", users.length],
              ["Seen in the last 7 days", recent],
              ["Turned off", users.filter((u) => u.disabled).length],
            ].map(([label, value]) => (
              <div key={label} className="pl-4 max-md:pl-0">
                <dt className="text-ink-nav">{label}</dt>
                <dd className="m-0">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section className="mx-gutter mt-24 border-t border-rule pt-6 max-md:mt-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex min-w-0 flex-[0_1_360px]">
            <span className="sr-only">Search accounts</span>
            <input
              type="search"
              placeholder="Search name, email, company or country"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full min-w-0 rounded-none border border-rule bg-transparent px-3.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-focus"
            />
          </label>
          <button type="button" disabled={!users?.length} onClick={() => users && download(usersCsv(shown), "sleuthhound-accounts.csv")} className={buttonClasses()}>
            Export CSV
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-6 mb-0 text-error-ink">
            {error}
          </p>
        ) : null}
        {!users && !error ? <p className="mt-6 mb-0 text-ink-muted">Loading accounts…</p> : null}
        {users ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-[14px] leading-5 tabular-nums">
              <thead>
                <tr className="border-b border-rule">
                  {COLUMNS.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th key={c.key} scope="col" aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"} className="py-3 pr-5 font-normal">
                        <button
                          type="button"
                          onClick={() => setSort({ key: c.key, desc: on ? !sort.desc : c.key === "createdAt" || c.key === "lastSeenAt" || c.key === "loginCount" })}
                          className={`cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] ${on ? "text-ink" : "text-ink-secondary hover:text-ink"}`}
                        >
                          {c.label}
                          {on ? <span aria-hidden>{sort.desc ? " ↓" : " ↑"}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="py-3 font-normal text-ink-secondary">
                    Account
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <UserRow key={u.id} user={u} self={u.id === me} onChanged={load} />
                ))}
              </tbody>
            </table>
            {shown.length === 0 ? <p className="mt-6 mb-0 text-ink-muted">No accounts match.</p> : null}
          </div>
        ) : null}
      </section>
      <InvitesSection />
    </>
  );
}

function UserRow({ user, self, onChanged }: { user: AdminUser; self: boolean; onChanged: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<"disable" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: "disable" | "enable" | "reset") {
    setBusy(true);
    setMessage(null);
    const res = await actOnUser(user.id, action);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) return setMessage(res.message);
    if (res.link) setLink(res.link);
    await onChanged();
  }

  const quiet = "link-quiet cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] text-ink-secondary hover:text-ink disabled:opacity-50";
  return (
    <>
      <tr className={`border-b border-subtle align-top ${user.disabled ? "text-ink-muted" : ""}`}>
        <td className="py-3.5 pr-5">
          {user.name}
          {user.role === "admin" ? <span className="text-ink-secondary"> (admin)</span> : null}
        </td>
        <td className="py-3.5 pr-5 [overflow-wrap:anywhere]">{user.email}</td>
        <td className="py-3.5 pr-5">{user.company}</td>
        <td className="py-3.5 pr-5 whitespace-nowrap">{signedUp.format(new Date(user.createdAt))}</td>
        <td className="py-3.5 pr-5 whitespace-nowrap">{user.lastSeenAt ? formatWhen(user.lastSeenAt) : "Never"}</td>
        <td className="py-3.5 pr-5">{user.loginCount}</td>
        <td className="py-3.5 pr-5">{user.country ?? "Unknown"}</td>
        <td className="py-3.5 whitespace-nowrap">
          {self ? (
            <span className="text-ink-muted">You</span>
          ) : (
            <span className="flex gap-5">
              {user.disabled ? (
                <button type="button" disabled={busy} onClick={() => void act("enable")} className={quiet}>
                  Turn on
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirm("disable")} className={quiet}>
                  Turn off
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => setConfirm("reset")} className={quiet}>
                {user.resetPending ? "New reset link" : "Reset password"}
              </button>
            </span>
          )}
        </td>
      </tr>
      {confirm || link || message ? (
        <tr className="border-b border-subtle">
          <td colSpan={8} className="pt-2 pb-5">
            <div className="max-w-[720px]">
              {confirm === "disable" ? (
                <InlineConfirm
                  question={`Turn off ${user.email}?`}
                  note="They’re logged out everywhere and can’t log in until turned on again. Their data stays in their browser."
                  confirmLabel="Turn off"
                  busy={busy}
                  onConfirm={() => void act("disable")}
                  onCancel={() => setConfirm(null)}
                />
              ) : null}
              {confirm === "reset" ? (
                <InlineConfirm
                  question={`Reset the password for ${user.email}?`}
                  note="Their password stops working at once. With the link you give them, they set a new one, and only their recovery code keeps their data readable. Without it, everything they saved becomes unreadable, backups included."
                  confirmLabel="Reset"
                  busy={busy}
                  onConfirm={() => void act("reset")}
                  onCancel={() => setConfirm(null)}
                />
              ) : null}
              {link ? (
                <div className="sh-swap">
                  <p className="m-0 text-ink">Send this link to {user.name} yourself. It works once, for 24 hours, and isn’t shown again.</p>
                  <p className="mt-2 mb-0 border border-strong px-3 py-2.5 text-[13px] break-all select-all">{link}</p>
                  <div className="mt-2 flex gap-5">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(link)} className={quiet}>
                      Copy
                    </button>
                    <button type="button" onClick={() => setLink(null)} className={quiet}>
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
              {message ? (
                <p role="alert" className="m-0 text-error-ink">
                  {message}
                </p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
