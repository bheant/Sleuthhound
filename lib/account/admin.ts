// Calls to /api/admin for the Admin page. The server checks the role on each.
// AdminUser mirrors the reply of functions/api/admin/users.ts.

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: "user" | "admin";
  disabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  loginCount: number;
  country: string | null;
  resetPending: boolean;
};

type Fail = { ok: false; message: string };

async function call<T>(path: string, body?: unknown): Promise<({ ok: true } & T) | Fail> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as ({ message?: string } & T) | null;
    if (!res.ok || !data) return { ok: false, message: data?.message ?? "Couldn’t reach Sleuthhound. Try again." };
    return { ok: true, ...data };
  } catch {
    return { ok: false, message: "Couldn’t reach Sleuthhound. Try again." };
  }
}

export const listUsers = () => call<{ users: AdminUser[]; me: string }>("/api/admin/users");

export const actOnUser = (id: string, action: "disable" | "enable" | "reset") =>
  call<{ link?: string; expiresAt?: string }>(`/api/admin/users/${encodeURIComponent(id)}`, { action });

const cell = (v: string | number | boolean | null) => {
  const text = v === null ? "" : String(v);
  // Quote everything, and stop a spreadsheet reading a cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function usersCsv(users: AdminUser[]): string {
  const head = ["Name", "Email", "Company", "Role", "Disabled", "Signed up", "Last seen", "Logins", "Country"];
  const rows = users.map((u) => [u.name, u.email, u.company, u.role, u.disabled, u.createdAt, u.lastSeenAt, u.loginCount, u.country].map(cell).join(","));
  return [head.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}

/** Mirrors the reply of functions/api/admin/invites.ts. */
export type AdminInvite = {
  id: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  status: "unused" | "used" | "expired";
  usedAt: string | null;
  usedBy: string | null;
};

export const listInvites = () => call<{ invites: AdminInvite[] }>("/api/admin/invites");

export const makeInvite = (email: string) => call<{ link: string; expiresAt: string; email: string | null }>("/api/admin/invites", { email: email.trim() });
