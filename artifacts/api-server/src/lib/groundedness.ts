// Shadow-mode only (see ai.ts's [groundedness] logging) — narrow, cheap
// first pass at catching fabrication: reject/flag outputs referencing a
// currency absent from the actual input, which is exactly the reported
// case (₹-only business context, response fabricated "$2M"). Deliberately
// NOT general entity/figure verification (invented company names,
// unsourced numbers) — that needs NLP or a second LLM call, which would
// fight the token-budget work this session has already spent two commits
// on. Broader checking is a scoped follow-up once this narrow version is
// validated against real traffic, not part of this pass.
//
// Stays shadow-mode (logged, never attached to the response) because it's
// new and unvalidated — an auto-reject/flag on a false positive would
// itself become a new "good answer blocked" bug.

const CURRENCY_PATTERN = /[₹$€£¥]|\b(?:INR|USD|EUR|GBP|JPY)\b/gi;

function normalizeCurrency(raw: string): string {
  const c = raw.toUpperCase();
  if (c === "₹" || c === "INR") return "INR";
  if (c === "$" || c === "USD") return "USD";
  if (c === "€" || c === "EUR") return "EUR";
  if (c === "£" || c === "GBP") return "GBP";
  if (c === "¥" || c === "JPY") return "JPY";
  return c;
}

function extractCurrencyMarkers(text: string): Set<string> {
  const markers = new Set<string>();
  for (const match of text.matchAll(CURRENCY_PATTERN)) {
    markers.add(normalizeCurrency(match[0]));
  }
  return markers;
}

// responseStrings: every individual string field from the response (see
// responseText.ts's collectResponseStrings) — joined here since, unlike
// the arithmetic check, this doesn't need same-passage proximity: a
// fabricated currency is a problem wherever in the response it appears.
export function detectUngroundedCurrency(responseStrings: string[], groundingText: string): string[] {
  const responseCurrencies = extractCurrencyMarkers(responseStrings.join(" "));
  if (responseCurrencies.size === 0) return [];
  const groundingCurrencies = extractCurrencyMarkers(groundingText);
  return [...responseCurrencies].filter((c) => !groundingCurrencies.has(c));
}
