import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, companiesTable, eventsTable, signalsTable } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadGraveyard(): any[] {
  const filePath = path.resolve(
    __dirname,
    "../../../artifacts/vera-nexus/src/lib/graveyard.ts",
  );
  const src = fs.readFileSync(filePath, "utf-8");
  const match = src.match(/export const GRAVEYARD:[^=]*=\s*(\[[\s\S]*\]);/);
  if (!match) throw new Error("Could not parse GRAVEYARD from graveyard.ts");
  const arrayLiteral = match[1];
  const factory = new Function(`return ${arrayLiteral};`);
  return factory();
}

const EVENTS = [
  { year: 2024, title: "OpenAI closes $6.6B funding round", description: "The AI lab raised capital at a $157B valuation, cementing its lead in the generative AI race and pressuring rivals to raise defensively.", category: "technology", sentiment: "positive", impact: 88, source: "TechCrunch", tags: ["AI", "Funding", "OpenAI"] },
  { year: 2024, title: "Fed holds interest rates steady at 4.25-4.50%", description: "The Federal Reserve paused its cutting cycle, citing sticky inflation and a resilient labor market, disappointing markets pricing in faster cuts.", category: "finance", sentiment: "neutral", impact: 72, source: "Reuters", tags: ["Fed", "Rates", "Macro"] },
  { year: 2024, title: "Boeing 737 MAX door plug blowout grounds fleet", description: "An Alaska Airlines flight suffered a mid-air panel blowout, triggering an FAA grounding of MAX 9 jets and renewed scrutiny of Boeing's quality control.", category: "markets", sentiment: "negative", impact: 81, source: "AP", tags: ["Boeing", "Safety", "Aviation"] },
  { year: 2024, title: "Novo Nordisk's Wegovy shortage eases", description: "Increased manufacturing capacity for the blockbuster GLP-1 drug began resolving a two-year supply shortage, reshaping obesity-drug economics.", category: "health", sentiment: "positive", impact: 65, source: "Bloomberg", tags: ["Pharma", "GLP-1", "Supply Chain"] },
  { year: 2024, title: "CrowdStrike outage takes down 8.5M Windows machines", description: "A faulty content update from the cybersecurity vendor caused a global IT outage, grounding flights and disrupting hospitals and banks worldwide.", category: "technology", sentiment: "negative", impact: 90, source: "Wired", tags: ["Cybersecurity", "Outage", "CrowdStrike"] },
  { year: 2024, title: "Nvidia becomes world's most valuable company", description: "Nvidia's market cap briefly surpassed $3.3T, driven by insatiable demand for AI training chips, before volatility returned amid DeepSeek concerns.", category: "markets", sentiment: "positive", impact: 84, source: "WSJ", tags: ["Nvidia", "AI Chips", "Markets"] },
  { year: 2024, title: "Paramount and Skydance finalize merger", description: "An $8B deal ended a prolonged bidding saga, consolidating traditional media as streaming economics forced further industry roll-up.", category: "markets", sentiment: "neutral", impact: 58, source: "Variety", tags: ["Media", "M&A", "Streaming"] },
  { year: 2024, title: "UnitedHealth CEO shooting shakes insurance sector", description: "The killing of Brian Thompson triggered intense public scrutiny of claim-denial practices and a wave of policy proposals targeting insurers.", category: "health", sentiment: "negative", impact: 76, source: "NYT", tags: ["Healthcare", "Insurance", "Policy"] },
  { year: 2025, title: "DeepSeek R1 release rattles AI markets", description: "A Chinese lab's low-cost open model matched frontier performance, wiping out nearly $1T in US tech market cap in a single trading session.", category: "technology", sentiment: "negative", impact: 92, source: "Bloomberg", tags: ["AI", "DeepSeek", "Markets"] },
  { year: 2025, title: "US imposes sweeping reciprocal tariffs", description: "New across-the-board tariffs on major trading partners triggered retaliatory measures and a sharp repricing of global supply chain risk.", category: "finance", sentiment: "negative", impact: 87, source: "Reuters", tags: ["Tariffs", "Trade", "Policy"] },
  { year: 2025, title: "Bitcoin surpasses $100,000 for the first time", description: "Institutional adoption and a friendlier US regulatory stance pushed the leading cryptocurrency past the psychological six-figure milestone.", category: "finance", sentiment: "positive", impact: 74, source: "CoinDesk", tags: ["Bitcoin", "Crypto", "Markets"] },
  { year: 2025, title: "Stargate AI infrastructure initiative announced", description: "A $500B joint venture to build US AI data center capacity was unveiled, signaling an unprecedented capital cycle in compute infrastructure.", category: "technology", sentiment: "positive", impact: 83, source: "TechCrunch", tags: ["AI", "Infrastructure", "Investment"] },
  { year: 2025, title: "S&P 500 enters correction on growth fears", description: "Renewed recession concerns and tariff escalation drove the index down more than 10% from its peak, the sharpest pullback in three years.", category: "markets", sentiment: "negative", impact: 79, source: "WSJ", tags: ["S&P 500", "Correction", "Markets"] },
  { year: 2025, title: "FDA approves first at-home diagnostic AI tool", description: "A new consumer-grade diagnostic device cleared regulatory review, opening a path for AI-assisted care outside traditional clinical settings.", category: "health", sentiment: "positive", impact: 61, source: "STAT News", tags: ["Healthtech", "FDA", "AI"] },
  { year: 2025, title: "Major regional bank faces deposit run fears", description: "Social-media-fueled withdrawal concerns pressured a mid-size US bank's stock, reviving memories of the 2023 regional banking crisis.", category: "finance", sentiment: "negative", impact: 70, source: "Financial Times", tags: ["Banking", "Deposits", "Risk"] },
  { year: 2025, title: "EU finalizes AI Act enforcement guidelines", description: "Brussels published detailed compliance requirements for high-risk AI systems, forcing global companies to adapt deployment timelines in Europe.", category: "technology", sentiment: "neutral", impact: 55, source: "Politico", tags: ["Regulation", "AI Act", "EU"] },
  { year: 2025, title: "Global chip shortage resurfaces on export controls", description: "Tightened export restrictions on advanced semiconductors disrupted supply chains, raising costs across consumer electronics and automotive sectors.", category: "markets", sentiment: "negative", impact: 68, source: "Bloomberg", tags: ["Semiconductors", "Export Controls", "Supply Chain"] },
  { year: 2026, title: "First AI-designed drug enters Phase III trials", description: "A therapy discovered end-to-end by machine learning models advanced to late-stage human trials, a milestone for AI-driven pharma R&D.", category: "health", sentiment: "positive", impact: 77, source: "STAT News", tags: ["AI", "Pharma", "Drug Discovery"] },
];

const SIGNALS = [
  { name: "S&P 500", value: "5,842", change: "+0.8%", sentiment: "positive" },
  { name: "10Y Treasury Yield", value: "4.32%", change: "-0.05%", sentiment: "neutral" },
  { name: "Bitcoin", value: "$98,420", change: "+3.2%", sentiment: "positive" },
  { name: "VIX", value: "18.4", change: "+1.1", sentiment: "negative" },
  { name: "US Dollar Index", value: "104.6", change: "-0.2%", sentiment: "neutral" },
  { name: "Nvidia (NVDA)", value: "$134.20", change: "+2.4%", sentiment: "positive" },
];

async function seed() {
  const existingCompanies = await db.select().from(companiesTable).limit(1);
  if (existingCompanies.length === 0) {
    const graveyard = loadGraveyard();
    const rows = graveyard.map((g) => ({
      id: g.id,
      name: g.name,
      yearRange: g.yearRange,
      description: g.description,
      category: g.category,
      tags: g.tags ?? [],
      failureReason: g.failureReason ?? null,
    }));
    await db.insert(companiesTable).values(rows);
    console.log(`Seeded ${rows.length} companies`);
  } else {
    console.log("Companies table already has data, skipping");
  }

  const existingEvents = await db.select().from(eventsTable).limit(1);
  if (existingEvents.length === 0) {
    await db.insert(eventsTable).values(
      EVENTS.map((e) => ({ ...e, source: e.source, rippleCount: 0 })),
    );
    console.log(`Seeded ${EVENTS.length} events`);
  } else {
    console.log("Events table already has data, skipping");
  }

  const existingSignals = await db.select().from(signalsTable).limit(1);
  if (existingSignals.length === 0) {
    await db.insert(signalsTable).values(SIGNALS);
    console.log(`Seeded ${SIGNALS.length} signals`);
  } else {
    console.log("Signals table already has data, skipping");
  }
}

seed()
  .then(() => {
    console.log("Seed complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
