// Generic web search helper. NOT specific to any topic, entity, or query shape —
// any route can hand this an arbitrary free-text query and get back a small set
// of source URLs plus scraped text snippets to ground an LLM answer with.
//
// Uses DuckDuckGo's HTML endpoint (no API key needed) for the search itself,
// then r.jina.ai as a lightweight readability proxy to pull page text. This is
// the same pattern already used in /ai/company-report — pulled out here so any
// route (in particular /ai/analyze) can reuse it for arbitrary topics, not just
// company lookups.

export interface WebSearchResult {
  query: string;
  sources: { url: string; snippet: string }[];
  // true if the search ran but returned nothing usable — callers should treat
  // this as "web search was attempted but came up empty," not as a hard error.
  empty: boolean;
}

const SEARCH_TIMEOUT_MS = 8000;
const PER_SOURCE_TIMEOUT_MS = 6000;
const MAX_SOURCES = 5;
const SNIPPET_CHAR_LIMIT = 3000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Runs a free-text web search and scrapes readable text from the top results.
 * Generic on purpose: the caller supplies whatever query fits their use case
 * (a company name, a product, a concept, a full user question — anything).
 * Never throws; a failed search just comes back with empty:true so the caller
 * can decide how to proceed (e.g. answer from general knowledge instead).
 */
export async function webSearch(query: string): Promise<WebSearchResult> {
  try {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const { signal, cancel } = withTimeout(SEARCH_TIMEOUT_MS);
    let searchHtml = "";
    try {
      const searchResponse = await fetch(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
        signal,
      });
      searchHtml = await searchResponse.text();
    } finally {
      cancel();
    }

    const resultUrls = Array.from(
      new Set((searchHtml.match(/uddg="([^"]+)"/g) ?? []).map((m) => m.slice(6, -1)).filter(Boolean)),
    ).slice(0, MAX_SOURCES);

    if (resultUrls.length === 0) {
      return { query, sources: [], empty: true };
    }

    const sources = await Promise.all(
      resultUrls.map(async (rawUrl) => {
        try {
          const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
          const parsed = new URL(target);
          const { signal: srcSignal, cancel: srcCancel } = withTimeout(PER_SOURCE_TIMEOUT_MS);
          try {
            const articleResponse = await fetch(
              `https://r.jina.ai/http://${parsed.host}${parsed.pathname}${parsed.search}`,
              { headers: { "User-Agent": "Mozilla/5.0" }, signal: srcSignal },
            );
            const text = await articleResponse.text();
            return text ? { url: target, snippet: text.slice(0, SNIPPET_CHAR_LIMIT) } : null;
          } finally {
            srcCancel();
          }
        } catch {
          // one bad source should never take down the whole search
          return null;
        }
      }),
    );

    const usable = sources.filter((s): s is { url: string; snippet: string } => s !== null && s.snippet.trim().length > 0);
    return { query, sources: usable, empty: usable.length === 0 };
  } catch {
    // network failure, DNS issue, etc — search itself failed entirely
    return { query, sources: [], empty: true };
  }
}

/**
 * Formats search results into a prompt-ready block. Generic — works whether
 * the underlying query was about a company, a consumer app, a concept, or
 * anything else the retrieval dataset has no precedent for.
 */
export function formatWebSearchForPrompt(result: WebSearchResult): string {
  if (result.empty || result.sources.length === 0) {
    return `WEB SEARCH: A live web search was attempted for "${result.query}" but returned no usable results.`;
  }
  const body = result.sources
    .map((s, i) => `[Source ${i + 1}: ${s.url}]\n${s.snippet}`)
    .join("\n\n");
  return `WEB SEARCH RESULTS (live, retrieved just now for "${result.query}"):\n\n${body}`;
}
