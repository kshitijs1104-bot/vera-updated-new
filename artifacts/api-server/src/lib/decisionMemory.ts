import { db, venusDecisionsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";

// Anti-bloat maintenance for Decision Memory. An "open" decision that never
// gets an outcome reported isn't wrong to keep — it's still provenance —
// but leaving it forever visible alongside genuinely live open items means
// the Weekly-Review-style "still open" nudge and any future browse UI never
// stop pointing at year-old noise. Soft-archive only: `archived` hides it
// from default views, `status` stays "open" (it genuinely was never
// resolved — that's true and shouldn't be overwritten to look otherwise).
const ARCHIVE_AFTER_DAYS = 30;

export async function archiveStaleOpenDecisions(sessionId: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60_000);
    const rows = await db
      .update(venusDecisionsTable)
      .set({ archived: true })
      .where(
        and(
          eq(venusDecisionsTable.sessionId, sessionId),
          eq(venusDecisionsTable.status, "open"),
          eq(venusDecisionsTable.archived, false),
          lt(venusDecisionsTable.createdAt, cutoff),
        ),
      )
      .returning({ id: venusDecisionsTable.id });
    return rows.length;
  } catch (err) {
    console.error("[decisionMemory] failed to archive stale open decisions", err);
    return 0;
  }
}

// Loose categorical tag for a founder's question — cheap regex heuristics
// in the same style as inferDecisionRouting/requiresContext in ai.ts,
// deliberately not exhaustive: an unmatched query gets `null` (displayed as
// "other"), never a fabricated guess.
export function classifyDecisionType(query: string): string | null {
  const q = query.toLowerCase();
  if (/\b(hire|hiring|recruit|employee|cofounder|co-founder|fire|layoff|terminat)\b/.test(q)) return "hire";
  if (/\b(price|pricing|priced|subscription|fee|fees|charge|charges)\b/.test(q)) return "pricing";
  if (/\b(raise|raising|funding|investor|vc|valuation|equity|dilution|seed round|series [a-z])\b/.test(q)) return "fundraise";
  if (/\b(launch|feature|mvp|roadmap|build|ship)\b/.test(q)) return "product";
  return null;
}
