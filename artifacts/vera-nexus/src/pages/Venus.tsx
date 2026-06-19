import { useVenusAnalyze, useGetOnboarding } from '@workspace/api-client-react';
import { useState, useRef, useEffect } from 'react';

export function VenusPage() {
  const { data: onboarding } = useGetOnboarding();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{role: 'user'|'venus', content?: string, cards?: any[]}>>([]);
  
  const analyzeMutation = useVenusAnalyze();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, analyzeMutation.isPending]);

  const handleSend = (preset?: string) => {
    const text = preset || input;
    if (!text.trim()) return;

    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    setInput('');

    const contextStr = onboarding ? `Company: ${onboarding.companyName}, Stage: ${onboarding.stage}, Industry: ${onboarding.industry}, Goal: ${onboarding.primaryGoal}` : '';

    analyzeMutation.mutate({
      data: {
        message: text,
        businessContext: contextStr,
        sessionHistory: messages.map(m => ({ role: m.role, content: m.content || 'card output' }))
      }
    }, {
      onSuccess: (res) => {
        setMessages(prev => [...prev, { role: 'venus', content: res.summary, cards: res.cards }]);
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[var(--bg)] relative border-r border-[var(--border)]">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] p-[2px] mb-8 shadow-[0_0_40px_rgba(0,229,176,0.15)]">
              <div className="w-full h-full bg-[var(--bg)] rounded-full flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--indigo)]/20 to-[var(--mint)]/20 mix-blend-overlay"></div>
                <span className="font-syne font-bold text-2xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--mint)]">V</span>
              </div>
            </div>
            <h1 className="text-3xl font-syne font-extrabold text-white mb-3">Venus AI</h1>
            <p className="text-sm font-mono text-[var(--muted)] uppercase tracking-widest mb-12">
              Elite business intelligence. No hedging. No generic advice. Pure signal.
            </p>
            
            <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
              {[
                "Analyze our whitespace opportunity",
                "Stress test my Q3 roadmap",
                "Give me a brutal teardown of my competitors",
                "Evaluate our capital efficiency risk"
              ].map(prompt => (
                <button 
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="bg-[var(--surface2)] border border-[var(--border)] hover:border-[var(--indigo)] p-4 rounded-lg text-left text-sm text-[var(--text)] transition-all hover:bg-[var(--surface3)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[70%] bg-[var(--indigo)]/20 border border-[var(--indigo)]/30 text-white rounded-2xl rounded-tr-none px-6 py-4 text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[8px] font-bold text-black">V</div>
                      <span className="text-xs font-mono uppercase text-[var(--muted)]">Venus</span>
                    </div>
                    {msg.content && (
                      <div className="text-[var(--text)] text-sm leading-relaxed font-medium">
                        {msg.content}
                      </div>
                    )}
                    {msg.cards && msg.cards.length > 0 && (
                      <div className="grid grid-cols-1 gap-4 mt-6">
                        {msg.cards.map((card: any, ci: number) => (
                          <div key={ci} className="bg-[var(--surface2)] border border-[var(--border2)] rounded-lg p-5">
                            <h4 className="text-xs font-mono uppercase text-[var(--mint)] mb-4">{card.title}</h4>
                            {/* Render card content based on type */}
                            {card.type === 'analysis' && (
                              <ul className="space-y-2">
                                {(card.content.points || []).map((pt: any, pi: number) => (
                                  <li key={pi} className="flex justify-between items-center text-sm border-b border-[var(--border)] border-dashed pb-2 last:border-0">
                                    <span className="text-[var(--muted)]">{pt.label}</span>
                                    <span className="font-mono text-white">{pt.value}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {card.type === 'risk' && (
                              <div className="space-y-4">
                                {(card.content.risks || []).map((risk: any, ri: number) => (
                                  <div key={ri} className="bg-[var(--surface)] p-3 rounded border border-[var(--border)]">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-bold text-[var(--amber)]">{risk.name}</span>
                                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--red)]/20 text-[var(--red)]">{risk.impact} Impact</span>
                                    </div>
                                    <p className="text-xs text-[var(--muted)]">{risk.mitigation}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Simple fallback for others */}
                            {['market', 'roadmap', 'decision'].includes(card.type) && (
                              <pre className="text-xs text-[var(--muted)] font-mono whitespace-pre-wrap">
                                {JSON.stringify(card.content, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {analyzeMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[8px] font-bold text-black animate-pulse">V</div>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[var(--mint)] rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                    <span className="w-1.5 h-1.5 bg-[var(--mint)] rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                    <span className="w-1.5 h-1.5 bg-[var(--mint)] rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>
        )}

        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)]">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-end gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--indigo)] transition-colors shadow-lg"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Venus for unvarnished analysis..."
              className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 min-h-[44px] py-3 px-4 text-sm text-[var(--text)] placeholder-[var(--dim)]"
            />
            <button 
              type="submit"
              disabled={!input.trim() || analyzeMutation.isPending}
              className="w-11 h-11 shrink-0 bg-[var(--indigo)] hover:bg-[var(--indigo-light)] disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-colors mb-0.5 mr-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Right panel: Context */}
      <div className="w-[280px] bg-[var(--surface)] p-6 shrink-0 overflow-y-auto hidden lg:block">
        <h3 className="text-xs font-mono text-[var(--muted)] uppercase tracking-widest mb-6 border-b border-[var(--border)] pb-2">Business Context</h3>
        
        {onboarding ? (
          <div className="space-y-4">
            <div className="bg-[var(--surface2)] p-4 rounded border border-[var(--border)]">
              <div className="text-[10px] uppercase font-mono text-[var(--dim)] mb-1">Company</div>
              <div className="text-sm font-bold text-white">{onboarding.companyName || 'Not Set'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--surface2)] p-3 rounded border border-[var(--border)]">
                <div className="text-[10px] uppercase font-mono text-[var(--dim)] mb-1">Stage</div>
                <div className="text-xs text-[var(--text)]">{onboarding.stage || '-'}</div>
              </div>
              <div className="bg-[var(--surface2)] p-3 rounded border border-[var(--border)]">
                <div className="text-[10px] uppercase font-mono text-[var(--dim)] mb-1">Industry</div>
                <div className="text-xs text-[var(--text)] truncate">{onboarding.industry || '-'}</div>
              </div>
            </div>
            <div className="bg-[var(--surface2)] p-4 rounded border border-[var(--border)]">
              <div className="text-[10px] uppercase font-mono text-[var(--dim)] mb-1">Primary Goal</div>
              <div className="text-xs text-[var(--text)] leading-relaxed">{onboarding.primaryGoal || '-'}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--muted)] italic">Update context in settings.</div>
        )}

        <div className="mt-12">
          <h3 className="text-xs font-mono text-[var(--muted)] uppercase tracking-widest mb-4 border-b border-[var(--border)] pb-2">Session Stats</h3>
          <div className="flex justify-between items-end mb-1">
            <span className="text-xs text-[var(--dim)]">Prompts Used</span>
            <span className="text-xs font-mono text-[var(--mint)]">12 / 100</span>
          </div>
          <div className="w-full h-1 bg-[var(--surface3)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--mint)] w-[12%]"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
