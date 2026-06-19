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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
