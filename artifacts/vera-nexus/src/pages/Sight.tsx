import { useListReports, useReportSummary } from '@workspace/api-client-react';
import { useCategory } from '../lib/CategoryContext';
import { useState, useEffect, useCallback } from 'react';
import { getWatchlist, addTicker, removeTicker } from '../lib/watchlist';

interface StockQuote {
  symbol: string;
  price: number | null;
  change: string;
  changeRaw: number;
  positive: boolean;
  error?: boolean;
}

function useStockQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (symbols.length === 0) return;
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/api/stocks/quote?symbols=${symbols.join(',')}`);
      if (res.ok) setQuotes(await res.json());
    } catch {}
    setLoading(false);
  }, [symbols.join(',')]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 120_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return { quotes, loading, refetch: fetch_ };
}

const CATEGORY_COLORS: Record<string, string> = {
  technology: 'var(--indigo)',
  finance: 'var(--amber)',
  markets: 'var(--mint)',
  health: 'var(--red)',
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SightPage() {
  const { category } = useCategory();
  const { data: reports = [], isLoading } = useListReports({ category: category !== 'all' ? category : undefined } as any);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const summaryMutation = useReportSummary();

  const [watchlist, setWatchlist] = useState<string[]>(getWatchlist);
  const [addInput, setAddInput] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const { quotes, loading: quotesLoading } = useStockQuotes(watchlist);

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    setWatchlist(addTicker(addInput.trim()));
    setAddInput('');
    setShowAddInput(false);
  };

  const handleRemove = (ticker: string) => {
    setWatchlist(removeTicker(ticker));
  };

  const handleReportClick = (id: number) => {
    setSelectedReport(id);
    summaryMutation.mutate({ id });
  };

  return (
    <div className="flex h-full">
      {/* Center feed — Bloomberg terminal style */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--dim)] uppercase tracking-wider">
            {reports.length} intelligence reports · {category}
          </span>
          <span className="text-[10px] font-mono text-[var(--dim)]">
            ⬤ Causal Chain annotated
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="px-6 py-4 border-b border-[var(--border)] animate-pulse">
                <div className="h-3 bg-[var(--surface2)] rounded w-3/4 mb-2"></div>
                <div className="h-2.5 bg-[var(--surface2)] rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {reports.map((report, idx) => (
              <div
                key={report.id}
                onClick={() => handleReportClick(report.id)}
                className="group flex gap-4 px-6 py-4 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface2)] transition-colors"
              >
                {/* Index */}
                <div className="shrink-0 w-6 text-right text-[10px] font-mono text-[var(--dim)] pt-1">
                  {(idx + 1).toString().padStart(2, '0')}
                </div>

                {/* Category dot */}
                <div className="shrink-0 pt-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: CATEGORY_COLORS[report.category ?? 'technology'] ?? 'var(--indigo)' }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <h2 className="text-sm font-bold text-white leading-snug group-hover:text-[var(--indigo-light)] transition-colors line-clamp-1">
                      {report.title}
                    </h2>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-mono text-[var(--dim)]">{timeAgo(report.publishedAt)}</span>
                      <span className="text-[10px] font-mono bg-[var(--surface3)] text-[var(--dim)] px-1.5 py-0.5 rounded border border-[var(--border)] uppercase">
                        {report.source}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed mb-2">
                    {report.summary}
                  </p>

                  <div className="flex items-center gap-3">
                    {/* Causal Chain annotation badge — the differentiator */}
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--mint)] bg-[var(--mint)]/10 border border-[var(--mint)]/30 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--mint)] inline-block"></span>
                      Causal Chain
                    </span>

                    {report.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] font-mono text-[var(--dim)] uppercase">
                        {tag}
                      </span>
                    ))}

                    <span className="ml-auto text-[10px] text-[var(--indigo-light)] group-hover:underline font-mono">
                      AI Summary →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel — Watchlist */}
      <aside className="w-[220px] border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 overflow-y-auto">
        {/* Watchlist */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[var(--dim)] uppercase tracking-wider">Watchlist</h3>
            <button
              onClick={() => setShowAddInput(v => !v)}
              className="text-[10px] font-mono text-[var(--indigo-light)] hover:text-white transition-colors"
              title="Add ticker"
            >
              + Add
            </button>
          </div>

          {showAddInput && (
            <form onSubmit={handleAddTicker} className="mb-3 flex gap-1">
              <input
                autoFocus
                value={addInput}
                onChange={e => setAddInput(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={6}
                className="flex-1 bg-[var(--surface2)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)]"
              />
              <button type="submit" className="text-[10px] font-mono text-black bg-[var(--mint)] px-2 py-1 rounded">
                Add
              </button>
            </form>
          )}

          <div className="space-y-1">
            {watchlist.map(ticker => {
              const q = quotes.find(q => q.symbol === ticker);
              return (
                <div
                  key={ticker}
                  className="group flex items-center justify-between py-1.5 px-1 rounded hover:bg-[var(--surface2)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-bold text-white">{ticker}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {quotesLoading && !q ? (
                      <span className="text-[10px] font-mono text-[var(--dim)]">…</span>
                    ) : q ? (
                      <span className={`text-[10px] font-mono font-bold ${q.positive ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                        {q.change}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[var(--dim)]">—</span>
                    )}
                    <button
                      onClick={() => handleRemove(ticker)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--dim)] hover:text-[var(--red)] text-[10px] transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[9px] font-mono text-[var(--dim)] mt-3 leading-relaxed">
            Data: Yahoo Finance · cached 2min · US tickers
          </p>
        </div>

        {/* Macro Signals */}
        <MacroSignals />
      </aside>

      {/* AI Summary Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedReport(null)}></div>
          <div className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--border)] rounded-xl relative z-10 p-8 shadow-2xl animate-in zoom-in-95">
            <button onClick={() => setSelectedReport(null)} className="absolute top-4 right-4 text-[var(--muted)] hover:text-white text-xl">✕</button>

            {summaryMutation.isPending ? (
              <div className="py-20 flex flex-col items-center justify-center text-[var(--muted)]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--mint)] mb-4"></div>
                Generating AI Summary...
              </div>
            ) : summaryMutation.data ? (
              <div className="space-y-8">
                <div>
                  <div className="text-xs font-mono text-[var(--indigo-light)] mb-1 uppercase tracking-wider">
                    {reports.find(r => r.id === selectedReport)?.source} · AI Executive Summary
                  </div>
                  <h2 className="text-xl font-syne font-bold text-white mb-4">
                    {reports.find(r => r.id === selectedReport)?.title}
                  </h2>
                  <p className="text-[var(--text)] leading-relaxed">
                    {summaryMutation.data.summary}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-6 border-t border-[var(--border2)]">
                  <div>
                    <h3 className="text-xs font-mono text-[var(--mint)] mb-4 uppercase tracking-wider">Key Takeaways</h3>
                    <ul className="space-y-3">
                      {summaryMutation.data.keyTakeaways.map((point: string, i: number) => (
                        <li key={i} className="text-sm text-[var(--muted)] flex items-start gap-2">
                          <span className="text-[var(--mint)] mt-1">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {summaryMutation.data.causalImplications && (
                    <div className="bg-[var(--surface2)] p-5 rounded-lg border border-[var(--border)]">
                      <h3 className="text-xs font-mono text-[var(--amber)] mb-3 uppercase tracking-wider">Causal Implications</h3>
                      <p className="text-sm text-[var(--muted)] leading-relaxed">{summaryMutation.data.causalImplications}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function MacroSignals() {
  const [signals] = useState([
    { name: 'AI Index', change: '+4.2%', positive: true },
    { name: 'Compute ETF', change: '+1.8%', positive: true },
    { name: 'Policy Risk', change: 'High', positive: false, warn: true },
    { name: 'Safety Sentiment', change: '-12%', positive: false },
    { name: 'BTC', change: '+3.1%', positive: true },
    { name: 'S&P 500', change: '+0.6%', positive: true },
  ]);

  return (
    <div className="p-4 flex flex-col gap-1">
      <h3 className="text-xs font-bold text-[var(--dim)] uppercase tracking-wider mb-2">Macro Signals</h3>
      {signals.map(s => (
        <div key={s.name} className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-[var(--surface2)] transition-colors">
          <span className="text-xs text-[var(--muted)]">{s.name}</span>
          <span className={`text-[10px] font-mono font-bold ${
            (s as any).warn ? 'text-[var(--amber)]' : s.positive ? 'text-[var(--green)]' : 'text-[var(--red)]'
          }`}>
            {s.positive && !((s as any).warn) ? '' : !s.positive && !(s as any).warn ? '↓ ' : ''}{s.change}
          </span>
        </div>
      ))}
    </div>
  );
}
