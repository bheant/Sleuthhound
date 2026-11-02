import { z } from "zod";

// The users table and what the browser may see of it.

export type UserRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: "user" | "admin";
  disabled: number;
  auth_salt: string | null;
  auth_hash: string | null;
  wrapped_by_password: string | null;
  wrapped_by_recovery: string;
  reset_token_hash: string | null;
  reset_expires_at: string | null;
  created_at: string;
  last_seen_at: string | null;
};

export type PublicUser = { id: string; name: string; email: string; company: string; role: "user" | "admin" };

export const publicUser = (u: UserRow): PublicUser => ({ id: u.id, name: u.name, email: u.email, company: u.company, role: u.role });

// Inputs. The auth key is 32 bytes in base64; wrapped keys are "v1.<iv>.<data>".
export const authKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "Bad key.");
export const wrappedSchema = z.string().regex(/^v1\.[A-Za-z0-9+/=]{16}\.[A-Za-z0-9+/=]{40,200}$/, "Bad wrapped key.");
export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");

export function findByEmail(db: D1Database, email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?1").bind(email).first<UserRow>();
}

export function findById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
}

export function recordLogin(db: D1Database, userId: string, country: string | null, now = new Date()) {
  const at = now.toISOString();
  return db.batch([
    db.prepare("INSERT INTO logins (user_id, at, country) VALUES (?1, ?2, ?3)").bind(userId, at, country),
    db.prepare("UPDATE users SET last_seen_at = ?2 WHERE id = ?1").bind(userId, at),
  ]);
}
