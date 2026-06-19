import { useListReports, useReportSummary } from '@workspace/api-client-react';
import { useCategory } from '../lib/CategoryContext';
import { useState } from 'react';

export function SightPage() {
  const { category } = useCategory();
  const { data: reports = [], isLoading } = useListReports({ category: category !== 'all' ? category : undefined } as any);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);

  const summaryMutation = useReportSummary();

  const handleReportClick = (id: number) => {
    setSelectedReport(id);
    summaryMutation.mutate({ id });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8 border-b border-[var(--border)] pb-4">
        <h1 className="text-sm font-mono text-[var(--muted)]">{reports.length} intelligence reports · {category}</h1>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-64 bg-[var(--surface2)] rounded-lg animate-pulse"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {reports.map(report => (
            <div 
              key={report.id}
              onClick={() => handleReportClick(report.id)}
              className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg overflow-hidden group cursor-pointer hover:border-[var(--indigo)] transition-colors flex flex-col h-full"
            >
              <div className="h-48 bg-[var(--surface3)] relative overflow-hidden">
                {report.imageUrl ? (
                  <img src={report.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[var(--surface3)] to-[var(--surface)] border-b border-[var(--border)]"></div>
                )}
                <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur text-xs font-mono px-2 py-1 border border-white/10 rounded text-white">
                  {report.source}
                </div>
                <div className="absolute bottom-3 right-3 text-xs font-mono text-white/70 bg-black/60 px-2 py-1 rounded">
                  {new Date(report.publishedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h2 className="text-xl font-syne font-bold text-white mb-3 group-hover:text-[var(--indigo-light)] transition-colors line-clamp-2">
                  {report.title}
                </h2>
                <p className="text-sm text-[var(--muted)] line-clamp-3 leading-relaxed mb-4">
                  {report.summary}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  {report.tags?.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] uppercase font-mono px-2 py-1 bg-[var(--surface3)] text-[var(--dim)] rounded border border-[var(--border)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
                  <h3 className="text-sm font-mono text-[var(--indigo-light)] mb-3 uppercase tracking-wider">AI Executive Summary</h3>
                  <p className="text-lg text-[var(--text)] leading-relaxed font-medium">
                    {summaryMutation.data.summary}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-8 pt-6 border-t border-[var(--border2)]">
                  <div>
                    <h3 className="text-xs font-mono text-[var(--mint)] mb-4 uppercase tracking-wider">Key Takeaways</h3>
                    <ul className="space-y-3">
                      {summaryMutation.data.keyTakeaways.map((point, i) => (
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
                      <p className="text-sm text-[var(--muted)] leading-relaxed">
                        {summaryMutation.data.causalImplications}
                      </p>
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
