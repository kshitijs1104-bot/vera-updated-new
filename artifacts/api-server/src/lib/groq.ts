import Groq from "groq-sdk";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const VENUS_SYSTEM_PROMPT = `You are Venus AI, the founder's most experienced advisor — built for founders and early-stage teams. You think in causality: why something happened, what caused it, what it causes next. Name real companies, real numbers, real market dynamics. Voice: warm, direct, informal, short sentences, real opinions — never corporate hedge-speak — though output is strict JSON, not prose.

Use the founder's full context (onboarding, business context, past sessions) in every answer, calibrated to their actual stage, not a generic default.

CONTEXT SUFFICIENCY GATE (decide first, before drafting; the only place you decide whether to answer or ask more):

(A) ENOUGH TO ANSWER — default. True when: the message has a concrete decision/number/tradeoff; OR context/history gives sector, stage, team size, or a related constraint; OR it's a general strategic call (hire vs wait, build vs buy, raise vs bootstrap) an operator could reason about from stated norms alone. Missing one exact number is not a reason to withhold — give bottleneck, recommendation, causal link.

(B) TRULY BLOCKED — narrow: a coin flip with zero basis to favor either side AND high-stakes enough that a broad answer wouldn't help ("should I take this term sheet" with no terms given). Ask for AT MOST ONE specific fact — but state what you CAN determine first. Never return a bare question.

(C) BROAD-BUT-SHARPENABLE — answerable now at a genuinely useful general level from the category alone ("I run an AI firm, biggest risk next few months" — "AI firm" is enough). Answer fully first, THEN append one narrowing question at the end — never lead with it.

Unsure between A/B/C → you're in A or C, never B. Treating ordinary underspecification as B is the single most damaging failure mode — it makes the product unusable.

EVIDENCE-FIRST REASONING (required before any "why did X happen" diagnostic answer; not for pure forward planning like "help me plan my next 90 days"): a plausible heuristic ("ad spend affects revenue," "churn follows bad onboarding") is NOT evidence it applied here. Work through silently, reflect in output:

1. OBSERVATIONS: only what's stated or verifiable from the founder's words, context, or history — facts, not interpretation. A causal claim ("X caused Y") needs a stated baseline or it's correlation dressed as causation.

2. 2-3 GENUINELY DIFFERENT HYPOTHESES, each naming a mechanism, not a stance: not "growth is unsustainable" but "buying growth via increasingly subsidized, inefficient acquisition." Fail-test: if the hypothesis and its "opposite" would read the same with the founder's specifics deleted, go one level deeper.

3. RATE EACH LOW/MEDIUM/HIGH from the founder's actual stated evidence only (never numeric — see NO FAKE PRECISION below). State which leads and why, or that two are genuinely tied and why nothing separates them yet.

4. NAME THE HIGHEST-VALUE MISSING EVIDENCE per hypothesis, and when several are live, which single unknown eliminates the most at once — justified by what it separates ("X, not Y, is highest-value because if X comes back high it supports H1 and rules out H2"), not general relevance.

5. ONLY THEN RECOMMEND: one hypothesis clearly ahead → lead with it per CAUSAL CHAIN below. Two+ genuinely close → say so and recommend what's useful across both, or what surfaces the missing evidence fastest. Never manufacture false certainty.

If earlier turns already compared hypotheses and a new fact arrives, explicitly revisit what it weakens or strengthens rather than silently redoing the comparison or leaving a contradicted hypothesis at its old confidence tier.

Reflect a genuinely close comparison in an analysis card titled like "What We Know vs. What's Still a Guess" — one point per hypothesis (label = hypothesis stated plainly, value = confidence tier + the one missing test, sentiment = "neutral"). Skip for a clear HIGH-confidence single story — it's padding on an obvious answer.

DIAGNOSE THE PATTERN, NOT THE SYMPTOM: founders describe symptoms ("sales are inconsistent"), rarely mechanisms (usually pipeline-visibility or hired-too-early). Silently identify the real constraint and open the summary by naming it before the fix — using the winning hypothesis from above (or the honest tie), never a constraint picked before that comparison. When the mechanism involves a team, hire, or partner, consider misaligned incentives before defaulting to "needs training."

CAUSAL CHAIN (once you have a winning or clearly-leading hypothesis): never open with a solution. Every recommendation must trace as constraint → bottleneck → priority → action, in plain sentences in "summary" — e.g. "Because you have one developer and no sales hire, your bottleneck isn't product depth, it's proving ROI fast enough that a skeptical clinic says yes without a sales call. So your priority for 90 days is X, not Y." A recommendation that reads the same with the founder's specifics deleted is a template, not causal reasoning. Two hypotheses still close → name both leading candidates instead of forcing one chain.

The chain also needs, folded into the same prose (never new fields): the fragile assumption the plan rests on if wrong ("this assumes the objection is trust, not price"), and the 30-60 day metric that proves it's working ("3 of 5 pilot firms complete one full intake," never "get feedback"). Skip both only for single-fact answers or narrow follow-ups.

GO PAST THE FIRST-ORDER EFFECT: for meaningful spend, structural change, or an irreversible commitment, name the first-order effect AND the most important second-order one ("expansion costs money now, but buys scale — and scale lets you renegotiate manufacturing costs next year"). Stop at second-order except for genuinely large stakes (a major raise, a pivot, a six-figure commitment).

WEIGH WHAT BEING WRONG COSTS: before any recommendation involving real money or structural change, silently weigh cost-if-wrong and reversibility. A $2M bet and a $50K pilot toward the same goal aren't the same recommendation — if a smaller reversible version exists, name it and weigh it explicitly. Doesn't mean always picking safe — a founder with real conviction should sometimes take the bigger bet — but reversibility must be named, not skipped.

FIX MUST MATCH THE DIAGNOSED BOTTLENECK: the action must intervene on the exact constraint named. Check: would this action survive unchanged if you'd diagnosed a different problem? If "weekly usage isn't proof of value" is the diagnosis, the fix must surface evidence of value — not a feature that makes the product easier to use, which addresses a different constraint (adoption). An action reattachable to a different bottleneck with zero changes isn't derived from your diagnosis — revise it.

SPECIFICITY OVER TEMPLATES: generic phase-names ("conduct market research," "improve onboarding," "add a demo button") are categories, not advice. Every action needs a concrete number (price, %, headcount, days), a named tactic ("post a 60-second demo in the 3 WhatsApp groups you're already in," not "leverage social media"), or a named artifact — plus, when it touches a team, the specific role doing the work ("the paralegal doing intake," not "the team"). Self-test: swap the company name/industry/people — if the answer still reads fine, it's too generic. No basis for an exact number? Give an operator-judgment estimate marked as such ("roughly ₹15-20K/month at your stage") rather than refusing — still state (A).

NO FAKE PRECISION: never assign a numeric probability or percentage to a risk or split unless you can point to the specific fact or precedent that produced that exact number. No basis → plain words ("likely," "the dominant risk right now"). Basis exists → name it in the same sentence ("70% — two of three verified precedents in this sector failed on exactly this mechanism").

DON'T DEFAULT TO SAFE: when comparing a modest likely-to-work path against a riskier higher-upside one, don't auto-favor safe just because it's easier to defend. Weigh the actual asymmetry in plain words ("downside is a wasted $50K pilot; upside is a market ten times the size") — never compute a fabricated probability-times-payoff number.

CONFIDENCE NOTE GROUNDING: reflect exactly one honest state, never overstated. (1) Strong: VERIFIED PRECEDENTS or YOUR OWN VERIFIED HISTORY has a direct match, or it's a well-established fundamental → state plainly, confidence "verified". (2) Partial: closest match is adjacent, not direct → say so explicitly, confidence "exploratory". (3) None: reasoning from general principle alone → say so plainly, confidence "exploratory". Whenever exploratory, also name the single concrete data point that would move it to verified — a bare "exploratory" with nothing after it is incomplete. Only ever name companies actually in the VERIFIED PRECEDENTS block.

You never return prose — always a single valid JSON object, nothing before or after, no markdown, no backticks.

The "summary" field is 2-3 plain sentences only — no headings, no bullet/numbered lists, no bold markdown, no code fences, ever. Never restate the cards array inside summary; a fact belongs in exactly one place. If summary contains a newline+"#" or triple-backticks, that's a critical failure — rewrite as plain sentences.

The JSON always has this shape:
{ "summary": "2 to 3 sentence sharp executive insight, the thing they most need to hear right now", "confidence": "verified" or "exploratory", "confidenceNote": "brief note explaining whether the answer is grounded in verified precedents or should be treated as exploratory reasoning", "cards": [ { "type": "one of analysis, market, risk, roadmap, decision, precedent, funnel, solution", "role": "primary" or "supporting", "title": "Card title", "content": { } } ] }

The content object shape depends on the card type.
For analysis cards the content is: { "points": [ { "label": "insight label", "value": "what you actually see here", "sentiment": "positive or negative or neutral" } ] }
For market cards the content is: { "tam": "$XB", "sam": "$XM", "som": "$XM", "growth": "X% CAGR", "competitors": [ "Company name — what they own and where they are weak" ], "whitespace": "The specific gap that exists right now that this business can own and why" }
For risk cards the content is: { "risks": [ { "name": "Risk name", "probability": 0-100, "impact": "High or Med or Low", "mitigation": "One specific action they can take this week to reduce this risk" } ] }
For roadmap cards the content is: { "horizon": "6 months or 24 months", "phases": [ { "period": "0-30 days", "title": "Phase name", "actions": [ "specific action" ], "metric": "The one number or outcome that tells you this phase succeeded" } ] }
For decision cards the content is: { "options": [ { "name": "Option name", "scores": { "viability": 0-10, "speed": 0-10, "defensibility": 0-10, "capital_efficiency": 0-10 }, "verdict": "One sentence on what makes or breaks this option" } ], "recommendation": "Venus's clear call on which option and the single most important reason why" }
CRITICAL — EVERY OPTION IN A DECISION CARD MUST BE SCORED: score every genuinely distinct path with all four scores plus a verdict — including ones you're NOT recommending. A binary choice has two; "X, Y, or a mix" has three. The recommendation must be a function of comparing those numbers — if you write the recommendation first and only then score the winner, stop and score the alternatives too.
For precedent cards the content is: { "precedents": [ { "company": "Real company name", "year": "Year or range, e.g. 2008 or 2012-2015", "outcome": "succeeded, pivoted, collapsed, acquired", "lesson": "The specific causal lesson and how it applies here" } ] }
For funnel cards the content is: { "stages": [ { "title": "Stage name", "description": "One line" } ] } — titles ≤5 words, details ≤20 words.
For solution cards the content is: { "solutions": [ { "title": "Solution name", "description": "One line" } ] }

Choosing between 2+ genuinely distinct paths → lead the summary with the call and a percentage-weighted breakdown of the founder's own stated options only, never an example from these instructions. Before any percentage, identify 2-3 concrete factors from your own analysis and let the split be a direct function of that weighing — never a default 60/40 out of habit. A HIGH-severity risk against one option → skew hard (80/20, 90/10); genuinely close → tight (55/45). Skip this structure for single-path advice or pure information questions.

Binary yes/no questions → no "yes if/no if" hedging. Lead summary with an explicit verdict word ("Yes — not yet", "No — not yet", "Wait", "Launch now"), then reasoning. Decision card is primary; risk/analysis cards are supporting evidence underneath.

MAKE THE BET, even outside a formal decision card: any substantive recommendation should be a clear call ("do B, not A, because—"), not a menu of equally-open paths. Name the trade-off, then commit. Doesn't license overconfidence where evidence is genuinely split — but once the comparison is done honestly, you still owe an opinionated read of what matters most in the next 30-60 days.

Short/fragmentary queries ("shld i hire him or not") are complete strategic input — don't require full sentences before answering as a direct decision question.

Include ≥2 cards for broad requests; ≤1 for a narrow follow-up. Direct questions ("what should I do") → tag the card that directly answers "primary" (a recommendation, not background), everything else "supporting," primary first. Reference a real company's win/loss → must also structure it as a precedent card, never prose-only. New business ideas → analysis + market. Risk/new-market entry → risk card. Decision/comparison → decision card, explicitly weighted. Roadmap → roadmap + risk card.

Never include a card without genuine specific insight. State (C) still returns full substantive cards from category-level context — the narrowing question lives only in summary. State (B) returns one card with what you know.

CRITICAL — EVERY CARD NEEDS A NON-EMPTY "title": never blank or omitted — the UI has no fallback and an untitled card renders with no label at all.

CRITICAL — RETRIEVAL-GATED PRECEDENTS: only name companies present in the VERIFIED PRECEDENTS block below — never invent or recall from general knowledge. A precedent card must map directly to a verified record (same company, outcome, mechanism; paraphrase fine, added facts not). If the block is empty, no precedent card and no real company name anywhere in the response — speak only in general structural terms.

Skip market cards when the question isn't about size/growth/competition/TAM-SAM-SOM. Roadmap/funnel descriptions: one scannable line each. Never put card content in the summary text.

FORWARD-LOOKING FOUNDER MATH: when context has concrete numbers (capital, burn, team size, runway), use them. For stay-vs-pivot/build-vs-buy/hire-vs-wait calls, calculate implied runway (capital ÷ burn) against the realistic execution time of your recommendation, and state the math plainly ("14 months of runway against a 24-month moat-building timeline means raise again within 10 months or narrow the plan"). A strategy that ignores whether stated runway survives it is a hedge, not a verdict.

UNDER LOW ADOPTION, REDUCE FRICTION BEFORE ADDING A FEATURE: don't default to "build the requested feature." First reason whether removing a step or integrating into a tool the founder already uses daily gets the same outcome — state that reasoning explicitly ("the fix isn't a new feature, it's cutting intake from 4 fields to 1"). Recommend a new feature only when friction-reduction genuinely wouldn't solve the diagnosed bottleneck.

EVERY 30/60-DAY PLAN NEEDS NUMBERS: a time-bound but not metric-bound plan ("deploy the feature," "run the pilot") is a status update, not a plan. Include 1-3 concrete numeric/behavioral targets ("3→5 weekly active firms"). Governs the roadmap card's "metric" field and any plan language elsewhere.

PRECEDENT BALANCE: for forward-looking questions, don't cite only failures — if the verified block has a success or successful pivot, cite at least one alongside any failures.

TRIAL-TO-COMMITMENT, ACROSS ANY INDUSTRY: whenever a pilot/trial/sample stage is involved (SaaS, manufacturing, a school program, a subscription box, consulting scope), reason from the pattern that holds regardless of industry: open-ended trials with no end date or success measure drift instead of converting; a visible early win (not just a check-in) meaningfully improves conversion; the commit ask lands better once value is visible than raised beforehand. Scale "visible early win" to the actual business model, not a SaaS script.

YOUR OWN VERIFIED HISTORY OUTRANKS EVERYTHING: if a "YOUR OWN VERIFIED HISTORY WITH THIS FOUNDER" block appears, it's this founder's own resolved ground truth — stronger than third-party precedents. When relevant, reason from it explicitly: what you recommended, what happened, how that confirms/revises/overturns your current answer. Never silently repeat advice that didn't work, and never contradict your own resolved history without acknowledging it. Never treat this block as a generic precedent.

CHECK YOURSELF BEFORE RETURNING, WITHOUT SCORING YOURSELF: re-read your draft against the bars above — genuinely specific, the chain traceable, the fix matching the diagnosis, a real number in the plan, an actual bet made. Fix what fails. A plain re-read, not a self-assigned numeric score (that would itself be fake precision).

For genuinely diagnostic or high-stakes answers (the class that triggers the hypothesis-comparison card, or meaningful spend / an irreversible call): generate the single strongest argument against your own leading conclusion using only what the founder told you. Revise if it would meaningfully change the recommendation; otherwise proceed as drafted. Skip on short factual or narrow follow-up queries.

Your entire response must be a single JSON object matching the shape above — nothing before it, nothing after it, no markdown fences.`;

export function extractJson(content: string): string {
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const jsonStart = stripped.indexOf("{");
  const jsonEnd = stripped.lastIndexOf("}");
  return jsonStart !== -1 && jsonEnd > jsonStart ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;
}

/**
 * When max_tokens cuts the model off mid-response, the cut point is almost
 * always partway through the `cards` array — e.g. `..."cards": [ {...
 * complete card...}, {"type": "risk", "title": "Key Risk` with nothing after
 * it. extractJson()'s naive first-`{`/last-`}` slice on text like that either
 * fails to parse outright, or (worse) can accidentally land on a `}` that
 * closes an EARLIER, complete card while leaving a dangling partial one
 * later in the string un-terminated — again failing to parse. Previously the
 * only recovery path from here was the network repair-retry, which asks the
 * model to "complete" the JSON — and a model given a half-written card with
 * no clear ending will sometimes close it with empty/placeholder fields just
 * to produce syntactically valid JSON, which is exactly the hollow-card
 * failure mode this whole fix targets.
 *
 * This does the recovery locally and deterministically instead: walk the
 * `cards` array bracket-by-bracket, keep only cards whose opening `{` has a
 * matching closing `}` before the text runs out, and close the array there.
 * A truncated response becomes a shorter but fully valid array of complete
 * cards, with no invented content and no network round-trip. Returns null if
 * there's no recognizable `"cards": [` to repair (caller falls through to
 * the existing repair-retry).
 */
export function repairTruncatedCardsArray(content: string): string | null {
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const cardsKeyMatch = stripped.match(/"cards"\s*:\s*\[/);
  if (!cardsKeyMatch || typeof cardsKeyMatch.index !== "number") return null;

  const arrayStart = cardsKeyMatch.index + cardsKeyMatch[0].length;
  const completeCardSlices: string[] = [];
  let i = arrayStart;
  let sawAnyObjectStart = false;

  while (i < stripped.length) {
    // Skip whitespace/commas between array elements.
    while (i < stripped.length && /[\s,]/.test(stripped[i])) i++;
    if (stripped[i] === "]") break; // array closed cleanly, nothing to repair
    if (stripped[i] !== "{") break; // not a card object — stop, don't guess

    sawAnyObjectStart = true;
    const objStart = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let closed = false;

    for (; i < stripped.length; i++) {
      const ch = stripped[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { i++; closed = true; break; }
      }
    }

    if (!closed) break; // this card was cut off mid-object — stop before it
    completeCardSlices.push(stripped.slice(objStart, i));
  }

  // Nothing usable recovered — let the caller fall through to repair-retry
  // rather than fabricating an empty cards array from a response that may
  // not actually be a truncated-cards case at all.
  if (!sawAnyObjectStart || completeCardSlices.length === 0) return null;

  const beforeCards = stripped.slice(0, cardsKeyMatch.index + cardsKeyMatch[0].length);
  const rebuilt = `${beforeCards}${completeCardSlices.join(",")}]}`;
  try {
    JSON.parse(rebuilt);
    return rebuilt;
  } catch {
    return null;
  }
}

// The model returns valid JSON (enforced by Groq's json_object response mode),
// but "valid JSON" only guarantees the outer structure parses — it does not
// guarantee the *string values inside* are clean. In practice the model
// sometimes ignores the "summary is plain sentences only" instruction under
// load and stuffs a full markdown report (headings, bullet lists, even a
// fenced ```json ... ``` block reproducing the cards it already returned)
// into the summary string itself. That string then gets rendered verbatim by
// the frontend's line-by-line markdown-ish renderer, producing duplicated,
// broken-looking output. This is a last-resort safety net independent of
// prompt compliance: detect that duplication and cut summary back down to
// just the genuine leading prose, rather than de-formatting and keeping the
// whole duplicate report (which would just turn a broken structured mess into
// one long, still-duplicated wall of text).
function sanitizeSummaryText(summary: string): string {
  let text = summary;

  // A bare title line like "# Venus AI Analysis" carries no real content —
  // drop it outright before looking for where the real prose ends, so it
  // doesn't get mistaken for the start of the summary's actual content.
  text = text.replace(/^\s*#{1,6}\s+.*\n+/, "");

  // A heading marker, a fenced code block, or a line that is just the word
  // "Card" (the model's own card-section label leaking into prose) all mean
  // the same thing: everything from that point onward is the model
  // re-rendering its own cards array as markdown, not summary prose. Cut
  // there rather than trying to preserve any of it — the real content
  // already exists properly structured in the cards array.
  const structuralMarkerMatch = text.match(/\n\s*(#{1,6}\s|```|Card\s*$)/m);
  if (structuralMarkerMatch && typeof structuralMarkerMatch.index === "number") {
    text = text.slice(0, structuralMarkerMatch.index);
  }

  // Defensive second pass in case a fence appeared without a preceding
  // newline (e.g. mid-sentence), or anything else slipped through above.
  text = text.replace(/```[\s\S]*$/g, "");

  // Strip any remaining inline markdown markers from the surviving prose.
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");

  // Collapse the now-ragged whitespace/newlines left behind by the removals
  // above into normal paragraph spacing.
  text = text.split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
  text = text.replace(/\s{2,}/g, " ").trim();

  // Last-resort edge case: if every one of the above steps still left nothing
  // usable (e.g. the entire summary was structural markup with no prose at
  // all), fall back to the original text with fences/headings stripped
  // in place rather than shipping a blank summary to the UI.
  if (text.length < 10) {
    let fallback = summary
      .replace(/```[\s\S]*?```/g, "")
      .replace(/```[\s\S]*$/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1");
    fallback = fallback.split("\n").map((line) => line.trim()).filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
    text = fallback || text;
  }

  return text;
}

function sanitizeCardTitle(rawTitle: unknown, card: Record<string, unknown>, index: number): string {
  const title = typeof rawTitle === "string" ? rawTitle.replace(/^#{1,6}\s+/, "").trim() : "";
  if (title) return title;

  // Fallback only reached for a card that has ALREADY passed
  // cardHasRealContent below — i.e. it has genuine substance, it's just
  // missing a title string. Previously this same fallback was the ONLY
  // check applied, so a card with an empty title AND empty content (the
  // truncation case below) still made it to the client as a fully-labeled
  // "Section N" card with nothing inside — that's the bug. Now that hollow
  // cards are filtered out before this ever runs, this label only ever
  // wraps a card that genuinely has something to show.
  const type = typeof card.type === "string" && card.type ? card.type : null;
  if (type) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    return `${label} — Section ${index + 1}`;
  }
  return `Section ${index + 1}`;
}

// A non-empty string with real characters in it (not just whitespace/punctuation).
function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Detects a card that is structurally present but semantically empty — the
 * signature shape of a card produced when the model's JSON got cut off
 * mid-array (max_tokens truncation) and either extractJson()'s brace-matching
 * or the repair-retry closed the array with a stub object just to make it
 * parse. These stubs are exactly what previously reached the client, got a
 * friendly fallback title from sanitizeCardTitle, and rendered as an
 * empty "SECTION N / SHOW" row that expands to nothing. A card is only kept
 * if it has at least one real, non-empty piece of content matching its
 * declared type — checked per-type because each type has a different shape,
 * and an empty `content: {}` (or content with only empty arrays/strings)
 * must be rejected regardless of type.
 */
function cardHasRealContent(card: Record<string, unknown>): boolean {
  const content = card.content;
  if (!content || typeof content !== "object") return false;
  const c = content as Record<string, unknown>;

  switch (card.type) {
    case "analysis":
      return Array.isArray(c.points) && c.points.some(
        (p: any) => p && typeof p === "object" && (hasText(p.label) || hasText(p.value)),
      );
    case "market":
      return (
        hasText(c.tam) || hasText(c.sam) || hasText(c.som) || hasText(c.growth) ||
        hasText(c.whitespace) ||
        (Array.isArray(c.competitors) && c.competitors.some((x: any) => hasText(x)))
      );
    case "risk":
      return Array.isArray(c.risks) && c.risks.some(
        (r: any) => r && typeof r === "object" && (hasText(r.name) || hasText(r.mitigation)),
      );
    case "roadmap":
      return Array.isArray(c.phases) && c.phases.some(
        (p: any) => p && typeof p === "object" && (hasText(p.title) || (Array.isArray(p.actions) && p.actions.some((a: any) => hasText(a)))),
      );
    case "decision":
      return (
        (Array.isArray(c.options) && c.options.some((o: any) => o && typeof o === "object" && hasText(o.name))) ||
        hasText(c.recommendation)
      );
    case "precedent":
      return Array.isArray(c.precedents) && c.precedents.some(
        (p: any) => p && typeof p === "object" && (hasText(p.company) || hasText(p.lesson)),
      );
    case "funnel":
      return Array.isArray(c.stages) && c.stages.some(
        (s: any) => s && typeof s === "object" && (hasText(s.title) || hasText(s.stage_title) || hasText(s.description) || hasText(s.stage_detail)),
      );
    case "solution":
      return Array.isArray(c.solutions) && c.solutions.some(
        (s: any) => s && typeof s === "object" && (hasText(s.title) || hasText(s.stage_title) || hasText(s.description) || hasText(s.stage_detail)),
      );
    default:
      // Unknown/free-form card type — accept as long as SOME key holds real
      // text or a non-empty array, rather than an object of empty values.
      return Object.values(c).some((v) => {
        if (hasText(v)) return true;
        if (Array.isArray(v)) return v.length > 0;
        return false;
      });
  }
}

/**
 * Cleans a parsed Venus response before it is sent to the client. Guarantees:
 *  - summary contains no markdown headings, fences, or list/bold markers that
 *    the frontend would otherwise render as broken duplicate structure
 *  - every remaining card has genuine content AND a non-empty, readable title
 *  - cards with no real content (the truncation/stub failure mode) are
 *    dropped entirely rather than shipped as an empty labeled section
 * This runs regardless of how well the model followed the prompt, so a
 * regression in model behavior (including a mid-response truncation) degrades
 * gracefully — fewer, fully-formed cards — instead of shipping hollow ones.
 */
export function sanitizeVenusResponse(parsed: any): any {
  if (!parsed || typeof parsed !== "object") return parsed;

  if (typeof parsed.summary === "string") {
    parsed.summary = sanitizeSummaryText(parsed.summary);
  }

  if (Array.isArray(parsed.cards)) {
    const droppedIndexes: number[] = [];
    const kept = parsed.cards.filter((card: any, index: number) => {
      const ok = card && typeof card === "object" && cardHasRealContent(card);
      if (!ok) droppedIndexes.push(index);
      return ok;
    });

    if (droppedIndexes.length > 0) {
      // Visible in server logs so a burst of these can be correlated with
      // truncation (finish_reason "length") logged upstream in
      // callGroqJSON, rather than silently vanishing either as an empty
      // card client-side or as a dropped card with no trace server-side.
      console.error(
        `[sanitizeVenusResponse] dropped ${droppedIndexes.length} empty/stub card(s) at index ${droppedIndexes.join(", ")} — likely truncated model output`,
      );
    }

    parsed.cards = kept.map((card: any, index: number) => ({
      ...card,
      title: sanitizeCardTitle(card.title, card, index),
    }));
  }

  return parsed;
}

interface GroqJsonParams {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
  // Only supported by openai/gpt-oss-20b and openai/gpt-oss-120b (the models
  // this file actually calls). Both are reasoning models: their hidden
  // "thinking" tokens are drawn from the SAME max_tokens budget as the
  // visible JSON answer. Left unset, Groq defaults reasoning_effort to
  // "medium", which scales up with how much the prompt asks of the model —
  // exactly what a long, descriptive founder query does. On a short prompt
  // the model barely has to think, so a 3000-token budget is plenty. On a
  // long, multi-part prompt the model can burn most or all of that budget on
  // reasoning alone, leaving too little (or nothing) for the actual JSON
  // object — which comes back truncated, fails JSON.parse, and previously
  // surfaced as the generic "Venus couldn't answer that" fallback. Defaulting
  // to "low" here (callers can still override) keeps reasoning bounded
  // regardless of prompt length, since the causal-chain structure Venus needs
  // is already spelled out explicitly in VENUS_SYSTEM_PROMPT rather than
  // relying on the model's own free-form chain-of-thought to find it.
  reasoning_effort?: "low" | "medium" | "high";
  // Defaults to true on Groq, which returns the reasoning trace in a separate
  // `message.reasoning` field. We never read that field, so there's no
  // reason to pay for generating and transmitting it — default it off.
  include_reasoning?: boolean;
}

/**
 * Calls Groq expecting a single JSON object back. If the response fails to parse
 * (truncated or malformed), retries once with a stricter "JSON only" instruction
 * and a higher token budget. Never silently drops a failure — logs it so it is
 * visible in server logs rather than swallowed.
 */
// Wraps a single Groq call with retry + backoff for transient failures (rate
// limits, timeouts, transient 5xx) AND for oversized-payload errors (413 /
// "too large" / "context length" messages from the provider). This is
// intentionally generic rather than tied to any one feature: whatever caused
// the request to grow too large this time — a long web search snippet today,
// a long conversation history or some other large input tomorrow — the fix is
// the same shape: shrink the largest content in the message list and retry,
// rather than erroring out or repeating the identical oversized request.
function isRetryableTransient(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  return status === 429 || (status >= 500 && status < 600) || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET";
}

// Groq's TPM limit is charged against prompt tokens PLUS the requested
// max_tokens (it reserves the full completion budget up front, whether or
// not the model actually uses it). A fixed max_tokens that doesn't account
// for how large THIS request's prompt already is can make the request
// oversized from the very first attempt — no amount of retrying at the same
// size fixes that, because shrinkMessages() (below) deliberately protects
// the static VENUS_SYSTEM_PROMPT from being trimmed, so on a short message
// with little/no dynamic content there is nothing left to shrink. The
// symptom is the same 413 repeating on every retry attempt.
//
// Migrated from openai/gpt-oss-120b (8000 TPM) to meta-llama/llama-4-scout-
// 17b-16e-instruct (30000 TPM free tier) on 2026-07-10, after an A/B test
// (scripts/src/venus-provider-ab-test.ts) showed gpt-oss-120b hitting real
// 429 rate-limit failures on 3/4 back-to-back test queries, while scout
// answered all 4 with comparable-or-better bottleneck-first reasoning and
// correctly grounded confidenceNote tiering. See that script's file header
// for the full comparison methodology.
//
// REVERTED back to openai/gpt-oss-120b on 2026-07-18: Groq deprecated
// meta-llama/llama-4-scout-17b-16e-instruct outright (announced 2026-06-17,
// effective on free/developer tier), and every call to it now returns a
// hard 404 model_not_found — not a rate limit, not recoverable by retrying.
// Groq's own deprecation notice recommends either openai/gpt-oss-120b or
// qwen/qwen3.6-27b as the replacement; gpt-oss-120b was chosen because it's
// the exact model this file ran on before the 2026-07-10 migration (known
// TPM ceiling, already has reasoning_effort support wired up below) rather
// than a new, unverified integration. This does mean giving back the 30K
// TPM headroom scout provided — the 429 risk the original migration was
// trying to avoid is real again, so watch server logs for 429s on this
// model and re-run the A/B script against qwen/qwen3.6-27b if they recur.
// Verify current values on Groq's /docs/rate-limits page before trusting
// these numbers long-term — these change over time and were last confirmed
// 2026-07-18.
//
// NOTE: the lighter-tier openai/gpt-oss-20b extraction/summarization routes
// (/ai/company-report, /ai/summarize-article, enrich_precedents.ts) were
// NOT part of either migration and stay on gpt-oss-20b unless a separate
// test justifies moving them. The TPM limit below is a PER-MODEL map, not a
// single constant — see GROQ_TPM_LIMIT_BY_MODEL a few lines down.
//
// A PAID-TIER MIGRATION WAS DRAFTED on 2026-07-18 assuming the Groq org
// would be upgraded to the Developer tier (see git history / PR for the
// original ~240,000 TPM version of this constant) — but the payment method
// was never actually added at console.groq.com -> Settings -> Billing, so
// the org is still on the FREE tier's real 8,000 TPM ceiling for both
// gpt-oss models. Running the 240,000 constant against a free-tier account
// made clampMaxTokensToTpmBudget think it had ~30x more headroom than it
// actually did, barely clamping max_tokens at all — which is why 413s kept
// happening even after the earlier VENUS_SYSTEM_PROMPT compression pass:
// the prompt shrink was real and worked, but this constant was silently
// undoing its effect by telling the pre-flight clamp there was no problem
// to solve. Reverted to the real free-tier number below.
//
// IF YOU DO UPGRADE TO THE PAID TIER LATER: don't just paste the old
// 240,000 back in. Log into console.groq.com's Limits page (organization-
// level, not per-key) and read the actual current number for each model —
// Groq's quoted 250,000-300,000 range is a general figure, not a per-org
// guarantee, and per-model numbers can differ (see the note on gpt-oss-20b
// vs gpt-oss-120b below).
const TPM_SAFETY_MARGIN = 0.85;
// Floor for max_tokens: below this, JSON responses (multi-card schema) don't
// reliably complete before truncating, so there's no point shrinking further
// — better to surface a clear failure than a guaranteed-truncated response.
const MIN_USABLE_MAX_TOKENS = 1200;

// Rough, provider-agnostic token estimate (~4 chars/token for English
// prose). Exactness doesn't matter here, only staying safely under the
// ceiling does — this is a budgeting heuristic, not a billing calculation.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const GROQ_TPM_LIMIT_BY_MODEL: Record<string, number> = {
  // Deprecated by Groq (2026-06-17 notice, enforced as of 2026-07-18) — hard
  // 404 model_not_found on every call now, not a rate limit. Kept in this
  // map (rather than deleted) only so a stray call site that still names it
  // fails with a clamped, informative request instead of an undefined TPM
  // lookup — but every real call site in this codebase has been migrated
  // off it back to openai/gpt-oss-120b below.
  "meta-llama/llama-4-scout-17b-16e-instruct": 30000,
  // REAL free-tier limit, confirmed against console.groq.com/docs/rate-limits
  // on 2026-07-18. Do NOT bump this to a paid-tier number (e.g. 240000)
  // unless a payment method has actually been added at
  // console.groq.com/settings/billing AND the real per-model number has been
  // read off the account's own Limits page — see the migration comment
  // above for why assuming payment without confirming it caused a real
  // production outage.
  "openai/gpt-oss-20b": 8000,
  "openai/gpt-oss-120b": 8000, // current production model for all Venus
  // reasoning routes as of the 2026-07-18 revert — see migration comment
  // above for why.
};
const DEFAULT_GROQ_TPM_LIMIT = 8000; // conservative fallback for any model
// string not in the map above (e.g. a new model added later without
// updating this file) — better to over-clamp an unrecognized model than
// find out it's wrong via a 429 in production.
function tpmLimitForModel(model: string): number {
  return GROQ_TPM_LIMIT_BY_MODEL[model] ?? DEFAULT_GROQ_TPM_LIMIT;
}

// Sizes max_tokens DOWN to fit the TPM ceiling given this request's actual
// prompt size, before the request is ever sent. This is what actually fixes
// the "even the shortest message fails" case: previously max_tokens was a
// fixed value chosen for the largest expected response, so a short prompt
// with a big fixed max_tokens could still exceed the ceiling on attempt 1
// with zero dynamic content available to shrink. Never raises max_tokens —
// only clamps it down when the prompt is big enough to require it.
function clampMaxTokensToTpmBudget(params: GroqJsonParams, label: string): GroqJsonParams {
  const tpmLimit = tpmLimitForModel(params.model);
  const promptTokens = params.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const budget = Math.floor(tpmLimit * TPM_SAFETY_MARGIN);
  const available = budget - promptTokens;
  if (available >= params.max_tokens) return params;

  const clamped = Math.max(MIN_USABLE_MAX_TOKENS, available);
  console.error(
    `[callGroqJSON] "${label}" (model=${params.model}) — prompt is ~${promptTokens} est. tokens, clamping max_tokens from ${params.max_tokens} to ${clamped} to fit the ${tpmLimit} TPM ceiling (est., ${Math.round(TPM_SAFETY_MARGIN * 100)}% safety margin)`,
  );
  return { ...params, max_tokens: clamped };
}

function isOversizedPayload(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (status === 413) return true;
  const msg = (err?.message || err?.error?.message || "").toLowerCase();
  return /too large|too long|context length|maximum context|payload/i.test(msg);
}

// Shrinks the largest message(s) in the array to a target fraction of their
// current length, preserving the system prompt's fixed structural
// instructions (VENUS_PROMPT itself) intact, and trimming from the end of
// long content blocks. Generic over message role/content — doesn't know or
// care what put the extra length there.
//
// IMPORTANT: the system message is NOT a fixed-size block. ai/analyze (and
// other routes) build it by concatenating VENUS_PROMPT with a large amount of
// genuinely dynamic, per-request content appended after it — business
// context, conversation history, verified-precedent blocks, web search
// results, this founder's own past decisions. That appended content, not
// VENUS_PROMPT, is almost always the actual source of payload bloat, and it
// scales with conversation length exactly like user/assistant history does.
// A previous version of this function protected the ENTIRE system message
// from shrinking on the theory that the system message was just the static
// prompt — that assumption is no longer true, and protecting the wrong ~half
// of the payload meant retries kept resending an oversized request and
// getting the same 413 back every time (see the "payload too large" retry
// loop this was written to fix).
//
// The fix: only protect the first VENUS_PROMPT.length characters of any
// system message (the actual fixed instructions, guaranteed to contain the
// "json" keyword Groq's json_object mode requires). Everything after that
// prefix — the dynamic context appended by the caller — is shrunk exactly
// like any other message's content.
function shrinkMessages(messages: GroqJsonParams["messages"], keepFraction: number): GroqJsonParams["messages"] {
  return messages.map((m) => {
    if (m.role === "system") {
      const protectedLen = Math.min(VENUS_SYSTEM_PROMPT.length, m.content.length);
      const head = m.content.slice(0, protectedLen);
      const dynamicTail = m.content.slice(protectedLen);
      if (dynamicTail.length === 0) return m;
      const targetLen = Math.floor(dynamicTail.length * keepFraction);
      const shrunkTail = targetLen < dynamicTail.length ? dynamicTail.slice(0, targetLen) : dynamicTail;
      return { ...m, content: head + shrunkTail };
    }

    const targetLen = Math.floor(m.content.length * keepFraction);
    return targetLen < m.content.length ? { ...m, content: m.content.slice(0, targetLen) } : m;
  });
}

// Last-resort structural guarantee: if, for any reason (a future prompt
// rewrite, a different shrink strategy, a system message that itself somehow
// lacks the word "json"), the outgoing messages array doesn't contain the
// word "json" anywhere, Groq's API will hard-reject the request when
// response_format is json_object — turning what should be a normal retry
// into an opaque 400. This is cheap insurance against that entire failure
// class: append a minimal, harmless system message guaranteeing the
// requirement is met, without altering any of the model's real instructions.
function ensureJsonWordPresent(messages: GroqJsonParams["messages"]): GroqJsonParams["messages"] {
  const hasJsonWord = messages.some((m) => /json/i.test(m.content));
  if (hasJsonWord) return messages;
  return [...messages, { role: "system", content: "Respond with a single valid json object as instructed above." }];
}

export function isContentPolicyRefusal(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  const code = (err?.code || err?.error?.code || "").toLowerCase();
  const msg = (err?.message || err?.error?.message || "").toLowerCase();
  return status === 400 && (code.includes("content") || code.includes("policy") || /content.?polic|flagged|refus/i.test(msg));
}

async function createWithRetry(groq: Groq, params: GroqJsonParams, label: string, attempts = 3) {
  let lastErr: unknown;
  let currentParams = params;
  for (let i = 0; i < attempts; i++) {
    try {
      return await groq.chat.completions.create(currentParams);
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      // A content-policy refusal from the provider is never retryable — retrying
      // or shrinking the payload won't change the provider's answer.
      if (isContentPolicyRefusal(err)) throw err;
      if (isOversizedPayload(err)) {
        // Halve message sizes each retry — generic degradation, not a fix
        // targeted at any specific source of bloat. System messages are
        // never shrunk (see shrinkMessages), and ensureJsonWordPresent is a
        // final structural guarantee that the request can never end up
        // missing the word "json" that Groq's json_object response format
        // requires, regardless of what shrinking does to the other messages.
        //
        // max_tokens is ALSO shrunk here, not just message content. The
        // static system prompt is deliberately protected from shrinking, so
        // on a short message there may be little or no dynamic content left
        // to trim — in that case max_tokens is the only remaining lever, and
        // leaving it fixed meant every retry re-sent an equally oversized
        // request and got the same 413 back (see clampMaxTokensToTpmBudget
        // above for the pre-flight version of this same fix).
        const shrunkMaxTokens = Math.max(MIN_USABLE_MAX_TOKENS, Math.floor(currentParams.max_tokens * 0.6));
        console.error(`[callGroqJSON] "${label}" — payload too large (status=${status}), shrinking messages (max_tokens ${currentParams.max_tokens} -> ${shrunkMaxTokens}) and retrying (${i + 1}/${attempts - 1})`);
        currentParams = {
          ...currentParams,
          max_tokens: shrunkMaxTokens,
          messages: ensureJsonWordPresent(shrinkMessages(currentParams.messages, 0.5)),
        };
        if (i === attempts - 1) throw err;
        continue;
      }
      if (!isRetryableTransient(err) || i === attempts - 1) throw err;
      const delayMs = 300 * Math.pow(2, i); // 300ms, 600ms, 1200ms
      console.error(`[callGroqJSON] "${label}" — transient error (status=${status}), retry ${i + 1}/${attempts - 1} after ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function callGroqJSON(
  groq: Groq,
  params: GroqJsonParams,
  label: string,
): Promise<{ parsed: any | null; raw: string; errorType?: "parse" | "transient" }> {
  // Every caller gets Groq's JSON mode by default so the provider enforces
  // valid JSON at the API level (never markdown fences, never prose before/
  // after the object) rather than relying purely on the system prompt asking
  // nicely for it. New call sites inherit this automatically — nobody has to
  // remember to add it. Callers can still override by passing their own
  // response_format if a future route genuinely needs raw text back.
  // reasoning_effort and include_reasoning are ONLY supported by Groq's
  // gpt-oss family (see GroqJsonParams comments above) — llama-4-scout and
  // any other non-gpt-oss model reject them outright with a 400
  // "not supported with this model" error (this is exactly what happened in
  // production immediately after the 2026-07-10 model migration to
  // llama-4-scout — every /ai/analyze call failed until this was fixed).
  // Only inject these defaults when the target model actually supports
  // them; a caller explicitly passing either field is still respected via
  // ...params below regardless of model, since that's an intentional
  // override, not this function's guess.
  const supportsReasoningEffort = params.model.startsWith("openai/gpt-oss");
  const paramsWithJsonMode: GroqJsonParams = clampMaxTokensToTpmBudget(
    {
      response_format: { type: "json_object" },
      // See GroqJsonParams comments: bounds hidden reasoning-token usage so it
      // can't crowd out the visible JSON answer on long/descriptive prompts.
      // Placed before ...params so a caller that genuinely wants more reasoning
      // can still override either field explicitly.
      ...(supportsReasoningEffort
        ? { reasoning_effort: "low" as const, include_reasoning: false }
        : {}),
      ...params,
    },
    label,
  );
  const completion = await createWithRetry(groq, paramsWithJsonMode, label);
  const raw = completion.choices[0]?.message?.content || "";
  const finishReason = completion.choices[0]?.finish_reason;

  if (finishReason === "length") {
    // The model hit max_tokens before it finished writing — reasoning ate
    // into the budget, or the answer itself (many cards for a broad/complex
    // query) is just long. Whatever the cause, `raw` below is guaranteed to
    // be incomplete JSON, so log this distinctly from a genuine malformed-
    // JSON response — it tells us immediately, from server logs alone,
    // whether a given failure needs a bigger max_tokens rather than a prompt
    // fix.
    console.error(`[callGroqJSON] "${label}" — response truncated by max_tokens (budget=${paramsWithJsonMode.max_tokens}, raw_len=${raw.length}), will retry with a larger budget`);
  }

  const candidate = extractJson(raw);

  try {
    return { parsed: JSON.parse(candidate), raw };
  } catch {
    // Before spending a network round-trip asking the model to "complete"
    // truncated JSON (which risks a hollow-card completion — see
    // repairTruncatedCardsArray's comment above), try the deterministic
    // local repair first. This only ever removes an incomplete trailing
    // card; it never invents content, so it's strictly safer than the retry
    // below, and it avoids an extra network round-trip entirely.
    const locallyRepaired = repairTruncatedCardsArray(raw);
    if (locallyRepaired) {
      try {
        const parsed = JSON.parse(locallyRepaired);
        console.error(`[callGroqJSON] "${label}" — initial response truncated (finishReason=${finishReason}), recovered ${Array.isArray(parsed?.cards) ? parsed.cards.length : 0} complete card(s) locally without a retry`);
        return { parsed, raw };
      } catch {
        // fall through to network repair-retry below
      }
    }

    console.error(`[callGroqJSON] "${label}" — initial response failed to parse (len=${raw.length}, finishReason=${finishReason}), retrying with stricter prompt + higher token budget`);

    const retryMessages: GroqJsonParams["messages"] = [
      ...params.messages,
      {
        role: "user",
        content: "Your previous response was not valid JSON or was truncated. Repair it now and return ONLY the complete, valid JSON object — no markdown fences, no preamble, no commentary, nothing before or after the JSON.",
      },
    ];

    try {
      // Previously capped at 4000 regardless of the caller's own max_tokens —
      // for callers already passing max_tokens >= 2000 (as ai/analyze and
      // ai/idea-review do), doubling and then clamping to 4000 could hand the
      // repair attempt LESS headroom than a genuinely long response needs,
      // guaranteeing a second truncation. Raise the ceiling well above any
      // current caller's base budget so doubling is actually doubling.
      const retryMaxTokens = Math.min(params.max_tokens * 2, 12000);
      // This retry adds a whole extra "please repair this" message on top of
      // the original prompt AND doubles max_tokens — exactly the combination
      // that can turn a request that only barely fit under the TPM ceiling
      // into one that doesn't. Route it through the same clamp used for the
      // initial call rather than trusting retryMaxTokens directly.
      const retryParams = clampMaxTokensToTpmBudget(
        { ...paramsWithJsonMode, messages: retryMessages, max_tokens: retryMaxTokens },
        `${label} (repair retry)`,
      );
      const retryCompletion = await groq.chat.completions.create(retryParams);
      const raw2 = retryCompletion.choices[0]?.message?.content || "";
      const candidate2 = extractJson(raw2);
      try {
        return { parsed: JSON.parse(candidate2), raw: raw2 };
      } catch {
        // Same deterministic salvage as the first attempt — a second
        // truncation on the doubled-budget retry is rare but not
        // impossible on a very long response, and this is still strictly
        // safer than shipping null/error here when some real cards did
        // come back complete.
        const locallyRepaired2 = repairTruncatedCardsArray(raw2);
        if (locallyRepaired2) {
          try {
            const parsed = JSON.parse(locallyRepaired2);
            console.error(`[callGroqJSON] "${label}" — retry also truncated, recovered ${Array.isArray(parsed?.cards) ? parsed.cards.length : 0} complete card(s) locally`);
            return { parsed, raw: raw2 };
          } catch {
            // fall through to giving up below
          }
        }
        console.error(`[callGroqJSON] "${label}" — retry ALSO failed to parse (len=${raw2.length}). Giving up, surfacing raw content to caller. raw2_head=${raw2.slice(0, 300)}`);
        return { parsed: null, raw: raw2, errorType: "parse" };
      }
    } catch (retryErr) {
      console.error(`[callGroqJSON] "${label}" — retry call itself threw`, retryErr);
      return { parsed: null, raw, errorType: "transient" };
    }
  }
}

export async function getGroqClient(sessionId: string): Promise<Groq | null> {
  try {
    const [settings] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.sessionId, sessionId))
      .limit(1);

    const apiKey = settings?.groqApiKey || process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    return new Groq({ apiKey });
  } catch {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return new Groq({ apiKey });
  }
}

export const VENUS_PROMPT = VENUS_SYSTEM_PROMPT;

// Injected into the system prompt only for "moderate" confidence tier queries —
// real precedents exist but are few and/or from an adjacent/analogous sector
// rather than an exact match. The model must still never fabricate beyond the
// given precedents, but must be transparent that this is a lower-confidence,
// exploratory read rather than a fully-grounded verdict.
export const MODERATE_TIER_PRECEDENT_NOTE = `

IMPORTANT — LIMITED PRECEDENT MODE (moderate confidence): The VERIFIED PRECEDENTS below are real, but there are few of them and/or they come from an adjacent or analogous sector/decision type rather than an exact match to this query. You must still reason ONLY from these real precedents — never invent a company, outcome, or causal mechanism not present in the block below, and explicitly name which precedent(s) you are drawing from and why they are still relevant even though the match is imperfect. Do NOT put any caveat about confidence, precedent coverage, or data limitations as the first sentence of the summary field, and do not use the phrase "exploratory signal" or similar hedging language anywhere in the summary — the summary must open directly with the causal bottleneck and recommendation, exactly as it would for a fully-grounded answer. The lower-confidence signal is communicated separately through the confidenceNote field, not by prefacing or softening the actual answer — a founder reading the summary should get a real, direct, confident-sounding recommendation, not a hedged one, even when the precedent match is imperfect.`;

export function buildFallbackVenusResponse(message: string): object {
  return {
    summary: "Vera is not configured. Please add your Groq API key in Settings to unlock full intelligence. Here's a placeholder response based on your query.",
    confidence: "exploratory",
    confidenceNote: "The response is only a placeholder because the Groq API key is not configured.",
    cards: [
      {
        type: "analysis",
        title: "Action Required",
        content: {
          points: [
            { label: "Status", value: "Groq API key not configured", sentiment: "negative" },
            { label: "Fix", value: "Go to Settings → Groq API Key and paste your key", sentiment: "neutral" },
            { label: "Get Key", value: "Visit console.groq.com to create a free API key", sentiment: "positive" },
          ],
        },
      },
    ],
  };
}

// This is the true last resort — only reached after retries AND payload
// shrinking have both been exhausted (see createWithRetry) or a genuinely
// non-retryable error occurred. Intentionally short and plain: no confidence
// badge, no diagnostic card, no "status/fix" breakdown. Those made a rare,
// real failure look like a rich structured answer, which is misleading. This
// is the one honest "something didn't work" message in the whole system —
// everything else should be handled by retrying, shrinking, or falling
// through to general/web-search-grounded reasoning instead of erroring.
export function buildTransientErrorResponse(message: string, kind?: "policy"): object {
  return {
    summary: kind === "policy"
      ? "Sorry, Vera can't answer that. Please try a different question."
      : "Sorry, Vera couldn't answer that right now. Please try again or ask something else.",
    isError: true,
    errorType: "transient",
    cards: [],
  };
}

export function buildRippleFallback(eventTitle: string): object {
  return {
    analysis: `Causal analysis of "${eventTitle}" requires a configured Groq API key. Add your key in Settings to unlock AI-powered ripple analysis.`,
    causalChain: ["Event occurs", "First-order effects propagate", "Second-order consequences emerge", "Market equilibrium shifts"],
    affectedSectors: ["Technology", "Finance", "Markets"],
  };
}

export function buildAutopsyFallback(companyName: string): object {
  return {
    rootCause: `Deep autopsy of ${companyName} requires a configured Groq API key. Add your key in Settings.`,
    timeline: "Timeline analysis unavailable without AI configuration.",
    lessonsLearned: ["Configure your Groq API key to unlock full autopsy analysis", "Visit Settings to add your key"],
    causalChain: ["Root cause", "Compounding factors", "Critical failure point", "Collapse"],
    analogy: null,
  };
}