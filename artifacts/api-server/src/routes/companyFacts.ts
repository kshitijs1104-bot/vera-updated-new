import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth, requireUserId } from "../middlewares/auth";
import { getActiveCompanyFacts, addCompanyFact } from "../lib/companyMemory";

const router = Router();

// Returns only active (non-superseded) facts, most recent first, which is
// the same "current ground truth" view buildContext-style prompt assembly
// would eventually consume.
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

const AddFactBody = z.object({
  factText: z.string().min(1),
  factType: z.string().optional(),
  sourceType: z.enum(["onboarding", "chat", "checkin", "decision", "manual"]),
});

// The first write path onto company_facts (previously read-only — see the
// GET handler above). Morning Check-In is the primary caller: a founder's
// free-text answer to "anything changed?" lands here with
// sourceType: "checkin", the enum value this table was already carrying
// around unused.
router.post("/company-facts", requireAuth, async (req, res) => {
  const body = AddFactBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "factText and sourceType are required" });

  try {
    const userId = requireUserId(req);
    const fact = await addCompanyFact({ userId, ...body.data });
    if (!fact) return res.status(500).json({ error: "Failed to save fact" });
    return res.status(201).json({ fact });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to save fact" });
  }
});

export default router;
