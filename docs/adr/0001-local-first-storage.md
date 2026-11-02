# ADR 1: Store business data in the browser

- Status: Accepted
- Date: October 2026

## Context

Sleuthhound stores a firm's client list, leads, notes and API keys for paid services. This is commercially sensitive data. Storing it on a server means the server can read it and I'm responsible for securing it. The first version ran locally with SQLite on disk, which kept data private but only worked on one machine.

## Decision

Store all business data in a SQLite database in the browser using sql.js. The database is held in memory while unlocked and persisted to IndexedDB as a single AES-256-GCM encrypted snapshot. The encryption key is derived from the user's password and never sent to the server. See [security.md](../security.md).

## Alternatives

- Hosted Postgres with encryption at rest: straightforward, but the server can read all data and there's an ongoing hosting cost.
- End-to-end encrypted sync: would let data follow a user across devices, but needs conflict resolution and server storage. Could be added later.
- IndexedDB without SQLite: smaller bundle, but no relational queries, which the review queue and charts rely on.

## Consequences

- The server has no business data to read or leak.
- Data is tied to one browser. Moving devices requires exporting and importing an encrypted backup.
- Runs only happen while the app is open. Missed schedules run on the next unlock.
- If a user loses both their password and recovery code, their data is unrecoverable.
