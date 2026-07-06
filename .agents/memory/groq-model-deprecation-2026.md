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
