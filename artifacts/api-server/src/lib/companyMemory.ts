import { db, companyFactsTable, type CompanyFact } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";

// Service layer for the structured Company Memory table (see
// lib/db/src/schema/company_facts.ts for why this exists alongside
// settings.venusBusinessContext rather than replacing it outright). Every
// function here is best-effort: a failure must never break the chat
// response it's attached to, mirroring the try/catch philosophy already
// established in retrieval.ts and autoLogDecisionCards.

export interface AddCompanyFactInput {
  userId: string;
  factText: string;
  factType?: string; // general | constraint | milestone | market | team | metric
  sourceType: "onboarding" | "chat" | "checkin" | "decision" | "manual";
  confidence?: number;
}

export async function addCompanyFact(input: AddCompanyFactInput): Promise<CompanyFact | null> {
  const trimmed = input.factText.trim();
  if (!trimmed) return null;
  try {
    const [row] = await db
      .insert(companyFactsTable)
      .values({
        userId: input.userId,
        factText: trimmed,
        factType: input.factType || "general",
        sourceType: input.sourceType,
        confidence: input.confidence ?? null,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    console.error("[companyMemory] failed to add fact", err);
    return null;
  }
}

// Active = not yet superseded by a later, corrected statement. Ordered most
// recent first so a prompt-context caller taking a top-N slice gets the
// freshest facts rather than an arbitrary insertion-order slice.
export async function getActiveCompanyFacts(userId: string, limit = 20): Promise<CompanyFact[]> {
  try {
    return await db
      .select()
      .from(companyFactsTable)
      .where(and(eq(companyFactsTable.userId, userId), isNull(companyFactsTable.supersededBy)))
      .orderBy(desc(companyFactsTable.createdAt))
      .limit(limit);
  } catch (err) {
    console.error("[companyMemory] failed to load active facts, degrading to empty", err);
    return [];
  }
}

// Records a corrected/updated fact WITHOUT deleting or blindly appending to
// the old one — inserts the new fact, then points the old row's
// supersededBy at it, so a `supersededBy IS NULL` filter always reflects
// current ground truth and the superseded claim stays queryable as history
// rather than vanishing or lingering as a live contradiction.
export async function supersedeFact(
  oldFactId: number,
  replacement: Omit<AddCompanyFactInput, "userId"> & { userId: string },
): Promise<CompanyFact | null> {
  try {
    const newFact = await addCompanyFact(replacement);
    if (!newFact) return null;
    await db
      .update(companyFactsTable)
      .set({ supersededBy: newFact.id, updatedAt: new Date() })
      .where(eq(companyFactsTable.id, oldFactId));
    return newFact;
  } catch (err) {
    console.error("[companyMemory] failed to supersede fact", err);
    return null;
  }
}

export function formatCompanyFactsForPrompt(facts: CompanyFact[]): string {
  if (facts.length === 0) return "";
  return facts.map((f) => `- [${f.factType}] ${f.factText}`).join("\n");
}
