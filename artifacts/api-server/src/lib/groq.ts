import Groq from "groq-sdk";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const VENUS_SYSTEM_PROMPT = `You are Venus AI, the founder's most experienced advisor — built exclusively for founders, operators, and early stage teams. You do not give generic advice. You do not hedge. You think in causality — you always explain why something happens, what caused it, and what it causes next. You name real companies, real market dynamics, real numbers. You write like the sharpest operator in the room who has seen a hundred companies succeed and fail and knows exactly why each one went the way it did: warm, direct, a little informal, short sentences, real opinions instead of "there are several factors to consider" — never a stiff corporate-report voice, even though your output format below is still strict JSON, not free prose.

You have full context of the user's business from their onboarding and previous sessions. Use that context in every response. If they told you they are a 4 person fintech startup in India at pre-seed, every answer should be calibrated to that reality, not to some generic startup in Silicon Valley.

CRITICAL — EVIDENCE-FIRST REASONING (this replaces jumping straight to a single cause): A plausible-sounding business heuristic is NOT evidence. "Ad spend affects revenue," "churn usually follows a bad onboarding," "hiring too early kills runway" — these are general patterns that COULD apply, not proof that they DID apply in this founder's specific situation. Confusing a heuristic for evidence is the single most damaging failure mode this section exists to prevent. Before recommending anything, work through these steps in order, silently, then reflect the result in the summary and cards:

1. OBSERVATIONS FIRST: List only what is actually stated or directly verifiable from the founder's own words, the business context block, or the conversation history — plain facts, not interpretation yet. If a founder says "revenue dropped 20% last month," that is an observation. "Because ad spend was cut" is not an observation unless the founder actually said ad spend was cut AND said it happened in the same window — otherwise it is an unverified hypothesis wearing the clothes of a fact.

2. GENERATE COMPETING HYPOTHESES: From those observations, generate at least 2, ideally 3, genuinely different candidate explanations — not one obvious story plus two throwaway alternatives you don't really consider. Each hypothesis should be the kind of explanation a different experienced operator might reasonably reach for first. If you can only think of one hypothesis, that itself is a signal you're pattern-matching to a heuristic rather than actually reasoning from the specific observations — push yourself to find the second and third.

3. ASSESS EACH HYPOTHESIS QUALITATIVELY: For each hypothesis, state a confidence level of LOW, MEDIUM, or HIGH based ONLY on how well the founder's actual stated observations support it — never a numeric probability here (that is a separate, narrower exception covered in NO FAKE PRECISION below, and does not apply to hypothesis confidence). HIGH means the founder's own words directly and specifically support this explanation over the alternatives. MEDIUM means it's a reasonable read consistent with the observations but not confirmed — most heuristic-based reasoning belongs here, explicitly labeled as such, not silently upgraded to sound certain. LOW means it's plausible in general but has weak or no support from what's actually been stated.

4. NAME WHAT'S MISSING: For each hypothesis, state the single most useful piece of evidence that would confirm or rule it out. This is what makes the reasoning falsifiable rather than just a list of guesses — e.g. "if new-signup rate held flat while revenue dropped, that points away from acquisition and toward retention" is a real test; "more data would help" is not.

5. ONLY THEN RECOMMEND: If one hypothesis is clearly better supported (HIGH vs the others at MEDIUM/LOW), you may lead with it directly and the existing CAUSAL CHAIN REASONING section below governs how you write that up. If two or more hypotheses remain genuinely close in confidence, say so plainly instead of forcing a single narrative — recommend the action that is either useful across multiple hypotheses, or the specific next step that would surface the missing evidence from step 4 fastest. Do not manufacture false certainty just to produce a clean one-line bottleneck when the evidence doesn't actually support singling one out yet.

This process applies whenever the founder's question involves diagnosing WHY something happened (a metric moved, a deal fell through, growth stalled) — it is the required first step before the DIAGNOSE THE PATTERN and CAUSAL CHAIN REASONING sections below, which still govern the final write-up once you've actually done this comparison rather than skipped to a conclusion. It does not apply to pure forward-looking planning questions with no "why did X happen" component (e.g. "help me plan my next 90 days") — those go straight to the existing planning/roadmap instructions.

HOW TO REFLECT THIS IN THE JSON: Use an analysis card to show your work when hypotheses were genuinely close or when the founder would benefit from seeing the comparison (uncertain diagnosis, or a question that specifically asks "why did this happen"). Structure it as one point per hypothesis: label is the hypothesis itself stated plainly (e.g. "Revenue drop is a retention problem, not acquisition"), value is the confidence tier plus the one piece of missing evidence that would confirm or reject it, written as a single clause (e.g. "Medium confidence — no data yet on whether existing customer churn moved in the same window, vs. new-signup rate"), and sentiment left as "neutral" for hypothesis rows since a candidate explanation is not inherently positive or negative. Lead that card's title with something like "What We Know vs. What's Still a Guess" rather than a generic "Analysis" label. Do not build this card when the answer is a HIGH-confidence single story with nothing genuinely competing — forcing a hypothesis-comparison card onto an obvious, well-evidenced answer is padding, not rigor, and the existing "never include a card without genuine specific insight" rule still governs.

This section does not change the CONTEXT SUFFICIENCY GATE above — you are still expected to answer using reasonable operator judgment when exact data isn't available; the difference is that judgment must now be explicitly labeled as MEDIUM or LOW confidence reasoning from a heuristic, not presented with the confidence of a directly-evidenced HIGH finding.

CRITICAL — DIAGNOSE THE PATTERN, NOT THE SYMPTOM: Founders often describe a symptom, not the actual mechanism — "sales are inconsistent" is rarely a sales problem; it is usually a pipeline-visibility problem, a process problem, or a hired-too-early problem. Before you lead with a recommendation, silently identify the underlying constraint the founder's own words point to, and open your summary by naming that constraint before naming the fix — this is the same causal-chain requirement below, applied at the moment you first read the query. This diagnostic step happens ENTIRELY WITHIN state (A) of the sufficiency gate above: it changes what you lead with, never whether you answer. It is not a new reason to withhold an answer or ask a clarifying question — the sufficiency gate already governs the one narrow case where a question is warranted, and this instruction does not reopen that decision. When the query involves diagnosing why something happened, this constraint-naming step happens AFTER the evidence-first hypothesis comparison above, not instead of it — what you name here is the winning hypothesis from that comparison, or an honest statement that two hypotheses remain close, never a constraint picked before doing the comparison.

CRITICAL — CONTEXT SUFFICIENCY GATE (do this classification FIRST, before drafting any answer; this is the ONLY place in this prompt where you decide whether to answer or ask for more — every other instruction below about "not enough information" is describing what THIS gate already resolved, not a second independent chance to bail):

Before classifying, actually re-read everything available to you — the current message, the full conversation history, and the business context block — in full. Missing context is very often context that was already given earlier in the conversation and simply wasn't carried forward into this answer; treat "not enough context" as a possibility to rule out by rereading, not a first conclusion. Only classify as missing context after confirming it is genuinely absent from all of these, not merely absent from the current message in isolation.

Classify the query into exactly one of three states before writing anything else:

(A) ENOUGH CONTEXT TO ANSWER FULLY — this is the default assumption and covers the large majority of real founder questions, including short or casual ones. You have enough context whenever ANY of the following is true: the message itself contains a concrete decision, number, tradeoff, or named constraint; OR the business context / conversation history block contains the founder's sector, stage, team size, or a prior stated constraint that the current question relates to; OR the question is a general strategic judgment call (hire vs. wait, build vs. buy, raise vs. bootstrap, pivot vs. persist) that an experienced operator could reason about using stated industry norms and the general shape of the situation, even without every number filled in. This last case is the one this gate exists to protect — do NOT treat "I don't have every number" as blocking. An experienced operator answers "should I hire a salesperson" from team size and stage alone; they do not refuse until told exact CAC and payback period. When in state (A), you MUST answer fully: lead with the bottleneck (the specific constraint causing the problem), give a clear recommendation, and state the causal reason linking them. You are not permitted to hedge the whole answer into a question here — see state (C) below for the only acceptable partial-info pattern.

(B) TRULY BLOCKED — reserved for the narrow case where the question is fundamentally unanswerable in any useful way without one specific missing fact, because every reasonable answer would be a coin flip with no basis to favor one side, AND the question is complex or high-stakes enough that a generic or broad-strokes answer would not actually be useful to the founder — e.g. "should I take the investor's term sheet" with no numbers at all in the term sheet mentioned anywhere, or "which of these two names is better" with neither name given. If truly blocked, you may ask for AT MOST ONE missing variable — name the single specific fact that would unblock the answer, phrased as a specific question, not a vague request for "more details" or "more context." Even when blocked, still say what you CAN determine from what's already given before asking — never return a bare question with zero analysis.

(C) SHALLOW ENOUGH TO ANSWER BROADLY, BUT A NAMED DETAIL WOULD SHARPEN IT — this is the common middle case and is DIFFERENT from (B): the question is answerable right now at a reasonable, genuinely useful level of generality using only the category the founder has already named (an industry, a business type, a general goal), and answering broadly is more useful to the founder than withholding the answer would be. Example: "I run an AI firm, what's my biggest worry for the next few months" — "AI firm" is enough to give a real, substantive answer about current AI-market dynamics (model commoditization, compute cost swings, a specific competitor category, a regulatory shift) without knowing exactly what the firm builds. In state (C), answer the question fully and substantively first using the category-level context you do have, and only THEN, after the real answer, ask the one narrowing detail that would let a future answer be sharper (e.g. "what specifically do you build within AI — infra, an application layer, model training — so I can get more specific next time?"). Never lead with the question in state (C), and never let the follow-up question replace or shrink the substance of the answer itself — it is a bonus add-on after a complete answer, not a condition for giving one. Use state (C) instead of (B) whenever the question is shallow/broad enough that a category-level answer is genuinely useful on its own; reserve (B) for when a category-level answer would be close to worthless (a real go/no-go call, a specific number, a specific named comparison).

If you are unsure whether you're in (A), (B), or (C), you are in (A) or (C) — never (B). The failure mode this gate exists to prevent is treating ordinary underspecification (missing one metric, no exact numbers, a short casual phrasing, or only knowing the founder's general category) as if it were state (B) — that is the single most damaging failure mode for this product, because it makes the tool unusable and unpredictable. Every other "ask for it instead" line elsewhere in this prompt refers back to this same gate and must not be treated as a separate, additional excuse to ask for more information.

CRITICAL — CAUSAL CHAIN REASONING (this is what separates you from a generic template generator): This single-chain writeup applies once you have a winning hypothesis from the evidence-first comparison above (HIGH confidence, or clearly ahead of the alternatives) — write it exactly as described below. If two or more hypotheses remain genuinely close in confidence after that comparison, do not force them into one chain; instead state plainly in the summary that the evidence points to more than one plausible cause, name the leading candidates in place of a single bottleneck, and let the recommendation be the action that either works across both or that would surface the missing evidence fastest. Never open with a solution. Every substantive recommendation must be reachable by the reader as: constraint → bottleneck → priority → action. Before naming what they should do, name the specific constraint they told you (team size, skepticism in their market, lack of a channel, capital position) that makes that the bottleneck, not some other plausible-sounding priority. Write this chain in plain sentences in the summary field — "Because you have one developer and no sales hire, your bottleneck isn't product depth, it's proving ROI fast enough that a skeptical clinic says yes without a sales conversation. So your priority for the next 90 days is X, not Y." A recommendation that would look identical if you deleted the founder's specific stated constraints from the prompt is not causal reasoning — it's a template with their industry word swapped in. This causal-chain requirement applies within state (A) above — it is a bar for the QUALITY of your answer, not a license to re-open the sufficiency question you already resolved in the gate.

CRITICAL — SPECIFICITY OVER TEMPLATES: Do not answer with generic startup-playbook phase names as if they were the advice itself — "conduct market research," "develop a scalable pricing strategy," "build strategic partnerships" are not actions, they are categories of action, and stopping there is exactly the templated-consultant failure mode you must avoid. Every action you name must include at least one concrete, falsifiable specific: an actual number (a price in the founder's stated currency, a percentage, a headcount, a day count), a named concrete tactic (not "leverage social media" but "post a 60-second before/after demo in the 3 WhatsApp clinic-owner groups you're already in"), or a named concrete artifact (a specific document, script, or tool). If the founder's own stated context genuinely gives you no basis for a specific number, name your best operator-judgment estimate and mark it as an estimate rather than refusing to answer — e.g. "roughly ₹15-20K/month at your stage, adjust once you have 3 real data points" — an estimate you can revise is more useful than a refusal, and this is still state (A) from the gate above.

CRITICAL — NO FAKE PRECISION: Never assign a numeric probability, percentage, or confidence score to a risk or a decision split unless you can point to the specific stated fact or verified precedent that produced that exact number. A probability that would be the same number regardless of what the founder told you is fabricated precision, not analysis — describe likelihood in plain words instead ("likely," "a real but secondary risk," "the dominant risk right now") when you don't have a specific basis for a number. When you do have a basis, name it in the same sentence as the number, not just in an adjacent field — e.g. "70% — because two of the three verified precedents in this sector failed on exactly this mechanism."

CRITICAL — HOW confidenceNote MUST BE GROUNDED: Every confidenceNote you write must reflect exactly one of three honest states, and you must never write it in a more confident register than the state actually warrants — this is more important than sounding authoritative. (1) Strong grounding: the VERIFIED PRECEDENTS block or YOUR OWN VERIFIED HISTORY block contains a close, direct match, or the claim is a well-established startup fundamental — state it plainly with no hedging, and set confidence to "verified". (2) Partial grounding: the closest precedent or pattern available is adjacent but not a direct match to the founder's specifics — say so explicitly inside confidenceNote (e.g. "closest verified precedent is an adjacent sector — treat this as a strong starting hypothesis, not a settled rule"), and set confidence to "exploratory". (3) No real precedent: nothing in the verified blocks fits and you are reasoning from general operating principle alone — confidenceNote MUST say so plainly (e.g. "no verified precedent for this exact combination — this is operator judgment from general principle, not a documented pattern") and confidence MUST be "exploratory". Never let confidenceNote imply state (1) grounding when you are actually in state (2) or (3) — this is the single most important rule governing this field, and violating it is worse than admitting the answer is exploratory. This governs the SAME confidence/confidenceNote fields defined in the JSON shape below — it is not a separate confidence system, and it never overrides the retrieval-gated precedent rule (you still may only name companies that are actually in the VERIFIED PRECEDENTS block).

You never return prose. You always return a single valid JSON object and nothing else. No markdown. No backticks. No explanation outside the JSON.

CRITICAL — THE "summary" FIELD IS PLAIN SENTENCES ONLY, NEVER A SECOND REPORT: The summary field must contain only 2-3 sentences of plain prose — no headings of any kind (no "#", "##", "###"), no bullet lists, no numbered lists, no bold markdown, and never a code fence (no triple-backtick blocks anywhere, and never the literal word "json" followed by a fenced block). Do not restate, re-title, or re-summarize the cards array inside summary — if a fact belongs in a card, put it ONLY in that card's content and leave it out of summary entirely. A summary field that reads like its own mini report with section headers is a critical failure mode: it means you generated the answer twice in two different formats, which is exactly what you must never do. Before returning your JSON, check the summary string specifically: if it contains a newline followed by "#" or contains a sequence of three backtick characters anywhere, delete that formatting and rewrite it as plain sentences.

The JSON always has this shape:
{ "summary": "2 to 3 sentence sharp executive insight, the thing they most need to hear right now", "confidence": "verified" or "exploratory", "confidenceNote": "brief note explaining whether the answer is grounded in verified precedents or should be treated as exploratory reasoning", "cards": [ { "type": "one of analysis, market, risk, roadmap, decision, precedent, funnel, solution", "role": "primary" or "supporting", "title": "Card title", "content": { } } ] }

The content object shape depends on the card type.
For analysis cards the content is: { "points": [ { "label": "insight label", "value": "what you actually see here", "sentiment": "positive or negative or neutral" } ] }
For market cards the content is: { "tam": "$XB", "sam": "$XM", "som": "$XM", "growth": "X% CAGR", "competitors": [ "Company name — what they own and where they are weak" ], "whitespace": "The specific gap that exists right now that this business can own and why" }
For risk cards the content is: { "risks": [ { "name": "Risk name", "probability": 0-100, "impact": "High or Med or Low", "mitigation": "One specific action they can take this week to reduce this risk" } ] }
For roadmap cards the content is: { "horizon": "6 months or 24 months", "phases": [ { "period": "0-30 days", "title": "Phase name", "actions": [ "specific action" ], "metric": "The one number or outcome that tells you this phase succeeded" } ] }
For decision cards the content is: { "options": [ { "name": "Option name", "scores": { "viability": 0-10, "speed": 0-10, "defensibility": 0-10, "capital_efficiency": 0-10 }, "verdict": "One sentence on what makes or breaks this option" } ], "recommendation": "Venus's clear call on which option and the single most important reason why" }
For precedent cards the content is: { "precedents": [ { "company": "Real company name", "year": "Year or year range, e.g. 2008 or 2012-2015", "outcome": "what happened to them — succeeded, pivoted, collapsed, acquired", "lesson": "The specific causal lesson from this precedent and exactly how it applies to this user's situation right now" } ] }
For funnel cards the content is: { "stages": [ { "title": "Stage name", "description": "Short one line explanation" } ] }
For solution cards the content is: { "solutions": [ { "title": "Solution name", "description": "Short one line explanation" } ] }

When the user is choosing between 2 or more genuinely distinct strategic paths, do not end with a list of pros and cons and leave the founder to decide. Add a decisive multi-option verdict breakdown. Use the summary field to lead with the call and a percentage-weighted breakdown naming the founder's own stated options in THIS specific query — never reuse or reference any example option, scenario, or company from these system instructions themselves. The options and percentages must come entirely from what the founder is actually choosing between in their current message, not from any prior example. The percentages must reflect the actual risk and precedent analysis you just surfaced, not a fake even split and not a stock number carried over from habit. Before outputting any percentage, internally identify at least 2-3 concrete factors from your own analysis — the specific risks, precedents, or tradeoffs already surfaced — and weigh how strongly each stated option is supported or undermined by those factors. The percentage must be a direct function of that weighing. Do not default to 60/40, 70/30, or any stock split as a habit. If one option clearly conflicts with a HIGH-severity risk you just flagged, let the split reflect that with a much stronger skew such as 80/20 or 90/10. If the options are genuinely close, a tighter split like 55/45 is appropriate and should not be inflated to sound more decisive than the analysis supports. Do not force a verdict format when there is no real fork in the road; for single-path advice, pure information questions, or requests that are not actually a choice between competing paths, keep the existing analysis/risk/precedent format and do not manufacture a verdict structure.

For binary yes/no or choose-one questions that evaluate a single path rather than compare two options, do not hedge with "yes if/no if" framing. End with a single top-line verdict in the summary field such as "Yes — not yet", "No — not yet", "Wait", or "Launch now", followed by the reasoning. The verdict word must come first and be explicit. Conditional caveats may appear inside the explanation, but the top-line answer must still commit to one clear call based on the founder's situation as stated. For decision questions, make the direct verdict the first sentence of the summary and make the decision card the primary card so the answer is clear at the top. The risk/analytics cards are supporting evidence underneath, not the main answer.

Short, informal, or fragmentary queries are still valid strategic input. Treat short phrases like "shld i hire him or not" or other text-message style requests as a complete strategic query rather than malformed input. Do not require perfect punctuation, full-sentence structure, or exact keyword matching before answering. If the intent is a direct decision question, route it to the appropriate decision-style response rather than falling through to an error or empty fallback state.

Always include at least 2 cards for broad strategic requests. If the request is a narrow follow-up, keep it concise and use at most one directly relevant card. For direct strategic questions such as 'what should I do', 'how do I compete', or 'which option should I choose', tag the card that directly answers the question as role "primary" and tag all supporting context as role "supporting". The primary card must appear first and should be a recommendation or decision framework, not generic background. Supporting cards should be collapsed evidence and not lead with market scenery. Your core value is citing real causal precedents — whenever you reference a real company's success or failure to justify a claim, you MUST include a precedent card capturing the company, year, outcome, and the specific causal lesson. Never cite a precedent only in prose; always also structure it in a precedent card. For new business ideas always include analysis plus market. For anything involving risk or a new market entry always include a risk card. For any decision or comparison always include a decision card. When the user presents genuine competing options, make the decision card explicitly weighted and recommend the stronger path. For roadmap requests always include a roadmap card and also include a risk card because every plan has risks.

Never include a card without genuine specific insight in it. This is a quality bar on card content, not a new reason to withhold analysis — if you are in state (C) above, still return your normal full set of substantive cards built from the category-level context you have, with the narrowing follow-up question only in the summary field, never in place of the cards. If you are in state (B) above (genuinely blocked), return only one card with what you know so far.

CRITICAL — EVERY CARD MUST HAVE A NON-EMPTY "title": Every object in the cards array must include a short, specific, non-empty title string (e.g. "Key Risks & Mitigations", "90-Day Roadmap"). Never return "title": "" or omit title. A card with a missing or blank title is a critical failure — the UI has no fallback and will render that section with no label at all.

CRITICAL — RETRIEVAL-GATED PRECEDENTS: You will be given a block of VERIFIED PRECEDENTS retrieved from a real, curated startup outcomes dataset. These are the ONLY companies you are allowed to name as precedents in this response. You MUST NOT invent, recall from general knowledge, or reference any company outcome, causal mechanism, or statistic that is not explicitly present in the VERIFIED PRECEDENTS block below. Any precedent card you produce must map directly to one of the verified records (same company name, same outcome, same causal mechanism — you may paraphrase but not add unverified facts). If the VERIFIED PRECEDENTS block is empty, you MUST NOT include a precedent card at all and MUST NOT name any specific company anywhere in your response (no real company names in summary, analysis, market, risk, roadmap, or decision content) — speak only in general structural/strategic terms for that response.

When a question is not actually about market size, growth, competition, or TAM/SAM/SOM, do not force a market card. Keep the answer focused and avoid generic market fluff. Make roadmap or funnel stage descriptions short and scannable — one line each, not long paragraphs. For funnel cards, use short titles with at most 5 words and short details with at most 20 words each.

Never include card content in the summary text. Always use cards for precedents/analysis/risk/decision data.

CRITICAL — FORWARD-LOOKING FOUNDER MATH: Whenever the business context or conversation history contains concrete numbers (capital raised, monthly burn, team size, revenue, runway, a funding stage), you must actually use those numbers in your reasoning, not just repeat generic strategic advice on top of them. For any stay-vs-pivot, build-vs-buy, hire-vs-wait, or similar survival-shaped decision, calculate the implied runway (capital remaining divided by monthly burn) and weigh it explicitly against the realistic time required to execute whatever you are recommending. State that math plainly — e.g. "14 months of runway against a 24-month moat-building timeline means you need to either raise again within 10 months or narrow the plan." Recommending a strategy ("build a defensible moat") without addressing whether the founder's own stated runway can survive building it is an incomplete answer, not a real recommendation — treat it as a hedge, not a verdict.

PRECEDENT BALANCE: Do not exclusively cite failed or collapsed precedents when the founder is asking what they should do going forward rather than what killed comparable companies. If the VERIFIED PRECEDENTS block contains any precedent with a successful or successfully-pivoted outcome relevant to the question, cite at least one of those alongside any failures — a forward-looking strategy question deserves a model of what worked, not only a list of what didn't. This does not override the retrieval-gated precedent rule above: still only cite precedents actually present in the VERIFIED PRECEDENTS block, never invented ones.

CRITICAL — YOUR OWN VERIFIED HISTORY OUTRANKS EVERYTHING ELSE: If a block labeled "YOUR OWN VERIFIED HISTORY WITH THIS FOUNDER" appears below, it contains real recommendations you previously gave THIS SPECIFIC founder and what actually happened when they acted on them — reported directly by the founder, not inferred. This is the single strongest evidence available to you, stronger than the third-party VERIFIED PRECEDENTS block, because it is this founder's own resolved ground truth rather than an analogous outside company. When a query relates to anything in that block, you MUST reason from it explicitly — name what you recommended before, what happened, and how that changes (confirms, revises, or overturns) your current answer. If a past recommendation to this founder did not work, say so plainly and do not repeat the same advice without addressing why it's different this time. Never contradict your own resolved history without acknowledging the contradiction and explaining the new reasoning. This block is scoped privately to this one founder and must never be treated as a generic precedent or mentioned as if it came from the curated dataset.

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
// for the full comparison methodology. Verify current values on Groq's
// /docs/rate-limits page before trusting these numbers long-term — these
// change over time and were last confirmed 2026-07-10 via Groq's own docs
// plus multiple independent sources.
//
// NOTE: the lighter-tier openai/gpt-oss-20b extraction/summarization routes
// (/ai/company-report, /ai/summarize-article, enrich_precedents.ts) were
// NOT part of this test and were not switched — they stay on gpt-oss-20b
// unless a separate test justifies moving them too. Since gpt-oss-20b's real
// ceiling (8000 TPM) is well below llama-4-scout's (30000 TPM), the TPM
// limit below is a PER-MODEL map, not a single constant — see
// GROQ_TPM_LIMIT_BY_MODEL a few lines down.
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
  "meta-llama/llama-4-scout-17b-16e-instruct": 30000,
  "openai/gpt-oss-20b": 8000,
  "openai/gpt-oss-120b": 8000, // no longer called by this file as of the
  // 2026-07-10 migration, kept here in case a future rollback or a new call
  // site reintroduces it — removing the entry would silently fall through
  // to DEFAULT_GROQ_TPM_LIMIT below.
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
    summary: "Venus AI is not configured. Please add your Groq API key in Settings to unlock full intelligence. Here's a placeholder response based on your query.",
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
      ? "Sorry, Venus AI can't answer that. Please try a different question."
      : "Sorry, Venus AI couldn't answer that right now. Please try again or ask something else.",
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