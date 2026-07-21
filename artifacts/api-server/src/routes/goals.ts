import { Router } from "express";
import { db, goalsTable, chatsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireUserId } from "../middlewares/auth";
import { attachGoalProgress } from "./chats";

// Goals stay intentionally scoped 1:1 to a chat (see goals.ts's schema
// comment — each chat is its own "project," the way a Claude Project's
// custom instructions frame one thread rather than the whole account).
// That's the right model for HOW a goal shapes a conversation, but a
// founder juggling a handful of live projects still needs one place to see
// all of them at a glance — this is that read, not a change to the
// underlying 1:1 relationship. Purely additive: a cross-chat list built
// from the exact same goalsTable rows and attachGoalProgress derivation
// every per-chat read already uses.
const router = Router();

router.get("/goals", requireAuth, async (req, res) => {
  try {
    const userId = requireUserId(req);
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;

    const rows = await db
      .select({
        goal: goalsTable,
        chatTitle: chatsTable.title,
      })
      .from(goalsTable)
      .innerJoin(chatsTable, eq(goalsTable.chatId, chatsTable.id))
      .where(eq(goalsTable.userId, userId))
      .orderBy(desc(goalsTable.updatedAt));

    const filtered = statusFilter ? rows.filter((r) => r.goal.status === statusFilter) : rows;

    const goals = await Promise.all(
      filtered.map(async (r) => ({
        ...(await attachGoalProgress(r.goal)),
        chatTitle: r.chatTitle,
      })),
    );

    return res.json({ goals });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list goals" });
  }
});

export default router;
