import { Router } from "express";
import { db, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListEventsQueryParams } from "@workspace/api-zod";
import { getGroqClient, buildRippleFallback } from "../lib/groq";

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

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({ eventId: id, ...buildRippleFallback(event.title) });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a causal intelligence analyst. You map cause-and-effect chains for major events with precision and specificity. Return ONLY valid JSON with no markdown or backticks.`,
        },
        {
          role: "user",
          content: `Analyze the causal ripple effects of this event and produce a structured flowchart.

Event: ${event.title}
Year: ${event.year}
Category: ${event.category}
Description: ${event.description || "No description"}

Return this exact JSON structure:
{
  "analysis": "2-3 sharp sentences on the causal significance of this event",
  "flowchart": {
    "nodes": [
      { "id": "n0", "label": "The event itself in 5-8 words", "type": "trigger" },
      { "id": "n1", "label": "First immediate cause/mechanism in 6-10 words", "type": "cause" },
      { "id": "n2", "label": "Second immediate cause/mechanism in 6-10 words", "type": "cause" },
      { "id": "n3", "label": "First downstream effect in 6-10 words", "type": "effect" },
      { "id": "n4", "label": "Second downstream effect in 6-10 words", "type": "effect" },
      { "id": "n5", "label": "Long-term consequence in 6-10 words", "type": "consequence" },
      { "id": "n6", "label": "Second long-term consequence in 6-10 words", "type": "consequence" }
    ],
    "edges": [
      { "from": "n0", "to": "n1" },
      { "from": "n0", "to": "n2" },
      { "from": "n1", "to": "n3" },
      { "from": "n2", "to": "n4" },
      { "from": "n3", "to": "n5" },
      { "from": "n4", "to": "n6" }
    ]
  },
  "affectedSectors": ["sector1", "sector2", "sector3"]
}

Replace ALL placeholder text with real specific content about this actual event. Node labels must be concrete and specific, not generic.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({ eventId: id, ...parsed });
    } catch {
      return res.json({ eventId: id, analysis: content, causalChain: [], affectedSectors: [], flowchart: null });
    }
  } catch (err) {
    req.log.error(err);
    return res.json({ eventId: parseInt(req.params.id), ...buildRippleFallback("this event") });
  }
});

export default router;
