// Makes an existing account an admin. The only way to grant the role: there
// is no button for it. Sign up on the site first, then run
//
//   npm run admin:grant -- you@example.com           (the live D1 database)
//   npm run admin:grant -- you@example.com --local   (the local one, for npm run dev)

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const where = args.includes("--local") ? "--local" : "--remote";

// Checked strictly, since it goes into SQL: letters, digits and . _ % + - only.
if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("Usage: npm run admin:grant -- you@example.com [--local]");
  process.exit(1);
}

const d1 = (sql) =>
  execFileSync("npx", ["wrangler", "d1", "execute", "sleuthhound-accounts", where, "--json", "--command", sql], { encoding: "utf8" });

d1(`UPDATE users SET role = 'admin' WHERE email = '${email}'`);
const [result] = JSON.parse(d1(`SELECT email, role FROM users WHERE email = '${email}'`));
const row = result?.results?.[0];
if (row?.role === "admin") {
  console.log(`${row.email} is now an admin (${where.slice(2)}). Reload Sleuthhound to see Admin.`);
} else {
  console.error(`No account for ${email} ${where === "--local" ? "in the local database" : "on the live site"}. Sign up first, then run this again.`);
  process.exit(1);
}
