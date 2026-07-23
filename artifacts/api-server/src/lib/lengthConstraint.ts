// Item 7: quantifiable constraint verification. Models can't reliably count
// characters/words from tokens — a stated "exactly 50 words" constraint is
// self-reported by the model today and is unreliable. This is the code-level
// ground truth check: parse a length constraint from the founder's OWN
// message (not the model's output), count the model's actual response in
// code, and — unlike the shadow-mode arithmeticCheck/groundedness checks —
// this one is live/blocking: ai.ts loops a bounded number of revision
// requests until the code-verified count actually satisfies the constraint,
// or gives up honestly after the bound.

export interface LengthConstraint {
  unit: "words" | "characters";
  operator: "exact" | "max";
  count: number;
}

// Matches things like "exactly 100 words", "under 280 characters", "at most
// 50 words", "within 40 words", "max 60 chars", or a bare "50-word post" /
// "280 characters". A bare number with no qualifier defaults to "exact" —
// stating a specific count at all reads as a target to hit, not a ceiling.
const LENGTH_CONSTRAINT_PATTERN = /\b(exactly|under|at most|no more than|within|max(?:imum)?)?\s*(\d+)\s*-?\s*(words?|characters?|chars?)\b/i;

export function parseLengthConstraint(userMessage: string): LengthConstraint | null {
  const match = LENGTH_CONSTRAINT_PATTERN.exec(userMessage);
  if (!match) return null;

  const qualifier = (match[1] || "").toLowerCase();
  const count = Number(match[2]);
  if (!Number.isFinite(count) || count <= 0) return null;

  const unit: LengthConstraint["unit"] = /char/i.test(match[3]) ? "characters" : "words";
  const operator: LengthConstraint["operator"] =
    /^(under|at most|no more than|within|max(imum)?)$/.test(qualifier) ? "max" : "exact";

  return { unit, operator, count };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface LengthCheckResult {
  ok: boolean;
  actual: number;
}

export function verifyLengthConstraint(text: string, constraint: LengthConstraint): LengthCheckResult {
  const actual = constraint.unit === "words" ? countWords(text) : text.length;
  const ok = constraint.operator === "exact" ? actual === constraint.count : actual <= constraint.count;
  return { ok, actual };
}

export function describeLengthConstraint(constraint: LengthConstraint): string {
  const noun = constraint.unit === "words" ? "words" : "characters";
  return constraint.operator === "exact" ? `exactly ${constraint.count} ${noun}` : `at most ${constraint.count} ${noun}`;
}
