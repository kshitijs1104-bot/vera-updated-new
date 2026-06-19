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

    const sessionId = req.headers["x-session-id"] as string || "default";
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

export default router;
