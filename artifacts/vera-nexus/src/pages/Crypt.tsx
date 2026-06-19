import { useListCompanies, useCompanyAutopsy } from '@workspace/api-client-react';
import { useCategory } from '../lib/CategoryContext';
import { useState } from 'react';

export function CryptPage() {
  const { category } = useCategory();
  const { data: companies = [], isLoading } = useListCompanies({ category: category !== 'all' ? category : undefined } as any);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const autopsyMutation = useCompanyAutopsy();

  const handleAutopsy = (id: number) => {
    setSelectedCompanyId(id);
    autopsyMutation.mutate({ id });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-10 text-center py-10 border-b border-[var(--border2)] bg-gradient-to-b from-transparent to-[var(--surface2)]/30 rounded-t-2xl">
        <h1 className="text-4xl font-syne font-extrabold text-[var(--red)] tracking-tight mb-2 opacity-90">Corporate Graveyard</h1>
        <p className="text-sm font-mono text-[var(--muted)] uppercase tracking-widest">Post-mortem analysis of enterprise failures</p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-6">
          {[1,2].map(i => <div key={i} className="h-48 bg-[var(--surface2)] rounded-lg animate-pulse border border-[var(--border)]"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {companies.map(company => (
            <div key={company.id} className="bg-[var(--surface)] border border-[var(--border2)] rounded-lg p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h2 className="text-2xl font-syne font-bold text-[var(--amber)]">{company.name}</h2>
                <span className="text-xs font-mono text-[var(--muted)] px-2 py-1 border border-[var(--border)] rounded bg-[var(--surface2)]">{company.yearRange}</span>
              </div>
              
              <p className="text-sm text-[var(--muted)] mb-6 line-clamp-3 leading-relaxed relative z-10">{company.description}</p>
              
              <div className="flex items-center justify-between mt-auto relative z-10">
                <div className="flex gap-2">
                  <span className="text-[10px] uppercase font-mono px-2 py-1 bg-[var(--surface2)] text-[var(--dim)] rounded border border-[var(--border)]">
                    {company.category}
                  </span>
                </div>
                <button 
                  onClick={() => handleAutopsy(company.id)}
                  className="px-4 py-2 border border-[var(--red)]/50 text-[var(--red)] hover:bg-[var(--red)] hover:text-white transition-all text-xs font-bold uppercase tracking-wider rounded"
                >
                  Enter Autopsy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCompanyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95">
          <div className="w-full h-full max-w-5xl bg-[var(--bg)] border border-[var(--red)]/30 rounded-xl relative z-10 p-10 flex flex-col animate-in zoom-in-95 overflow-hidden">
            <button onClick={() => setSelectedCompanyId(null)} className="absolute top-6 right-6 text-[var(--muted)] hover:text-white text-2xl font-mono z-50">✕</button>
            
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--red)] to-transparent"></div>

            {autopsyMutation.isPending ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--red)] font-mono uppercase tracking-widest text-sm">
                <div className="w-16 h-16 border-2 border-[var(--red)]/20 border-t-[var(--red)] rounded-full animate-spin mb-6"></div>
                Extracting Root Cause...
              </div>
            ) : autopsyMutation.data ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <header className="mb-8 shrink-0">
                  <h2 className="text-3xl font-syne font-bold text-white mb-2">Autopsy Report: <span className="text-[var(--red)]">{companies.find(c => c.id === selectedCompanyId)?.name}</span></h2>
                  <p className="text-sm font-mono text-[var(--muted)]">Status: TERMINAL / File: #{selectedCompanyId.toString().padStart(4, '0')}</p>
                </header>

                <div className="grid grid-cols-3 gap-8 flex-1 overflow-y-auto pr-4 pb-10">
                  <div className="col-span-2 space-y-8">
                    <section>
                      <h3 className="text-sm font-mono text-[var(--red)] mb-4 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 bg-[var(--red)] rounded-full animate-pulse"></span>
                        Primary Root Cause
                      </h3>
                      <div className="bg-[var(--surface2)] border border-[var(--red)]/20 p-6 rounded-lg">
                        <p className="text-[var(--text)] leading-relaxed text-lg font-medium">{autopsyMutation.data.rootCause}</p>
                      </div>
                    </section>

                    {autopsyMutation.data.causalChain && (
                      <section>
                        <h3 className="text-sm font-mono text-[var(--amber)] mb-4 uppercase tracking-wider">Causal Chain of Failure</h3>
                        <div className="space-y-4">
                          {autopsyMutation.data.causalChain.map((step, i) => (
                            <div key={i} className="flex gap-4 items-start">
                              <div className="font-mono text-[var(--amber)] opacity-50 pt-1 text-xs">{(i+1).toString().padStart(2, '0')}</div>
                              <div className="text-[var(--muted)] text-sm bg-[var(--surface)] border border-[var(--border)] p-3 rounded flex-1">
                                {step}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>

                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-mono text-[var(--mint)] mb-4 uppercase tracking-wider">Lessons Learned</h3>
                      <ul className="space-y-3">
                        {autopsyMutation.data.lessonsLearned.map((lesson, i) => (
                          <li key={i} className="text-sm text-[var(--muted)] flex items-start gap-2 bg-[var(--surface)] p-3 rounded border border-[var(--border)]">
                            <span className="text-[var(--mint)] shrink-0">✓</span>
                            <span>{lesson}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="bg-[var(--surface2)] p-5 rounded-lg border border-[var(--border2)]">
                      <h3 className="text-xs font-mono text-[var(--dim)] mb-2 uppercase tracking-wider">Timeline</h3>
                      <p className="text-sm text-[var(--muted)] font-mono">{autopsyMutation.data.timeline}</p>
                    </section>

                    {autopsyMutation.data.analogy && (
                      <section className="border-t border-[var(--border)] pt-6">
                        <h3 className="text-xs font-mono text-[var(--indigo-light)] mb-2 uppercase tracking-wider">Analogy</h3>
                        <p className="text-sm text-[var(--text)] italic">"{autopsyMutation.data.analogy}"</p>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
