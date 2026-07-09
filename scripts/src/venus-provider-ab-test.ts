/**
 * Venus A/B test: Groq openai/gpt-oss-120b (CURRENT production model, 8K TPM)
 * vs Groq meta-llama/llama-4-scout-17b-16e-instruct (30K TPM, same provider).
 *
 * IMPORTANT: gpt-oss-120b, not llama-3.3-70b-versatile, is what Venus
 * actually calls in production today — see artifacts/api-server/src/routes/
 * ai.ts and .agents/memory/groq-model-deprecation-2026.md. Groq deprecated
 * llama-3.3-70b-versatile on 2026-06-17 and this repo already migrated off
 * it, so testing against it would compare against a model you can't
 * actually fall back to.
 *
 * Why this comparison and not a cross-provider swap: Groq's own published
 * rate limits (checked 2026-07-10 via multiple independent sources) show
 * llama-4-scout at 30K free-tier TPM vs gpt-oss-120b's 8K — a 3.75x jump
 * with ZERO new provider, ZERO new API key, ZERO new failure surface. This
 * is the cheapest real fix to test before considering a cross-provider
 * migration (Gemini, Cerebras) with its own new tradeoffs (data-training
 * terms, context caps, catalog volatility).
 *
 * This is a standalone diagnostic script — NOT wired into the app, NOT
 * imported by any route. Run it manually, read the output, decide.
 *
 * Usage:
 *   GROQ_API_KEY=... pnpm tsx scripts/src/venus-provider-ab-test.ts
 *
 * What this does:
 *   1. Pulls the REAL VENUS_SYSTEM_PROMPT from the live groq.ts file (no
 *      copy-pasted/stale prompt — if you edit the prompt later, this script
 *      picks up the change automatically).
 *   2. Sends the same set of realistic founder queries + business context to
 *      both models on Groq, asking for the same JSON shape.
 *   3. Prints both raw outputs side by side so you can read and judge for
 *      yourself — this script does NOT auto-score or declare a winner.
 *      Quality judgment is a human call, not something to fake-quantify.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the REAL live prompt directly out of groq.ts at runtime rather than
// importing it as a TS module. This script lives in the `scripts` package,
// which is typechecked separately with its own rootDir boundary (see
// scripts/tsconfig.json) — a cross-package `import` here would break
// `pnpm run typecheck` for the whole monorepo the moment this file was
// added, since scripts/tsconfig.json's rootDir/include don't extend into
// artifacts/api-server. Reading the source as text avoids that entirely
// while still guaranteeing we always test the CURRENT prompt, not a stale
// copy-paste, even after future edits to groq.ts.
function loadVenusPromptFromSource(): string {
  const groqTsPath = resolve(__dirname, "../../artifacts/api-server/src/lib/groq.ts");
  const source = readFileSync(groqTsPath, "utf8");
  const match = source.match(/const VENUS_SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error(
      `Could not find VENUS_SYSTEM_PROMPT in ${groqTsPath} — the template literal delimiters may have changed. Update the regex in this script if groq.ts's prompt definition was restructured.`,
    );
  }
  return match[1];
}

const VENUS_PROMPT = loadVenusPromptFromSource();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in environment. Set it and re-run.");
  process.exit(1);
}

const MODEL_A = "openai/gpt-oss-120b"; // current production model, 8K TPM free tier
const MODEL_B = "meta-llama/llama-4-scout-17b-16e-instruct"; // 30K TPM free tier

// Same fake-but-realistic business context for every query, so both models
// see identical input — this is the only fair way to compare.
const BUSINESS_CONTEXT = `
BUSINESS CONTEXT:
- Sector: B2B SaaS, clinic scheduling software
- Stage: Pre-seed, 6 pilot clinics
- Team: Solo founder, no hires yet
- Traction: ~2 daily active users per pilot clinic
- Capital: ₹4L raised (friends & family), no institutional funding yet
- Runway: ~5 months at current burn
`.trim();

const TEST_QUERIES = [
  "i want to scale",
  "should i hire a salesperson or keep doing sales myself",
  "one of my pilot clinics wants a custom feature before they'll pay. should i build it?",
  "shld i raise a seed round now or wait",
];

async function callGroq(model: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      max_tokens: 1200,
      messages: [
        { role: "system", content: VENUS_PROMPT },
        { role: "user", content: `${BUSINESS_CONTEXT}\n\nFOUNDER QUERY: ${userMessage}` },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return `[GROQ ERROR ${res.status}] ${errText}`;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[GROQ: empty response]";
}

function tryPrettyPrintJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw + "\n\n[NOTE: did not parse as valid JSON]";
  }
}

async function main() {
  for (const query of TEST_QUERIES) {
    console.log("\n" + "=".repeat(100));
    console.log(`QUERY: "${query}"`);
    console.log("=".repeat(100));

    const [resultA, resultB] = await Promise.all([
      callGroq(MODEL_A, query).catch((e) => `[MODEL A THREW] ${e}`),
      callGroq(MODEL_B, query).catch((e) => `[MODEL B THREW] ${e}`),
    ]);

    console.log(`\n--- MODEL A: ${MODEL_A} (current production, 8K TPM) ---`);
    console.log(tryPrettyPrintJson(resultA));

    console.log(`\n--- MODEL B: ${MODEL_B} (30K TPM) ---`);
    console.log(tryPrettyPrintJson(resultB));
  }

  console.log("\n" + "=".repeat(100));
  console.log("Done. Read both columns for each query above and judge: does llama-4-scout");
  console.log("diagnose the bottleneck as well as, or better than, gpt-oss-120b (current)?");
  console.log("If yes (or close), switching the model string is a safe, zero-risk 3.75x TPM win.");
  console.log("=".repeat(100));
}

main();

