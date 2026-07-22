import type { PrecedentMatch, ConfidenceTier } from "./retrieval";
import { outcomePolarity, clamp01 } from "./confidence";

// Shadow-mode only (see ai.ts's [convergence] block) — none of this reaches
// the client yet. The model generates competing hypotheses with tagged
// evidence; everything about WHICH hypothesis wins is computed here, in
// code, from structural facts about those hypotheses — never from a
// confidence/tier/recommendation the model states directly (the prompt in
// groq.ts explicitly tells it not to).
//
// precedent_match_count and outcome_consistency are the one place this
// design could have quietly reintroduced the exact problem it exists to
// close: if those two numbers were trusted as the LLM reported them, a
// model wanting a weak hypothesis to look stronger wouldn't need to fake a
// FACT tag — it could just report a higher match count than its own
// evidence[].precedent_ids actually cite, and the formula would reward it
// with nothing to catch the gap. Both are therefore re-derived here from
// the hypothesis's own FACT-tagged citations, cross-checked against the
// real matched-precedent set — the LLM's self-reported versions are kept
// on the Hypothesis type only so ai.ts can log how much they drift from
// reality, never fed into scoring.

export type EvidenceTag = "FACT" | "INFERENCE" | "ASSUMPTION";

export interface EvidenceItem {
  claim: string;
  tag: EvidenceTag;
  precedent_ids?: string[];
}

export interface Hypothesis {
  id: string;
  explanation: string;
  evidence: EvidenceItem[];
  precedent_match_count: number; // LLM-reported — calibration-drift logging only, never scored
  outcome_consistency: number;   // LLM-reported — same
}

export interface Contradiction {
  hypothesis_a_id: string;
  hypothesis_b_id: string;
  description: string;
}

export interface ConvergenceResult {
  tier: 1 | 2 | 3;
  scores: Record<string, number>;
  converged: boolean;
  leading_hypothesis_id: string | null;
  convergence_gap: number;
  // The values scoring actually used, keyed by hypothesis id — exposed so
  // ai.ts's calibration-drift log doesn't need to recompute them.
  codeVerifiedMatchCounts: Record<string, number>;
  codeVerifiedOutcomeConsistency: Record<string, number>;
}

const W1 = 0.3; // precedent match count (code-verified)
const W2 = 0.3; // evidence verification ratio
const W3 = 0.25; // outcome consistency (code-verified)
const W4 = 0.4; // contradiction penalty (subtracted)

const CONVERGENCE_THRESHOLD = 0.2;
// A single hypothesis has no second score to compare against — its
// "convergence_gap" is its own score, which would otherwise trivially clear
// CONVERGENCE_THRESHOLD for almost any non-zero score. This floor stops a
// single weak, thinly-evidenced hypothesis from auto-converging just
// because nothing competed with it.
const SINGLE_HYPOTHESIS_FLOOR = 0.5;

// Normalization denominator for precedent match count — reuses
// retrieval.ts's own TOP_K (4), so "fully normalized" means "matched as
// many precedents as retrieval.ts would ever hand the model at once."
const PRECEDENT_MATCH_NORM_CAP = 4;

// Every function below reads fields straight out of the LLM's raw JSON
// (via ai.ts's `as Hypothesis[]`/`as Contradiction[] | "none_identified"`
// casts — TypeScript casts are compile-time only and enforce nothing at
// runtime). Groq's json_object mode guarantees syntactically valid JSON,
// never a specific shape, so every array field the model was ASKED for is
// treated here as possibly missing, null, or the wrong type — malformed
// input degrades to "no evidence"/"no contradiction" rather than throwing.
// This matters more than usual for this file specifically: it runs inside
// a shadow-mode block that must never be able to turn an otherwise-valid
// founder-facing response into an error (see ai.ts's try/catch around the
// call site for the second layer of the same guarantee).

// Parses a hypothesis's FACT-tagged evidence into a set of valid,
// deduped [Precedent N] indices (1-based, matching the numbering the model
// was actually shown — see EVIDENCE_CONVERGENCE_INSTRUCTION in groq.ts).
// An id that isn't a real position in matchedPrecedents is silently
// dropped — a citation that doesn't resolve to a real shown precedent gets
// zero scoring credit, not the benefit of the doubt.
function resolveFactPrecedentIndices(hypothesis: Hypothesis, matchedPrecedents: PrecedentMatch[]): Set<number> {
  const indices = new Set<number>();
  if (!Array.isArray(hypothesis.evidence)) return indices;
  for (const item of hypothesis.evidence) {
    if (!item || item.tag !== "FACT" || !Array.isArray(item.precedent_ids)) continue;
    for (const raw of item.precedent_ids) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 1 && n <= matchedPrecedents.length) {
        indices.add(n);
      }
    }
  }
  return indices;
}

function codeVerifiedOutcomeConsistency(indices: Set<number>, matchedPrecedents: PrecedentMatch[]): number {
  if (indices.size === 0) return 0;
  let positive = 0;
  let negative = 0;
  for (const n of indices) {
    const status = matchedPrecedents[n - 1].precedent.status;
    if (outcomePolarity(status) === "negative") negative++;
    else positive++;
  }
  return Math.max(positive, negative) / indices.size;
}

function verificationRatio(evidence: EvidenceItem[]): number {
  if (!Array.isArray(evidence) || evidence.length === 0) return 0;
  const sum = evidence.reduce((acc, item) => {
    if (!item) return acc;
    if (item.tag === "FACT") return acc + 1;
    if (item.tag === "INFERENCE") return acc + 0.5;
    return acc; // ASSUMPTION = 0
  }, 0);
  return sum / evidence.length;
}

function contradictionPenalty(hypothesisId: string, contradictions: Contradiction[] | "none_identified", totalHypotheses: number): number {
  if (contradictions === "none_identified" || totalHypotheses === 0 || !Array.isArray(contradictions)) return 0;
  const involved = contradictions.filter(
    (c) => c && (c.hypothesis_a_id === hypothesisId || c.hypothesis_b_id === hypothesisId),
  ).length;
  return Math.min(1, involved / totalHypotheses);
}

const TIER_FROM_RETRIEVAL: Record<ConfidenceTier, 1 | 2 | 3> = {
  strong: 1,
  moderate: 2,
  none: 3,
};

// tier is not derivable from matchedPrecedents alone (a plain array has no
// memory of which threshold/count logic in retrieval.ts selected it) — it
// reuses the tier retrieval.ts already computed for this same request,
// relabeled to the spec's 1/2/3 shape. No new tiering logic.
export function computeConvergence(
  rawHypotheses: Hypothesis[],
  contradictions: Contradiction[] | "none_identified",
  matchedPrecedents: PrecedentMatch[],
  retrievalTier: ConfidenceTier,
): ConvergenceResult {
  // A hypothesis missing its own `id` (or not an object at all) can't be
  // scored, referenced by a contradiction, or ranked — drop it rather than
  // letting `h.id`/`h.evidence` access below throw on malformed LLM output.
  const hypotheses = Array.isArray(rawHypotheses)
    ? rawHypotheses.filter((h): h is Hypothesis => !!h && typeof h.id === "string")
    : [];

  const codeVerifiedMatchCounts: Record<string, number> = {};
  const outcomeConsistencyById: Record<string, number> = {};
  const scores: Record<string, number> = {};

  for (const h of hypotheses) {
    const indices = resolveFactPrecedentIndices(h, matchedPrecedents);
    const consistency = codeVerifiedOutcomeConsistency(indices, matchedPrecedents);
    codeVerifiedMatchCounts[h.id] = indices.size;
    outcomeConsistencyById[h.id] = consistency;

    const score =
      W1 * Math.min(indices.size / PRECEDENT_MATCH_NORM_CAP, 1) +
      W2 * verificationRatio(h.evidence) +
      W3 * consistency -
      W4 * contradictionPenalty(h.id, contradictions, hypotheses.length);

    scores[h.id] = Number(clamp01(score).toFixed(3));
  }

  const ranked = [...hypotheses].sort((a, b) => scores[b.id] - scores[a.id]);
  const topScore = ranked.length > 0 ? scores[ranked[0].id] : 0;
  const secondScore = ranked.length > 1 ? scores[ranked[1].id] : 0;
  const convergenceGap = ranked.length === 0 ? 0 : ranked.length === 1 ? topScore : topScore - secondScore;

  const converged = ranked.length > 0 && convergenceGap >= CONVERGENCE_THRESHOLD && topScore >= SINGLE_HYPOTHESIS_FLOOR;

  return {
    tier: TIER_FROM_RETRIEVAL[retrievalTier],
    scores,
    converged,
    leading_hypothesis_id: converged ? ranked[0].id : null,
    convergence_gap: Number(convergenceGap.toFixed(3)),
    codeVerifiedMatchCounts,
    codeVerifiedOutcomeConsistency: outcomeConsistencyById,
  };
}

export function withheldReasonFor(tier: 1 | 2 | 3): string {
  return tier === 3
    ? "No precedent coverage — reasoning is unverified and multiple explanations remain plausible."
    : "Evidence does not clearly favor one explanation over the others; see ranked hypotheses and key missing information below.";
}

// Template, not a second Groq call — see plan Context §1 for why a
// dedicated recommendation call was deliberately not used in this
// shadow-mode/measurement phase.
export function generateRecommendationText(hypothesis: Hypothesis): string {
  const factClaims = hypothesis.evidence.filter((e) => e.tag === "FACT").map((e) => e.claim);
  if (factClaims.length === 0) return hypothesis.explanation;
  return `${hypothesis.explanation} This is grounded in: ${factClaims.join("; ")}.`;
}
