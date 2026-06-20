import { Router } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListCompaniesQueryParams } from "@workspace/api-zod";
import { getGroqClient, buildAutopsyFallback } from "../lib/groq";

const router = Router();

router.get("/companies", async (req, res) => {
  try {
    const query = ListCompaniesQueryParams.safeParse(req.query);
    const category = query.success ? query.data.category : undefined;
    const sort = query.success ? query.data.sort : undefined;

    let companies = await db.select().from(companiesTable);

    if (category && category !== "all") {
      companies = companies.filter((c) => c.category === category);
    }

    if (sort === "name") {
      companies.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      companies.sort((a, b) => b.yearRange.localeCompare(a.yearRange));
    }

    return res.json(companies);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list companies" });
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({ companyId: id, ...buildAutopsyFallback(company.name) });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
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
      max_tokens: 1000,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({ companyId: id, ...parsed });
    } catch {
      return res.json({ companyId: id, rootCause: content, timeline: "", lessonsLearned: [], causalChain: [], analogy: null });
    }
  } catch (err) {
    req.log.error(err);
    return res.json({ companyId: parseInt(req.params.id), ...buildAutopsyFallback("this company") });
  }
});

router.post("/companies/:id/autopsy/chat", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const { message = "", attempt = 0, history = [] } = req.body as {
      message?: string;
      attempt?: number;
      history?: { role: string; content: string }[];
    };

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({
        reply: `To play as Interim CEO of ${company.name}, you need a Groq API key configured in Settings. Visit console.groq.com for a free key.`,
        companyState: "Unknown",
        attempt,
        gameOver: false,
        outcome: null,
      });
    }

    const isOpening = attempt === 0 && (!history || history.length === 0);
    const isFinal = attempt >= 5;

    const systemPrompt = `You are simulating ${company.name} (${company.yearRange}) at the moment of its critical failure. The user is playing as the newly appointed Interim CEO who has just taken the helm in a crisis.

Background: ${company.description}
Known failure reason: ${company.failureReason || "Multiple compounding factors"}

You are the company simulator. You respond to the CEO's decisions with realistic, historically-grounded consequences. Be brutally honest — most decisions have both positive effects and dangerous trade-offs. Reference real competitors, market dynamics, and specific numbers wherever possible.

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
      for (const h of history) {
        messages.push({ role: h.role as "user" | "assistant", content: h.content });
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

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.6,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({
        reply: parsed.reply,
        companyState: parsed.companyState || "Critical",
        attempt,
        gameOver: isFinal ? true : (parsed.gameOver || false),
        outcome: isFinal ? (parsed.outcome || "failed") : null,
      });
    } catch {
      return res.json({
        reply: content.slice(0, 800),
        companyState: "Critical",
        attempt,
        gameOver: isFinal,
        outcome: isFinal ? "failed" : null,
      });
    }
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to process CEO chat" });
  }
});

export default router;
