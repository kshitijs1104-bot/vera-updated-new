import { Router } from "express";
import { db, eventsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ListEventsQueryParams, RippleAnalysisParams } from "@workspace/api-zod";
import { getGroqClient, VENUS_PROMPT, buildRippleFallback } from "../lib/groq";

const router = Router();

router.get("/events", async (req, res) => {
  try {
    const query = ListEventsQueryParams.safeParse(req.query);
    const category = query.success ? query.data.category : undefined;
    const sentiment = query.success ? query.data.sentiment : undefined;

    let events = await db.select().from(eventsTable).orderBy(eventsTable.year);

    if (category && category !== "all") {
      events = events.filter((e) => e.category === category);
    }
    if (sentiment && sentiment !== "all") {
      events = events.filter((e) => e.sentiment === sentiment);
    }

    return res.json(events);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list events" });
  }
});

router.get("/events/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id)).limit(1);
    if (!event) return res.status(404).json({ error: "Event not found" });
    return res.json(event);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get event" });
  }
});

router.post("/events/:id/ripple", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id)).limit(1);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const sessionId = req.headers["x-session-id"] as string || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({ eventId: id, ...buildRippleFallback(event.title) });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a causal intelligence analyst. Analyze events and explain their ripple effects in a concise JSON format. Return ONLY valid JSON, no markdown, no backticks.`,
        },
        {
          role: "user",
          content: `Analyze the ripple effects of this event:
Title: ${event.title}
Year: ${event.year}
Category: ${event.category}
Description: ${event.description || "No description"}

Return JSON: { "analysis": "2-3 sharp sentences on why this matters causally", "causalChain": ["cause 1", "effect 1", "effect 2", "long-term consequence"], "affectedSectors": ["sector1", "sector2"] }`,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({ eventId: id, ...parsed });
    } catch {
      return res.json({ eventId: id, analysis: content, causalChain: [], affectedSectors: [] });
    }
  } catch (err) {
    req.log.error(err);
    return res.json({ eventId: parseInt(req.params.id), ...buildRippleFallback("this event") });
  }
});

export default router;
