---
name: Vera Nexus Stack
description: Key architecture decisions, gotchas, and conventions for the Vera Nexus BI platform rebuild.
---

## Contract-first API

`lib/api-spec/openapi.yaml` is the single source of truth. After any change, run `pnpm --filter @workspace/api-spec run codegen` to regenerate Zod schemas (`lib/api-zod`) and React Query hooks (`lib/api-client-react`). The server uses Zod schemas to validate request bodies; the frontend uses the generated hooks.

**Why:** Prevents drift between client and server types; codegen keeps both in sync automatically.

**How to apply:** Always edit the spec first, codegen second, then touch route handlers or frontend hooks.

## Groq key stored per-session in DB

The Groq API key is stored in the `settings` table keyed by session ID (from `x-session-id` header or IP). The key is used server-side in `artifacts/api-server/src/lib/groq.ts` via `getGroqClient(sessionId)`. All AI routes fall back to informative placeholder responses if no key is configured.

**Why:** No auth required; session-based key storage lets any user configure their own key instantly.

**How to apply:** All AI routes call `getGroqClient(sessionId)` and check for null before calling Groq. Frontend reads `useGetGroqKeyStatus` and shows Settings CTA if unconfigured.

## Venus AI system prompt

Venus AI is configured with a strict system prompt that demands pure JSON output (no prose, no markdown). The prompt lives in `artifacts/api-server/src/lib/groq.ts` as `VENUS_PROMPT`. The JSON shape is: `{ summary, cards: [{ type, title, content }] }` with 5 card types: analysis, market, risk, roadmap, decision.

**Why:** Structured JSON allows the frontend to render rich visual cards instead of plain text.

**How to apply:** Always send `role: system` with VENUS_PROMPT. Parse the Groq response as JSON; if parsing fails, return a generic analysis card.

## Reaction toggle pattern

Reactions table has a unique constraint on `(thought_id, session_id, reaction_type)`. POST `/api/reactions` checks for an existing row and deletes it (toggle off) or inserts it (toggle on). Returns `{ action: "added" | "deleted" }`.

**Why:** Mirrors toggle behavior without a separate DELETE endpoint.

## Session-based settings (no auth)

No Clerk/auth in this rebuild. Settings (Groq key, onboarding context) are stored per `x-session-id` header. Frontend should generate and persist a session UUID in localStorage and send it with every API request as `x-session-id`.

**Why:** Avoids Clerk complexity while still persisting user state across page reloads.

## DB schema location

All tables defined in `lib/db/src/schema/`: events, reports, companies, signals, thoughts, settings. After schema changes, run `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs` to refresh declarations before running API server typecheck.
