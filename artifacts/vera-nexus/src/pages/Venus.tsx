import { useVenusAnalyze, useListThoughts } from '@workspace/api-client-react';
import { useState, useRef, useEffect } from 'react';
import { resetGate } from '../lib/enterpriseGate';
import { useLocation } from 'wouter';

const VENUS_FEATURES = [
  {
    id: 'market-cause',
    label: 'Market Cause Mapping',
    icon: '◎',
    desc: 'Trace second and third-order effects of any market event on your sector',
    primer: 'Map the causal chain for my business from the most significant market shifts happening right now. Be specific to my sector and stage.',
  },
  {
    id: 'decision-simulator',
    label: 'Decision Simulator',
    icon: '⚡',
    desc: 'Stress-test your next strategic decision against historical failure patterns',
    primer: 'Simulate the downstream risks and opportunities of my next major strategic decision. Ask me what the decision is, then give a structured analysis.',
  },
  {
    id: 'failure-pattern',
    label: 'Failure Pattern Matching',
    icon: '◈',
    desc: 'Match your current situation against precedent failures in your space',
    primer: 'Analyze my company situation and surface the top 3 historical failure patterns that most closely match our current trajectory. What should I watch for?',
  },
  {
    id: 'fundraising',
    label: 'Fundraising Intelligence',
    icon: '◆',
    desc: 'Investor readiness, narrative stress-test, and capital efficiency audit',
    primer: 'Run a full fundraising readiness analysis for my company. Cover investor narrative gaps, capital efficiency, and the most likely objections from institutional investors.',
  },
  {
    id: 'competitive-radar',
    label: 'Competitive Causal Radar',
    icon: '◐',
    desc: 'Identify which competitor moves will have causal knock-on effects on you',
    primer: 'Identify which competitor moves in my space will have the highest causal impact on our trajectory over the next 12 months. Prioritize by probability and severity.',
  },
];

type TabId = 'market-cause' | 'decision-simulator' | 'failure-pattern' | 'fundraising' | 'competitive-radar' | 'forum';

interface ChatMessage {
  role: 'user' | 'venus';
  content?: string;
  cards?: any[];
}

export function VenusPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>('market-cause');
  const [chatsByTab, setChatsByTab] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState('');
  const analyzeMutation = useVenusAnalyze();
  const endRef = useRef<HTMLDivElement>(null);

  const { data: thoughts = [] } = useListThoughts();

  const messages = chatsByTab[activeTab] ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, analyzeMutation.isPending, activeTab]);

  const handleSend = (preset?: string) => {
    const text = preset || input;
    if (!text.trim() || activeTab === 'forum') return;
    const newMsgs: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setChatsByTab(prev => ({ ...prev, [activeTab]: newMsgs }));
    setInput('');

    analyzeMutation.mutate(
      { data: { message: text, sessionHistory: messages.map(m => ({ role: m.role, content: m.content ?? '' })) } },
      {
        onSuccess: (res) => {
          setChatsByTab(prev => ({
            ...prev,
            [activeTab]: [...(prev[activeTab] ?? []), { role: 'venus', content: res.summary, cards: res.cards }],
          }));
        },
      }
    );
  };

  const handleFeatureStart = (feature: typeof VENUS_FEATURES[0]) => {
    setActiveTab(feature.id as TabId);
    if (!chatsByTab[feature.id]?.length) {
      setTimeout(() => handleSend(feature.primer), 50);
    }
  };

  const handleSignOut = () => {
    resetGate();
    navigate('/line');
  };

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden">
      {/* Left nav */}
      <nav className="w-[220px] border-r border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[8px] font-bold text-black">V</div>
            <span className="text-sm font-syne font-bold text-white">Venus AI</span>
          </div>
          <div className="text-[10px] font-mono text-[var(--mint)] uppercase tracking-widest">Enterprise</div>
        </div>

        <div className="flex-1 p-3 space-y-1 overflow-y-auto">
          {VENUS_FEATURES.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveTab(f.id as TabId)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group text-sm ${
                activeTab === f.id
                  ? 'bg-[var(--indigo)]/20 border border-[var(--indigo)]/40 text-white'
                  : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface2)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[var(--indigo-light)] text-xs">{f.icon}</span>
                <span className="font-medium text-xs">{f.label}</span>
              </div>
            </button>
          ))}

          <div className="pt-2 border-t border-[var(--border)] mt-2">
            <button
              onClick={() => setActiveTab('forum')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${
                activeTab === 'forum'
                  ? 'bg-[var(--mint)]/10 border border-[var(--mint)]/30 text-[var(--mint)]'
                  : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface2)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">◉</span>
                <span className="font-medium text-xs">Aurelian Forum</span>
              </div>
            </button>
          </div>
        </div>

        <div className="p-3 border-t border-[var(--border)]">
          <button
            onClick={handleSignOut}
            className="w-full text-[10px] font-mono text-[var(--dim)] hover:text-[var(--red)] transition-colors text-left px-2 py-1"
          >
            ← Exit Enterprise
          </button>
        </div>
      </nav>

      {/* Main content */}
      {activeTab === 'forum' ? (
        <AurelianForum thoughts={thoughts} />
      ) : (
        <ChatPane
          feature={VENUS_FEATURES.find(f => f.id === activeTab)!}
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onFeatureStart={handleFeatureStart}
          isPending={analyzeMutation.isPending}
          endRef={endRef}
        />
      )}
    </div>
  );
}

function ChatPane({
  feature, messages, input, setInput, onSend, onFeatureStart, isPending, endRef
}: {
  feature: typeof VENUS_FEATURES[0];
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: (preset?: string) => void;
  onFeatureStart: (f: typeof VENUS_FEATURES[0]) => void;
  isPending: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] p-[2px] mb-6 shadow-[0_0_40px_rgba(0,229,176,0.1)]">
            <div className="w-full h-full bg-[var(--bg)] rounded-full flex items-center justify-center">
              <span className="text-2xl">{feature.icon}</span>
            </div>
          </div>
          <h2 className="text-2xl font-syne font-extrabold text-white mb-2">{feature.label}</h2>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-8 leading-relaxed">{feature.desc}</p>
          <button
            onClick={() => onFeatureStart(feature)}
            className="bg-[var(--indigo)] hover:bg-[var(--indigo-light)] text-white font-bold px-8 py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
          >
            Start Analysis →
          </button>
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
                    <p className="text-[var(--text)] text-sm leading-relaxed font-medium">{msg.content}</p>
                  )}
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mt-6">
                      {msg.cards.map((card: any, ci: number) => (
                        <div key={ci} className="bg-[var(--surface2)] border border-[var(--border2)] rounded-lg p-5">
                          <h4 className="text-xs font-mono uppercase text-[var(--mint)] mb-4">{card.title}</h4>
                          {card.type === 'analysis' && (
                            <ul className="space-y-2">
                              {(card.content?.points ?? []).map((pt: any, pi: number) => (
                                <li key={pi} className="flex justify-between items-center text-sm border-b border-[var(--border)] border-dashed pb-2 last:border-0">
                                  <span className="text-[var(--muted)]">{pt.label}</span>
                                  <span className="font-mono text-white">{pt.value}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {card.type === 'risk' && (
                            <div className="space-y-4">
                              {(card.content?.risks ?? []).map((risk: any, ri: number) => (
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
                          {['market', 'roadmap', 'decision'].includes(card.type) && (
                            <pre className="text-xs text-[var(--muted)] font-mono whitespace-pre-wrap">{JSON.stringify(card.content, null, 2)}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[8px] font-bold text-black animate-pulse">V</div>
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="w-1.5 h-1.5 bg-[var(--mint)] rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }}></span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)]">
        <form
          onSubmit={e => { e.preventDefault(); onSend(); }}
          className="flex items-end gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--indigo)] transition-colors"
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={`Ask Venus about ${feature.label.toLowerCase()}...`}
            className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 min-h-[44px] py-3 px-4 text-sm text-[var(--text)] placeholder-[var(--dim)]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            className="w-11 h-11 shrink-0 bg-[var(--indigo)] hover:bg-[var(--indigo-light)] disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-colors mb-0.5 mr-0.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function AurelianForum({ thoughts }: { thoughts: any[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <header className="mb-8 border-b border-[var(--border)] pb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[var(--mint)]">◉</span>
          <h1 className="text-2xl font-syne font-extrabold text-white">Aurelian Forum</h1>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Signal-dense intelligence from operators, founders, and investors in the Venus AI ecosystem.
        </p>
      </header>

      <div className="space-y-4 max-w-3xl">
        {thoughts.length === 0 ? (
          <div className="text-center py-20 text-[var(--dim)] font-mono text-sm">No forum posts yet.</div>
        ) : (
          thoughts.map((thought: any) => (
            <div key={thought.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 hover:border-[var(--border2)] transition-colors">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--indigo)]/40 to-[var(--mint)]/40 border border-[var(--border)] flex items-center justify-center text-xs font-bold text-white">
                    {(thought.author ?? 'A')[0]}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{thought.author ?? 'Anonymous'}</div>
                    <div className="text-[10px] font-mono text-[var(--dim)] uppercase">{thought.category}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {(thought.tags ?? []).slice(0, 2).map((tag: string) => (
                    <span key={tag} className="text-[10px] font-mono text-[var(--dim)] bg-[var(--surface2)] border border-[var(--border)] px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm text-[var(--text)] leading-relaxed">{thought.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
