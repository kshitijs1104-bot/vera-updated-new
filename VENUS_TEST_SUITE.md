# Venus AI — Manual Test Suite

Run this after ANY change to `groq.ts`, `ai.ts`, or `Venus.tsx`. It's built from
real bugs found in production testing, not hypotheticals — every row here is
something that actually broke once. Takes ~10 minutes.

I can't call the live Groq API from my sandbox, so I can't run this myself —
you run it in the actual app, paste me the transcript for anything that fails,
and that transcript IS the bug report (see "Standard Debug Prompt" at the
bottom). No more screenshot-by-screenshot back and forth.

**Rule of thumb:** if a change touches the system prompt or the analyze route,
run all of Section 1–4. If it's a pure UI/CSS change, Section 5 is enough.

---

## Section 1 — Context Gate (cold start, brand NEW chat, zero prior context)

| # | Prompt | Pass criteria |
|---|--------|----------------|
| 1.1 | `What's my biggest risk right now and how do I fix it?` | Asks for context (industry/stage/customer). Does NOT answer with real cards. |
| 1.2 | `Find 3 failed companies most similar to mine and why they failed` | Asks for context. |
| 1.3 | `What's the biggest threat to our burn rate and how do I fix it?` | Asks for context. |
| 1.4 | `Run an investor-fit analysis — which VCs are most likely to fund us?` | Asks for context. |
| 1.5 (negative control) | `What is a SWOT analysis?` | Answers directly, does NOT ask for context. If this one starts gating too, the gate is over-firing. |

If 1.1–1.4 fail (Venus answers without asking) → check `requiresContext()` in
`ai.ts` — the keyword list or personal-reference regex likely missed the new
phrasing. Don't just add the one word that failed; ask whether the underlying
signal (a personal "my/our/mine" reference) was even checked.

## Section 2 — Context Persistence (same chat, after giving context once)

1. Paste a context block, e.g.:
   > We're building a B2B SaaS for [industry]. [Stage], raised [$X], burning
   > [$X]/month, team of [N], targeting [customer].
2. Re-ask any prompt from Section 1.

**Pass:** does NOT re-ask for context, uses the actual numbers/industry you gave.
**Fail:** re-asks "what industry are you in" after you already said it.

## Section 3 — Founder Math (needs context from Section 2 first)

Ask a stay-vs-pivot / survival-shaped question, e.g.:
> Realistically, do we have a shot against [competitor], or should we pivot?

**Pass criteria (all of these, not just one):**
- Explicitly computes or references runway (capital ÷ burn), using the actual
  numbers you gave — not a generic "you should build a moat."
- States a real verdict word — pivot, stay, wait, raise-first — not just a
  strategy category.
- If it recommends a strategy, it says whether your stated runway can survive
  executing it (e.g. "24 months to build this moat against your 14 months of
  runway means...").

**Fail example (this exact failure happened before the fix):** "You cannot
compete on price, so build a defensible moat" with no numbers anywhere. That's
a hedge wearing a verdict's clothes.

## Section 4 — Precedent Integrity

Ask: `What should our strategy be going forward?` (or similar forward-looking ask).

**Pass:** if the precedent dataset has any success/pivot outcome relevant to
the question, at least one appears alongside any failures — not an all-failure
graveyard list.
**Also check:** every named company is one you can verify actually appeared in
that response's precedent card — no company should appear in the summary prose
that isn't backed by a precedent card.

## Section 5 — Rendering / UI Integrity

Visual-only checks, no need for context setup:

- [ ] No raw `` ```json `` code fence ever appears inside a rendered chat bubble.
- [ ] No literal `[object Object]` appears anywhere on screen.
- [ ] Long analysis-card labels (full sentences, not short tags) never crush
      the value text into single-word-per-line vertical stacking.
- [ ] The quick-jump pill nav at the top of a long response does NOT float
      over/obscure the card text as you scroll through that message.
- [ ] On a brand-new chat with an empty message list, all 5 example prompts
      are visible and reachable — either they fit on screen, or the container
      scrolls to reveal the rest (no clipped-with-no-way-to-scroll state).

## Section 6 — Specificity ("mentor," not "template generator")

Give a context block with at least one hard constraint (small team, no sales
channel, skeptical customer base, etc.), then ask for a 90-day priority.

**Pass:** the recommendation explicitly traces back to the constraint you
named ("because you have 1 dev and no sales team, your bottleneck is X, so
priority is Y") AND includes at least one concrete number/tactic/artifact —
an actual price, a named channel, a specific script — not just a category
name like "develop a pricing strategy."
**Fail:** the same answer would make sense for literally any startup in that
industry, constraint or no constraint.

## Section 7 — Risk Probability Justification

Any response with a risk card:

**Pass:** every probability number (e.g. "70%") is paired with a reason tied
to something specific — a stated fact or a named precedent — in the same
sentence or the adjacent mitigation field.
**Fail:** a round, unexplained number (70%, 80%) that reads like it would be
identical regardless of what you told Venus.

---

## Standard Debug Prompt (reuse this instead of describing bugs from scratch)

When something looks wrong, paste me this filled in — it's everything I need
in one shot instead of a back-and-forth:

```
BUG REPORT
1. Exact prompt sent: "..."
2. Full Venus response (copy-paste, not paraphrase): ...
3. New chat or continuing one with prior context already given?
4. What I expected instead:
5. Which test-suite section does this map to (1–7 above), if any:
6. Screenshot attached? (for anything visual)
```

This makes every bug reproducible against a specific section of this suite
instead of a one-off patch, and tells me whether to look at `requiresContext`,
the system prompt, the rendering code, or the model/API layer — the four
places bugs have actually come from so far.
