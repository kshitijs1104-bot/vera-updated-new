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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
