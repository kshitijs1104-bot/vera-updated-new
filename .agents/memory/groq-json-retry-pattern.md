---
name: Groq small-model JSON robustness
description: Pattern for getting reliable structured JSON out of small/fast Groq models (e.g. llama-3.1-8b-instant).
---

Small/fast models (e.g. `llama-3.1-8b-instant`) are noticeably less reliable than larger ones (e.g. `llama-3.3-70b-versatile`) at consistently returning a single clean JSON object, especially for verbose/multi-field schemas. Two failure modes show up in practice:

1. **Truncation** — the response gets cut off mid-object because `max_tokens` was sized for the larger model's typical output length, not the smaller model's more verbose/rambling tendency for the same schema.
2. **Format bleed** — if the system prompt contains instructions for more than one output format (e.g. a JSON-cards schema AND a separate "2-3 sentences + pipe-delimited STATS line" format meant for a different UI mode), a small model will sometimes blend both formats into a single malformed response, even when only one format's route calls it. Always audit which parts of a shared/reused system prompt actually apply to the route consuming it — a stray unused instruction block is silent poison for weaker models.

**Why:** Switching an app from `llama-3.3-70b-versatile` to `llama-3.1-8b-instant` (e.g. to route around a per-model daily token cap) can look like it "broke JSON output" when the real causes are undersized token budgets and prompt cruft that the larger model tolerated but the smaller one doesn't.

**How to apply:**
- Extract JSON robustly: strip markdown fences, then slice from the first `{` to the last `}` before `JSON.parse`.
- If parsing still fails, retry once with a stricter follow-up user message ("your previous response was not valid JSON or was truncated — return ONLY the complete JSON object now") and a higher `max_tokens` ceiling on the retry.
- Log (don't silently swallow) any entry that fails to parse even after the retry, so failures are visible rather than surfacing as generic "not configured" style fallbacks that mask the real cause.
- Keep system prompts single-purpose per consuming route; don't let one shared prompt constant carry instructions for multiple, mutually-exclusive output formats.
