import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SaveGroqKeyBody, SaveOnboardingBody } from "@workspace/api-zod";
import { requireAuth, requireUserId } from "../middlewares/auth";

const router = Router();

// Previously `(req.headers["x-session-id"] as string) || req.ip || "default"`
// — same IP-fallback bug as ai.ts. Settings (onboarding data, primaryGoal,
// the Groq key) is exactly the kind of per-person state that must never leak
// across users sharing a network, so every route below is now behind
// requireAuth and keyed on the verified Clerk userId.
function getSessionId(req: any): string {
  return requireUserId(req);
}

async function getOrCreateSettings(sessionId: string) {
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.sessionId, sessionId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(settingsTable)
    .values({ sessionId })
    .onConflictDoNothing({ target: settingsTable.sessionId })
    .returning();

  if (created) return created;

  const [fallback] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.sessionId, sessionId))
    .limit(1);

  return fallback;
}

router.get("/settings/groq-key", requireAuth, async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const settings = await getOrCreateSettings(sessionId);

    const hasKey = !!settings.groqApiKey;
    const maskedKey = hasKey
      ? settings.groqApiKey!.slice(0, 8) + "****" + settings.groqApiKey!.slice(-4)
      : null;

    return res.json({ configured: hasKey, maskedKey });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get key status" });
  }
});

router.post("/settings/groq-key", requireAuth, async (req, res) => {
  try {
    const body = SaveGroqKeyBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid API key" });

    const sessionId = getSessionId(req);
    const settings = await getOrCreateSettings(sessionId);

    await db
      .update(settingsTable)
      .set({ groqApiKey: body.data.apiKey, updatedAt: new Date() })
      .where(eq(settingsTable.sessionId, sessionId));

    const maskedKey = body.data.apiKey.slice(0, 8) + "****" + body.data.apiKey.slice(-4);
    return res.json({ configured: true, maskedKey });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to save key" });
  }
});

router.delete("/settings/groq-key", requireAuth, async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    await getOrCreateSettings(sessionId);

    await db
      .update(settingsTable)
      .set({ groqApiKey: null, updatedAt: new Date() })
      .where(eq(settingsTable.sessionId, sessionId));

    return res.json({ configured: false, maskedKey: null });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete key" });
  }
});

router.get("/settings/onboarding", requireAuth, async (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const settings = await getOrCreateSettings(sessionId);

    return res.json({
      companyName: settings.companyName,
      stage: settings.stage,
      industry: settings.industry,
      teamSize: settings.teamSize,
      country: settings.country,
      primaryGoal: settings.primaryGoal,
      completed: settings.onboardingCompleted,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get onboarding" });
  }
});

router.post("/settings/onboarding", requireAuth, async (req, res) => {
  try {
    const body = SaveOnboardingBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid onboarding data" });

    const sessionId = getSessionId(req);
    await getOrCreateSettings(sessionId);

    await db
      .update(settingsTable)
      .set({
        companyName: body.data.companyName,
        stage: body.data.stage,
        industry: body.data.industry,
        teamSize: body.data.teamSize,
        country: body.data.country,
        primaryGoal: body.data.primaryGoal,
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(settingsTable.sessionId, sessionId));

    return res.json({
      companyName: body.data.companyName,
      stage: body.data.stage,
      industry: body.data.industry,
      teamSize: body.data.teamSize,
      country: body.data.country,
      primaryGoal: body.data.primaryGoal,
      completed: true,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to save onboarding" });
  }
});

export default router;
