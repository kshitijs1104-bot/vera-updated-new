import { useState } from 'react';
import { useListEvents, useRippleAnalysis } from '@workspace/api-client-react';
import { useCategory } from '../lib/CategoryContext';
import { Filter } from 'lucide-react';

export function LinePage() {
  const { category } = useCategory();
  const { data: events = [], isLoading } = useListEvents({ category: category !== 'all' ? category : undefined } as any);
  const [selectedEventForRipple, setSelectedEventForRipple] = useState<number | null>(null);
  
  const rippleMutation = useRippleAnalysis({
    mutation: {
      onSuccess: () => {
        // Show panel
      }
    }
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-8 border-b border-[var(--border)] pb-4">
        <h1 className="text-sm font-mono text-[var(--muted)]">{events.length} events · chronological</h1>
        <button className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-white transition-colors px-3 py-1.5 bg-[var(--surface2)] rounded border border-[var(--border)]">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </header>

      <div className="relative border-l border-[var(--border2)] ml-4 space-y-12 pb-12">
        {isLoading ? (
          <div className="pl-8 space-y-4">
            <div className="h-32 bg-[var(--surface2)] rounded-lg animate-pulse w-full"></div>
            <div className="h-32 bg-[var(--surface2)] rounded-lg animate-pulse w-full"></div>
          </div>
        ) : events.map(event => {
          const isPos = event.sentiment === 'positive';
          const isNeg = event.sentiment === 'negative';
          
          return (
            <div key={event.id} className="relative pl-8 group">
              <div className={`absolute -left-2 top-0 w-4 h-4 rounded-full border-[4px] border-[var(--bg)] flex items-center justify-center ${
                isPos ? 'bg-[var(--green)]' : isNeg ? 'bg-[var(--red)]' : 'bg-[var(--amber)]'
              }`}>
                {/* Internal indicator like up arrow or minus could go here if large enough */}
              </div>

              <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--border2)] transition-colors relative overflow-hidden">
                <div className="flex items-center gap-3 mb-4 text-xs font-mono">
                  <span className="px-2 py-1 bg-[var(--surface3)] rounded text-white">{event.year}</span>
                  <span className="uppercase text-[var(--muted)] tracking-wider">{event.category} Intelligence</span>
                  <span className={`px-2 py-1 rounded border uppercase font-bold tracking-wider ${
                    isPos ? 'text-[var(--green)] border-[var(--green)]/30 bg-[var(--green)]/10' :
                    isNeg ? 'text-[var(--red)] border-[var(--red)]/30 bg-[var(--red)]/10' :
                    'text-[var(--amber)] border-[var(--amber)]/30 bg-[var(--amber)]/10'
                  }`}>
                    {event.sentiment}
                  </span>
                  {event.rippleCount !== undefined && (
                    <span className="px-2 py-1 bg-[var(--indigo)]/20 text-[var(--indigo-light)] rounded border border-[var(--indigo)]/30">
                      Ripples: {event.rippleCount}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl font-syne font-bold text-white mb-2">{event.title}</h2>
                <p className="text-[var(--muted)] text-sm mb-6 max-w-2xl leading-relaxed">{event.description}</p>

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <div className="flex items-center gap-3 flex-1 max-w-[200px]">
                    <span className="text-xs font-mono text-[var(--dim)]">Impact</span>
                    <div className="flex-1 h-1 bg-[var(--surface3)] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: `${event.impact}%`, 
                          background: isPos ? 'var(--green)' : isNeg ? 'var(--red)' : 'var(--amber)' 
                        }}
                      ></div>
                    </div>
                    <span className="text-xs font-mono text-[var(--text)]">{event.impact}%</span>
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedEventForRipple(event.id);
                      rippleMutation.mutate({ id: event.id });
                    }}
                    className="text-sm font-bold text-[var(--indigo-light)] hover:text-white transition-colors"
                  >
                    Ripple Analysis →
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Basic Slide-over panel implementation for ripple analysis */}
      {selectedEventForRipple && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEventForRipple(null)}></div>
          <div className="w-[400px] bg-[var(--surface)] border-l border-[var(--border)] h-full relative z-10 p-6 flex flex-col animate-in slide-in-from-right">
            <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-4">
              <h2 className="text-lg font-syne font-bold">Ripple Analysis</h2>
              <button onClick={() => setSelectedEventForRipple(null)} className="text-[var(--muted)] hover:text-white">✕</button>
            </div>
            
            {rippleMutation.isPending ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--mint)]"></div>
              </div>
            ) : rippleMutation.data ? (
              <div className="space-y-6 overflow-y-auto flex-1">
                <div>
                  <h3 className="text-xs font-mono text-[var(--mint)] mb-2 uppercase">Analysis</h3>
                  <p className="text-sm text-[var(--text)] leading-relaxed">{rippleMutation.data.analysis}</p>
                </div>
                {rippleMutation.data.causalChain && (
                  <div>
                    <h3 className="text-xs font-mono text-[var(--amber)] mb-3 uppercase">Causal Chain</h3>
                    <div className="space-y-2 border-l border-[var(--border)] ml-2 pl-4">
                      {rippleMutation.data.causalChain.map((step, i) => (
                        <div key={i} className="text-sm text-[var(--muted)] relative before:absolute before:-left-[21px] before:top-2 before:w-2 before:h-2 before:bg-[var(--surface3)] before:rounded-full before:border before:border-[var(--border)]">
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
