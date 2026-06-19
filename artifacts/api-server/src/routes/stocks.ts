import { Router } from "express";

const router = Router();

interface QuoteData {
  symbol: string;
  price: number | null;
  change: string;
  changeRaw: number;
  positive: boolean;
  error?: boolean;
}

const cache = new Map<string, { data: QuoteData; ts: number }>();
const CACHE_TTL_MS = 120_000;

async function fetchYahooQuote(symbol: string): Promise<QuoteData> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

    const json: any = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error("No meta in response");

    const price: number = meta.regularMarketPrice ?? null;
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changeRaw = prevClose && price ? price - prevClose : 0;
    const changePct = prevClose ? (changeRaw / prevClose) * 100 : 0;
    const positive = changeRaw >= 0;
    const change = `${positive ? '+' : ''}${changePct.toFixed(2)}%`;

    const data: QuoteData = { symbol: symbol.toUpperCase(), price, change, changeRaw, positive };
    cache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch {
    const fallback: QuoteData = {
      symbol: symbol.toUpperCase(),
      price: null,
      change: "—",
      changeRaw: 0,
      positive: true,
      error: true,
    };
    cache.set(symbol, { data: fallback, ts: Date.now() - CACHE_TTL_MS + 15_000 });
    return fallback;
  }
}

router.get("/stocks/quote", async (req, res) => {
  const raw = req.query.symbols;
  if (!raw || typeof raw !== "string") {
    res.status(400).json({ error: "symbols query param required" });
    return;
  }

  const symbols = raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10);

  const results = await Promise.all(symbols.map(fetchYahooQuote));
  res.json(results);
});

export default router;
