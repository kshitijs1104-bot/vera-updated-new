import { Router } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListCompaniesQueryParams } from "@workspace/api-zod";
import { getGroqClient, buildAutopsyFallback, callGroqJSON } from "../lib/groq";
import { retrievePrecedents, formatPrecedentsForPrompt } from "../lib/retrieval";

const router = Router();

function normalizeHistoryRole(role: unknown): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function normalizeHistory(history: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(history)) return [];
  return history.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as { role?: unknown; content?: unknown };
    const content = typeof item.content === "string" ? item.content : "";
    if (!content) return [];
    return [{ role: normalizeHistoryRole(item.role), content }];
  });
}

router.get("/companies", async (req, res) => {
  try {
    const query = ListCompaniesQueryParams.safeParse(req.query);
    const category = query.success ? query.data.category : undefined;
    const sort = query.success ? query.data.sort : undefined;

    let companies = await db.select().from(companiesTable);

    if (category && category !== "all") {
      companies = companies.filter((c: { category: string }) => c.category === category);
    }

    if (sort === "name") {
      companies.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    } else {
      companies.sort((a: { yearRange: string }, b: { yearRange: string }) => b.yearRange.localeCompare(a.yearRange));
    }

    return res.json(companies);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list companies" });
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid company id" });
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });
    return res.json(company);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get company" });
  }
});

router.post("/companies/:id/autopsy", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid company id" });
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({ companyId: id, ...buildAutopsyFallback(company.name) });
    }

    const { parsed, raw } = await callGroqJSON(
      groq,
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: `You are an elite post-mortem analyst for failed companies. You think causally — you explain exactly why they failed, step by step. Use real facts, real numbers, real names. Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Perform a deep autopsy on this failed company:
Name: ${company.name}
Period: ${company.yearRange}
Category: ${company.category}
Description: ${company.description}
Tags: ${company.tags.join(", ")}

Return JSON: { "rootCause": "The single root cause in 1-2 sharp sentences", "timeline": "What happened and when in 2-3 sentences", "lessonsLearned": ["lesson1", "lesson2", "lesson3", "lesson4"], "causalChain": ["Initial mistake", "Compounding factor", "Point of no return", "Final collapse"], "analogy": "One sharp analogy to another well-known failure or pattern" }`,
          },
        ],
        temperature: 0.4,
        max_tokens: 1200,
      },
      `companies/${id}/autopsy`,
    );

    if (parsed) {
      return res.json({ companyId: id, ...parsed });
    }
    return res.json({ companyId: id, rootCause: raw.slice(0, 500) || "Autopsy generation failed after retry.", timeline: "", lessonsLearned: [], causalChain: [], analogy: null });
  } catch (err) {
    req.log.error(err);
    return res.json({ companyId: parseInt(req.params.id), ...buildAutopsyFallback("this company") });
  }
});

router.post("/companies/:id/autopsy/chat", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid company id" });
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const { message = "", attempt = 0, history = [] } = req.body as {
      message?: string;
      attempt?: number;
      history?: { role: string; content: string }[];
    };
    const normalizedHistory = normalizeHistory(history);

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const headerKey = req.headers["x-groq-api-key"] as string | undefined;
    const groq = headerKey
      ? new (await import("groq-sdk").then(m => m.default))({ apiKey: headerKey })
      : await getGroqClient(sessionId);

    if (!groq) {
      return res.json({
        reply: `To play as Interim CEO of ${company.name}, you need a Groq API key configured in Settings. Visit console.groq.com for a free key.`,
        companyState: "Unknown",
        attempt,
        gameOver: false,
        outcome: null,
      });
    }

    const isOpening = attempt === 0 && normalizedHistory.length === 0;
    const isFinal = attempt >= 5;

    const retrievalQuery = `${company.name} ${company.description} ${company.failureReason || ""} ${(company.tags ?? []).join(" ")} ${message}`;
    const retrieval = await retrievePrecedents(retrievalQuery);

    if (!retrieval.matched) {
      return res.json({
        reply: `Insufficient verified precedent data to run a grounded Interim CEO simulation for ${company.name} (${company.category}) — our precedent dataset only has ${retrieval.sectorCoverageCount} verified record(s) in this sector, below the confidence threshold needed to simulate realistic causal consequences. Vera will not invent unverified market dynamics to fill this gap.`,
        companyState: "Unknown",
        attempt,
        gameOver: true,
        outcome: "insufficient_data",
        retrievalGated: true,
        matchConfidence: retrieval.confidence,
      });
    }

    const precedentBlock = `VERIFIED PRECEDENTS (retrieved from curated dataset, confidence ${retrieval.confidence}) — these are the ONLY companies/outcomes you may reference to ground consequences. Do not invent or recall other companies, numbers, or market dynamics beyond what is stated here or in the Background/Known failure reason above:\n\n${formatPrecedentsForPrompt(retrieval.precedents)}`;

    const systemPrompt = `You are simulating ${company.name} (${company.yearRange}) at the moment of its critical failure. The user is playing as the newly appointed Interim CEO who has just taken the helm in a crisis.

Background: ${company.description}
Known failure reason: ${company.failureReason || "Multiple compounding factors"}

${precedentBlock}

You are the company simulator. You respond to the CEO's decisions with realistic, historically-grounded consequences, grounded ONLY in the Background/Known failure reason above and the VERIFIED PRECEDENTS block. Be brutally honest — most decisions have both positive effects and dangerous trade-offs. You may reference the verified precedent companies above by name; do NOT invent other real company names, statistics, or market events not present in the given context.

The CEO has exactly 5 attempts to save the company. Track momentum: early good decisions compound, bad decisions accelerate collapse.

ALWAYS return ONLY valid JSON in this exact shape (no markdown, no backticks):
{
  "reply": "3-5 SHORT sentences maximum. One sentence on the immediate effect, one on the board/market reaction, one on what changed. Be sharp and specific — no padding.",
  "companyState": "one of: Critical | Deteriorating | Stable | Recovering | Survived | Collapsed",
  "gameOver": false,
  "outcome": null
}

Keep replies concise. No long paragraphs. When attempt reaches 5, set gameOver to true and outcome to either "survived" or "failed" based on the trajectory of decisions made.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (isOpening) {
      messages.push({
        role: "user",
        content: `Set the scene in 4-5 sentences maximum. I just walked in as Interim CEO. What is on fire right now, what is the single biggest decision I need to make, and what resources do I have left. Be sharp — no lengthy preamble.`,
      });
    } else {
      // Add conversation history
      for (const h of normalizedHistory) {
        messages.push({ role: h.role, content: h.content });
      }
      if (isFinal) {
        messages.push({
          role: "user",
          content: `${message}\n\n[This is the 5th and final decision. Resolve the outcome: did we save the company or not? Give a final verdict with specific consequences and what happened in the months after.]`,
        });
      } else {
        messages.push({ role: "user", content: message });
      }
    }

    const { parsed, raw } = await callGroqJSON(
      groq,
      { model: "meta-llama/llama-4-scout-17b-16e-instruct", messages, temperature: 0.6, max_tokens: 800 },
      `companies/${id}/autopsy/chat`,
    );

    if (parsed) {
      return res.json({
        reply: parsed.reply,
        companyState: parsed.companyState || "Critical",
        attempt,
        gameOver: isFinal ? true : (parsed.gameOver || false),
        outcome: isFinal ? (parsed.outcome || "failed") : null,
      });
    }

    // Last resort: pull the reply field out via regex so we never surface raw JSON.
    const replyMatch = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const fallbackReply = replyMatch
      ? replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n")
      : raw.slice(0, 800) || "Simulation response failed after retry. Please try again.";
    return res.json({
      reply: fallbackReply,
      companyState: "Critical",
      attempt,
      gameOver: isFinal,
      outcome: isFinal ? "failed" : null,
    });
  } catch (err) {
    req.log.error(err);
    const id = Number.parseInt(req.params.id, 10);
    const fallbackCompanyName = Number.isNaN(id) ? "this company" : `company ${id}`;
    return res.json({
      reply: `The company simulator hit a transient issue while processing ${fallbackCompanyName}. Please try again in a moment.`,
      companyState: "Critical",
      attempt: 0,
      gameOver: false,
      outcome: null,
    });
  }
});

export default router;
