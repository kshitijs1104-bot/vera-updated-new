import { pgTable, serial, text, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Replaces settings.venusBusinessContext's pipe-joined free-text blob with
// discrete, individually-supersedable facts. The blob approach only ever
// grows (saveStoredBusinessContext in ai.ts appends with " | ", never
// removes) so a founder correcting themselves ("actually we pivoted away
// from clinics") leaves the old claim sitting in the string forever, still
// getting fed into every future prompt alongside the correction — the exact
// "stale context" bug class already patched once by hand for goal state
// (see commit 0733bda). Structuring memory as rows with a `supersededBy`
// pointer fixes this at the data-model level instead of needing another
// one-off patch next time it recurs.
//
// Deliberately NOT a replacement for venusBusinessContext yet — that column
// stays as the fallback source ai.ts already reads (see
// getStoredBusinessContext), so nothing about the live chat path regresses.
// This table is additive: every context statement ai.ts already captures
// also gets logged here as its own fact, and future retrieval can prefer
// this structured source once there's a UI to manage/correct facts
// directly. Until then it accumulates for free from normal usage, same as
// venus_decisions does for Decision Memory.
export const companyFactsTable = pgTable(
  "company_facts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),

    factText: text("fact_text").notNull(),
    // Loose categorical tag for retrieval filtering as the fact log grows —
    // "general" is the safe default for anything not confidently classified,
    // never left null (an unclassified fact is still a fact, just an
    // untagged one — null would force every reader to handle a third state).
    factType: text("fact_type").notNull().default("general"), // general | constraint | milestone | market | team | metric

    // Where this fact came from — lets retrieval/UI weight or filter by
    // provenance (e.g. trust an onboarding-form answer differently than a
    // loosely-classified chat aside).
    sourceType: text("source_type").notNull(), // onboarding | chat | checkin | decision | manual

    // Optional 0-1 confidence for facts inferred rather than stated outright.
    // Null means "stated directly, not inferred" — not "unknown confidence".
    confidence: real("confidence"),

    // Self-reference by convention (no DB-enforced FK, matching every other
    // cross-table relationship in this schema — see chats/goals/venus_decisions).
    // Null = still active. Set to the id of the fact that replaced it when a
    // later statement contradicts or refines this one, so retrieval can
    // filter to `supersededBy IS NULL` and never surface a stale claim
    // alongside the correction that replaced it.
    supersededBy: integer("superseded_by"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    // Every read path filters by userId first (a founder's facts are never
    // cross-visible) — this is the one index retrieval always needs.
    index("company_facts_user_id_idx").on(table.userId),
  ],
);

export const insertCompanyFactSchema = createInsertSchema(companyFactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompanyFact = z.infer<typeof insertCompanyFactSchema>;
export type CompanyFact = typeof companyFactsTable.$inferSelect;
