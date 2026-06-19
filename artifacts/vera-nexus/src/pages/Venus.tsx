import { useVenusAnalyze } from '@workspace/api-client-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  getSessions, saveSession, deleteSession, createSession,
  getSavedAnalyses, saveAnalysis, deleteSavedAnalysis,
  detectAnalysisType, typeLabel, titleFromMessage,
  type ChatSession, type ChatMessage, type SavedAnalysisType,
} from '../lib/venusHistory';
import { Settings, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const EXAMPLE_PROMPTS = [
  "Map the causal chain for my business from the most significant market shifts right now",
  "What's my biggest risk right now and how do I fix it?",
  "Build me a 6-month roadmap based on similar companies at my stage",
  "Find 3 failed companies most similar to mine and why they failed",
  "Run an investor-fit analysis — which VCs are most likely to fund us?",
];

const SAVED_TYPE_COLORS: Record<SavedAnalysisType, string> = {
  risk: 'var(--red)',
  roadmap: 'var(--mint)',
  pattern: 'var(--amber)',
  fundraising: 'var(--indigo-light)',
  competitive: 'var(--green)',
  analysis: 'var(--dim)',
};

function groupSavedByType(saved: ReturnType<typeof getSavedAnalyses>) {
  const groups: Partial<Record<SavedAnalysisType, typeof saved>> = {};
  for (const s of saved) {
    if (!groups[s.type]) groups[s.type] = [];
    groups[s.type]!.push(s);
  }
  return groups;
}

export function VenusPage() {
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<ChatSession[]>(getSessions);
  const [currentSession, setCurrentSession] = useState<ChatSession>(() => {
    const existing = getSessions();
    return existing.length > 0 ? existing[0] : createSession();
  });
  const [saved, setSaved] = useState(getSavedAnalyses);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('ve_groq_key') || '');
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const analyzeMutation = useVenusAnalyze();

  const messages = currentSession.messages;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, analyzeMutation.isPending]);

  const persistSession = useCallback((session: ChatSession) => {
    saveSession(session);
    setSessions(getSessions());
  }, []);

  const handleNewChat = () => {
    const s = createSession();
    setCurrentSession(s);
  };

  const handleSelectSession = (s: ChatSession) => {
    setCurrentSession(s);
    setInput('');
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
    setSessions(getSessions());
    if (currentSession.id === id) setCurrentSession(createSession());
  };

  const handleSend = (preset?: string) => {
    const text = (preset || input).trim();
    if (!text) return;
    setInput('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    const updatedTitle = messages.length === 0 ? titleFromMessage(text) : currentSession.title;
    const updated: ChatSession = { ...currentSession, messages: newMessages, title: updatedTitle };
    setCurrentSession(updated);
    persistSession(updated);

    analyzeMutation.mutate(
      { data: { message: text, sessionHistory: messages.map(m => ({ role: m.role, content: m.content ?? '' })) } },
      {
        onSuccess: (res) => {
          const venusMsg: ChatMessage = { role: 'venus', content: res.summary, cards: res.cards };
          const withVenus: ChatSession = { ...updated, messages: [...newMessages, venusMsg] };
          setCurrentSession(withVenus);
          persistSession(withVenus);
        },
      }
    );
  };

  const handleSaveResponse = (msg: ChatMessage) => {
    const type = detectAnalysisType(msg.content ?? '', msg.cards);
    const title = typeLabel(type) + ' — ' + new Date().toLocaleDateString();
    saveAnalysis({ type, title, summary: msg.content ?? '' });
    setSaved(getSavedAnalyses());
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedAnalysis(id);
    setSaved(getSavedAnalyses());
  };

  const toggleGroup = (type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const savedGroups = groupSavedByType(saved);

  return (
    <div className="flex h-screen w-full bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-[240px] border-r border-[var(--border)] flex flex-col shrink-0 bg-[var(--surface)]">
        {/* Back link */}
        <div className="p-4 border-b border-[var(--border)]">
          <button
            onClick={() => navigate('/line')}
            className="text-xs font-mono text-[var(--dim)] hover:text-white transition-colors flex items-center gap-1.5"
          >
            ← Back to Vera Nexus
          </button>
        </div>

        {/* New Chat + History */}
        <div className="p-3 border-b border-[var(--border)]">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--indigo)]/20 border border-[var(--indigo)]/40 text-[var(--indigo-light)] hover:bg-[var(--indigo)]/30 transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Chat History */}
          {sessions.length > 0 && (
            <div className="px-2 mb-4">
              <div className="text-[10px] font-mono text-[var(--dim)] uppercase tracking-wider px-2 mb-2">Recent</div>
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSession(s)}
                  className={`w-full group flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors text-xs mb-0.5 ${
                    currentSession.id === s.id
                      ? 'bg-[var(--surface2)] text-white'
                      : 'text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-white'
                  }`}
                >
                  <span className="truncate flex-1">{s.title}</span>
                  <Trash2
                    className="w-3 h-3 shrink-0 ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[var(--red)] transition-opacity"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Saved Analyses */}
          {Object.keys(savedGroups).length > 0 && (
            <div className="px-2">
              <div className="text-[10px] font-mono text-[var(--dim)] uppercase tracking-wider px-2 mb-2">Saved</div>
              {(Object.entries(savedGroups) as [SavedAnalysisType, typeof saved][]).map(([type, items]) => (
                <div key={type} className="mb-2">
                  <button
                    onClick={() => toggleGroup(type)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider hover:text-white transition-colors"
                    style={{ color: SAVED_TYPE_COLORS[type] }}
                  >
                    {collapsedGroups.has(type) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {typeLabel(type)}s ({items.length})
                  </button>
                  {!collapsedGroups.has(type) && items.map(item => (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between px-3 py-1.5 rounded text-xs text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-white transition-colors cursor-default mb-0.5"
                    >
                      <span className="truncate flex-1">{item.title}</span>
                      <Trash2
                        className="w-3 h-3 shrink-0 ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[var(--red)] transition-opacity cursor-pointer"
                        onClick={(e) => handleDeleteSaved(item.id, e)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Settings */}
        <div className="border-t border-[var(--border)] p-3">
          <button
            onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--muted)] hover:text-white hover:bg-[var(--surface2)] transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          {showSettings && (
            <div className="mt-2 p-3 bg-[var(--surface2)] border border-[var(--border)] rounded-lg">
              <div className="text-[10px] font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Groq API Key</div>
              <input
                type="password"
                value={groqKey}
                onChange={e => {
                  setGroqKey(e.target.value);
                  localStorage.setItem('ve_groq_key', e.target.value);
                }}
                placeholder="gsk_..."
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2.5 py-2 text-xs font-mono text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
              />
              <p className="text-[9px] font-mono text-[var(--dim)] mt-1.5 leading-relaxed">
                Get a free key at console.groq.com
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-[var(--border)] flex items-center px-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[8px] font-bold text-black">V</div>
            <span className="text-sm font-syne font-bold text-white">Venus AI</span>
            <span className="text-[10px] font-mono text-[var(--mint)] uppercase ml-2">Enterprise</span>
          </div>
        </div>

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] p-[2px] mb-6 shadow-[0_0_40px_rgba(0,229,176,0.1)]">
              <div className="w-full h-full bg-[var(--bg)] rounded-full flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--indigo)]/20 to-[var(--mint)]/20"></div>
                <span className="font-syne font-bold text-xl text-white relative z-10">V</span>
              </div>
            </div>
            <h1 className="text-2xl font-syne font-extrabold text-white mb-2">Venus AI</h1>
            <p className="text-sm font-mono text-[var(--muted)] uppercase tracking-widest mb-10">
              Elite business intelligence. No hedging. Pure signal.
            </p>

            <div className="grid grid-cols-1 gap-3 max-w-2xl w-full">
              {EXAMPLE_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="bg-[var(--surface2)] border border-[var(--border)] hover:border-[var(--indigo)] p-4 rounded-lg text-left text-sm text-[var(--text)] transition-all hover:bg-[var(--surface3)] group"
                >
                  <span className="text-[var(--dim)] group-hover:text-[var(--muted)] transition-colors text-xs font-mono mr-2">→</span>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto w-full">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[70%] bg-[var(--indigo)]/20 border border-[var(--indigo)]/30 text-white rounded-2xl rounded-tr-none px-5 py-3.5 text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[90%] space-y-3 group">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[7px] font-bold text-black">V</div>
                      <span className="text-[10px] font-mono uppercase text-[var(--muted)]">Venus</span>
                    </div>

                    {msg.content && <VenusMessage content={msg.content} />}

                    {msg.cards && msg.cards.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 mt-4">
                        {msg.cards.map((card: any, ci: number) => (
                          <VenusCard key={ci} card={card} />
                        ))}
                      </div>
                    )}

                    {/* Save button */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                      <button
                        onClick={() => handleSaveResponse(msg)}
                        className="text-[10px] font-mono text-[var(--dim)] hover:text-[var(--mint)] transition-colors border border-[var(--border)] hover:border-[var(--mint)]/40 px-2.5 py-1 rounded"
                      >
                        Save as {typeLabel(detectAnalysisType(msg.content ?? '', msg.cards))} →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {analyzeMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[7px] font-bold text-black animate-pulse">V</div>
                  <div className="flex gap-1">
                    {[0, 150, 300].map(delay => (
                      <span key={delay} className="w-1.5 h-1.5 bg-[var(--mint)] rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] shrink-0">
          <form
            onSubmit={e => { e.preventDefault(); handleSend(); }}
            className="flex items-end gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--indigo)] transition-colors max-w-4xl mx-auto"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask Venus for unvarnished analysis…"
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 min-h-[44px] py-3 px-4 text-sm text-[var(--text)] placeholder-[var(--dim)]"
            />
            <button
              type="submit"
              disabled={!input.trim() || analyzeMutation.isPending}
              className="w-10 h-10 shrink-0 bg-[var(--indigo)] hover:bg-[var(--indigo-light)] disabled:opacity-40 text-white rounded-lg flex items-center justify-center transition-colors mb-0.5 mr-0.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* Render Venus response with basic markdown-like formatting */
function VenusMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-sm text-[var(--text)] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-xs font-mono text-[var(--mint)] uppercase tracking-wider pt-3 first:pt-0">{line.slice(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-sm font-syne font-bold text-white pt-3 first:pt-0">{line.slice(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={i} className="text-base font-syne font-extrabold text-white pt-2 first:pt-0">{line.slice(2)}</h1>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[var(--mint)] mt-0.5 text-xs shrink-0">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\.\s/)![1];
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[var(--dim)] font-mono text-xs shrink-0 pt-0.5">{num}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function VenusCard({ card }: { card: any }) {
  const typeColors: Record<string, string> = {
    analysis: 'var(--indigo-light)',
    market: 'var(--mint)',
    risk: 'var(--red)',
    roadmap: 'var(--amber)',
    decision: 'var(--green)',
  };
  const color = typeColors[card.type] ?? 'var(--dim)';

  return (
    <div className="bg-[var(--surface2)] border border-[var(--border2)] rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <h4 className="text-xs font-mono uppercase tracking-wider" style={{ color }}>{card.title}</h4>
      </div>

      {card.type === 'analysis' && (
        <ul className="space-y-2">
          {(card.content?.points ?? []).map((pt: any, i: number) => (
            <li key={i} className="flex justify-between items-center text-sm border-b border-[var(--border)] border-dashed pb-2 last:border-0">
              <span className="text-[var(--muted)]">{pt.label}</span>
              <span className="font-mono text-white">{pt.value}</span>
            </li>
          ))}
        </ul>
      )}

      {card.type === 'risk' && (
        <div className="space-y-3">
          {(card.content?.risks ?? []).map((risk: any, i: number) => (
            <div key={i} className="bg-[var(--surface)] p-3 rounded border border-[var(--border)]">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-bold text-[var(--amber)]">{risk.name}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--red)]/20 text-[var(--red)]">{risk.impact}</span>
              </div>
              <p className="text-xs text-[var(--muted)]">{risk.mitigation}</p>
            </div>
          ))}
        </div>
      )}

      {card.type === 'roadmap' && (
        <div className="space-y-3">
          {(card.content?.milestones ?? card.content?.phases ?? []).map((m: any, i: number) => (
            <div key={i} className="flex gap-3">
              <div className="font-mono text-[var(--amber)] opacity-60 text-xs pt-0.5 shrink-0">{m.period ?? m.phase ?? `Q${i + 1}`}</div>
              <div className="text-sm text-[var(--muted)]">{m.goal ?? m.description ?? JSON.stringify(m)}</div>
            </div>
          ))}
        </div>
      )}

      {['market', 'decision'].includes(card.type) && (
        <div className="space-y-2">
          {(card.content?.points ?? card.content?.factors ?? []).map((p: any, i: number) => (
            <div key={i} className="text-sm text-[var(--muted)] flex items-start gap-2">
              <span className="text-[var(--mint)] mt-0.5">•</span>
              <span>{typeof p === 'string' ? p : p.label ?? p.factor ?? JSON.stringify(p)}</span>
            </div>
          ))}
          {/* Fallback */}
          {!card.content?.points && !card.content?.factors && (
            <pre className="text-xs text-[var(--muted)] font-mono whitespace-pre-wrap">{JSON.stringify(card.content, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
