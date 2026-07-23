import { db, messagesTable, type Message } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { tokenize } from "./retrieval";

// Service layer for the permanent raw chat log (see
// lib/db/src/schema/messages.ts for why this table exists). Every function
// here is best-effort/never-throws, matching the philosophy already
// established in companyMemory.ts and autoLogDecisionCards: logging or
// retrieving history must never be able to break the actual chat response.

export interface LogMessageInput {
  userId: string;
  chatId?: number;
  role: "user" | "assistant";
  content: string;
}

export async function logMessage(input: LogMessageInput): Promise<void> {
  const trimmed = input.content?.trim();
  if (!trimmed) return;
  try {
    await db.insert(messagesTable).values({
      userId: input.userId,
      chatId: input.chatId ?? null,
      role: input.role,
      content: trimmed,
    });
  } catch (err) {
    console.error("[messageLog] failed to log message", err);
  }
}

// Plain recency fetch — a chat's full-ish history for debugging/browse, or
// as the raw pool getRelevantMessages below scores and filters. Returned
// oldest-first (chronological), matching how a transcript reads.
export async function getRecentMessages(userId: string, chatId: number, limit = 50): Promise<Message[]> {
  try {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.userId, userId), eq(messagesTable.chatId, chatId)))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);
    return rows.reverse();
  } catch (err) {
    console.error("[messageLog] failed to load recent messages, degrading to empty", err);
    return [];
  }
}

export interface RelevantMessagesOptions {
  keepRecent: number;
  topKRelevant: number;
}

// Same raw overlap floor style as retrieval.ts's MIN_RAW_OVERLAP — a match
// can't be manufactured from a single coincidental shared word.
const MIN_RELEVANCE_OVERLAP = 2;

// The actual fix for cross-topic bleed: instead of "last N turns" (which
// re-surfaces an unrelated earlier request just because it's recent — e.g.
// an old "draft a mail" turn bleeding into a brand new unrelated question),
// this always keeps the most recent `keepRecent` turns for conversational
// coherence, then scores every OLDER turn by token-overlap against the
// CURRENT message (same tokenize()/stopword approach retrieval.ts uses to
// score precedents) and keeps only the top `topKRelevant` above a minimum
// real-overlap floor. An unrelated older turn scores at or near zero and
// drops out, so it's never even in front of the model to confuse it — this
// is stronger than relying on the model to ignore it (see groq.ts's
// CURRENT-TURN PRIMACY, which is the belt to this retrieval's suspenders).
//
// Result is re-sorted back into chronological order — a transcript with
// gaps still reads top-to-bottom, it just skips the irrelevant middle.
export async function getRelevantMessages(
  userId: string,
  chatId: number,
  currentMessage: string,
  opts: RelevantMessagesOptions,
): Promise<Message[]> {
  const all = await getRecentMessages(userId, chatId, 200);
  if (all.length === 0) return [];

  const recentCount = Math.min(opts.keepRecent, all.length);
  const recent = all.slice(all.length - recentCount);
  const older = all.slice(0, all.length - recentCount);

  if (older.length === 0 || opts.topKRelevant <= 0) return recent;

  const queryTokens = new Set(tokenize(currentMessage));
  const scored = older.map((m) => {
    const docTokens = new Set(tokenize(m.content));
    let overlap = 0;
    for (const t of queryTokens) {
      if (docTokens.has(t)) overlap++;
    }
    return { message: m, overlap };
  });

  const relevant = scored
    .filter((s) => s.overlap >= MIN_RELEVANCE_OVERLAP)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, opts.topKRelevant)
    .map((s) => s.message);

  // Re-sort the (recency-selected + relevance-selected) union back into
  // chronological order by id (monotonic with insertion order) rather than
  // relevance-rank, createdAt, or duplicate-filtering by hand.
  const byId = new Map<number, Message>();
  for (const m of [...relevant, ...recent]) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}
