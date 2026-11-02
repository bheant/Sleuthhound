import { deriveAccountKeys, newDataKey, newRecoveryCode, normaliseEmail, openDataKey, rewrapWithPassword, rewrapWithRecovery } from "./keys";

// Calls to the account functions. The password never leaves this module: it
// becomes the auth key (sent) and the vault key (kept). Everything here
// returns plain copy for the page on failure.

export type User = { id: string; name: string; email: string; company: string; role: "user" | "admin" };

export type Result<T> = ({ ok: true } & T) | { ok: false; message: string; status?: number };

const OFFLINE = "Couldn’t reach Sleuthhound. Check your connection, then try again.";

async function call<T>(path: string, body?: unknown): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: OFFLINE };
  }
  const data = (await res.json().catch(() => null)) as ({ message?: string } & T) | null;
  if (!res.ok || !data) return { ok: false, status: res.status, message: data?.message ?? OFFLINE };
  return { ok: true, ...data };
}

type Signed = { user: User; wrapped: { byPassword: string } };

/** Who is signed in: a user, or null for nobody. Failure means the server couldn't be asked. */
export function fetchMe() {
  return call<{ user: User | null; wrapped?: { byPassword: string } }>("/api/auth/me");
}

export async function signUp(input: { name: string; email: string; company: string; password: string; invite: string }): Promise<Result<{ user: User; dataKey: CryptoKey; byPassword: string; recoveryCode: string }>> {
  const email = normaliseEmail(input.email);
  const { authKey, vaultKey } = await deriveAccountKeys(input.password, email);
  const recoveryCode = newRecoveryCode();
  const { dataKey, wrapped } = await newDataKey(vaultKey, recoveryCode);
  const res = await call<Signed>("/api/auth/signup", { name: input.name, email, company: input.company, authKey, wrapped, invite: input.invite });
  return res.ok ? { ok: true, user: res.user, dataKey, byPassword: wrapped.byPassword, recoveryCode } : res;
}

/** Whether an invite can be used, and the email it's for, if any. */
export function inviteInfo(token: string) {
  return call<{ email: string | null; expiresAt: string }>(`/api/auth/invite?token=${encodeURIComponent(token)}`);
}

export async function logIn(email: string, password: string): Promise<Result<{ user: User; dataKey: CryptoKey; byPassword: string }>> {
  const keys = await deriveAccountKeys(password, email);
  const res = await call<Signed>("/api/auth/login", { email: normaliseEmail(email), authKey: keys.authKey });
  if (!res.ok) return res;
  const byPassword = res.wrapped.byPassword;
  return { ok: true, user: res.user, dataKey: await openDataKey(byPassword, keys.vaultKey, "password"), byPassword };
}

/** Opens the data key with the password alone, for an unlock after a reload. Null when the password is wrong. */
export async function unlockWith(email: string, password: string, byPassword: string): Promise<CryptoKey | null> {
  const { vaultKey } = await deriveAccountKeys(password, email);
  return openDataKey(byPassword, vaultKey, "password").catch(() => null);
}

export function logOut() {
  return call<object>("/api/auth/logout", {});
}

export function resetInfo(token: string) {
  return call<{ email: string; name: string; wrapped: { byRecovery: string } }>(`/api/auth/reset?token=${encodeURIComponent(token)}`);
}

/**
 * Sets a new password from a reset link. With the recovery code the same data
 * key is kept, so everything opens again; without it there's a new data key
 * and a new recovery code, and data encrypted before can't be opened.
 */
export async function resetPassword(input: { token: string; email: string; password: string; byRecovery: string; recoveryCode: string | null }): Promise<Result<{ user: User; dataKey: CryptoKey; byPassword: string; newRecoveryCode: string | null }>> {
  const { authKey, vaultKey } = await deriveAccountKeys(input.password, input.email);
  let dataKey: CryptoKey;
  let wrapped: { byPassword: string; byRecovery?: string };
  let fresh: string | null = null;
  if (input.recoveryCode) {
    try {
      const rewrapped = await rewrapWithRecovery(input.byRecovery, input.recoveryCode, vaultKey);
      dataKey = rewrapped.dataKey;
      wrapped = { byPassword: rewrapped.byPassword };
    } catch {
      return { ok: false, message: "That recovery code doesn’t match this account. Check it, then try again." };
    }
  } else {
    fresh = newRecoveryCode();
    const made = await newDataKey(vaultKey, fresh);
    dataKey = made.dataKey;
    wrapped = made.wrapped;
  }
  const res = await call<Signed>("/api/auth/reset", { token: input.token, authKey, wrapped });
  return res.ok ? { ok: true, user: res.user, dataKey, byPassword: wrapped.byPassword, newRecoveryCode: fresh } : res;
}

export async function changePassword(input: { email: string; current: string; next: string; byPassword: string }): Promise<Result<{ byPassword: string }>> {
  const [current, next] = await Promise.all([deriveAccountKeys(input.current, input.email), deriveAccountKeys(input.next, input.email)]);
  let byPassword: string;
  try {
    byPassword = await rewrapWithPassword(input.byPassword, current.vaultKey, next.vaultKey);
  } catch {
    return { ok: false, message: "Your current password is wrong." };
  }
  const res = await call<object>("/api/account/password", { currentAuthKey: current.authKey, newAuthKey: next.authKey, byPassword });
  return res.ok ? { ok: true, byPassword } : res;
}

export async function deleteAccount(email: string, password: string) {
  const { authKey } = await deriveAccountKeys(password, email);
  return call<object>("/api/account/delete", { authKey });
}
