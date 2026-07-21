import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
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
export const venusDecisionsTable = pgTable(
  "venus_decisions",
  {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),

  // Which chat this card was generated in. Nullable because pre-Goal-feature
  // rows and cards from chats with no chatId wired up yet won't have one —
  // treat null as "not attributable to any goal," not as an error. When
  // present AND that chat has an active goal, resolving this decision is
  // what moves the goal's evidenceScore (see goals.ts) — a roadmap card is a
  // sub-task of the goal precisely by virtue of living in the same chatId,
  // not through any separate linking table.
  chatId: integer("chat_id"),

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

  // ---- Scalability / signal-to-noise additions ----
  //
  // Loose categorical tag (hire/pricing/fundraise/product/other) for
  // filtering once the log is large enough that lexical retrieval alone
  // isn't a precise enough browse/filter mechanism. Nullable: older rows
  // and any row logged before classification is wired up simply have no
  // tag rather than a fabricated one.
  decisionType: text("decision_type"),

  // Soft-hide, never hard-delete: a founder can dismiss noise (an
  // accidental re-ask, a test query) without losing it as causal history —
  // retrieval and the future browse UI both filter on this, but the row
  // and its resolved outcome remain queryable for anyone who needs the
  // full record.
  archived: boolean("archived").notNull().default(false),

  // Bumped instead of inserting a new row when the same founder asks a
  // near-duplicate open question within a short window (see the dedupe
  // guard in autoLogDecisionCards) — keeps the log from bloating with
  // repeats of the same in-session question and keeps retrieval scoring
  // from being skewed by near-identical rows competing for the same slot.
  reinforcedCount: integer("reinforced_count").notNull().default(1),

  // Set when this decision's card was a "roadmap" card AND got materialized
  // into a durable roadmaps row (see roadmaps.ts / lib/roadmap.ts) — lets a
  // decision-log entry link forward to the trackable plan it produced,
  // rather than only the reverse (roadmaps.sourceDecisionId) being
  // queryable. Null for "decision" cards and for roadmap cards that failed
  // to materialize (never blocks the decision row itself from being saved).
  roadmapId: integer("roadmap_id"),
  },
  (table) => [
    // Every retrieval path (retrieveOwnResolvedDecisions,
    // retrieveOpenSessionDecisions, GET /ai/decisions) filters by sessionId
    // first and very often status too — a composite index matches that
    // access pattern directly instead of relying on a sessionId-only index
    // and a full scan of that founder's rows for the status filter.
    index("venus_decisions_session_status_idx").on(table.sessionId, table.status),
    index("venus_decisions_chat_id_idx").on(table.chatId),
  ],
);

export const insertVenusDecisionSchema = createInsertSchema(venusDecisionsTable).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertVenusDecision = z.infer<typeof insertVenusDecisionSchema>;
export type VenusDecision = typeof venusDecisionsTable.$inferSelect;