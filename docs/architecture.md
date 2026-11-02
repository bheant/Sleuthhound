# Architecture

Sleuthhound is a static Next.js export. All application logic runs in the browser. Cloudflare Pages Functions handle accounts and proxy requests to the two providers that don't support CORS. Business data is never stored server-side.

## Components

| Component | Runs on | Code | Stores |
| --- | --- | --- | --- |
| App | Browser | `app/`, `components/`, `lib/` | Targets, sources, reviews, decisions, clients, API keys |
| Local database | Browser | `lib/db/`, `lib/vault/` | SQLite (sql.js) in memory while unlocked; encrypted snapshot in IndexedDB |
| Account API | Pages Functions | `functions/api/`, `server/` | Nothing; reads and writes D1 |
| Account database | D1 | `d1/migrations/` | Users, sessions, log-ins, invites, rate limits |
| Proxy | Pages Functions | `functions/proxy/` | Nothing |

## Run pipeline

```mermaid
flowchart LR
  Q[Queued run] --> F[Fetch]
  F --> U[Resolve]
  U --> P[Pre-score]
  P --> T[Trading check]
  T --> R[Research and review]
  R --> S[Summary]
```

`lib/runs/runner.ts` runs in the tab holding the unlocked vault. It polls for queued runs every 2 seconds and checks source schedules every 60 seconds, queuing any that are overdue. Only one run executes at a time. Schedules missed while the app was closed are picked up on the next unlock.

1. Fetch: each connector pulls new items through a shared rate limiter in `lib/limits/`. Companies House allows 600 requests per 5 minutes.
2. Resolve: connectors return drafts of targets, signals, people, places and links. `lib/ontology/upsert.ts` writes them in one transaction. `lib/ontology/resolve.ts` matches existing targets by company number, then website domain, then normalised name plus postcode district. There is no fuzzy matching.
3. Pre-score: if there are more candidates than the review cap, `lib/pipeline/prescore.ts` ranks them using register data only.
4. Trading check: the highest pre-scored companies without a known website get one web search each, looking for evidence they trade.
5. Review: the default LLM researches the target and returns a 0 to 100 score, using the ideal-client description and recent keeps and discards (with reasons) as context. Output is validated with Zod. Cited URLs must appear in the research results.
6. Summary: a short text summary of the run for the home page.

Errors are caught per step and written to the run log. A failed item doesn't stop the run.

## Data model

Every source maps into six record types, defined in `lib/db/schema.ts`:

| Type | Example |
| --- | --- |
| Target | A company, or a forum post asking for an accountant |
| Signal | First accounts due 14 May 2027; shares allotted |
| Person | A director |
| Place | A registered office and its borough |
| Source | A Companies House search, Hacker News, a CSV upload |
| Link | Director of, same address as, similar to client |

The pipeline and UI only use these types. Source-specific fields such as company numbers, SIC codes and accounts types are handled inside `lib/connectors/companies-house/`.

## Connectors

Each source implements the interface in `lib/connectors/types.ts`: key testing, scope fields, fetch, and normalisation into drafts. The Add source wizard has seven steps: pick, connect, describe, scope, map, preview and schedule. For CSV files, an LLM suggests the column mapping in the map step.

## LLM providers

`lib/ai/provider.ts` wraps Anthropic, OpenAI and xAI through the Vercel AI SDK. The user picks a default provider. Each review stores provider, model, token counts and cost in GBP (`lib/ai/cost.ts`), which makes it possible to compare providers on the same targets.

## Network requests

All outbound requests go through `externalFetch` in `lib/net/external.ts`.

- Anthropic, OpenAI, xAI, Companies House, postcodes.io, Hacker News and Reddit are called directly from the browser.
- Apollo and HubSpot are routed through `/proxy/<provider>`.
- The sample workspace makes no network requests.

`scripts/headers.mjs` generates the Content-Security-Policy at build time. `connect-src` lists only the site and the hosts above.
