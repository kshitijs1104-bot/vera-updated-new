import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { VenusAnalyzeBody, IdeaReviewBody } from "@workspace/api-zod";
import { getGroqClient, VENUS_PROMPT, buildFallbackVenusResponse } from "../lib/groq";

const router = Router();

router.post("/ai/analyze", async (req, res) => {
  try {
    const body = VenusAnalyzeBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid request body" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const headerKey = req.headers["x-groq-api-key"] as string | undefined;
    const groq = headerKey
      ? new (await import("groq-sdk").then(m => m.default))({ apiKey: headerKey })
      : await getGroqClient(sessionId);

    if (!groq) {
      return res.json(buildFallbackVenusResponse(body.data.message));
    }

    const systemPrompt = body.data.businessContext
      ? `${VENUS_PROMPT}\n\nBusiness Context: ${body.data.businessContext}`
      : VENUS_PROMPT;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (body.data.sessionHistory && body.data.sessionHistory.length > 0) {
      for (const h of body.data.sessionHistory.slice(-10)) {
        if (h.content) {
          messages.push({ role: h.role as "user" | "assistant", content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: body.data.message });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(content);
      return res.json(parsed);
    } catch {
      return res.json({
        summary: content.slice(0, 300),
        cards: [
          {
            type: "analysis",
            title: "Response",
            content: {
              points: [{ label: "Note", value: "Response format error. Please try again.", sentiment: "neutral" }],
            },
          },
        ],
      });
    }
  } catch (err) {
    req.log.error(err);
    return res.json(buildFallbackVenusResponse("your query"));
  }
});

router.post("/ai/idea-review", async (req, res) => {
  try {
    const body = IdeaReviewBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid request body" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const headerKey = req.headers["x-groq-api-key"] as string | undefined;
    const groq = headerKey
      ? new (await import("groq-sdk").then(m => m.default))({ apiKey: headerKey })
      : await getGroqClient(sessionId);

    if (!groq) {
      return res.json(buildFallbackVenusResponse(body.data.idea));
    }

    const contextParts = [
      body.data.stage && `Stage: ${body.data.stage}`,
      body.data.industry && `Industry: ${body.data.industry}`,
      body.data.teamSize && `Team size: ${body.data.teamSize}`,
    ].filter(Boolean).join(", ");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: VENUS_PROMPT },
        {
          role: "user",
          content: `Review this business idea: "${body.data.idea}"${contextParts ? `\n\nContext: ${contextParts}` : ""}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json(parsed);
    } catch {
      return res.json(buildFallbackVenusResponse(body.data.idea));
    }
  } catch (err) {
    req.log.error(err);
    return res.json(buildFallbackVenusResponse("your idea"));
  }
});

router.post("/ai/summarize-article", async (req, res) => {
  try {
    const { articleId, title, body } = req.body as { articleId?: number; title?: string; body?: string };
    if (!title || !body) return res.status(400).json({ error: "title and body are required" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({
        articleId,
        bullets: [
          "Configure your Groq API key in Settings to unlock AI article summaries.",
          "Visit console.groq.com to create a free key in under 60 seconds.",
          "Paste the key in Vera Nexus Settings and refresh — summaries appear instantly.",
        ],
        stats: [
          { label: "Status", value: "No API key" },
          { label: "Fix", value: "Settings → Groq Key" },
          { label: "Cost", value: "Free tier" },
        ],
      });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Summarize this market news article in exactly 3 concise bullet points (max 20 words each) for a time-pressed reader, plus 3 key stats extracted from the text as label/value pairs. Return ONLY valid JSON, no markdown, no preamble.`,
        },
        {
          role: "user",
          content: `Title: ${title}\n\nBody: ${body}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({ articleId, bullets: parsed.bullets || [], stats: parsed.stats || [] });
    } catch {
      return res.json({ articleId, bullets: [content.slice(0, 120)], stats: [] });
    }
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to summarize article" });
  }
});

export default router;
