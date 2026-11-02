# ADR 5: Host on Cloudflare Pages and D1

- Status: Accepted
- Date: October 2026

## Context

Since business data stays in the browser ([ADR 1](0001-local-first-storage.md)), the server only needs to serve static files, handle accounts and run the proxy. That's a small enough workload to fit within a free hosting plan.

## Decision

Deploy a static Next.js export to Cloudflare Pages, use Pages Functions for the account API and proxy, and use D1 for account data.

## Alternatives

- Vercel with a managed database: the original plan, and better Next.js integration, but the database adds cost and makes it tempting to store more server-side.
- A VPS: full control, but requires ongoing patching and monitoring.

## Consequences

- No server components, server actions or API routes in Next.js. Every page is a client component.
- Functions are limited to 10 ms of CPU per request, so a slow password hash can't run on the server. Key stretching happens in the browser instead. See [security.md](../security.md).
- D1's free limits are well above what the account tables need.
