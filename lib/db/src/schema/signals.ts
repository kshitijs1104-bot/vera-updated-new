import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value"),
  change: text("change").notNull(),
  sentiment: text("sentiment").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ id: true, updatedAt: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
