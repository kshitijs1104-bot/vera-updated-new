import { db, precedentsTable, venusDecisionsTable, type Precedent, type VenusDecision } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const SECTOR_KEYWORDS: Record<string, string[]> = {
  "SaaS/Enterprise Software": ["saas", "enterprise software", "b2b software", "dashboard", "crm", "collaboration tool", "productivity software"],
  "Fintech": ["fintech", "banking", "payments", "lending", "insurance tech", "insurtech", "trading", "crypto", "wallet", "neobank"],
  "Healthtech": ["healthtech", "health tech", "digital health", "medtech", "telemedicine", "biotech", "wellness app", "healthcare"],
  "Consumer Hardware": ["hardware", "wearable", "device", "gadget", "iot", "consumer electronics", "smart home"],
  "E-commerce/Retail": ["ecommerce", "e-commerce", "retail", "marketplace", "d2c", "online store", "subscription box"],
  "Foodtech": ["foodtech", "food tech", "delivery", "restaurant tech", "meal kit", "grocery", "food delivery"],
  "Edtech": ["edtech", "education tech", "e-learning", "online learning", "tutoring", "school software"],
  "AI/ML": ["ai", "artificial intelligence", "machine learning", "ml", "generative ai", "llm", "computer vision", "nlp"],
  "Mobility/Transportation": ["mobility", "transportation", "ride share", "rideshare", "autonomous vehicle", "ev", "scooter", "logistics", "delivery fleet"],
  "Real Estate/Proptech": ["proptech", "real estate", "property", "rental", "housing", "mortgage tech"],
  "Fitness/Wellness": ["gym", "fitness", "workout", "personal training", "wellness studio", "yoga studio", "crossfit", "membership fitness", "health club"],
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "on", "for", "and", "or",
  "we", "our", "i", "my", "should", "would", "could", "what", "how", "do", "does", "will", "with", "about",
  "this", "that", "it", "its", "us", "me", "you", "your", "can", "if", "as", "at", "by", "from", "into",
  // Generic startup/business vocabulary that appears in nearly every precedent's
  // text — these carry no real topical signal and previously caused false-positive
  // matches on completely unrelated queries (e.g. a satellite-hardware query
  // matching a foodtech precedent purely because both mention "startup"/"raise").
  "startup", "startups", "company", "companies", "business", "businesses", "raise", "raising", "raised",
  "series", "funding", "fund", "funded", "product", "products", "market", "markets", "team", "teams",
  "build", "building", "built", "launch", "launching", "launched", "scale", "scaling", "scaled",
  "now", "need", "needs", "idea", "ideas", "operator", "operators", "founder", "founders", "money",
  "revenue", "growth", "grow", "growing", "customer", "customers", "year", "years",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function inferSector(query: string): string | null {
  const lower = query.toLowerCase();
  let best: { sector: string; hits: number } | null = null;
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { sector, hits };
    }
  }
  return best?.sector ?? null;
}

export interface PrecedentMatch {
  precedent: Precedent;
  score: number;
}

export type ConfidenceTier = "strong" | "moderate" | "none";

export interface RetrievalResult {
  matched: boolean;
  tier: ConfidenceTier;
  confidence: number;
  inferredSector: string | null;
  precedents: PrecedentMatch[];
  sectorCoverageCount: number;
}

const MATCH_THRESHOLD = 0.12;
const TOP_K = 4;
// Even if the ratio threshold is hit, require at least this many real overlapping
// substantive tokens (post-stopword) so a match can't be manufactured from a
// single coincidental word when the query has very few tokens overall.
const MIN_RAW_OVERLAP = 2;
// Strong tier requires this many solid in-sector-strength matches (see MATCH_THRESHOLD
// + MIN_RAW_OVERLAP above). Below that, we fall back to a relaxed "moderate" pass so a
// query is never hard-refused just because it doesn't clear the strict bar, as long as
// there is at least one genuinely overlapping real precedent to ground the answer in.
const STRONG_TIER_MIN_COUNT = 3;
// Moderate tier: real but weaker signal — fewer overlapping tokens and/or lower ratio,
// possibly from an adjacent/analogous sector. Still requires at least one real
// overlapping token; never zero-overlap (that would be pure fabrication).
const MODERATE_MATCH_THRESHOLD = 0.06;
const MODERATE_MIN_RAW_OVERLAP = 1;
const MODERATE_TOP_K = 3;

export async function retrievePrecedents(query: string, opts?: { sector?: string; businessContext?: string }): Promise<RetrievalResult> {
  const all = await db.select().from(precedentsTable);

  const combinedQuery = [query, opts?.businessContext].filter(Boolean).join(" ");
  const queryTokens = new Set(tokenize(combinedQuery));
  const inferredSector = opts?.sector || inferSector(combinedQuery);
  const sectorCoverageCount = inferredSector ? all.filter((p: Precedent) => p.sector === inferredSector).length : 0;

  const scored: (PrecedentMatch & { overlap: number })[] = all.map((p: Precedent) => {
    const haystack = [
      p.embeddingSummary,
      p.decisionContext,
      p.decisionTaken,
      p.causalMechanism,
      p.outcome,
      p.companyName,
      p.sector,
      ...(p.tags || []),
    ].join(" ");
    const docTokens = tokenize(haystack);
    const docTokenSet = new Set(docTokens);

    let overlap = 0;
    for (const t of queryTokens) {
      if (docTokenSet.has(t)) overlap++;
    }
    const denom = Math.max(queryTokens.size, 1);
    let score = overlap / denom;

    // sector match is a strong signal on top of lexical overlap, but only
    // counts toward the raw-overlap floor if there is also at least some
    // genuine lexical overlap — otherwise a bare sector inference (from a
    // single loosely-matched keyword) could pass the gate with zero real
    // topical connection to the retrieved precedent's actual content.
    if (inferredSector && p.sector === inferredSector) {
      score += 0.25;
    }

    return { precedent: p, score, overlap };
  });

  scored.sort((a, b) => b.score - a.score);

  const strongCandidates = scored.filter((s) => s.score >= MATCH_THRESHOLD && s.overlap >= MIN_RAW_OVERLAP);

  let tier: ConfidenceTier;
  let selected: (PrecedentMatch & { overlap: number })[];

  if (strongCandidates.length >= STRONG_TIER_MIN_COUNT) {
    tier = "strong";
    selected = strongCandidates.slice(0, TOP_K);
  } else {
    // Relaxed pass: real precedents with weaker lexical signal and/or from an
    // adjacent sector, but still at least one genuinely overlapping token —
    // never a zero-overlap (pure sector-inference-only) match.
    //
    // If we confidently inferred a sector for this query, restrict the relaxed
    // pass to precedents in that same sector. Without this, a gym/fitness query
    // (a sector with zero or few precedents) could fall through and grab an
    // unrelated precedent (e.g. Ask Jeeves, Zume) purely because it shares one
    // generic overlapping word — a real match by the scoring math but with zero
    // genuine topical connection to the founder's actual question.
    const moderatePool = inferredSector
      ? scored.filter((s) => s.precedent.sector === inferredSector)
      : scored;
    const moderateCandidates = moderatePool.filter(
      (s) => s.score >= MODERATE_MATCH_THRESHOLD && s.overlap >= MODERATE_MIN_RAW_OVERLAP,
    );
    if (moderateCandidates.length > 0) {
      tier = "moderate";
      selected = moderateCandidates.slice(0, MODERATE_TOP_K);
    } else {
      tier = "none";
      selected = [];
    }
  }

  const top = selected.map(({ precedent, score }) => ({ precedent, score }));
  const confidence = top.length > 0 ? Math.min(1, top[0].score) : 0;
  const matched = tier !== "none";

  return {
    matched,
    tier,
    confidence: Number(confidence.toFixed(3)),
    inferredSector,
    precedents: top,
    sectorCoverageCount,
  };
}

export function formatPrecedentsForPrompt(matches: PrecedentMatch[]): string {
  return matches
    .map(
      (m, i) =>
        `[Precedent ${i + 1}] ${m.precedent.companyName} (${m.precedent.sector}, founded ${m.precedent.foundedYear ?? "?"}, status: ${m.precedent.status})\n` +
        `Context: ${m.precedent.decisionContext}\n` +
        `Decision: ${m.precedent.decisionTaken}\n` +
        `Causal mechanism: ${m.precedent.causalMechanism}\n` +
        `Outcome: ${m.precedent.outcome}${m.precedent.timeframeToOutcome ? ` (timeframe: ${m.precedent.timeframeToOutcome})` : ""}\n` +
        `Source: ${m.precedent.sourceCitation}`,
    )
    .join("\n\n");
}

/* ---- The founder's own resolved decisions — Venus's real, growing memory ---- */
//
// This is deliberately a SEPARATE, simpler retrieval path from
// retrievePrecedents above. The third-party precedent dataset is large
// enough to need real scoring/tiering/thresholds; a single founder's own
// decision history starts at zero and grows slowly, so simple recency +
// lexical overlap is sufficient and avoids over-engineering a tiny table.
// Critically, this is scoped to sessionId — one founder's resolved
// decisions are never surfaced into another founder's session.

export interface OwnDecisionMatch {
  decision: VenusDecision;
  score: number;
}

const OWN_DECISION_TOP_K = 3;

export async function retrieveOwnResolvedDecisions(
  sessionId: string,
  query: string,
  opts?: { businessContext?: string },
): Promise<OwnDecisionMatch[]> {
  const rows = await db
    .select()
    .from(venusDecisionsTable)
    .where(and(eq(venusDecisionsTable.sessionId, sessionId), eq(venusDecisionsTable.status, "resolved")));

  if (rows.length === 0) return [];

  const combinedQuery = [query, opts?.businessContext].filter(Boolean).join(" ");
  const queryTokens = new Set(tokenize(combinedQuery));

  const scored: OwnDecisionMatch[] = rows.map((decision: VenusDecision) => {
    const haystack = [decision.query, decision.recommendationSummary, decision.outcome ?? "", decision.lesson ?? ""].join(" ");
    const docTokens = new Set(tokenize(haystack));
    let overlap = 0;
    for (const t of queryTokens) {
      if (docTokens.has(t)) overlap++;
    }
    // Recency counts here in a way it doesn't for the third-party precedent
    // dataset: a founder's own decision from last week is more relevant to
    // "what should I do now" than one from months ago, even at similar topical
    // overlap, since it reflects the current state of their business.
    const ageDays = decision.resolvedAt ? (Date.now() - new Date(decision.resolvedAt).getTime()) / 86_400_000 : 9999;
    const recencyBoost = ageDays < 30 ? 0.15 : ageDays < 90 ? 0.05 : 0;
    const score = overlap / Math.max(queryTokens.size, 1) + recencyBoost;
    return { decision, score };
  });

  return scored
    .filter((s) => s.score > 0) // never surface a zero-overlap decision just to fill the slot
    .sort((a, b) => b.score - a.score)
    .slice(0, OWN_DECISION_TOP_K);
}

export function formatOwnDecisionsForPrompt(matches: OwnDecisionMatch[]): string {
  if (matches.length === 0) return "";
  return matches
    .map(
      (m, i) =>
        `[Your own past decision ${i + 1}] Asked: "${m.decision.query}"\n` +
        `You recommended: ${m.decision.recommendationSummary}\n` +
        `What actually happened: ${m.decision.outcome}\n` +
        `Lesson: ${m.decision.lesson ?? "(not yet derived)"}`,
    )
    .join("\n\n");
}