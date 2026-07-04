import { Router } from "express";
import { db, thoughtsTable, reactionsTable } from "@workspace/db";
import { eq, sql, and, inArray, desc } from "drizzle-orm";
import { ListThoughtsQueryParams, CreateThoughtBody, ToggleReactionBody } from "@workspace/api-zod";

const router = Router();

async function getThoughtWithReactions(thoughtId: number) {
  const [thought] = await db.select().from(thoughtsTable).where(eq(thoughtsTable.id, thoughtId)).limit(1);
  if (!thought) return null;

  const reactions = await db
    .select({ reactionType: reactionsTable.reactionType, count: sql<number>`count(*)::int` })
    .from(reactionsTable)
    .where(eq(reactionsTable.thoughtId, thoughtId))
    .groupBy(reactionsTable.reactionType);

  const reactionMap: Record<string, number> = {};
  for (const r of reactions) {
    reactionMap[r.reactionType] = r.count;
  }

  return { ...thought, reactions: reactionMap };
}

router.get("/thoughts", async (req, res) => {
  try {
    const query = ListThoughtsQueryParams.safeParse(req.query);
    const category = query.success ? query.data.category : undefined;

    let thoughts = await db.select().from(thoughtsTable).orderBy(desc(thoughtsTable.createdAt));

    if (category && category !== "all") {
      thoughts = thoughts.filter((t) => t.category === category);
    }

    const thoughtIds = thoughts.map((t) => t.id);
    if (thoughtIds.length === 0) return res.json([]);

    const allReactions = await db
      .select({ thoughtId: reactionsTable.thoughtId, reactionType: reactionsTable.reactionType, count: sql<number>`count(*)::int` })
      .from(reactionsTable)
      .where(inArray(reactionsTable.thoughtId, thoughtIds))
      .groupBy(reactionsTable.thoughtId, reactionsTable.reactionType);

    const reactionsByThought: Record<number, Record<string, number>> = {};
    for (const r of allReactions) {
      if (!reactionsByThought[r.thoughtId]) reactionsByThought[r.thoughtId] = {};
      reactionsByThought[r.thoughtId][r.reactionType] = r.count;
    }

    const result = thoughts.map((t) => ({ ...t, reactions: reactionsByThought[t.id] || {} }));
    return res.json(result);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list thoughts" });
  }
});

router.post("/thoughts", async (req, res) => {
  try {
    const body = CreateThoughtBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid request body" });

    const [thought] = await db
      .insert(thoughtsTable)
      .values({
        content: body.data.content,
        author: body.data.author,
        category: body.data.category,
        tags: body.data.tags || [],
      })
      .returning();

    return res.status(201).json({ ...thought, reactions: {} });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create thought" });
  }
});

router.get("/thoughts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const thought = await getThoughtWithReactions(id);
    if (!thought) return res.status(404).json({ error: "Thought not found" });
    return res.json(thought);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get thought" });
  }
});

router.delete("/thoughts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(thoughtsTable).where(eq(thoughtsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete thought" });
  }
});

router.post("/reactions", async (req, res) => {
  try {
    const body = ToggleReactionBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid request body" });

    const sessionId = req.headers["x-session-id"] as string || req.ip || "anonymous";

    const existing = await db
      .select()
      .from(reactionsTable)
      .where(
        and(
          eq(reactionsTable.thoughtId, body.data.thoughtId),
          eq(reactionsTable.sessionId, sessionId),
          eq(reactionsTable.reactionType, body.data.reactionType),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(reactionsTable).where(eq(reactionsTable.id, existing[0].id));
      return res.json({ action: "deleted", thoughtId: body.data.thoughtId, reactionType: body.data.reactionType });
    } else {
      await db.insert(reactionsTable).values({
        thoughtId: body.data.thoughtId,
        sessionId,
        reactionType: body.data.reactionType,
      });
      return res.json({ action: "added", thoughtId: body.data.thoughtId, reactionType: body.data.reactionType });
    }
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

export default router;
