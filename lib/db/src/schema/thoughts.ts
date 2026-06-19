import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const thoughtsTable = pgTable("thoughts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reactionsTable = pgTable("reactions", {
  id: serial("id").primaryKey(),
  thoughtId: integer("thought_id").notNull().references(() => thoughtsTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  reactionType: text("reaction_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  unique("reactions_unique").on(t.thoughtId, t.sessionId, t.reactionType),
]);

export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({ id: true, createdAt: true });
export type InsertThought = z.infer<typeof insertThoughtSchema>;
export type Thought = typeof thoughtsTable.$inferSelect;
export type Reaction = typeof reactionsTable.$inferSelect;
