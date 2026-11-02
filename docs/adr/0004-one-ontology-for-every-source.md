# ADR 4: One data model for all sources

- Status: Accepted
- Date: October 2026

## Context

Leads come from different kinds of source: a company register, forum posts, CSV exports. Separate tables per source would mean separate review logic, queues and charts for each.

## Decision

Every connector maps its data into six record types: targets, signals, people, places, sources and links. The pipeline, review step and UI only work with these. Source-specific fields like company numbers and SIC codes stay inside the connector or in a target's attributes.

## Alternatives

- A companies table: fits Companies House, but forum posts and CSV rows don't map cleanly, and each new source would require changes to the core.
- Untyped JSON per item: flexible, but no shared queries, so no map, graph or deadline views across sources.

## Consequences

- A new source only needs a connector implementing `lib/connectors/types.ts`. The pipeline doesn't change.
- Companies and forum posts go through the same review and the same queue.
- Deduplication across sources is handled in one place, `lib/ontology/resolve.ts`.
