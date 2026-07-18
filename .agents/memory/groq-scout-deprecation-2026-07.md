---
name: Groq llama-4-scout deprecation, reverted to gpt-oss-120b
description: meta-llama/llama-4-scout-17b-16e-instruct was deprecated by Groq (announced 2026-06-17, hard 404 model_not_found as of 2026-07-18); every call site reverted to openai/gpt-oss-120b. Read this before changing any `model:` string in this repo, and before re-attempting a move to Scout or to qwen/qwen3.6-27b.
---

## What happened

On 2026-07-10 this repo migrated every Venus reasoning route from
`openai/gpt-oss-120b` to `meta-llama/llama-4-scout-17b-16e-instruct`, chasing
a 30,000 TPM free-tier ceiling vs gpt-oss-120b's 8,000 (see
`scripts/src/venus-provider-ab-test.ts` header for the full A/B methodology
that justified that move at the time).

On 2026-07-18, production started throwing:

```
404 {"error":{"message":"The model `meta-llama/llama-4-scout-17b-16e-instruct`
does not exist or you do not have access to it.","type":"invalid_request_error",
"code":"model_not_found"}}
```

This is a **hard deprecation, not a rate limit or outage** — Groq announced
on 2026-06-17 that Scout was being deprecated in favor of `openai/gpt-oss-120b`
or `qwen/qwen3.6-27b` (their own recommendation, in that order), and pulled
free/developer-tier access to it. Retrying does nothing; the model string
itself no longer resolves.

## What was reverted (2026-07-18)

Every call site that had been switched to Scout on 2026-07-10 went back to
`openai/gpt-oss-120b` — i.e. this repo is now back to exactly where it was
before that migration:

- `artifacts/api-server/src/routes/ai.ts` — `/ai/analyze` main reasoning call,
  idea-review follow-up call, decision-lesson distillation call (3 call sites)
- `artifacts/api-server/src/routes/companies.ts` — company autopsy + autopsy
  chat (2 call sites)
- `artifacts/api-server/src/routes/events.ts` — event ripple analysis
- `artifacts/api-server/src/routes/reports.ts` — report summary generation
- `artifacts/api-server/src/lib/groq.ts` — `GROQ_TPM_LIMIT_BY_MODEL` comment
  updated; the `meta-llama/llama-4-scout-17b-16e-instruct: 30000` entry was
  **left in the map** (not deleted) so a stray future call site that still
  names it fails with a clamped, informative request shape rather than an
  undefined TPM lookup — but confirm no real call site actually references it
  before relying on that safety net.
- `scripts/src/venus-provider-ab-test.ts` — `MODEL_B` swapped from Scout to
  `qwen/qwen3.6-27b` so the script still compiles and still tests something
  real; see "Open question" below before trusting its output.

`openai/gpt-oss-20b` lighter-tier routes (`/ai/company-report`,
`/ai/summarize-article`, `enrich_precedents.ts`) were never on Scout and are
untouched.

## Known tradeoff, don't silently re-optimize around it

This revert gives back the 30K→8K TPM headroom the original migration was
chasing. The 429 risk that migration was trying to avoid is real again. If
429s start showing up in server logs (check `isRetryableTransient` match
shape first — `callGroqJSON` already retries transient 429/5xx automatically,
so a 429 reaching the logs means it survived that retry), that's this
tradeoff resurfacing, not a new bug.

## Open question for a future session: qwen/qwen3.6-27b

Groq's deprecation notice lists `qwen/qwen3.6-27b` as an alternative to
gpt-oss-120b, and it's newer/larger than Scout was. At the time of this
revert, no confident published Groq-specific TPM figure for this model was
available via web search — don't assume it's a free upgrade over gpt-oss-120b
without actually re-running `scripts/src/venus-provider-ab-test.ts`
(`MODEL_A = openai/gpt-oss-120b` vs `MODEL_B = qwen/qwen3.6-27b`) and checking
Groq's `/docs/rate-limits` page directly for the current TPM ceiling before
trusting it. Don't repeat the 2026-07-10 mistake of migrating production
traffic before confirming the actual rate-limit numbers hold up under real
back-to-back load, not just a burst test.

## General lesson

This is the **second** time a Groq model this repo depended on has been
deprecated out from under it in about a month (see
`groq-model-deprecation-2026.md` for the first, `llama-3.1-8b-instant` /
`llama-3.3-70b-versatile`). Before picking a model for a new call site or a
migration, check Groq's `/docs/deprecations` page directly for how recently
it launched and whether it's flagged "Preview" (preview models "may be
discontinued at short notice" per Groq's own docs) vs "Production." Scout's
status at the time of the 07-10 migration isn't recorded in this repo's
history — if a future session repeats this kind of migration, note the
model's production/preview status in the migration commit so this exact
surprise is easier to have predicted next time.
