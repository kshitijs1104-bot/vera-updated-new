import { Router } from "express";
import { requireAuth, requireUserId } from "../middlewares/auth";
import {
  getTopOpenDecision,
  getBiggestRiskGoal,
  getBlockedRoadmapAction,
  getRecentAssumptionChange,
} from "../lib/dailyBrief";

const router = Router();

// Single aggregation read backing the Decision Inbox (see TodayCard.tsx) —
// one round-trip instead of four, over data that's already computed
// elsewhere (goal risk, decision reinforcement, roadmap phases, company
// facts). biggestRisk is resolved first so blockedTask can prefer the
// roadmap for that same at-risk goal's chat.
router.get("/daily-brief", requireAuth, async (req, res) => {
  try {
    const userId = requireUserId(req);
    const [topDecision, biggestRisk] = await Promise.all([getTopOpenDecision(userId), getBiggestRiskGoal(userId)]);
    const [blockedTask, assumptionChange] = await Promise.all([
      getBlockedRoadmapAction(userId, biggestRisk?.chatId ?? null),
      getRecentAssumptionChange(userId),
    ]);
    return res.json({ topDecision, biggestRisk, blockedTask, assumptionChange });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to load daily brief" });
  }
});

export default router;
