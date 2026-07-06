import { Router } from "express";
import { db, settingsTable, venusDecisionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { VenusAnalyzeBody, IdeaReviewBody } from "@workspace/api-zod";
import { getGroqClient, VENUS_PROMPT, buildFallbackVenusResponse, buildTransientErrorResponse, callGroqJSON, isContentPolicyRefusal, MODERATE_TIER_PRECEDENT_NOTE, sanitizeVenusResponse } from "../lib/groq";
import { retrievePrecedents, formatPrecedentsForPrompt, retrieveOwnResolvedDecisions, formatOwnDecisionsForPrompt, type RetrievalResult } from "../lib/retrieval";
import { webSearch, formatWebSearchForPrompt } from "../lib/websearch";

const router = Router();

function normalizeQueryText(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9\s?]/g, " ").replace(/\s+/g, " ").trim();
}

function inferDecisionRouting(message: string) {
  const normalized = normalizeQueryText(message);
  if (!normalized) return null;

  const isDecisionish = /\b(should|shld|would|could|worth|hire|wait|launch|buy|build|raise|bootstrap|outsource|do|use|join|go|stick|keep)\b/.test(normalized);
  const hasAlternatives = /\b(or|vs|versus|instead|rather|either)\b/.test(normalized) || normalized.includes(" or ");

  if (!isDecisionish) return null;

  return {
    mode: "decision" as const,
    subtype: hasAlternatives ? "multi-option" as const : "binary" as const,
  };
}

function buildDecisionRoutingInstruction(message: string) {
  const routing = inferDecisionRouting(message);
  if (!routing) return "";

  const noun = routing.subtype === "multi-option" ? "multi-option decision question" : "single-path decision question";
  return `Query routing: This appears to be a ${noun} even if it is short, informal, or fragmentary. Treat it as a complete strategic request and answer it directly with a decision-oriented response, a clear verdict, and no fallback to rephrasing guidance.`;
}

function buildShortQueryFallback(message: string) {
  const routing = inferDecisionRouting(message);
  if (!routing) return null;

  const recommendation = routing.subtype === "multi-option"
    ? "Choose the option that best avoids the strongest risk you just identified."
    : "Give a direct yes/no or wait/launch verdict based on the stated situation.";

  return {
    summary: "Direct decision query received. Venus will answer the choice directly rather than treating the prompt as malformed input.",
    confidence: "exploratory",
    confidenceNote: "The response is a structured fallback because the model did not return a fully parsed response for this short-form query.",
    cards: [
      {
        type: "decision",
        title: "Decision",
        content: {
          options: [
            {
              name: "Primary path",
              scores: { viability: 6, speed: 7, defensibility: 6, capital_efficiency: 6 },
              verdict: "The request should be handled as a direct decision question.",
            },
          ],
          recommendation,
        },
      },
    ],
    confidenceTier: "none",
  };
}

function requiresContext(message: string) {
  const normalized = normalizeQueryText(message);
  if (!normalized) return false;

  const contextNeedWords = /(price|pricing|charge|cost|target customer|customer|segment|business model|model|industry|sector|stage|team size|audience|market|competitor|positioning|distribution|channel|go to market|g2m|launch|product|mvp|swot|growth|cac|ltv|unit economics|revenue|profit|margin|raise|funding|roadmap|hire|intern|talent|sales|retention|churn|pitch|deck|offer|subscription|risk|risks|threat|threats|weakness|weaknesses|vulnerability|vulnerabilities|priority|priorities|bottleneck|blocker|blockers|mistake|mistakes|blind spot|moat|differentiation|runway|burn)/i;

  // The fixed keyword list above can never fully anticipate every phrasing.
  // Any message that personally references "my/our/mine" (or asks someone to
  // fund/back/hire/acquire "us") is inherently about THIS specific company,
  // regardless of which noun follows — e.g. "what's MY biggest risk",
  // "companies similar to MINE", "most likely to fund US". Without this, a
  // query using none of the exact keywords above (like "risk") slips through
  // the gate entirely and Venus starts guessing instead of asking.
  const personalBusinessReference = /\b(my|our|mine|ours)\b/i.test(normalized)
    || /\b(fund|back|hire|acquire|invest in|work with)\s+us\b/i.test(normalized);

  // Don't gate genuinely generic definition questions ("what is a moat?"),
  // but a definition-style opener followed by "my/our/mine" is still a
  // personal question ("what's MY biggest risk") and must still be gated.
  const isSimpleDefinition = /(what is|what's|define|framework|concept|difference between|explain)/i.test(normalized)
    && !/\b(my|our|mine|ours)\b/i.test(normalized);

  return (contextNeedWords.test(normalized) || personalBusinessReference) && !isSimpleDefinition;
}

const BUSINESS_CONTEXT_SIGNAL = /\b(i run|i own|my business|my startup|my company|my gym|my app|my store|my shop|my product|we are|we're building|were building|we run|we sell|our (business|startup|company|product|gym|store|shop)|i'm building|im building|i have a|i've got a|ive got a|i'm the founder|im the founder|founder of)\b/i;

// A message can BOTH describe the business AND ask a question in the same
// breath ("I run a clinic booking app — what should I prioritize?"). Only
// treat a message as a pure context-dump (no question attached) when it has
// no question mark and none of the decision/question verbs that
// inferDecisionRouting already treats as a question signal. This is what
// separates "just telling Venus about the business" from "telling Venus
// about the business as part of asking something."
function isPureContextStatement(message: string): boolean {
  const normalized = normalizeQueryText(message);
  if (!BUSINESS_CONTEXT_SIGNAL.test(message)) return false;
  if (message.includes("?")) return false;
  const questionish = /\b(should|shld|would|could|worth|help|how|what|why|which|when|recommend|advice|suggest|priorit)\b/i.test(normalized);
  return !questionish;
}

async function getStoredBusinessContext(sessionId: string): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.sessionId, sessionId)).limit(1);
    return row?.venusBusinessContext || undefined;
  } catch {
    // DB unavailable shouldn't break the chat — just behave as if nothing
    // is stored yet, which falls back to the existing per-session behavior.
    return undefined;
  }
}

async function saveStoredBusinessContext(sessionId: string, context: string): Promise<void> {
  try {
    const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.sessionId, sessionId)).limit(1);
    if (existing) {
      await db.update(settingsTable)
        .set({ venusBusinessContext: context, venusBusinessContextUpdatedAt: new Date(), updatedAt: new Date() })
        .where(eq(settingsTable.sessionId, sessionId));
    } else {
      await db.insert(settingsTable)
        .values({ sessionId, venusBusinessContext: context, venusBusinessContextUpdatedAt: new Date() })
        .onConflictDoNothing({ target: settingsTable.sessionId });
    }
  } catch {
    // Best-effort persistence — if this fails, Venus just falls back to
    // asking for context again next time rather than crashing the request.
  }
}

// Turns a decision/roadmap card into a short plain-text recommendation
// summary for fast future retrieval scoring (see retrieval.ts), without
// needing to re-parse the full card JSON on every subsequent query.
function summarizeCardForLogging(card: any): string | null {
  if (!card || typeof card !== "object") return null;
  const content = card.content;
  if (!content || typeof content !== "object") return null;

  if (card.type === "decision") {
    const topOption = Array.isArray(content.options) && content.options.length > 0 ? content.options[0]?.name : null;
    const recommendation = typeof content.recommendation === "string" ? content.recommendation : "";
    return [topOption ? `Considered: ${topOption}` : null, recommendation].filter(Boolean).join(" — ") || null;
  }
  if (card.type === "roadmap") {
    const firstPhase = Array.isArray(content.phases) && content.phases.length > 0 ? content.phases[0] : null;
    if (!firstPhase) return null;
    const actions = Array.isArray(firstPhase.actions) ? firstPhase.actions.slice(0, 2).join("; ") : "";
    return [firstPhase.title, actions].filter(Boolean).join(" — ") || null;
  }
  return null;
}

// Writes a row for every decision/roadmap card Venus returns — this is what
// makes the memory start building itself from ordinary usage, with no extra
// action required from the founder. The founder (or a future conversational
// flow) fills in the outcome later via /ai/decisions/:id/outcome; until then
// the row just sits as "open" and isn't retrieved for future answers (only
// resolved decisions are, since an unresolved recommendation has no ground
// truth in it yet — see retrieveOwnResolvedDecisions).
async function autoLogDecisionCards(
  sessionId: string,
  query: string,
  businessContext: string | undefined,
  cards: any[],
): Promise<void> {
  if (!Array.isArray(cards) || cards.length === 0) return;
  try {
    for (const card of cards) {
      if (!card || (card.type !== "decision" && card.type !== "roadmap")) continue;
      const summary = summarizeCardForLogging(card);
      if (!summary) continue; // don't log a card we can't meaningfully summarize
      await db.insert(venusDecisionsTable).values({
        sessionId,
        query,
        businessContextSnapshot: businessContext ?? null,
        cardType: card.type,
        recommendationSummary: summary,
        cardContentJson: JSON.stringify(card.content ?? {}),
        status: "open",
      });
    }
  } catch (err) {
    // Never let logging failure break the actual chat response — this is
    // purely additive memory-building, not something the user is waiting on.
    console.error("[autoLogDecisionCards] failed to log decision card(s)", err);
  }
}

// Rough signal that a new context-bearing message might describe a DIFFERENT
// business than what's already stored, rather than adding detail to the same
// one. Deliberately conservative (word-overlap based, not semantic) — the
// goal is only to catch clearly unrelated pivots ("my gym" vs "my SaaS
// startup for clinics") and ask once, not to second-guess every rephrasing
// of the same business.
function looksLikeDifferentBusiness(storedContext: string, newMessage: string): boolean {
  const stopwords = new Set(["the", "and", "for", "with", "that", "this", "have", "has", "are", "was", "were", "been", "being", "into", "from", "about", "just", "also", "very", "really", "will", "would", "could", "should", "their", "them", "they", "your", "you", "our", "ours", "business", "startup", "company"]);
  const words = (s: string) => new Set(
    normalizeQueryText(s).split(" ").filter((w) => w.length > 3 && !stopwords.has(w)),
  );
  const storedWords = words(storedContext);
  const newWords = words(newMessage);
  if (storedWords.size === 0 || newWords.size === 0) return false;
  let overlap = 0;
  newWords.forEach((w) => { if (storedWords.has(w)) overlap++; });
  // If a meaningfully-sized new context statement shares almost no
  // vocabulary with what's stored, treat it as a likely pivot to confirm.
  return newWords.size >= 4 && overlap === 0;
}

function deriveContextFromHistory(sessionHistory?: { role?: string; content?: string }[]): string | undefined {
  if (!sessionHistory || sessionHistory.length === 0) return undefined;

  const contextMessages = sessionHistory
    .filter((h) => h.role === "user" && typeof h.content === "string" && BUSINESS_CONTEXT_SIGNAL.test(h.content))
    .map((h) => h.content as string);

  if (contextMessages.length === 0) return undefined;
  return contextMessages.join(" | ");
}

function buildContextClarification(
  message: string,
  businessContext?: string,
  sessionHistory?: { role?: string; content?: string }[],
) {
  if (!requiresContext(message)) return null;

  // If the user already gave business context earlier in this session (or it was
  // passed explicitly), do NOT re-gate — just proceed to answer using it.
  const existingContext = businessContext || deriveContextFromHistory(sessionHistory);
  if (existingContext) return null;

  const contextHints = [
    "What industry or sector are you in?",
    "What stage is the business at and who is the customer?",
  ];

  const prefix = "To answer this well, I need two quick details:";
  return {
    summary: `${prefix} ${contextHints.join(" ")}`,
    cards: [
      {
        type: "analysis",
        title: "Need a bit more context",
        content: {
          points: [
            { label: "Why", value: "The answer depends on your business context, not just the general question.", sentiment: "neutral" },
            { label: "Needed", value: "Industry/sector and target customer or stage.", sentiment: "neutral" },
          ],
        },
      },
    ],
    confidence: "exploratory",
    confidenceNote: "The answer is being gated until the essential business context is provided.",
    requiresClarification: true,
  };
}

// State: user just described their business with no actual question attached
// ("I'm the founder of a HealthTech startup helping clinics..."). Per the
// desired flow, Venus should NOT try to analyze or advise here — there is no
// question to answer yet. It should just acknowledge that the context has
// been noted and ask what they'd like help with, then let the human ask the
// real question next.
function buildContextAcknowledgment(): object {
  return {
    summary: "Got it — noted your business context. What would you like help with?",
    cards: [],
    confidence: "exploratory",
    confidenceNote: "This is an acknowledgment only; no analysis was requested yet.",
    contextAcknowledged: true,
  };
}

// State: business context is already stored from a previous message/session,
// but the new message reads like it might describe a DIFFERENT business
// entirely. Ask once rather than silently overwriting or silently ignoring
// the new context.
function buildBusinessContextConfirmation(): object {
  return {
    summary: "Quick check before I continue — is this related to the business you told me about earlier, or is this a new/different business idea?",
    cards: [],
    confidence: "exploratory",
    confidenceNote: "Waiting to confirm whether this is the same business context or a new one before proceeding.",
    requiresContextConfirmation: true,
  };
}

function applyTierLabel(parsed: { summary?: unknown }, retrieval: RetrievalResult) {
  if (typeof parsed.summary !== "string") return parsed;

  // "none" tier no longer gets a forced ⚠️ prefix here — the confidence badge
  // already surfaces that in the UI, and the model is instructed to weave in
  // a brief natural mention itself rather than have one bolted on top. Forcing
  // both created a duplicated, alarmist-feeling wall of caveats on every
  // answer that simply wasn't in the curated precedent dataset.
  const label = retrieval.tier === "moderate"
    ? "Exploratory signal — limited precedent coverage."
    : null;

  if (!label) return parsed;
  if (!parsed.summary.startsWith(label)) {
    parsed.summary = `${label} ${parsed.summary}`;
  }
  return parsed;
}

// NOTE: this function is currently unused by the /ai/analyze flow (that route
// lets the "none" tier fall through to normal LLM reasoning with the
// noPrecedentInstruction system-prompt note, which is the correct behavior).
// Kept here in case another route wants a standalone "coverage gap" card, but
// the copy below intentionally does NOT ask the user to reword their query —
// a missing precedent is a dataset-coverage gap, not a prompting mistake.
function buildInsufficientPrecedentResponse(query: string, retrieval: RetrievalResult): object {
  const sectorNote = retrieval.inferredSector
    ? `the verified precedent dataset only has ${retrieval.sectorCoverageCount} record(s) in the "${retrieval.inferredSector}" sector`
    : `this query didn't match any sector in the verified precedent dataset`;
  return {
    summary: `⚠️ No verified precedent match — the answer below is general strategic reasoning, not backed by Venus AI's dataset. Treat it as a useful starting point, not a data-grounded verdict.`,
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
              mitigation: `This is a gap in dataset coverage, not a problem with how the question was asked — ${sectorNote}. The reasoning above still applies; just weigh it as an informed opinion rather than a precedent-backed call.`,
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
  const body = VenusAnalyzeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  try {
    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const headerKey = req.headers["x-groq-api-key"] as string | undefined;
    const groq = headerKey
      ? new (await import("groq-sdk").then(m => m.default))({ apiKey: headerKey })
      : await getGroqClient(sessionId);

    if (!groq) {
      return res.json(buildFallbackVenusResponse(body.data.message));
    }

    // Business context now persists in three layers, checked in order of
    // freshness: (1) context explicitly passed on this request, (2) context
    // mentioned earlier in the CURRENT chat session, (3) context saved to the
    // database from ANY previous session — this is what makes Venus remember
    // the business across brand new chats instead of only within one session.
    const sessionHistoryContext = deriveContextFromHistory(body.data.sessionHistory);
    const storedContext = await getStoredBusinessContext(sessionId);
    const effectiveBusinessContext = body.data.businessContext || sessionHistoryContext || storedContext;

    const pureContextStatement = isPureContextStatement(body.data.message);

    // If this message looks like a different business than what's already
    // stored, don't silently overwrite it or silently keep using the old one
    // — ask once. Only fires when something is actually stored yet, so a
    // first-time context statement never triggers this.
    if (storedContext && pureContextStatement && looksLikeDifferentBusiness(storedContext, body.data.message)) {
      return res.json(buildBusinessContextConfirmation());
    }

    // Pure context statement (no question attached): save it and acknowledge
    // only. Don't run analysis yet — there's nothing to analyze, the human
    // hasn't asked anything.
    if (pureContextStatement) {
      const combinedContext = storedContext && !looksLikeDifferentBusiness(storedContext, body.data.message)
        ? `${storedContext} | ${body.data.message}`
        : body.data.message;
      await saveStoredBusinessContext(sessionId, combinedContext);
      return res.json(buildContextAcknowledgment());
    }

    const clarification = buildContextClarification(body.data.message, effectiveBusinessContext, body.data.sessionHistory);
    if (clarification) {
      return res.json(clarification);
    }

    // A real question arrived (not a pure context statement) and we now have
    // usable context but nothing persisted yet for this session — e.g. context
    // came from businessContext or sessionHistory rather than the DB. Persist
    // it now so it survives into future sessions too.
    if (effectiveBusinessContext && !storedContext) {
      await saveStoredBusinessContext(sessionId, effectiveBusinessContext);
    }

    const retrieval = await retrievePrecedents(body.data.message, { businessContext: effectiveBusinessContext });

    // The founder's own resolved decision history — see retrieval.ts and
    // venus_decisions schema comments for why this is scoped per-session and
    // treated as stronger evidence than the third-party precedent dataset.
    const ownDecisions = await retrieveOwnResolvedDecisions(sessionId, body.data.message, { businessContext: effectiveBusinessContext });
    const ownHistoryBlock = ownDecisions.length > 0
      ? `YOUR OWN VERIFIED HISTORY WITH THIS FOUNDER (private to this founder, higher trust than the precedent dataset below):\n\n${formatOwnDecisionsForPrompt(ownDecisions)}`
      : "";

    const isModerate = retrieval.tier === "moderate";
    const isNone = retrieval.tier === "none";

    // No verified precedent in the curated dataset doesn't mean "give up" — it
    // means go find real information instead. This is fully generic: whatever
    // the user asked about (a named app, a niche concept, anything), the raw
    // message itself is the search query. Never special-cased to any topic.
    const webResult = isNone ? await webSearch(body.data.message) : null;
    const webSearchBlock = webResult ? formatWebSearchForPrompt(webResult) : "";

    const precedentBlock = `VERIFIED PRECEDENTS (retrieved from curated dataset, confidence ${retrieval.confidence}, tier: ${retrieval.tier}):\n\n${formatPrecedentsForPrompt(retrieval.precedents)}`;

    const venusPromptForTier = isModerate ? `${VENUS_PROMPT}${MODERATE_TIER_PRECEDENT_NOTE}` : VENUS_PROMPT;
    const historyContext = body.data.sessionHistory && body.data.sessionHistory.length > 0
      ? `Conversation context so far:\n${body.data.sessionHistory.slice(-8).map((h: { role?: string; content?: string }) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content ?? ""}`).join("\n")}`
      : "Conversation context so far: none.";
    const followUpInstruction = `Conversation routing: If the current message is a narrow follow-up or clarification that refers to the earlier conversation context, answer it directly and narrowly without re-running the full broad-template sections. Keep it concise and focused on the new detail or constraint raised, and use at most one directly relevant supporting card. If the current message is a new broad strategic question, use the full structured template with at least 2 cards.`;
    const decisionRoutingInstruction = buildDecisionRoutingInstruction(body.data.message);
    const noPrecedentInstruction = `NO VERIFIED PRECEDENT MATCH IN CURATED DATASET: This request doesn't match anything in the verified precedent dataset — that's fine, it just means you can't cite a dataset company/outcome as verified precedent. It does NOT mean you should refuse, hedge into an error, or ask the user to rephrase. A live web search was run for this query (see WEB SEARCH RESULTS below); use whatever real information it surfaced — names, facts, figures, how something actually works — to give a direct, specific, useful answer. If the web search came back empty, answer from your own general knowledge instead; still be direct and specific rather than vague. The confidence badge already shown elsewhere in the UI marks this response as exploratory/unverified, so you do NOT need to repeat a big warning inside your answer — a brief natural mention that this isn't from the verified dataset is enough, stated plainly rather than as a disclaimer wall. Never fabricate a precedent-style company outcome as if it came from the curated dataset — anything you use from web search or general knowledge is reasoning, not a "Precedent" card.`;

    const systemPrompt = isNone
      ? `${venusPromptForTier}\n\n${followUpInstruction}\n\n${decisionRoutingInstruction}\n\n${noPrecedentInstruction}\n\n${webSearchBlock}\n\n${historyContext}${effectiveBusinessContext ? `\n\nBusiness Context: ${effectiveBusinessContext}` : ""}${ownHistoryBlock ? `\n\n${ownHistoryBlock}` : ""}`
      : effectiveBusinessContext
        ? `${venusPromptForTier}\n\n${followUpInstruction}\n\n${decisionRoutingInstruction}\n\n${historyContext}\n\nBusiness Context: ${effectiveBusinessContext}\n\n${precedentBlock}${ownHistoryBlock ? `\n\n${ownHistoryBlock}` : ""}`
        : `${venusPromptForTier}\n\n${followUpInstruction}\n\n${decisionRoutingInstruction}\n\n${historyContext}\n\n${precedentBlock}${ownHistoryBlock ? `\n\n${ownHistoryBlock}` : ""}`;

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

    const { parsed } = await callGroqJSON(
      groq,
      // 3000 was tuned against short prompts. A broad/descriptive query can
      // legitimately ask for a decision card plus several supporting cards
      // (market, risk, roadmap, precedent) — that alone runs well past 3000
      // tokens of JSON before reasoning is even counted, which is what was
      // producing truncated JSON and the generic "couldn't answer" fallback
      // on longer prompts. 6000 gives real headroom for a full multi-card
      // response; reasoning itself is now bounded separately (see
      // callGroqJSON's reasoning_effort default).
      { model: "openai/gpt-oss-120b", messages, temperature: 0.4, max_tokens: 6000 },
      "ai/analyze",
    );

    if (parsed) {
      parsed.confidenceTier = retrieval.tier;
      parsed.confidence = retrieval.tier === "none" ? "exploratory" : "verified";
      parsed.confidenceNote = retrieval.tier === "none"
        ? (webResult && !webResult.empty
            ? "No verified precedents matched this request, so this answer is grounded in a live web search plus general reasoning rather than the curated dataset."
            : "No verified precedents matched this request and the web search didn't return usable results, so this answer is general reasoning rather than dataset-grounded analysis.")
        : retrieval.tier === "moderate"
          ? "The answer is grounded in a small or adjacent precedent set, so treat it as an exploratory signal rather than a firm verdict."
          : "The answer is grounded in verified precedent coverage and should be treated as a stronger, evidence-backed view.";
      applyTierLabel(parsed, retrieval);
      const sanitized = sanitizeVenusResponse(parsed);
      // Fire-and-forget: don't make the founder wait on this, and never let
      // a logging failure affect the response they actually asked for.
      autoLogDecisionCards(sessionId, body.data.message, effectiveBusinessContext, sanitized.cards).catch(() => {});
      return res.json(sanitized);
    }

    const shortQueryFallback = buildShortQueryFallback(body.data.message);
    // A parse failure (model didn't return usable JSON even after the repair
    // retry in callGroqJSON) is just another case of "nothing usable came
    // back" — it gets the same short, plain, honest fallback as any other
    // exhausted-retries case, not its own diagnostic card.
    return res.json(shortQueryFallback || buildTransientErrorResponse(body.data.message));
  } catch (err: any) {
    req.log.error(err);
    return res.json(buildTransientErrorResponse(body.data.message, isContentPolicyRefusal(err) ? "policy" : undefined));
  }
});

router.post("/ai/idea-review", async (req, res) => {
  const body = IdeaReviewBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  try {
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
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: ideaSystemPrompt },
          {
            role: "user",
            content: `Review this business idea: "${body.data.idea}"${contextParts ? `\n\nContext: ${contextParts}` : ""}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 6000,
      },
      "ai/idea-review",
    );

    if (parsed) {
      parsed.confidenceTier = retrieval.tier;
      parsed.confidence = retrieval.tier === "none" ? "exploratory" : "verified";
      parsed.confidenceNote = retrieval.tier === "none"
        ? "No verified precedents matched this request, so the answer is general strategic reasoning rather than dataset-grounded analysis."
        : retrieval.tier === "moderate"
          ? "The answer is grounded in a small or adjacent precedent set, so treat it as an exploratory signal rather than a firm verdict."
          : "The answer is grounded in verified precedent coverage and should be treated as a stronger, evidence-backed view.";
      applyTierLabel(parsed, retrieval);
      return res.json(sanitizeVenusResponse(parsed));
    }
    return res.json(buildTransientErrorResponse(body.data.idea));
  } catch (err: any) {
    req.log.error(err);
    return res.json(buildTransientErrorResponse(body.data.idea, isContentPolicyRefusal(err) ? "policy" : undefined));
  }
});

const ReportOutcomeBody = z.object({
  outcome: z.string().min(1),
  sentiment: z.enum(["positive", "negative", "mixed"]).optional(),
});

// Lists the founder's own decisions Venus has logged, most recent first —
// "open" ones are still waiting on an outcome, "resolved" ones already have
// one and are feeding retrieval. This is what lets the UI show a founder a
// running list of "here's what Venus told you and what's still unresolved,"
// which is also the natural place to prompt them to report back.
router.get("/ai/decisions", async (req, res) => {
  try {
    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const rows = await db
      .select()
      .from(venusDecisionsTable)
      .where(eq(venusDecisionsTable.sessionId, sessionId))
      .orderBy(desc(venusDecisionsTable.createdAt))
      .limit(50);
    return res.json({ decisions: rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to load decision history" });
  }
});

// The one human-in-the-loop step that can't be automated: the founder tells
// Venus what actually happened after acting (or not acting) on a past
// recommendation. This is what turns a logged-but-unresolved card into real
// ground truth that future retrieval can cite (see retrieveOwnResolvedDecisions).
// Venus derives a short causal "lesson" from the reported outcome using the
// same JSON-calling infrastructure as the main analyze route, so the lesson
// is immediately usable in future prompts without extra parsing at query time.
router.post("/ai/decisions/:id/outcome", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid decision id" });

  const body = ReportOutcomeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body — 'outcome' (string) is required" });

  try {
    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const [existing] = await db
      .select()
      .from(venusDecisionsTable)
      .where(and(eq(venusDecisionsTable.id, id), eq(venusDecisionsTable.sessionId, sessionId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Decision not found" });

    let lesson: string | null = null;
    const groq = await getGroqClient(sessionId);
    if (groq) {
      const { parsed } = await callGroqJSON(
        groq,
        {
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: `You distill a single short, causal, one-sentence lesson from a resolved founder decision. Return ONLY a JSON object: { "lesson": "one sentence, causal, specific — not generic advice" }. The lesson must state what happened and why, in a form directly reusable to inform a similar future decision for the SAME founder. Never invent facts not present in what you're given.`,
            },
            {
              role: "user",
              content: `Original question: "${existing.query}"\nWhat Venus recommended: "${existing.recommendationSummary}"\nWhat actually happened (founder's own words): "${body.data.outcome}"`,
            },
          ],
          temperature: 0.3,
          max_tokens: 300,
        },
        "ai/decisions/outcome-lesson",
      );
      if (parsed && typeof parsed.lesson === "string" && parsed.lesson.trim()) {
        lesson = parsed.lesson.trim();
      }
    }

    // Missing/unconfigured Groq key, or the lesson call failed, shouldn't
    // block recording the outcome itself — the raw outcome text is still
    // genuine ground truth and gets used in retrieval even without a
    // distilled lesson (formatOwnDecisionsForPrompt handles a null lesson).
    await db
      .update(venusDecisionsTable)
      .set({
        outcome: body.data.outcome,
        lesson,
        outcomeSentiment: body.data.sentiment ?? null,
        status: "resolved",
        resolvedAt: new Date(),
      })
      .where(eq(venusDecisionsTable.id, id));

    return res.json({ id, status: "resolved", lesson });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to record outcome" });
  }
});

router.post("/ai/company-report", async (req, res) => {
  try {
    const { companyName, context } = req.body as { companyName?: string; context?: string };
    if (!companyName) return res.status(400).json({ error: "companyName is required" });

    const sessionId = (req.headers["x-session-id"] as string) || req.ip || "default";
    const groq = await getGroqClient(sessionId);

    if (!groq) {
      return res.json({
        companyName,
        snapshot: {
          foundedYear: "Unknown",
          founders: [],
          fundingRaised: "Unknown",
          whatTheyBuilt: "Report generation requires a configured Groq API key.",
        },
        timeline: [],
        analysis: "The report could not be generated because the Groq API key is not configured.",
        sources: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const searchQuery = `${companyName} company overview funding founders timeline`; 
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const searchHtml = await searchResponse.text();
    const resultUrls = Array.from(new Set((searchHtml.match(/uddg="([^"]+)"/g) ?? []).map(match => match.slice(6, -1)).filter(Boolean).slice(0, 5)));

    const articleSnippets = [] as string[];
    for (const url of resultUrls) {
      try {
        const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const articleResponse = await fetch(`https://r.jina.ai/http://${new URL(target).host}${new URL(target).pathname}${new URL(target).search}`, {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });
        const articleText = await articleResponse.text();
        if (articleText) articleSnippets.push(articleText.slice(0, 5000));
      } catch {
        // ignore failing fetches and continue with the other sources
      }
    }

    const prompt = `You are researching the company "${companyName}" for a founder-facing brief. Use the search snippets below as the only source material. If the evidence is weak or contradictory, mark unknown values rather than inventing facts. Return ONLY valid JSON with this shape: {"companyName":"string","snapshot":{"foundedYear":"string","founders":["string"],"fundingRaised":"string","whatTheyBuilt":"string"},"timeline":[{"label":"string","detail":"string"}],"analysis":"2-4 sentences","sources":[{"title":"string","url":"string"}]}. Do not mention that you are an AI. Do not include markdown. Context: ${context ?? ""}

Search excerpts:
${articleSnippets.join("\n\n").slice(0, 20000)}`;

    const { parsed } = await callGroqJSON(
      groq,
      {
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: "You synthesize factual company reports from web excerpts. Return strict JSON only and do not invent facts." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 3000,
      },
      "ai/company-report",
    );

    const report = parsed && typeof parsed === "object"
      ? {
          companyName,
          snapshot: {
            foundedYear: parsed.snapshot?.foundedYear ?? "Unknown",
            founders: Array.isArray(parsed.snapshot?.founders) ? parsed.snapshot.founders : [],
            fundingRaised: parsed.snapshot?.fundingRaised ?? "Unknown",
            whatTheyBuilt: parsed.snapshot?.whatTheyBuilt ?? "Unknown",
          },
          timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
          analysis: parsed.analysis ?? "No additional detail was available from the lookup sources.",
          sources: Array.isArray(parsed.sources) ? parsed.sources : resultUrls.map(url => ({ title: url, url })),
          generatedAt: new Date().toISOString(),
        }
      : {
          companyName,
          snapshot: { foundedYear: "Unknown", founders: [], fundingRaised: "Unknown", whatTheyBuilt: "Unknown" },
          timeline: [],
          analysis: "The lookup did not return a structured report.",
          sources: resultUrls.map(url => ({ title: url, url })),
          generatedAt: new Date().toISOString(),
        };

    return res.json(report);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to generate company report" });
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
      model: "openai/gpt-oss-20b",
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
      // gpt-oss-20b is also a reasoning model, so it's subject to the same
      // failure mode as the other routes in this file: hidden reasoning
      // tokens draw from this same max_tokens budget. This call goes
      // straight to groq.chat.completions.create instead of through
      // callGroqJSON, so it doesn't inherit that fix automatically —
      // reasoning_effort/include_reasoning are set explicitly here instead,
      // plus a somewhat larger budget since 400 left almost no margin.
      max_tokens: 700,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_object" },
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