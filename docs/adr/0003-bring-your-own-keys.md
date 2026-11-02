# ADR 3: Users provide their own API keys

- Status: Accepted
- Date: October 2026

## Context

Each review is an LLM call with web search, which costs money. Paying for reviews centrally would need billing, per-user usage limits and a server holding a shared key. Every lead would also pass through my account.

## Decision

Users enter their own API keys for LLM providers and data sources. Keys are stored in the encrypted browser database and only sent to the provider they belong to. The UI only shows the last four characters.

## Alternatives

- A shared key with billing: easier onboarding, but requires a server in the request path and makes me a processor of users' data.
- A self-hosted model: lower cost per call, but weaker at web research and still needs a server.

## Consequences

- No usage costs on my side. Users pay providers directly.
- Users can switch between Anthropic, OpenAI and xAI and compare results on the same leads.
- Onboarding takes longer: a Companies House key and one LLM key are needed before the first run. The sample workspace lets people try the app first.
- Each review records token usage and cost, and each source has a configurable spend cap.
