# Vera Nexus

A causal business intelligence platform for founders and operators — surfaces why events happen, not just what happened, through AI-powered ripple analysis, corporate autopsies, and the Venus AI engine.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/vera-nexus run dev` — run the frontend (port 24335)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `GROQ_API_KEY` — fallback Groq key (users can also paste their own in Settings)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter, custom dark CSS design system (no Tailwind components)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Groq SDK (llama-3.3-70b-versatile) — Venus AI engine
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (events, reports, companies, signals, thoughts, settings)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/groq.ts` — Groq client + Venus AI system prompt
- `artifacts/vera-nexus/src/` — React frontend (pages: Line, Sight, Crypt, Thoughts, Venus AI, Settings)

## Architecture decisions

- Session-based settings (no auth): Groq key and onboarding stored per `x-session-id` in `settings` table
- Venus AI always returns structured JSON with `{ summary, cards[] }` — 5 card types: analysis, market, risk, roadmap, decision
- All AI routes have graceful fallbacks when no Groq key is configured
- Reaction toggle: unique constraint on `(thought_id, session_id, reaction_type)`, single POST endpoint toggles on/off
- Contract-first: OpenAPI spec → codegen → typed hooks; never hand-write what codegen produces

## Product

- **Line**: Chronological causal events timeline with impact scores and AI Ripple Analysis
- **Sight**: Intelligence reports feed with AI summaries
- **Crypt**: Corporate graveyard with AI-powered post-mortem autopsies
- **Thoughts Hub**: Social feed with 5 reaction types
- **Venus AI**: Chat interface powered by Groq, returns structured JSON cards (analysis, market, risk, roadmap, decision)
- **Settings**: Paste your own Groq API key, set business context for personalized AI responses

## User preferences

- Venus AI system prompt is fixed per spec in `.agents/memory/vera-nexus-stack.md`
- Design system: dark navy (#080810), indigo (#5b4fe8), mint (#00e5b0), Syne/Inter/JetBrains Mono fonts

## Gotchas

- After schema changes: `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs` before API server typecheck
- After OpenAPI spec changes: run codegen before touching routes or frontend hooks
- Groq model: `llama-3.3-70b-versatile` — change in `artifacts/api-server/src/lib/groq.ts` if needed
- Session ID should be generated client-side (localStorage UUID) and sent as `x-session-id` header on every request

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
