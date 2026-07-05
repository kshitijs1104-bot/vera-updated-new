import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { VenusAnalyzeBody, IdeaReviewBody } from "@workspace/api-zod";
import { getGroqClient, VENUS_PROMPT, buildFallbackVenusResponse, buildTransientErrorResponse, callGroqJSON, MODERATE_TIER_PRECEDENT_NOTE } from "../lib/groq";
import { retrievePrecedents, formatPrecedentsForPrompt, type RetrievalResult } from "../lib/retrieval";

const router = Router();

function applyTierLabel(parsed: { summary?: unknown }, retrieval: RetrievalResult) {
  if (typeof parsed.summary !== "string") return parsed;

  const label = retrieval.tier === "moderate"
    ? "Exploratory signal — limited precedent coverage."
    : retrieval.tier === "none"
      ? "⚠️ No verified precedent match — this is general strategic reasoning, not backed by Venus AI's dataset. Treat as an unverified starting point only."
      : null;

  if (!label) return parsed;
  if (!parsed.summary.startsWith(label)) {
    parsed.summary = `${label} ${parsed.summary}`;
  }
  return parsed;
}

function buildInsufficientPrecedentResponse(query: string, retrieval: RetrievalResult): object {
  const sectorNote = retrieval.inferredSector
    ? `our verified precedent dataset only has ${retrieval.sectorCoverageCount} record(s) in the "${retrieval.inferredSector}" sector`
    : `we could not confidently match this query to any sector in our verified precedent dataset`;
  return {
    summary: `⚠️ No verified precedent match — this is general strategic reasoning, not backed by Venus AI's dataset. Treat as an unverified starting point only. ${sectorNote}.`,
    cards: [
      {
        type: "risk",
        title: "Precedent Coverage Gap",
        content: {
          risks: [
            {
              name: "Insufficient grounded data",
              probability: 100,
              impact: "High",
              mitigation: `Rephrase your question toward a well-covered sector (SaaS, Fintech, Healthtech, Consumer Hardware, E-commerce/Retail, or Foodtech have full precedent coverage), or treat any answer here as unverified opinion rather than a data-grounded call.`,
            },
          ],
        },
      },
    ],
    retrievalGated: true,
    matchConfidence: retrieval.confidence,
    inferredSector: retrieval.inferredSector,
  };
}

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

    const retrieval = await retrievePrecedents(body.data.message, { businessContext: body.data.businessContext });

    const isModerate = retrieval.tier === "moderate";
    const isNone = retrieval.tier === "none";

    const precedentBlock = `VERIFIED PRECEDENTS (retrieved from curated dataset, confidence ${retrieval.confidence}, tier: ${retrieval.tier}):\n\n${formatPrecedentsForPrompt(retrieval.precedents)}`;

    const venusPromptForTier = isModerate ? `${VENUS_PROMPT}${MODERATE_TIER_PRECEDENT_NOTE}` : VENUS_PROMPT;
    const historyContext = body.data.sessionHistory && body.data.sessionHistory.length > 0
      ? `Conversation context so far:\n${body.data.sessionHistory.slice(-8).map((h: { role?: string; content?: string }) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content ?? ""}`).join("\n")}`
      : "Conversation context so far: none.";
    const followUpInstruction = `Conversation routing: If the current message is a narrow follow-up or clarification that refers to the earlier conversation context, answer it directly and narrowly without re-running the full broad-template sections. Keep it concise and focused on the new detail or constraint raised, and use at most one directly relevant supporting card. If the current message is a new broad strategic question, use the full structured template with at least 2 cards.`;
    const noPrecedentInstruction = `NO VERIFIED PRECEDENT MATCH: There are no verified precedents for this request. You must not invent company names or fabricate specific precedent-based causal claims. Respond with general strategic reasoning only, clearly labeled as unverified and not derived from Venus AI's dataset.`;

    const systemPrompt = isNone
      ? `${venusPromptForTier}\n\n${followUpInstruction}\n\n${noPrecedentInstruction}\n\n${historyContext}${body.data.businessContext ? `\n\nBusiness Context: ${body.data.businessContext}` : ""}`
      : body.data.businessContext
        ? `${venusPromptForTier}\n\n${followUpInstruction}\n\n${historyContext}\n\nBusiness Context: ${body.data.businessContext}\n\n${precedentBlock}`
        : `${venusPromptForTier}\n\n${followUpInstruction}\n\n${historyContext}\n\n${precedentBlock}`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (body.data.sessionHistory && body.data.sessionHistory.length > 0) {
      for (const h of body.data.sessionHistory.slice(-10)) {
        if (h.content) {
          const role = h.role === "user" ? "user" : "assistant";
          messages.push({ role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: body.data.message });

    const { parsed, raw } = await callGroqJSON(
      groq,
      { model: "llama-3.1-8b-instant", messages, temperature: 0.4, max_tokens: 3000 },
      "ai/analyze",
    );

    if (parsed) {
      parsed.confidenceTier = retrieval.tier;
      applyTierLabel(parsed, retrieval);
      return res.json(parsed);
    }

    return res.json({
      summary: raw.slice(0, 300) || "Venus AI could not produce a well-formed response for this query. Please try again.",
      cards: [
        {
          type: "analysis",
          title: "Response",
          content: {
            points: [{ label: "Note", value: "Response format error after retry. Please try again.", sentiment: "neutral" }],
          },
        },
      ],
      confidenceTier: retrieval.tier,
    });
  } catch (err) {
    req.log.error(err);
    return res.json(buildTransientErrorResponse("your query"));
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

    const retrieval = await retrievePrecedents(body.data.idea, { sector: body.data.industry });

    const isModerate = retrieval.tier === "moderate";
    const isNone = retrieval.tier === "none";

    const precedentBlock = `VERIFIED PRECEDENTS (retrieved from curated dataset, confidence ${retrieval.confidence}):\n\n${formatPrecedentsForPrompt(retrieval.precedents)}`;
    const followUpInstruction = `Conversation routing: If the current message is a narrow follow-up or clarification that refers to the earlier conversation context, answer it directly and narrowly without re-running the full broad-template sections. Keep it concise and focused on the new detail or constraint raised, and use at most one directly relevant supporting card. If the current message is a new broad strategic question, use the full structured template with at least 2 cards.`;
    const noPrecedentInstruction = `NO VERIFIED PRECEDENT MATCH: There are no verified precedents for this request. You must not invent company names or fabricate specific precedent-based causal claims. Respond with general strategic reasoning only, clearly labeled as unverified and not derived from Venus AI's dataset.`;

    const ideaSystemPrompt = isNone
      ? `${VENUS_PROMPT}\n\n${followUpInstruction}\n\n${noPrecedentInstruction}`
      : isModerate
        ? `${VENUS_PROMPT}${MODERATE_TIER_PRECEDENT_NOTE}\n\n${followUpInstruction}\n\n${precedentBlock}`
        : `${VENUS_PROMPT}\n\n${followUpInstruction}\n\n${precedentBlock}`;

    const { parsed } = await callGroqJSON(
      groq,
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: ideaSystemPrompt },
          {
            role: "user",
            content: `Review this business idea: "${body.data.idea}"${contextParts ? `\n\nContext: ${contextParts}` : ""}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      },
      "ai/idea-review",
    );

    if (parsed) {
      parsed.confidenceTier = retrieval.tier;
      applyTierLabel(parsed, retrieval);
      return res.json(parsed);
    }
    return res.json(buildFallbackVenusResponse(body.data.idea));
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
      model: "llama-3.1-8b-instant",
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
