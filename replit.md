# Vera Nexus

Vera Nexus is a causal business intelligence platform for founders — it tracks market/company events on a timeline, annotates them with AI-generated causal chain analysis, and surfaces intelligence reports, a corporate "graveyard" of failures, a social feed, and an AI copilot.

## Run & Operate

- `pnpm --filter @workspace/vera-nexus run dev` — run the frontend (Vite, port assigned via `PORT`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (`lib/api-spec/openapi.yaml`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; optional per-session Groq API key (entered via Settings UI, not an env var)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter (routing) + TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Groq SDK (`llama-3.3-70b-versatile`) for causal chain analysis / chat, keyed per-session
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle) for API, Vite for frontend

## Where things live

- Frontend pages: `artifacts/vera-nexus/src/pages/` — `Line` (causal event timeline, default route), `Sight` (+ `sight/*` subcomponents: intelligence reports/news), `Crypt` (corporate graveyard), `Thoughts` (social feed w/ reactions), `Venus` (AI chat), `Settings`, `enterprise/*` (Signup/Onboarding/Plan/Checkout gate flow guarding `/venus`)
- Layout: `artifacts/vera-nexus/src/components/layout/{Layout,Topbar,LeftSidebar,RightSidebar}.tsx`
- Frontend routing wired in `artifacts/vera-nexus/src/App.tsx` (Wouter `Switch`/`Route`)
- Backend routes: `artifacts/api-server/src/routes/` (events, reports, companies, signals, thoughts, settings, ai, stocks)
- API contract (source of truth): `lib/api-spec/openapi.yaml` — edit this, then rerun codegen
- DB schema: `lib/db` package

## Architecture decisions

- Migrated from an imported Vercel/v0 Next.js prototype into this pnpm-workspace multi-artifact stack (separate `vera-nexus` frontend and `api-server` backend artifacts, communicating over `/api`).
- Settings (Groq API key, onboarding data) are keyed by a client-generated `x-session-id` header instead of full user auth — no login system exists.
- The Venus AI chat page is gated behind a client-side (localStorage-based) enterprise signup/onboarding/plan flow (`lib/enterpriseGate.ts`), not a real paywall — this is pre-existing product behavior carried over from the original prototype, not new functionality.
- Design system: dark navy background (`#080810`), indigo accent (`#5b4fe8`), mint accent (`#00e5b0`).

## Product

- **Line**: causal event timeline for tracked companies/markets, each event annotated with AI causal chain analysis.
- **Sight**: intelligence reports / news feed with watchlist, category filters, and AI summaries.
- **Crypt**: corporate graveyard — failed/shut-down companies and post-mortems.
- **Thoughts**: lightweight social feed with reactions, filterable by category.
- **Venus**: conversational AI copilot (Groq-backed), gated behind an enterprise onboarding flow.
- **Settings**: per-session Groq API key entry and onboarding preferences.

## User preferences

_None recorded yet._

## Gotchas

- When passing an array of IDs into a Drizzle SQL condition, use `inArray(...)`, not a raw `sql\`ANY(${arr}::int[])\`` template — the latter serializes the array as a malformed literal and throws at query time.
- `getOrCreate`-style settings lookups must use `onConflictDoNothing()` + re-select (not plain insert) since concurrent requests for a new session can race and violate the `sessionId` unique constraint.
- No Groq API key is configured by default; AI features should degrade gracefully and point users to Settings rather than erroring.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
