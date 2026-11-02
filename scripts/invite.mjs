// Makes a sign-up invite from the terminal: for the very first account,
// before there's an admin to make one in /admin. Single use, 7 days.
//
//   npm run invite                         (anyone with the link, on the live site)
//   npm run invite -- you@example.com      (only that email can use it)
//   npm run invite -- --local              (the local database, for npm run dev)

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const local = args.includes("--local");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase() ?? null;

// Checked strictly, since it goes into SQL.
if (email && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("Usage: npm run invite -- [you@example.com] [--local]");
  process.exit(1);
}

const token = crypto.randomBytes(32).toString("base64url");
const hash = crypto.createHash("sha256").update(token).digest("hex");
const now = new Date();
const expires = new Date(now.getTime() + 7 * 24 * 3600_000);
const sql = `INSERT INTO invites (id, token_hash, email, created_at, expires_at) VALUES ('${crypto.randomUUID()}', '${hash}', ${email ? `'${email}'` : "NULL"}, '${now.toISOString()}', '${expires.toISOString()}')`;

execFileSync("npx", ["wrangler", "d1", "execute", "sleuthhound-accounts", local ? "--local" : "--remote", "--command", sql], { stdio: "ignore" });
const base = local ? "http://127.0.0.1:3000" : "https://sleuthhound.net";
console.log(`Invite${email ? ` for ${email}` : ""}, single use, until ${expires.toDateString()}:\n${base}/signup?invite=${token}`);
