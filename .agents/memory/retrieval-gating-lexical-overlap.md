---
name: Lexical retrieval-gating false positives
description: Why keyword-overlap retrieval gates leak ungrounded answers unless generic vocabulary is stripped, and how to catch it.
---

When gating an LLM's ability to cite "verified precedents" behind a lexical (keyword-overlap) retrieval score, generic domain vocabulary that appears in nearly every record in the corpus — words like "startup", "company", "raise", "series", "funding", "product", "scale" — will match almost any query and silently defeat the gate. A query with zero real topical connection to the dataset can still cross the match threshold purely because both the query and an unrelated record mention "startup" and "raise".

**Why:** Found this the hard way — a query about "quantum-encrypted satellite manufacturing" matched and cited a foodtech company ("Zume") purely on shared generic words, even though the retrieval function had an explicit sector-keyword-inference layer. The sector inference correctly returned `null` (no sector keywords hit), but pure lexical overlap on stopword-adjacent generic terms alone was enough to pass the ratio threshold since the query had few tokens (small denominator).

**How to apply:** When building any keyword/TF-style retrieval gate over a small-to-medium domain-specific corpus (not a real embedding/vector index):
1. Expand the stopword list to include generic vocabulary specific to the domain being searched (for a startup-outcomes corpus: "startup", "company", "raise", "funding", "product", "market", "team", "scale", "revenue", "customer", etc.) — anything that would appear in most records regardless of topic.
2. Add a minimum *raw* overlap-count floor (not just a ratio) so a match can't be manufactured from 1-2 coincidental shared words when the query is short.
3. Test the gate specifically with an intentionally out-of-domain query and check the actual top-matched record's identity, not just whether `matched` came back true/false — a wrong-but-confident match is worse than a correct refusal.
