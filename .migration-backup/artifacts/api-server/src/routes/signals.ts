import { Router } from "express";
import { db, signalsTable } from "@workspace/db";

const router = Router();

router.get("/signals", async (req, res) => {
  try {
    const signals = await db.select().from(signalsTable).orderBy(signalsTable.id);
    return res.json(signals);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get signals" });
  }
});

export default router;
