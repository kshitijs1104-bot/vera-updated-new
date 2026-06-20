import { useState } from 'react';
import { useNewsArticles, type NewsArticle } from '../../lib/sight-data';

interface NewsFeedProps {
  category: string;
  onArticleClick: (article: NewsArticle) => void;
}

const TAG_STYLES: Record<string, string> = {
  markets:  'bg-[rgba(91,79,232,0.14)] text-[var(--indigo-light)] border-[rgba(91,79,232,0.3)]',
  macro:    'bg-[rgba(0,229,176,0.14)] text-[var(--mint)] border-[rgba(0,229,176,0.3)]',
  earnings: 'bg-[rgba(240,168,58,0.14)] text-[var(--amber)] border-[rgba(240,168,58,0.3)]',
  global:   'bg-[rgba(240,94,94,0.14)] text-[var(--red)] border-[rgba(240,94,94,0.3)]',
  ipo:      'bg-[rgba(167,139,250,0.14)] text-[#b9a4ff] border-[rgba(167,139,250,0.3)]',
};

const POSITIVE_RE = /beat|easing|strong|recovery|positive|up|gain|rally|no change|lower|resilient|green/i;
const NEGATIVE_RE = /cautious|weak|slow|drag|down|fall|miss|loss|pressure|softer|negative|risk/i;

// Derive a sentiment signal from the article's real stat data — no fabricated values.
function deriveSignal(article: NewsArticle): { label: string; value: string; tone: 'pos' | 'neg' | 'neu' } {
  const stat =
    article.stats.find(s => /sentiment|guidance|trend|expected|move|growth/i.test(s.label)) ||
    article.stats[0];
  const blob = `${stat?.value ?? ''} ${article.blurb}`;
  let tone: 'pos' | 'neg' | 'neu' = 'neu';
  if (POSITIVE_RE.test(blob) && !NEGATIVE_RE.test(stat?.value ?? '')) tone = 'pos';
  if (NEGATIVE_RE.test(stat?.value ?? '')) tone = 'neg';
  return { label: stat?.label ?? 'Signal', value: stat?.value ?? '—', tone };
}

const TONE_STYLES: Record<string, string> = {
  pos: 'text-[var(--mint)]',
  neg: 'text-[var(--red)]',
  neu: 'text-[var(--muted)]',
};

const TONE_GLYPH: Record<string, string> = { pos: '▲', neg: '▼', neu: '■' };

export function NewsFeed({ category, onArticleClick }: NewsFeedProps) {
  const { data: articles = [], isLoading } = useNewsArticles(category === 'all' ? undefined : category);
  const [visibleCount, setVisibleCount] = useState(12);

  const visible = articles.slice(0, visibleCount);
  const hasMore = articles.length > visibleCount;

  if (isLoading) {
    return (
      <div className="flex flex-col">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-[58px] border-b border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] rounded-[10px] overflow-hidden bg-[var(--surface)]">
      {/* Column header — terminal style */}
      <div className="hidden md:grid grid-cols-[80px_1fr_150px_120px] items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)] font-mono text-[10px] uppercase tracking-[1px] text-[var(--dim)]">
        <span>Sector</span>
        <span>Headline</span>
        <span>Source · Time</span>
        <span className="text-right">Signal</span>
      </div>

      <div className="flex flex-col">
        {visible.map(article => {
          const tagStyle = TAG_STYLES[article.cat] || TAG_STYLES.markets;
          const signal = deriveSignal(article);
          return (
            <button
              key={article.id}
              onClick={() => onArticleClick(article)}
              className="grid grid-cols-[1fr] md:grid-cols-[80px_1fr_150px_120px] items-center gap-2 md:gap-3 px-4 py-[11px] border-b border-[var(--border)] last:border-b-0 text-left transition-colors hover:bg-[var(--surface2)] group"
            >
              {/* Sector tag */}
              <span className={`inline-flex items-center justify-center w-fit font-mono text-[9.5px] font-semibold tracking-[0.5px] uppercase px-[7px] py-[3px] rounded border ${tagStyle}`}>
                {article.tagLabel}
              </span>

              {/* Headline + one-line blurb */}
              <div className="min-w-0">
                <div className="font-syne text-[13.5px] font-semibold leading-[1.3] text-[var(--text)] truncate group-hover:text-white">
                  {article.title}
                </div>
                <div className="text-[11px] text-[var(--dim)] truncate leading-[1.4] mt-[1px]">
                  {article.blurb}
                </div>
              </div>

              {/* Source · time */}
              <div className="hidden md:flex items-center gap-[6px] font-mono text-[10.5px] text-[var(--muted)] whitespace-nowrap">
                <span className="truncate">{article.source}</span>
                <span className="w-[3px] h-[3px] rounded-full bg-[var(--dim)] shrink-0" />
                <span className="text-[var(--dim)] shrink-0">{article.time}</span>
              </div>

              {/* Signal chip */}
              <div className="hidden md:flex items-center justify-end gap-[6px] font-mono text-[10.5px] whitespace-nowrap">
                <span className={`${TONE_STYLES[signal.tone]} text-[9px]`}>{TONE_GLYPH[signal.tone]}</span>
                <span className="text-[var(--dim)]">{signal.label}</span>
                <span className={`font-semibold ${TONE_STYLES[signal.tone]}`}>{signal.value}</span>
              </div>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount(v => v + 8)}
          className="w-full text-center py-[10px] border-t border-[var(--border)] text-[var(--muted)] text-[11.5px] font-mono cursor-pointer transition-colors hover:bg-[var(--surface2)] hover:text-[var(--indigo-light)]"
        >
          Load more — {articles.length - visibleCount} remaining ↓
        </button>
      )}
    </div>
  );
}
