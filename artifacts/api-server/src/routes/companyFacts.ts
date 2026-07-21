import { Router } from "express";
import { requireAuth, requireUserId } from "../middlewares/auth";
import { getActiveCompanyFacts } from "../lib/companyMemory";

const router = Router();

// Read-only for now (no UI yet to add/correct facts by hand — see
// company_facts.ts schema comment). Returns only active (non-superseded)
// facts, most recent first, which is the same "current ground truth" view
// buildContext-style prompt assembly would eventually consume.
router.get("/company-facts", requireAuth, async (req, res) => {
  try {
    const userId = requireUserId(req);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const facts = await getActiveCompanyFacts(userId, limit);
    return res.json({ facts });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to load company facts" });
  }
});

export default router;
