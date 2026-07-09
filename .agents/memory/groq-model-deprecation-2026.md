---
name: Groq 2026 model deprecation migration
description: llama-3.1-8b-instant and llama-3.3-70b-versatile were deprecated by Groq (announced 2026-06-17); migrated to the gpt-oss family. Read this before changing any `model:` string in this repo.
---

Groq deprecated `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` (shutdown
dates on Groq's `/docs/deprecations` page — check that page directly, don't
trust a cached date here). Every call site in this repo was migrated:

- Reasoning-heavy / user-facing causal analysis (`/ai/analyze`, `/ai/idea-review`,
  company autopsy + autopsy chat, event ripple analysis, report summaries) →
  `openai/gpt-oss-120b`.
- Lighter extraction/summarization tasks (`/ai/company-report`,
  `/ai/summarize-article`, the offline `enrich_precedents.ts` batch script) →
  `openai/gpt-oss-20b`.

**Why the split:** both gpt-oss tiers have identical free-tier rate limits on
Groq (RPM 30 / RPD 1,000 / TPM 8,000 / TPD 200,000 — verify current numbers on
Groq's `/docs/rate-limits` page, these change), so there's no quota reason to
use the smaller model anywhere reasoning quality actually matters. Quotas are
per-model buckets, not shared, so mixing tiers across routes doesn't make one
endpoint starve another.

**Known tradeoff, don't silently re-optimize around it:** the original switch
to `llama-3.1-8b-instant` (see `groq-json-retry-pattern.md`) was deliberately
done to dodge a per-model daily cap. The gpt-oss free-tier RPD (1,000) and TPD
(200,000) are both *much* tighter than 8b-instant's old RPD (14,400) / TPD
(500,000). At ~3-7K tokens per `/ai/analyze` turn (system prompt + precedent
block + history + response), that's roughly 30-40 full conversations/day
before hitting the wall on the free tier. If you ever see 429s that don't
match `isRetryableTransient`'s expected shape, check whether it's actually
"working as intended, tighter free-tier budget" before treating it as a bug.
The app already supports a per-session custom Groq key (Settings →
`x-groq-api-key` header path in `getGroqClient`) as a release valve — that's
a separate quota bucket per key.

**Also fixed in the same pass — do this for any NEW Groq call site too:**
Added `response_format: { type: "json_object" }` as an automatic default
inside `callGroqJSON()` (see `groq.ts`) so the provider enforces valid JSON at
the API level instead of relying purely on system-prompt wording. This is
Groq's basic/stable JSON mode, not the stricter `json_schema` structured-
output mode — `json_schema` is officially supported on both gpt-oss models but
has had mixed reliability reports on deeply nested schemas (see Groq community
forum threads from late 2025), and this codebase's card schema is deeply
nested (8 card types, each with its own content shape). `json_object` was the
safer choice given no way to live-test `json_schema` adherence from outside
the actual running app. If a future session wants to try upgrading to
`json_schema` for full schema-level guarantees, test it thoroughly against
`VENUS_TEST_SUITE.md` Section 5 (rendering integrity) before trusting it in
production — don't assume the forum reports are stale just because time has
passed.

**Gotcha if you touch `callGroqJSON` again:** the retry-on-parse-failure path
used to spread the original `params` (losing any per-call `response_format`
override) instead of the JSON-mode-defaulted version. Fixed by making sure
`paramsWithJsonMode` (not `params`) is the base for the retry call's spread.
Any future refactor of that retry path needs to preserve this.

---

## Update, 2026-07-10: reasoning-heavy routes moved off gpt-oss-120b to llama-4-scout

The TPM split documented above (both gpt-oss tiers at 8,000 TPM) became a real
production problem: `openai/gpt-oss-120b`'s 8K TPM ceiling was too tight given
this app's actual prompt size (~6-7K tokens per `/ai/analyze` call once
business context + precedent block + history are included), causing frequent
429s on ordinary back-to-back usage, not just heavy load.

Ran an A/B test (`scripts/src/venus-provider-ab-test.ts`, standalone, not
wired into the app) comparing `openai/gpt-oss-120b` (8K TPM) against
`meta-llama/llama-4-scout-17b-16e-instruct` (30K TPM free tier, confirmed via
Groq's own rate-limits docs — verify current value, these change). Result:
gpt-oss-120b hit real 429 rate-limit errors on 3 of 4 back-to-back test
queries; llama-4-scout answered all 4, with comparable-or-better
bottleneck-first reasoning and correctly grounded `confidenceNote` tiering
(consistent with the mentor-voice prompt merge — see the CRITICAL blocks in
`VENUS_SYSTEM_PROMPT` in `groq.ts`).

**What changed:**
- Every reasoning-heavy call site previously on `openai/gpt-oss-120b`
  (`ai.ts` — `/ai/analyze`, idea-review, company autopsy chat; `companies.ts`
  — company report + autopsy; `events.ts` — event ripple analysis;
  `reports.ts` — report summaries) now uses
  `meta-llama/llama-4-scout-17b-16e-instruct`.
- `GROQ_TPM_LIMIT` in `groq.ts` updated from `8000` to `30000` to match.
- The lighter-tier `openai/gpt-oss-20b` routes (`/ai/company-report`
  extraction variant, `/ai/summarize-article`, `enrich_precedents.ts`) were
  **not** touched — they weren't part of this test.

**Known open question, not yet resolved:** one test response (seed-round
query) named a company ("DocGenius") with a specific funding outcome and
lesson that could not be verified against this repo's actual
`VERIFIED PRECEDENTS` dataset, since the standalone test script doesn't wire
in real retrieval. This is exactly the kind of fabrication the
`NEVER FABRICATE` / retrieval-gated-precedents rules in `VENUS_SYSTEM_PROMPT`
exist to prevent. Worth specifically testing the live app (with real
precedent retrieval active) for fabricated-sounding precedent names on
`llama-4-scout` before fully trusting this model choice — don't assume this
was a one-off just because it only showed up once in a 4-query test.

**If TPM problems return:** check Groq's `/docs/rate-limits` page first for
the current llama-4-scout ceiling before assuming code regression — these
limits are explicitly noted as changing over time in every source that
documents them.
