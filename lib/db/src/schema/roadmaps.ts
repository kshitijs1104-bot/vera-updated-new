import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Today a "roadmap" is only ever an ephemeral card inside a chat response
// (see ai.ts's card-type union and summarizeCardForLogging) — logged into
// venus_decisions as an opaque cardContentJson blob for provenance, but
// never re-read as trackable state. That means a founder can never mark a
// roadmap action done, and re-asking "what's my roadmap" regenerates a
// brand new plan from scratch with no memory of what was already decided.
// This table makes the roadmap a real, mutable object instead of a
// snapshot: one row per active plan, phases/actions stored as JSON (same
// convention as venus_decisions.cardContentJson — a `text` column holding
// JSON.stringify'd content, not a jsonb column, since 3-5 phases with a
// handful of actions each has nowhere near the cardinality that would need
// relational decomposition into join tables).
//
// Scoped to chatId, not goalId — this deliberately follows the existing
// Goal model's "one chat = one project" convention (see goals.ts) rather
// than inventing a parallel linking scheme. A roadmap belongs to the same
// thread its goal lives in.
//
// phasesJson shape: Array<{
//   period: string;
//   title: string;
//   metric?: string;
//   actions: Array<{ text: string; status: "pending" | "done" | "skipped"; completedAt?: string }>;
// }>
export const roadmapsTable = pgTable(
  "roadmaps",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id").notNull(),
    userId: text("user_id").notNull(),

    title: text("title").notNull(),
    horizon: text("horizon"),
    phasesJson: text("phases_json").notNull(),

    // Only one "active" roadmap per chatId at a time. When a fresh roadmap
    // card is generated for a chat that already has one, the service layer
    // (see roadmap.ts's mergePhases) updates this SAME row additively rather
    // than replacing it — a chat's roadmap is one evolving plan, and
    // regenerating it every couple of prompts must never discard actions the
    // founder already checked off. "superseded" is kept for a possible
    // future explicit "start over" action but isn't set by the automatic
    // path anymore. "archived" is the founder dismissing a plan outright.
    status: text("status").notNull().default("active"), // active | superseded | archived

    // Which venus_decisions row this roadmap was materialized from, for
    // provenance/traceability back to the original chat turn. Nullable
    // because a roadmap can also be created/edited directly once there's a
    // UI for that, with no originating card.
    sourceDecisionId: integer("source_decision_id"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("roadmaps_chat_id_idx").on(table.chatId),
    index("roadmaps_user_id_idx").on(table.userId),
  ],
);

export const insertRoadmapSchema = createInsertSchema(roadmapsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRoadmap = z.infer<typeof insertRoadmapSchema>;
export type Roadmap = typeof roadmapsTable.$inferSelect;

export interface RoadmapAction {
  text: string;
  status: "pending" | "done" | "skipped";
  completedAt?: string;
}

export interface RoadmapPhase {
  period: string;
  title: string;
  metric?: string;
  actions: RoadmapAction[];
}
