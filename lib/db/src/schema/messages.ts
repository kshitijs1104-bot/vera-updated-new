import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The permanent raw chat log — the piece that was missing entirely before
// this table existed. Every /ai/* route previously only ever saw chat turns
// through whatever `sessionHistory` the CLIENT chose to send on that one
// request; nothing was ever durably written server-side, so there was no
// source of truth to re-derive context from, no way to fix a client-side
// history bug after the fact, and no way for a brand new chat to ever learn
// anything from a founder's other chats' raw conversation (as opposed to the
// already-extracted company_facts/venus_decisions/goals rows, which are
// userId-scoped and already do carry over).
//
// Every turn, full text, never edited and never deleted — this is the
// re-processable source of truth for context extraction, not itself the
// context that gets fed into a prompt (see messageLog.ts's
// getRelevantMessages for the actual retrieval/filtering layer built on top
// of this table).
//
// chatId is nullable (not a DB-enforced FK, matching every other cross-table
// reference in this schema — see chats/goals/venus_decisions) so a message
// logged before a chatId exists, or from a route with no chat concept, still
// gets a durable row instead of being silently dropped. userId is always
// required and is what makes this "queryable across all of a user's/org's
// chats" (per the requirement this table exists for) regardless of chatId.
export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    chatId: integer("chat_id"),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    // Cross-chat queries (a founder's whole raw history, for reprocessing or
    // debugging) filter by userId alone; per-chat reads filter by chatId.
    // Both are common enough access patterns to index directly rather than
    // relying on a userId-only index for the chatId-scoped case.
    index("messages_user_id_idx").on(table.userId),
    index("messages_chat_id_idx").on(table.chatId),
  ],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
