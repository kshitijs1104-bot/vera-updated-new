import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// This table is the actual mechanism behind "is Venus better on day 30 than
// day 1" — every other piece of business context (settings.venusBusinessContext)
// tells Venus WHAT the founder's business is, but never records what Venus
// told them to do or what happened when they did it. Without that, every
// conversation is stateless advice-giving with no compounding value: a
// generic wrapper around an LLM would produce the exact same day-30 answer
// as its day-1 answer, because nothing about its knowledge of THIS founder's
// specific situation has actually changed.
//
// Rows are written two ways:
//  1. Automatically, whenever /ai/analyze returns a "decision" or "roadmap"
//     card — logged as status "open" with no outcome yet. This means the
//     memory starts building itself from normal usage with zero extra effort
//     from the founder.
//  2. The founder (or Venus, conversationally) later reports back what
//     actually happened — status becomes "resolved", outcome + lesson get
//     filled in. This is the one piece that can't be automated: it requires
//     a real person telling Venus the truth about a real result. Product
//     design should make this as low-friction as possible (a single message
//     like "hire worked out, we signed 2 clinics off it" should be enough
//     for Venus to parse and log against the open decision).
//
// Resolved rows feed back into retrieval (see retrieval.ts /
// formatOwnDecisionsForPrompt) as first-class precedent-like evidence, but
// scoped to this one sessionId/business — never shown to or blended into
// other users' sessions. This is what makes the founder's own usage history
// a real, growing, proprietary asset rather than just a longer chat log.
export const venusDecisionsTable = pgTable("venus_decisions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),

  // The founder's original question/message that produced this decision.
  query: text("query").notNull(),
  // Snapshot of the business context at the time, so a resolved decision
  // still makes sense to retrieve even if the business description has
  // since been updated or refined.
  businessContextSnapshot: text("business_context_snapshot"),

  // What Venus actually recommended — kept as both the raw card content
  // (for accurate re-display) and a short plain-text version (for fast
  // retrieval scoring without re-parsing JSON every time).
  cardType: text("card_type").notNull(), // "decision" | "roadmap"
  recommendationSummary: text("recommendation_summary").notNull(),
  cardContentJson: text("card_content_json").notNull(),

  // "open" until the founder reports back; "resolved" once an outcome is
  // logged; "abandoned" if the founder explicitly says they didn't go with
  // it (still useful signal — tells Venus this framing didn't land).
  status: text("status").notNull().default("open"),

  // Filled in only once resolved. `outcome` is what happened in the
  // founder's own words (kept close to verbatim — this is ground truth, not
  // something to paraphrase away); `lesson` is Venus's own short causal
  // takeaway derived from it, generated at resolution time so future
  // retrieval can surface the lesson directly rather than re-deriving it
  // from the raw outcome text on every query.
  outcome: text("outcome"),
  lesson: text("lesson"),
  // Coarse self-reported signal so retrieval/UI can weight or filter by
  // whether following the advice actually worked, without re-reading prose.
  outcomeSentiment: text("outcome_sentiment"), // "positive" | "negative" | "mixed" | null

  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertVenusDecisionSchema = createInsertSchema(venusDecisionsTable).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertVenusDecision = z.infer<typeof insertVenusDecisionSchema>;
export type VenusDecision = typeof venusDecisionsTable.$inferSelect;