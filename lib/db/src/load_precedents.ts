import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, precedentsTable } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const dataPath = path.join(__dirname, "..", "..", "..", "data", "precedents.json");
  const results = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const existing = await db.select().from(precedentsTable);
  const existingNames = new Set(existing.map((r) => r.companyName));

  let inserted = 0;
  for (const r of results) {
    if (existingNames.has(r.company_name)) continue;
    await db.insert(precedentsTable).values({
      companyName: r.company_name,
      sector: r.sector,
      foundedYear: r.founded_year,
      outcomeYear: r.outcome_year,
      status: r.status,
      stageAtDecision: r.stage_at_decision || "unknown",
      decisionContext: r.decision_context,
      decisionTaken: r.decision_taken,
      causalMechanism: r.causal_mechanism,
      outcome: r.outcome,
      timeframeToOutcome: r.timeframe_to_outcome,
      sourceCitation: r.source_citation,
      verificationStatus: r.verification_status,
      embeddingSummary: r.embedding_summary,
      tags: r.tags,
    });
    inserted++;
  }
  console.log(`Inserted ${inserted} new precedents into DB (${existingNames.size} already existed).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
