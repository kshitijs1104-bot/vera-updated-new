// Precedent-vs-precedent contradiction (see confidence.ts) only catches
// disagreement in third-party evidence. It can't catch a founder
// contradicting themselves within one conversation (e.g. "churn is up but
// so is our NPS") — that requires the model to expose which tracked
// metrics it was explicitly told a direction for (see the extractedFacts
// prompt addition in groq.ts), then checking those against this table.
//
// Deliberately small and precision-favoring: a noisy rules table that
// flags things founders can trivially explain away is worse than no rules
// table at all. Ship additions only once shadow-mode logs (see ai.ts's
// [factConflict] logging) show a real pattern worth tracking, not on
// hunches.

export type TrackedMetric = "churn" | "nps" | "growth" | "retention" | "headcount" | "revenue" | "cac" | "ltv";
export type MetricDirection = "up" | "down" | "flat";

export interface ExtractedFact {
  metric: TrackedMetric;
  direction: MetricDirection;
}

export const TRACKED_METRICS: TrackedMetric[] = ["churn", "nps", "growth", "retention", "headcount", "revenue", "cac", "ltv"];

interface FactConflictRule {
  id: string;
  metricA: TrackedMetric;
  directionA: MetricDirection;
  metricB: TrackedMetric;
  directionB: MetricDirection[];
  description: string;
}

export const FACT_CONFLICT_RULES: FactConflictRule[] = [
  {
    id: "churn-up-nps-up",
    metricA: "churn",
    directionA: "up",
    metricB: "nps",
    directionB: ["up"],
    description: "Churn is rising while NPS is also rising — the NPS sample may be excluding the customers who are actually leaving.",
  },
  {
    id: "growth-up-retention-down",
    metricA: "growth",
    directionA: "up",
    metricB: "retention",
    directionB: ["down"],
    description: "Growth is up while retention is down — new-customer growth may be masking a leaky bucket rather than solving it.",
  },
  {
    id: "headcount-up-revenue-flat-or-down",
    metricA: "headcount",
    directionA: "up",
    metricB: "revenue",
    directionB: ["flat", "down"],
    description: "Headcount is scaling up while revenue is flat or down — cost structure is growing without a matching top line.",
  },
  {
    id: "cac-up-ltv-down",
    metricA: "cac",
    directionA: "up",
    metricB: "ltv",
    directionB: ["down"],
    description: "CAC is rising while LTV is falling — unit economics are moving the wrong way on both sides at once.",
  },
];

export interface FactConflict {
  ruleId: string;
  description: string;
  facts: ExtractedFact[];
}

// Order-independent: a rule matches regardless of which metric the founder
// mentioned first. Facts must be exact — this never infers a direction that
// wasn't explicitly extracted (see the extractedFacts prompt instruction).
export function detectFactConflicts(facts: ExtractedFact[]): FactConflict[] {
  if (!Array.isArray(facts) || facts.length < 2) return [];

  const conflicts: FactConflict[] = [];
  for (const rule of FACT_CONFLICT_RULES) {
    const factA = facts.find((f) => f.metric === rule.metricA && f.direction === rule.directionA);
    const factB = facts.find((f) => f.metric === rule.metricB && rule.directionB.includes(f.direction));
    if (factA && factB) {
      conflicts.push({ ruleId: rule.id, description: rule.description, facts: [factA, factB] });
    }
  }
  return conflicts;
}
