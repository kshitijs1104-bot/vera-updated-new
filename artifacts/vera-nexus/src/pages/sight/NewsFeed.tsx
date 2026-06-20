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

const TAG_BORDER_COLOR: Record<string, string> = {
  markets:  'var(--indigo-light)',
  macro:    'var(--mint)',
  earnings: 'var(--amber)',
  global:   'var(--red)',
  ipo:      '#b9a4ff',
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

const TONE_COLOR: Record<string, string> = {
  pos: 'var(--mint)',
  neg: 'var(--red)',
  neu: 'var(--dim)',
};

// Generate a placeholder image URL based on category for visual distinction
function getPlaceholderImage(category: string): string {
  const categoryImages: Record<string, string> = {
    markets: 'https://images.unsplash.com/photo-1611974789855-9e51b6b7d4b1?w=600&h=400&fit=crop',
    macro: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=400&fit=crop',
    earnings: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop',
    global: 'https://images.unsplash.com/photo-1526628653108-3ec4f5b47dda?w=600&h=400&fit=crop',
    ipo: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop',
  };
  return categoryImages[category] || 'https://images.unsplash.com/photo-1611974789855-9e51b6b7d4b1?w=600&h=400&fit=crop';
}

export function NewsFeed({ category, onArticleClick }: NewsFeedProps) {
  const { data: articles = [], isLoading } = useNewsArticles(category === 'all' ? undefined : category);
  const [visibleCount, setVisibleCount] = useState(15);

  const visible = articles.slice(0, visibleCount);
  const hasMore = articles.length > visibleCount;
  const [hero, ...rest] = visible;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-[120px] border border-[var(--border)] bg-[var(--surface)] animate-pulse rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero card — top story with large image and prominent treatment */}
      {hero && (
        <button
          onClick={() => onArticleClick(hero)}
          className="w-full group relative overflow-hidden rounded-lg border border-[var(--border)] transition-all hover:border-[var(--indigo-light)]/50 hover:shadow-lg hover:shadow-[var(--indigo)]/10"
        >
          <div className="grid grid-cols-[1fr_280px] gap-4 bg-[var(--surface)]">
            {/* Left: text content */}
            <div className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center justify-center font-mono text-[9.5px] font-semibold tracking-[0.5px] uppercase px-[7px] py-[3px] rounded border ${TAG_STYLES[hero.cat] || TAG_STYLES.markets}`}>
                    {hero.tagLabel}
                  </span>
                </div>
                <h3 className="font-syne text-lg font-bold text-white leading-[1.3] mb-2 group-hover:text-[var(--indigo-light)] transition-colors">
                  {hero.title}
                </h3>
                <p className="text-sm text-[var(--muted)] leading-[1.4] line-clamp-2">
                  {hero.blurb}
                </p>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs text-[var(--dim)] mt-3">
                <span>{hero.source}</span>
                <span className="w-px h-3 bg-[var(--border)]"></span>
                <span>{hero.time}</span>
              </div>
            </div>

            {/* Right: image */}
            <div className="relative w-full h-[200px] overflow-hidden bg-gradient-to-br from-[var(--surface2)] to-[var(--surface3)]">
              <img
                src={getPlaceholderImage(hero.cat)}
                alt={hero.title}
                className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                crossOrigin="anonymous"
              />
            </div>
          </div>

          {/* Sentiment indicator: colored left border with signal data */}
          {(() => {
            const signal = deriveSignal(hero);
            return (
              <div
                className="absolute top-0 left-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                style={{ backgroundColor: TONE_COLOR[signal.tone] }}
              />
            );
          })()}
        </button>
      )}

      {/* Rest of feed: asymmetric grid layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rest.map(article => {
          const tagStyle = TAG_STYLES[article.cat] || TAG_STYLES.markets;
          const signal = deriveSignal(article);
          const borderColor = TAG_BORDER_COLOR[article.cat] || TAG_BORDER_COLOR.markets;

          return (
            <button
              key={article.id}
              onClick={() => onArticleClick(article)}
              className="group relative overflow-hidden rounded-lg border border-[var(--border)] transition-all hover:border-[var(--indigo-light)]/40 hover:bg-[var(--surface2)] p-4 text-left flex flex-col"
            >
              {/* Sentiment left border indicator */}
              <div
                className="absolute top-0 left-0 bottom-0 w-0.5 transition-all group-hover:w-1"
                style={{ backgroundColor: TONE_COLOR[signal.tone] }}
              />

              {/* Content with padding to make room for border indicator */}
              <div className="pl-3 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center justify-center font-mono text-[8.5px] font-semibold tracking-[0.5px] uppercase px-[6px] py-[2px] rounded border ${tagStyle}`}>
                    {article.tagLabel}
                  </span>
                </div>

                <h4 className="font-syne font-semibold text-[13px] leading-[1.3] text-white mb-1 group-hover:text-[var(--indigo-light)] transition-colors line-clamp-2">
                  {article.title}
                </h4>

                <p className="text-[11px] text-[var(--dim)] leading-[1.4] line-clamp-2 mb-3">
                  {article.blurb}
                </p>

                {/* Footer: source, time, signal */}
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <div className="flex items-center gap-2 text-[var(--muted)]">
                    <span className="truncate">{article.source}</span>
                    <span className="w-[2px] h-[2px] rounded-full bg-[var(--dim)] shrink-0" />
                    <span className="shrink-0">{article.time}</span>
                  </div>
                  <div className={`flex items-center gap-1 whitespace-nowrap font-semibold ${TONE_STYLES[signal.tone]}`}>
                    <span className="text-[9px]">{signal.label}</span>
                    <span>{signal.value}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount(v => v + 12)}
          className="w-full text-center py-[10px] border border-[var(--border)] rounded-lg text-[var(--muted)] text-[11.5px] font-mono cursor-pointer transition-colors hover:bg-[var(--surface2)] hover:text-[var(--indigo-light)] hover:border-[var(--indigo-light)]/40"
        >
          Load more — {articles.length - visibleCount} remaining ↓
        </button>
      )}
    </div>
  );
}
