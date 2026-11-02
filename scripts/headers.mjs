// Runs after `next build`. Writes out/_headers for Cloudflare Pages with a
// strict Content-Security-Policy: scripts only from this site plus the exact
// inline scripts Next wrote into the pages (by SHA-256), styles only from this
// site, and connections only to this site and the providers the browser calls
// directly. XSS is the main threat to data kept in the browser, so nothing
// else may run or be contacted.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, "out");

// Providers called straight from the browser (lib/net/external.ts). Apollo
// and HubSpot go through /proxy on this site, so they're covered by 'self'.
const PROVIDERS = [
  "https://api.anthropic.com",
  "https://api.openai.com",
  "https://api.x.ai",
  "https://api.company-information.service.gov.uk",
  "https://api.postcodes.io",
  "https://hn.algolia.com",
  "https://www.reddit.com",
];

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith(".html") ? [p] : [];
  });
}

const hashes = new Set();
for (const file of htmlFiles(out)) {
  const html = fs.readFileSync(file, "utf8");
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`);
  }
  if (/<style[\s>]|\sstyle="/.test(html)) {
    console.error(`${path.relative(root, file)} has an inline style, which the CSP blocks. Use a class instead.`);
    process.exit(1);
  }
}

const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets SQLite's WebAssembly compile; it allows no JavaScript eval.
  `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].sort().join(" ")}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${PROVIDERS.join(" ")}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Cloudflare Pages caps each header value at 2,000 characters.
if (csp.length > 2000) {
  console.error(`The CSP is ${csp.length} characters, over Cloudflare's 2,000. Too many distinct inline scripts: split it per page.`);
  process.exit(1);
}

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Type: application/manifest+json
`;

fs.writeFileSync(path.join(out, "_headers"), headers);
console.log(`Wrote out/_headers: ${hashes.size} inline script hashes, CSP ${csp.length} characters.`);
