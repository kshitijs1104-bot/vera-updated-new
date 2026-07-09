import { Router } from "express";
import { db, reportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListReportsQueryParams } from "@workspace/api-zod";
import { getGroqClient } from "../lib/groq";

const router = Router();

router.get("/reports", async (req, res) => {
  try {
    const query = ListReportsQueryParams.safeParse(req.query);
    const category = query.success ? query.data.category : undefined;

    let reports = await db.select().from(reportsTable).orderBy(reportsTable.id);

    if (category && category !== "all") {
      reports = reports.filter((r) => r.category === category);
    }

    return res.json(reports);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list reports" });
  }
});

router.get("/reports/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });
    return res.json(report);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get report" });
  }
});

router.post("/reports/:id/summary", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({
        reportId: id,
        summary: "Configure your Groq API key in Settings to get AI-powered report summaries.",
        keyTakeaways: ["Add Groq API key in Settings", "Visit console.groq.com for a free key"],
        causalImplications: "AI analysis unavailable without configuration.",
      });
    }

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a sharp business intelligence analyst. Summarize reports causally and concisely. Return ONLY valid JSON.",
        },
        {
          role: "user",
          content: `Summarize this intelligence report:
Title: ${report.title}
Source: ${report.source}
Category: ${report.category}
Summary: ${report.summary}

Return JSON: { "summary": "2-3 sharp sentences", "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"], "causalImplications": "What this means for founders and operators in 1-2 sentences" }`,
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const content = completion.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return res.json({ reportId: id, ...parsed });
    } catch {
      return res.json({ reportId: id, summary: content, keyTakeaways: [], causalImplications: "" });
    }
  } catch (err) {
    req.log.error(err);
    return res.json({ reportId: parseInt(req.params.id), summary: "Analysis unavailable.", keyTakeaways: [], causalImplications: "" });
  }
});

export default router;
