import type Groq from "groq-sdk";
import { callGroqJSON } from "./groq";
import { tokenize } from "./retrieval";

// Item 3: correction detection + lightweight confirmation. This is
// deliberately a 3-layer check, cheapest first, same philosophy as
// inferDecisionRouting/classifyQueryScope in ai.ts (cheap regex heuristics
// decide routing; the model is only asked to make the actual fuzzy judgment
// call where regex genuinely can't) — see confirmPreferenceWithModel below
// for why the model, not another regex, makes the final call here.

// Correction-shaped reply: leading rejection/negation language directed at
// the prior turn, OR an explicit standing-instruction phrase. Deliberately
// narrow (not a general sentiment classifier) — this is a pre-filter for
// "is it even worth asking the model," not the final judgment.
const CORRECTION_OPENER = /^\s*(no[,.]?\s|nah[,.]?\s|actually[,.]?\s|don'?t\s|stop\s|that'?s not\s|i meant\s|not like that)/i;
const STANDING_INSTRUCTION = /\b(always|never|from now on|in general|every time|going forward|as a rule)\b/i;

export function looksLikeCorrection(message: string, priorAssistantMessage: string): boolean {
  if (!priorAssistantMessage || !priorAssistantMessage.trim()) return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  return CORRECTION_OPENER.test(trimmed) || STANDING_INSTRUCTION.test(trimmed);
}

// Distinguishes a standing style/behavior preference ("no em-dashes," "keep
// answers short," "call me Alex") from a one-off factual correction specific
// to this instance ("no, I meant 50L not 5L"). Keys off generalizing
// language OR a small closed set of known style-preference categories
// (tone, formatting, length, emoji/em-dash/jargon usage, form of address) —
// a correction with neither signal is a one-off and must never reach the
// confirmation flow, since asking "should I remember this?" on an ordinary
// one-time correction would be exactly the over-triggering this item exists
// to avoid.
const STYLE_PREFERENCE_TOPIC = /\b(em-?dash(es)?|emoji|emojis|tone|formatting|format|bullet points?|headings?|jargon|corporate speak|short(er)? answers?|long(er)? answers?|verbose|concise|call me|address me|my name is|no more than \d+ (words?|sentences?|paragraphs?))\b/i;

export function looksLikeGeneralizablePreference(message: string): boolean {
  return STANDING_INSTRUCTION.test(message) || STYLE_PREFERENCE_TOPIC.test(message);
}

// Cheap floor before ever asking the model: if this candidate text shares
// real vocabulary with an already-stored preference, treat it as already
// covered rather than asking to store a near-duplicate — same overlap-based
// approach as ai.ts's looksLikeDifferentBusiness, inverted (high overlap =
// already known, here, instead of low overlap = pivot, there).
export function looksLikeExistingPreference(existingPreferenceTexts: string[], candidateMessage: string): boolean {
  const candidateTokens = new Set(tokenize(candidateMessage));
  if (candidateTokens.size === 0) return false;
  return existingPreferenceTexts.some((existing) => {
    const existingTokens = new Set(tokenize(existing));
    if (existingTokens.size === 0) return false;
    let overlap = 0;
    candidateTokens.forEach((t) => { if (existingTokens.has(t)) overlap++; });
    const ratio = overlap / Math.min(candidateTokens.size, existingTokens.size);
    return overlap >= 2 && ratio >= 0.5;
  });
}

// Mechanical enforcement for the small set of stored preferences that are
// LITERAL, checkable text rules (no em-dashes, no emoji) rather than a style
// judgment call — same principle as lengthConstraint.ts: a model instruction
// alone is unreliable (observed live: a response confirming "no em-dashes
// going forward" used an em-dash in that very sentence), so the mechanically
// checkable ones get a code-level guarantee instead of relying on the prompt
// alone. Deliberately narrow — only the two concrete, unambiguous cases below;
// a subjective preference ("keep it casual") has no mechanical check and
// stays prompt-only.
const EM_DASH_PATTERN = /\s*[—–]\s*/g;
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

export function enforceStylePreferences(text: string, preferenceTexts: string[]): string {
  if (preferenceTexts.length === 0) return text;
  const combined = preferenceTexts.join(" ").toLowerCase();
  let result = text;
  if (/em-?dash/.test(combined)) {
    result = result.replace(EM_DASH_PATTERN, ", ");
  }
  if (/\bemoji/.test(combined)) {
    result = result.replace(EMOJI_PATTERN, "");
  }
  return result;
}

export interface PreferenceModelCheck {
  isStandingPreference: boolean;
  preferenceText: string | null;
}

// Only ever called when BOTH regex pre-filters above already fired — this is
// the rare-path model call, not a per-message cost. One small, cheap JSON
// call (low max_tokens, low reasoning_effort — same shape as the existing
// outcome-lesson call in ai.ts's /ai/decisions/:id/outcome) asks the model to
// make the actual judgment call the regex layer can't: does this message
// genuinely state a standing preference the founder wants applied to every
// future response, or is it a one-off correction specific to this instance?
// The user still gives final yes/no before anything is stored (see ai.ts's
// pendingPreferenceText flow) — this model call only decides whether it's
// worth asking that question at all.
export async function confirmPreferenceWithModel(
  groq: Groq,
  message: string,
  priorAssistantMessage: string,
): Promise<PreferenceModelCheck | null> {
  try {
    const { parsed } = await callGroqJSON(
      groq,
      {
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: `Does the user's message state a STANDING preference or rule they want applied to every future response (e.g. "no em-dashes", "keep answers short", "call me Alex") — as opposed to a one-off correction specific to this instance only (e.g. "no, I meant 50L not 5L", "that's not what I asked")? Return ONLY JSON: {"isStandingPreference": true|false, "preferenceText": "a short, clean, generalized restatement of the rule if true, else null"}. Never invent a preference that isn't actually implied by the message.`,
          },
          {
            role: "user",
            content: `Venus's prior response: "${priorAssistantMessage.slice(0, 500)}"\n\nUser's reply: "${message}"`,
          },
        ],
        temperature: 0.2,
        max_tokens: 200,
        reasoning_effort: "low",
        include_reasoning: false,
      },
      "preferenceDetection/confirm",
    );
    if (!parsed || typeof parsed.isStandingPreference !== "boolean") return null;
    return {
      isStandingPreference: parsed.isStandingPreference,
      preferenceText: typeof parsed.preferenceText === "string" && parsed.preferenceText.trim() ? parsed.preferenceText.trim() : null,
    };
  } catch (err) {
    console.error("[preferenceDetection] model confirmation check failed, skipping", err);
    return null;
  }
}
