// Ships live (see plan Context — pure math, no real false-positive risk
// once two mentions are correctly paired, unlike groundedness.ts's
// unvalidated currency-mismatch heuristic, which stays shadow-mode).
// Catches exactly the reported case: a monthly figure and a "quarterly"
// figure in the same passage where the quarterly one is actually the
// annual figure (×12) mislabeled, or any other period-multiplier mismatch
// (month->quarter should be ×3, month->year ×12, quarter->year ×4).
//
// Deliberately pairs mentions only WITHIN the same string (never across
// unrelated card fields) — same precision-favoring stance as
// factConflicts.ts: a false positive here would flag a perfectly correct
// response, which is a worse outcome than missing a real error the first
// pass doesn't catch.

export interface ArithmeticIssue {
  description: string;
  mentionA: string;
  mentionB: string;
}

type Period = "month" | "quarter" | "year";

interface AmountMention {
  raw: string;
  currency: string;
  value: number;
  period: Period;
}

// Matches "₹1.2L/mo", "$2,000/month", "14.4L per quarter", "₹1L/yr", etc.
// Requires an explicit period marker — a bare currency amount with no
// period is out of scope for this check (nothing to cross-check it against).
const AMOUNT_PATTERN = /([₹$€£¥]|\b(?:INR|USD|EUR|GBP|JPY)\b)\s?([\d,]+(?:\.\d+)?)\s?(lakhs?|crores?|cr|l|k|mn|million|m)?\s?(?:\/|per)\s?(mo|month|monthly|qtr|quarter|quarterly|yr|year|annual|annually|annum)\b/gi;

function normalizeCurrency(raw: string): string {
  const c = raw.toUpperCase();
  if (c === "₹" || c === "INR") return "INR";
  if (c === "$" || c === "USD") return "USD";
  if (c === "€" || c === "EUR") return "EUR";
  if (c === "£" || c === "GBP") return "GBP";
  if (c === "¥" || c === "JPY") return "JPY";
  return c;
}

// Indian numbering (Lakh/Crore) alongside K/M — the exact reported case
// used Lakh notation ("₹1.2L/mo"), so this has to be understood, not just
// plain-number formats.
function unitMultiplier(suffix: string | undefined): number {
  if (!suffix) return 1;
  const s = suffix.toLowerCase();
  if (s.startsWith("lakh") || s === "l") return 100_000;
  if (s.startsWith("crore") || s === "cr") return 10_000_000;
  if (s === "k") return 1_000;
  if (s === "m" || s === "mn" || s.startsWith("million")) return 1_000_000;
  return 1;
}

function normalizePeriod(raw: string): Period | null {
  const p = raw.toLowerCase();
  if (p.startsWith("mo")) return "month";
  if (p.startsWith("qtr") || p.startsWith("quarter")) return "quarter";
  if (p.startsWith("yr") || p.startsWith("year") || p.startsWith("annual") || p === "annum") return "year";
  return null;
}

const PERIOD_MONTHS: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

function parseMentions(text: string): AmountMention[] {
  const mentions: AmountMention[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const [raw, currencyRaw, numStr, unitSuffix, periodRaw] = match;
    const period = normalizePeriod(periodRaw);
    if (!period) continue;
    const value = Number(numStr.replace(/,/g, "")) * unitMultiplier(unitSuffix);
    if (!Number.isFinite(value) || value <= 0) continue;
    mentions.push({ raw, currency: normalizeCurrency(currencyRaw), value, period });
  }
  return mentions;
}

// How far the stated larger-period figure may drift from the expected
// conversion before it's flagged — generous enough to absorb legitimate
// rounding ("roughly 3.5L/quarter" for a 1.2L/mo base), not so generous it
// misses a real multiplier mistake (a ×12-instead-of-×3 error is a 4x
// discrepancy, nowhere near this tolerance).
const TOLERANCE = 0.1;

export function checkArithmeticConsistency(text: string): ArithmeticIssue[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const mentions = parseMentions(text);
  const issues: ArithmeticIssue[] = [];

  for (let i = 0; i < mentions.length; i++) {
    for (let j = i + 1; j < mentions.length; j++) {
      const a = mentions[i];
      const b = mentions[j];
      if (a.currency !== b.currency || a.period === b.period) continue;

      const [smaller, larger] = PERIOD_MONTHS[a.period] < PERIOD_MONTHS[b.period] ? [a, b] : [b, a];
      const expectedLarger = smaller.value * (PERIOD_MONTHS[larger.period] / PERIOD_MONTHS[smaller.period]);
      const ratio = larger.value / expectedLarger;

      if (ratio < 1 - TOLERANCE || ratio > 1 + TOLERANCE) {
        issues.push({
          description: `${smaller.raw} (${smaller.period}) implies ${larger.period} of ~${Math.round(expectedLarger).toLocaleString()}, but the response states ${larger.raw}.`,
          mentionA: smaller.raw,
          mentionB: larger.raw,
        });
      }
    }
  }

  return issues;
}
