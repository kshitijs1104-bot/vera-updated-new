import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const precedentsTable = pgTable("precedents", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  sector: text("sector").notNull(),
  foundedYear: integer("founded_year"),
  outcomeYear: integer("outcome_year"),
  status: text("status").notNull(),
  stageAtDecision: text("stage_at_decision").notNull(),
  decisionContext: text("decision_context").notNull(),
  decisionTaken: text("decision_taken").notNull(),
  causalMechanism: text("causal_mechanism").notNull(),
  outcome: text("outcome").notNull(),
  timeframeToOutcome: text("timeframe_to_outcome"),
  sourceCitation: text("source_citation").notNull(),
  verificationStatus: text("verification_status").notNull().default("auto-extracted-unverified"),
  embeddingSummary: text("embedding_summary").notNull(),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPrecedentSchema = createInsertSchema(precedentsTable).omit({ id: true, createdAt: true });
export type InsertPrecedent = z.infer<typeof insertPrecedentSchema>;
export type Precedent = typeof precedentsTable.$inferSelect;
