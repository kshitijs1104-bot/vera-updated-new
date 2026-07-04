import { db, precedentsTable, type Precedent } from "@workspace/db";

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
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "in", "on", "for", "and", "or",
  "we", "our", "i", "my", "should", "would", "could", "what", "how", "do", "does", "will", "with", "about",
  "this", "that", "it", "its", "us", "me", "you", "your", "can", "if", "as", "at", "by", "from", "into",
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

export interface RetrievalResult {
  matched: boolean;
  confidence: number;
  inferredSector: string | null;
  precedents: PrecedentMatch[];
  sectorCoverageCount: number;
}

const MATCH_THRESHOLD = 0.12;
const TOP_K = 4;

export async function retrievePrecedents(query: string, opts?: { sector?: string; businessContext?: string }): Promise<RetrievalResult> {
  const all = await db.select().from(precedentsTable);

  const combinedQuery = [query, opts?.businessContext].filter(Boolean).join(" ");
  const queryTokens = new Set(tokenize(combinedQuery));
  const inferredSector = opts?.sector || inferSector(combinedQuery);
  const sectorCoverageCount = inferredSector ? all.filter((p) => p.sector === inferredSector).length : 0;

  const scored: PrecedentMatch[] = all.map((p) => {
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

    // sector match is a strong signal on top of lexical overlap
    if (inferredSector && p.sector === inferredSector) {
      score += 0.25;
    }

    return { precedent: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_K).filter((s) => s.score >= MATCH_THRESHOLD);

  const confidence = top.length > 0 ? Math.min(1, top[0].score) : 0;
  const matched = top.length > 0 && confidence >= MATCH_THRESHOLD;

  return {
    matched,
    confidence: Number(confidence.toFixed(3)),
    inferredSector,
    precedents: matched ? top : [],
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
