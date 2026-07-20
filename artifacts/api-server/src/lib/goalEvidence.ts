// This file is the actual mechanism behind the "navigation-line, not a
// progress bar" requirement: Origin(0) ──────◉────── Target(1), where the
// marker's position is a running sum over resolved evidence, never a
// fraction of (checked off / total) sub-tasks. A roadmap item's value is in
// what it proves or disproves about whether the current approach can reach
// the goal — NOT in being marked done — so the score only moves when a
// decision/roadmap card tied to the goal's chat gets a real outcome
// reported against it.
//
// Deliberately asymmetric, per the product spec: success moves the marker
// significantly; failure barely moves it forward (or can move it backward)
// rather than just "not counting" — because a failed attempt is itself
// evidence, often evidence the current approach is wrong, which is exactly
// what should make the path bend rather than stay a straight line with a
// moving dot. "mixed" sits between the two. There is no per-task credit for
// merely attempting something with no reported outcome yet — only resolved
// evidence moves the marker at all.
//
// Values aren't a percentage and are NOT clamped to [0, 1] on write — the UI
// (see the goals API's derived `progress` field) is responsible for mapping
// the raw evidenceScore onto a bounded visual position and for flagging
// "at risk" when the score is lagging badly relative to time elapsed against
// the deadline. That derivation is read-time and disposable; this file only
// owns the raw, durable score.
export type OutcomeSentiment = "positive" | "negative" | "mixed" | null | undefined;

// How much a single resolved card moves the score, on a scale where 1.0 is
// "fully closes the goal on its own" (rare — most goals need several pieces
// of positive evidence to actually reach Target). Tuned so:
//  - A handful of genuine wins visibly advances the marker without one lucky
//    card instantly finishing the goal.
//  - A failure isn't free to ignore (small negative pull, so a founder can
//    SEE the path bend backward) but doesn't wipe out prior progress from a
//    single bad result, since one negative data point rarely invalidates
//    everything learned before it.
const SENTIMENT_DELTA: Record<"positive" | "negative" | "mixed", number> = {
  positive: 0.18,
  mixed: 0.04,
  negative: -0.05,
};

// Given the goal's current raw score and a newly-resolved card's sentiment,
// return the new raw score. No sentiment (null/undefined) means the founder
// reported an outcome without a clear positive/negative/mixed read — that's
// real ground truth for Decision Memory retrieval, but not something this
// function can weight, so it returns the score unchanged.
export function applyResolvedEvidence(currentScore: number, sentiment: OutcomeSentiment): number {
  if (!sentiment) return currentScore;
  const delta = SENTIMENT_DELTA[sentiment];
  if (delta === undefined) return currentScore;
  return currentScore + delta;
}

export type GoalRiskLevel = "on_track" | "at_risk" | "off_track";

// Read-time judgment, never stored: compares how far along the evidence
// score is against how much of the goal's time budget has elapsed. A goal
// can have plenty of resolved cards and still be at_risk if none of them
// were positive — this is deliberately NOT "have they done N things," it's
// "does the evidence so far suggest this will land by the deadline."
export function assessGoalRisk(params: {
  evidenceScore: number;
  createdAt: Date;
  deadline: Date;
  now?: Date;
}): GoalRiskLevel {
  const now = params.now ?? new Date();
  const totalMs = params.deadline.getTime() - params.createdAt.getTime();
  const elapsedMs = now.getTime() - params.createdAt.getTime();

  // Deadline already passed with the goal still short of Target.
  if (elapsedMs >= totalMs && params.evidenceScore < 1) {
    return params.evidenceScore <= 0 ? "off_track" : "at_risk";
  }

  const timeFraction = totalMs > 0 ? Math.max(0, Math.min(1, elapsedMs / totalMs)) : 0;
  // Evidence "should" be at least roughly proportional to time elapsed for
  // a goal that's on track — a generous allowance (evidence only needs to
  // be at 60% of the time-elapsed fraction) since most real progress arrives
  // in bursts late in a push, not evenly, and this shouldn't cry wolf on
  // every ordinary lull.
  const expectedFloor = timeFraction * 0.6;

  if (params.evidenceScore < 0) return "off_track";
  if (params.evidenceScore + 0.001 < expectedFloor - 0.25) return "off_track";
  if (params.evidenceScore + 0.001 < expectedFloor) return "at_risk";
  return "on_track";
}

// Maps the raw, unbounded evidenceScore onto a [0, 1] visual position for
// the Origin ──◉── Target line, without ever mutating or clamping the
// stored score itself. Uses a soft compression near 1 (instead of a hard
// clamp) so a goal that's overshot still reads as "essentially at Target"
// rather than looking identical to one that landed exactly on it, and so a
// score that dips negative after a failure visibly sits left of Origin
// instead of being floored back to 0 and hiding that the path bent.
export function evidenceScoreToPosition(evidenceScore: number): number {
  if (evidenceScore >= 1) return 1 - 0.05 * Math.exp(-(evidenceScore - 1));
  if (evidenceScore <= 0) return 0.05 * Math.exp(evidenceScore) - 0.05;
  return evidenceScore;
}
