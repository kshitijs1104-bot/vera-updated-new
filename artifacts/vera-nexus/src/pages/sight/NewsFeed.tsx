import { useState } from 'react';
import { useNewsArticles, type NewsArticle } from '../../lib/sight-data';
import { HeroCard, NewsCard } from './NewsCard';

interface NewsFeedProps {
  category: string;
  onArticleClick: (article: NewsArticle) => void;
}

const SECTION_LABEL_STYLE = `
  flex items-center gap-[10px] font-mono text-[11px] text-[var(--dim)] tracking-[1.2px] uppercase my-[10px] -mb-0.5
  after:content-[''] after:flex-1 after:h-px after:bg-[var(--border)]
`;

export function NewsFeed({ category, onArticleClick }: NewsFeedProps) {
  const { data: articles = [], isLoading } = useNewsArticles(category === 'all' ? undefined : category);
  const [visibleCount, setVisibleCount] = useState(8);

  const hero = articles.find(a => a.hero);
  const rest = articles.filter(a => !a.hero).slice(0, visibleCount - 1);
  const hasMore = articles.filter(a => !a.hero).length > visibleCount - 1;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-[280px] bg-[var(--surface2)] rounded-[14px] animate-pulse" />
        <div className="grid grid-cols-2 gap-[14px] max-[640px]:grid-cols-1">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-[120px] bg-[var(--surface2)] rounded-[14px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes sight-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex flex-col gap-4">
        {/* Hero */}
        {hero && <HeroCard article={hero} onClick={() => onArticleClick(hero)} />}

        {/* Grid */}
        {rest.length > 0 && (
          <>
            <div className={SECTION_LABEL_STYLE}>Latest</div>
            <div className="grid grid-cols-2 gap-[14px] max-[640px]:grid-cols-1">
              {rest.map((article, i) => (
                <NewsCard
                  key={article.id}
                  article={article}
                  onClick={() => onArticleClick(article)}
                  animDelay={0.05 + i * 0.05}
                />
              ))}
            </div>
          </>
        )}

        {hasMore && (
          <button
            onClick={() => setVisibleCount(v => v + 6)}
            className="text-center py-4 mt-[6px] border border-dashed border-[var(--border)] rounded-[14px] text-[var(--muted)] text-[12.5px] font-mono cursor-pointer transition-all hover:border-[var(--indigo)] hover:text-[var(--indigo-light)] w-full"
          >
            Load more stories →
          </button>
        )}
      </div>
    </>
  );
}
