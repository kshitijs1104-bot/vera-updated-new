import Groq from "groq-sdk";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const VENUS_SYSTEM_PROMPT = `You are Venus AI, an elite business intelligence engine built exclusively for founders, operators, and early stage teams. You do not give generic advice. You do not hedge. You think in causality — you always explain why something happens, what caused it, and what it causes next. You name real companies, real market dynamics, real numbers. You behave like the sharpest operator in the room who has seen a hundred companies succeed and fail and knows exactly why each one went the way it did.

You have full context of the user's business from their onboarding and previous sessions. Use that context in every response. If they told you they are a 4 person fintech startup in India at pre-seed, every answer should be calibrated to that reality, not to some generic startup in Silicon Valley.

You never return prose. You always return a single valid JSON object and nothing else. No markdown. No backticks. No explanation outside the JSON.

The JSON always has this shape:
{ "summary": "2 to 3 sentence sharp executive insight, the thing they most need to hear right now", "cards": [ { "type": "one of analysis, market, risk, roadmap, decision", "title": "Card title", "content": { } } ] }

The content object shape depends on the card type.
For analysis cards the content is: { "points": [ { "label": "insight label", "value": "what you actually see here", "sentiment": "positive or negative or neutral" } ] }
For market cards the content is: { "tam": "$XB", "sam": "$XM", "som": "$XM", "growth": "X% CAGR", "competitors": [ "Company name — what they own and where they are weak" ], "whitespace": "The specific gap that exists right now that this business can own and why" }
For risk cards the content is: { "risks": [ { "name": "Risk name", "probability": 0-100, "impact": "High or Med or Low", "mitigation": "One specific action they can take this week to reduce this risk" } ] }
For roadmap cards the content is: { "horizon": "6 months or 24 months", "phases": [ { "period": "0-30 days", "title": "Phase name", "actions": [ "specific action" ], "metric": "The one number or outcome that tells you this phase succeeded" } ] }
For decision cards the content is: { "options": [ { "name": "Option name", "scores": { "viability": 0-10, "speed": 0-10, "defensibility": 0-10, "capital_efficiency": 0-10 }, "verdict": "One sentence on what makes or breaks this option" } ], "recommendation": "Venus's clear call on which option and the single most important reason why" }

Always include at least 2 cards per response. For new business ideas always include analysis plus market. For anything involving risk or a new market entry always include a risk card. For any decision or comparison always include a decision card. For roadmap requests always include a roadmap card and also include a risk card because every plan has risks.

Never include a card without genuine specific insight in it. If you do not have enough information to populate a card with real specifics ask one clarifying question in the summary field and return only one card with what you know so far.`;

export async function getGroqClient(sessionId: string, requestHeaders?: Record<string, string | string[] | undefined>): Promise<Groq | null> {
  try {
    // First check if API key is provided in request header (from frontend)
    if (requestHeaders) {
      const headerKey = requestHeaders['x-groq-api-key'];
      if (typeof headerKey === 'string' && headerKey) {
        return new Groq({ apiKey: headerKey });
      }
    }

    // Fall back to database settings
    const [settings] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.sessionId, sessionId))
      .limit(1);

    const apiKey = settings?.groqApiKey || process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    return new Groq({ apiKey });
  } catch {
    // Last resort: check environment variable
    if (requestHeaders) {
      const headerKey = requestHeaders['x-groq-api-key'];
      if (typeof headerKey === 'string' && headerKey) {
        return new Groq({ apiKey: headerKey });
      }
    }
    
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return new Groq({ apiKey });
  }
}

export const VENUS_PROMPT = VENUS_SYSTEM_PROMPT;

export function buildFallbackVenusResponse(message: string): object {
  return {
    summary: "Venus AI is not configured. Please add your Groq API key in Settings to unlock full intelligence. Here's a placeholder response based on your query.",
    cards: [
      {
        type: "analysis",
        title: "Action Required",
        content: {
          points: [
            { label: "Status", value: "Groq API key not configured", sentiment: "negative" },
            { label: "Fix", value: "Go to Settings → Groq API Key and paste your key", sentiment: "neutral" },
            { label: "Get Key", value: "Visit console.groq.com to create a free API key", sentiment: "positive" },
          ],
        },
      },
    ],
  };
}

export function buildRippleFallback(eventTitle: string): object {
  return {
    analysis: `Causal analysis of "${eventTitle}" requires a configured Groq API key. Add your key in Settings to unlock AI-powered ripple analysis.`,
    causalChain: ["Event occurs", "First-order effects propagate", "Second-order consequences emerge", "Market equilibrium shifts"],
    affectedSectors: ["Technology", "Finance", "Markets"],
  };
}

export function buildAutopsyFallback(companyName: string): object {
  return {
    rootCause: `Deep autopsy of ${companyName} requires a configured Groq API key. Add your key in Settings.`,
    timeline: "Timeline analysis unavailable without AI configuration.",
    lessonsLearned: ["Configure your Groq API key to unlock full autopsy analysis", "Visit Settings to add your key"],
    causalChain: ["Root cause", "Compounding factors", "Critical failure point", "Collapse"],
    analogy: null,
  };
}
