import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Groq from "groq-sdk";
import { db, precedentsTable } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Candidate {
  name: string;
  target_sector: string;
  source_sector_label: string;
  years_of_operation: string;
  what_they_did: string;
  how_much_raised: string;
  why_they_failed: string;
  takeaway: string;
  source_file: string;
  crunchbase_cross_ref: {
    status?: string;
    funding_total_usd?: string;
    category_list?: string;
    founded_at?: string;
    country_code?: string;
  } | null;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a data-extraction engine for a causal precedent database of startup outcomes. You will be given a short factual record about a real company (name, sector, years of operation, what they did, how much they raised, why they failed, a one-line takeaway, and optionally cross-referenced Crunchbase metadata).

IMPORTANT CONTEXT: The source dataset is intentionally terse — each field is typically a short phrase or one sentence, not a paragraph (e.g. "what_they_did": "Business intelligence dashboards", "why_they_failed": "Scaled back 2023; lost to Tableau; Power BI; high costs"). This terseness is NORMAL for this dataset and is NOT a reason to mark a row as insufficient. Your job is to restructure/lightly rephrase this terse factual information into the target schema — you can and should produce 1-2 sentence fields (not padded to 2-3 sentences) as long as they are grounded in the given facts.

Your ONLY constraint is: do not invent details, financial figures, dates, causal claims, or specifics that are NOT stated or directly implied by the source text. It is fine and expected for decision_context/decision_taken/causal_mechanism to be short (even a single sentence each) as long as they are a faithful restatement/light synthesis of the given "what_they_did" and "why_they_failed" facts. Only mark insufficient_data as true if the source literally lacks any explanation at all (e.g. why_they_failed is empty, "unknown", or a bare category with zero explanatory content) — a short-but-informative one-liner like the Domo example above is SUFFICIENT, not insufficient.

Return ONLY valid JSON, no markdown, no backticks, no commentary. The JSON shape is exactly:
{
  "founded_year": number or null,
  "outcome_year": number or null,
  "status": "failed" | "acquired" | "active",
  "stage_at_decision": "pre-seed" | "seed" | "series-a" | "series-b-plus" | "public" | null (infer loosely from funding amount if given, else null),
  "decision_context": "1-3 sentences describing the situation/market position the company was in before its outcome, grounded only in the source text",
  "decision_taken": "the specific strategic choice or approach the company took (from what_they_did / why_they_failed), grounded only in source text",
  "causal_mechanism": "why that approach led to the stated outcome, grounded only in source text (e.g. 'lost to Tableau and Power BI on cost' is a valid, sufficient causal mechanism) — do not add outside causal theories",
  "outcome": "the quantified or factual outcome as stated in source text (e.g. shutdown year, acquisition, scale-back, specific numbers if given)",
  "timeframe_to_outcome": "short phrase describing how long between founding/decision and outcome if inferable from years_of_operation or text, or null",
  "embedding_summary": "a dense 2-3 sentence summary of the whole record for retrieval matching, grounded only in source text",
  "insufficient_data": boolean (true ONLY if why_they_failed or what_they_did is essentially empty/uninformative with zero real explanation — this should be RARE, not the default)
}

Never pad a field with generic startup wisdom not tied to this specific company's stated story, but do not reject terse-yet-informative source data either.`;

function buildUserPrompt(c: Candidate): string {
  const cross = c.crunchbase_cross_ref;
  const crossText = cross
    ? `\nCrunchbase cross-reference: status=${cross.status || "unknown"}, funding_total_usd=${cross.funding_total_usd || "unknown"}, category_list=${cross.category_list || "unknown"}, founded_at=${cross.founded_at || "unknown"}, country=${cross.country_code || "unknown"}`
    : "\nCrunchbase cross-reference: none found";

  return `Company: ${c.name}
Sector (source label): ${c.source_sector_label}
Target sector bucket: ${c.target_sector}
Years of operation: ${c.years_of_operation}
What they did: ${c.what_they_did}
How much they raised: ${c.how_much_raised}
Why they failed: ${c.why_they_failed}
Takeaway: ${c.takeaway}${crossText}

Extract the structured causal precedent record as specified.`;
}

function parseYearRange(yearsOfOperation: string): { founded: number | null; outcome: number | null } {
  const match = yearsOfOperation.match(/(\d{4})\s*-\s*(\d{4})/);
  if (match) {
    return { founded: parseInt(match[1]), outcome: parseInt(match[2]) };
  }
  return { founded: null, outcome: null };
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY not set. Cannot run enrichment.");
    process.exit(1);
  }
  const groq = new Groq({ apiKey });

  const candidatesPath = path.join(__dirname, "..", "..", "..", "data", "candidates.json");
  const allCandidates: Candidate[] = JSON.parse(fs.readFileSync(candidatesPath, "utf-8"));

  const outPath = path.join(__dirname, "..", "..", "..", "data", "precedents.json");
  const skippedPath = path.join(__dirname, "..", "..", "..", "data", "skipped-rows-report.json");
  const progressPath = path.join(__dirname, "..", "..", "..", "data", "enrich_progress.json");

  const results: any[] = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf-8")) : [];
  let skipped: { name: string; sector: string; reason: string }[] = fs.existsSync(skippedPath)
    ? JSON.parse(fs.readFileSync(skippedPath, "utf-8"))
    : [];
  // rate-limit errors are transient, not genuine data-insufficiency skips: requeue them
  const rateLimitedNames = new Set(skipped.filter((s) => s.reason.startsWith("API error")).map((s) => s.name));
  skipped = skipped.filter((s) => !rateLimitedNames.has(s.name));

  const processedNames = new Set<string>([
    ...results.map((r) => r.company_name),
    ...skipped.map((s) => s.name),
  ]);

  const BATCH_SIZE = parseInt(process.env.ENRICH_BATCH_SIZE || "20", 10);
  const candidates = allCandidates.filter((c) => !processedNames.has(c.name)).slice(0, BATCH_SIZE);

  console.log(`Total candidates: ${allCandidates.length}, already processed: ${processedNames.size}, this batch: ${candidates.length}`);

  let idCounter = 1000 + processedNames.size; // precedent ids start at 1000 to avoid collision with companiesTable ids

  async function callWithRetry(c: Candidate, attempt = 0): Promise<any> {
    try {
      return await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(c) },
        ],
        temperature: 0.1,
        max_tokens: 800,
      });
    } catch (err: any) {
      const is429 = err?.status === 429 || /429/.test(err?.message || "");
      if (is429 && attempt < 4) {
        const waitMs = 2000 * Math.pow(2, attempt);
        console.log(`Rate limited on ${c.name}, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, waitMs));
        return callWithRetry(c, attempt + 1);
      }
      throw err;
    }
  }

  for (const c of candidates) {
    try {
      const completion = await callWithRetry(c);

      const content = completion.choices[0]?.message?.content || "";
      const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const jsonStart = stripped.indexOf("{");
      const jsonEnd = stripped.lastIndexOf("}");
      const jsonStr = jsonStart !== -1 && jsonEnd > jsonStart ? stripped.slice(jsonStart, jsonEnd + 1) : stripped;

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        skipped.push({ name: c.name, sector: c.target_sector, reason: "Groq response was not valid JSON" });
        continue;
      }

      if (
        parsed.insufficient_data === true ||
        !parsed.decision_context ||
        !parsed.decision_taken ||
        !parsed.causal_mechanism
      ) {
        skipped.push({
          name: c.name,
          sector: c.target_sector,
          reason: "Insufficient source narrative to populate decision_context/decision_taken/causal_mechanism without inventing content",
        });
        continue;
      }

      const yearFallback = parseYearRange(c.years_of_operation);

      results.push({
        id: idCounter++,
        company_name: c.name,
        sector: c.target_sector,
        founded_year: parsed.founded_year ?? yearFallback.founded,
        outcome_year: parsed.outcome_year ?? yearFallback.outcome,
        status: parsed.status || (c.crunchbase_cross_ref?.status === "acquired" ? "acquired" : "failed"),
        stage_at_decision: parsed.stage_at_decision || null,
        decision_context: parsed.decision_context,
        decision_taken: parsed.decision_taken,
        causal_mechanism: parsed.causal_mechanism,
        outcome: parsed.outcome || c.why_they_failed,
        timeframe_to_outcome: parsed.timeframe_to_outcome || null,
        source_citation: `Kaggle: ${c.source_file} (dagloxkankwanda/startup-failures)${c.crunchbase_cross_ref ? " cross-referenced with yanmaksi/big-startup-secsees-fail-dataset-from-crunchbase" : ""}`,
        verification_status: "auto-extracted-unverified",
        embedding_summary: parsed.embedding_summary || `${c.name}: ${c.what_they_did}. ${c.why_they_failed}`,
        tags: [c.target_sector, c.source_sector_label].filter(Boolean),
      });

      console.log(`Extracted: ${c.name} (${c.target_sector})`);
    } catch (err: any) {
      skipped.push({ name: c.name, sector: c.target_sector, reason: `API error: ${err?.message || String(err)}` });
    }
    // incremental write so a timeout never loses progress
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    fs.writeFileSync(skippedPath, JSON.stringify(skipped, null, 2));
    // delay to be gentle on rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(skippedPath, JSON.stringify(skipped, null, 2));
  fs.writeFileSync(
    progressPath,
    JSON.stringify({ totalCandidates: allCandidates.length, processed: processedNames.size + candidates.length, extracted: results.length, skipped: skipped.length }, null, 2),
  );

  console.log(`\nBatch complete. Extracted so far: ${results.length}. Skipped so far: ${skipped.length}.`);
  console.log(`Remaining candidates: ${allCandidates.length - processedNames.size - candidates.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
