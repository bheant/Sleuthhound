# ADR 2: Proxy Apollo and HubSpot through a stateless function

- Status: Accepted
- Date: October 2026

## Context

Anthropic, OpenAI, xAI and Companies House accept requests from the browser. Apollo and HubSpot don't send CORS headers, so the browser blocks their responses.

## Decision

Add a single Pages Function, `functions/proxy/[provider]/[[path]].ts`, that forwards requests to Apollo and HubSpot only. It requires a valid session and a same-origin request, forwards five specific headers (never the session cookie), and doesn't store or log anything.

## Alternatives

- Proxy all providers through the server: simpler client code, but every API key and lead would pass through the server, which contradicts [ADR 1](0001-local-first-storage.md).
- A browser extension: avoids CORS, but is a big ask of users for two optional integrations.
- Drop Apollo and HubSpot: sending kept leads to the CRM is one of the main features users want.

## Consequences

- Apollo and HubSpot keys are present in the function's memory during a request. This is documented in [security.md](../security.md).
- The function is about 40 lines and easy to audit.
- Adding another proxied provider means updating both the function's allow-list and `lib/net/external.ts`.
