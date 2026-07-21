import { Router } from "express";
import { db, chatsTable, roadmapsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireUserId } from "../middlewares/auth";
import { getActiveRoadmap, setRoadmapActionStatus, parsePhases } from "../lib/roadmap";

const router = Router();

function serializeRoadmap(roadmap: NonNullable<Awaited<ReturnType<typeof getActiveRoadmap>>>) {
  return { ...roadmap, phases: parsePhases(roadmap) };
}

// The durable, trackable roadmap for a chat/project — see roadmaps.ts for
// why this exists alongside the ephemeral "roadmap" card type. Scoped by
// chatId the same way a goal is (one active plan per chat/project).
router.get("/chats/:id/roadmap", requireAuth, async (req, res) => {
  const chatId = Number(req.params.id);
  if (!Number.isFinite(chatId)) return res.status(400).json({ error: "Invalid chat id" });

  try {
    const userId = requireUserId(req);
    const [chat] = await db
      .select({ id: chatsTable.id })
      .from(chatsTable)
      .where(and(eq(chatsTable.id, chatId), eq(chatsTable.userId, userId)))
      .limit(1);
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const roadmap = await getActiveRoadmap(chatId);
    if (!roadmap) return res.status(404).json({ error: "No roadmap for this chat yet" });

    return res.json(serializeRoadmap(roadmap));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get roadmap" });
  }
});

const UpdateActionBody = z.object({
  phaseIndex: z.number().int().min(0),
  actionIndex: z.number().int().min(0),
  status: z.enum(["pending", "done", "skipped"]),
});

// The mechanism that makes the roadmap an actually-tracked plan: mark one
// action within one phase done/pending/skipped. Ownership is checked
// directly against roadmaps.userId (stored denormalized on the row, same
// convention goals/venus_decisions already use) rather than requiring a
// join back through chats.
router.patch("/roadmaps/:id/actions", requireAuth, async (req, res) => {
  const roadmapId = Number(req.params.id);
  if (!Number.isFinite(roadmapId)) return res.status(400).json({ error: "Invalid roadmap id" });

  const body = UpdateActionBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "phaseIndex, actionIndex, and status are required" });

  try {
    const userId = requireUserId(req);
    const [owned] = await db
      .select({ id: roadmapsTable.id })
      .from(roadmapsTable)
      .where(and(eq(roadmapsTable.id, roadmapId), eq(roadmapsTable.userId, userId)))
      .limit(1);
    if (!owned) return res.status(404).json({ error: "Roadmap not found" });

    const updated = await setRoadmapActionStatus(roadmapId, body.data.phaseIndex, body.data.actionIndex, body.data.status);
    if (!updated) return res.status(400).json({ error: "Invalid phase/action index" });

    return res.json(serializeRoadmap(updated));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update roadmap action" });
  }
});

export default router;
