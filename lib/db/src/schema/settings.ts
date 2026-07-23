import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  groqApiKey: text("groq_api_key"),
  tier: text("tier").notNull().default("personal"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  companyName: text("company_name"),
  stage: text("stage"),
  industry: text("industry"),
  teamSize: text("team_size"),
  country: text("country"),
  primaryGoal: text("primary_goal"),
  // Freeform business context Venus AI has learned from the conversation
  // itself (as opposed to the structured onboarding fields above, which are
  // filled in explicitly through the onboarding flow). This is what lets
  // Venus remember "I'm building a B2B SaaS for clinics in India" across
  // every future question — in this session and in brand new sessions —
  // without asking again, until the user starts a genuinely different idea.
  venusBusinessContext: text("venus_business_context"),
  venusBusinessContextUpdatedAt: timestamp("venus_business_context_updated_at"),
  // Set when Venus asks "is this the same business or a new one?" (see
  // buildBusinessContextConfirmation in ai.ts) so the VERY NEXT message in
  // this session can be interpreted as the answer to that specific question,
  // instead of being re-run through the normal classifiers from scratch —
  // which is what let short replies like "new" fall through every gate
  // unrecognized and reach the LLM with stale or empty context. Cleared as
  // soon as the pending confirmation is resolved, one way or the other.
  pendingContextConfirmation: boolean("pending_context_confirmation").notNull().default(false),
  // Mirrors pendingContextConfirmation's pattern for a different question: set
  // when a message looked like a standing preference/correction (see
  // preferenceDetection.ts) and Venus asked "should I remember this going
  // forward?" — holds the model's own cleaned-up candidate text (not the raw
  // message) so the very next reply is checked against THIS specific
  // question before any other classifier runs. Null = no confirmation
  // pending. Cleared as soon as the founder answers either way.
  pendingPreferenceText: text("pending_preference_text"),
  // Same pending-confirmation pattern again, for a third specific question:
  // set when a new business-context statement looks like it contradicts an
  // already-stored company_facts row (see companyMemory.findPotentialContradiction)
  // and Venus asked "you told me X before, now Y — update it, or both true?"
  // JSON-encoded { oldFactId, newFactText, factType, sourceType } so the next
  // reply can be resolved (supersedeFact vs. add-as-new) without re-deriving
  // any of it. Null = no contradiction pending.
  pendingFactContradiction: text("pending_fact_contradiction"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
