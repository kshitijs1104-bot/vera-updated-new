import { useVenusAnalyze } from '@workspace/api-client-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  getSessions, saveSession, deleteSession, createSession,
  getSavedAnalyses, saveAnalysis, deleteSavedAnalysis,
  detectAnalysisType, typeLabel, titleFromMessage,
  type ChatSession, type ChatMessage, type SavedAnalysisType,
} from '../lib/venusHistory';
import { Settings, Plus, Trash2, ChevronDown, ChevronRight, Copy, Download, Check } from 'lucide-react';

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

interface CompanyReportSnapshot {
  foundedYear?: string;
  founders?: string[];
  fundingRaised?: string;
  whatTheyBuilt?: string;
}

interface CompanyReport {
  companyName: string;
  snapshot: CompanyReportSnapshot;
  timeline: Array<{ label: string; detail: string }>;
  analysis: string;
  sources: Array<{ title: string; url: string }>;
  generatedAt: string;
}

interface CompanyReportState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  report?: CompanyReport;
  error?: string;
}

function normalizeCompanyKey(companyName: string) {
  return companyName.trim().toLowerCase().replace(/\s+/g, ' ');
}

function loadCompanyReportCache(): Record<string, CompanyReportState> {
  try {
    const raw = localStorage.getItem('ve_company_reports');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistCompanyReportCache(cache: Record<string, CompanyReportState>) {
  try {
    localStorage.setItem('ve_company_reports', JSON.stringify(cache));
  } catch {}
}

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
  const [companyReports, setCompanyReports] = useState<Record<string, CompanyReportState>>(loadCompanyReportCache);
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
          const venusMsg: ChatMessage = {
            role: 'venus',
            content: res.summary,
            cards: res.cards,
            confidence: res.confidence,
            confidenceNote: res.confidenceNote,
            contextQuery: text,
          };
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
    saveAnalysis({
      type,
      title,
      summary: msg.content ?? '',
      cards: msg.cards,
      confidence: msg.confidence,
      confidenceNote: msg.confidenceNote,
      contextQuery: msg.contextQuery,
    });
    setSaved(getSavedAnalyses());
  };

  const handleOpenSaved = (item: ReturnType<typeof getSavedAnalyses>[number]) => {
    // Reopen a saved analysis as a fresh read-only session in the main chat view.
    // Previously saved items had no click handler at all — this is the missing
    // read-back path for the write-only save action.
    const reopened: ChatSession = {
      ...createSession(),
      title: item.title,
      messages: [
        {
          role: 'venus',
          content: item.summary,
          cards: item.cards ?? [],
          confidence: item.confidence,
          confidenceNote: item.confidenceNote,
          contextQuery: item.contextQuery,
        },
      ],
    };
    setCurrentSession(reopened);
    persistSession(reopened);
  };

  const handleGenerateCompanyReport = useCallback(async (companyName: string) => {
    const key = normalizeCompanyKey(companyName);
    if (!key) return;

    setCompanyReports(prev => ({
      ...prev,
      [key]: { status: 'loading', report: prev[key]?.report, error: undefined },
    }));

    try {
      const response = await fetch('/api/ai/company-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, context: messages[messages.length - 1]?.content ?? '' }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const report = await response.json();
      const nextState = {
        status: 'ready' as const,
        report,
      };
      setCompanyReports(prev => {
        const updated = { ...prev, [key]: nextState };
        persistCompanyReportCache(updated);
        return updated;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setCompanyReports(prev => {
        const updated = { ...prev, [key]: { status: 'error', error: message } };
        persistCompanyReportCache(updated);
        return updated;
      });
    }
  }, [messages]);

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
                      onClick={() => handleOpenSaved(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleOpenSaved(item); }}
                      className="group flex items-center justify-between px-3 py-1.5 rounded text-xs text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-white transition-colors cursor-pointer mb-0.5"
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
          // NOTE: the outer div is scrollable and the inner div uses `m-auto`
          // instead of the parent using `justify-center`. A centered flex
          // parent with overflow content clips symmetrically and there is no
          // way to scroll up to reach the clipped top — which is exactly what
          // was hiding the example prompts on shorter viewports. `m-auto`
          // still centers when everything fits, but collapses to 0 and lets
          // the container scroll normally once content is taller than the
          // available space.
          <div className="flex-1 overflow-y-auto flex flex-col items-center p-8 text-center">
            <div className="m-auto flex flex-col items-center w-full py-4">
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

              <form
                onSubmit={e => { e.preventDefault(); handleSend(); }}
                className="flex items-end gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--indigo)] transition-colors max-w-2xl w-full mb-6"
              >
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask Venus for unvarnished analysis..."
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
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto w-full">
            {messages.map((msg, i) => {
              const priorUserQuery = messages.slice(0, i).reverse().find(m => m.role === 'user')?.content ?? '';
              return (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[70%] bg-[var(--indigo)]/20 border border-[var(--indigo)]/30 text-white rounded-2xl rounded-tr-none px-5 py-3.5 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] space-y-3 group">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--indigo)] to-[var(--mint)] flex items-center justify-center text-[7px] font-bold text-black">V</div>
                          <span className="text-[10px] font-mono uppercase text-[var(--muted)]">Venus</span>
                        </div>
                        {msg.role === 'venus' && !(msg as any).isError && <ConfidenceBadge confidence={msg.confidence} note={msg.confidenceNote} />}
                      </div>

                      {msg.content && <VenusMessage content={msg.content} confidence={msg.confidence} confidenceNote={msg.confidenceNote} />}

                      {msg.cards && msg.cards.length > 0 && (() => {
                        if ((msg as any).isError) {
                          return (
                            <div className="rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 p-4 text-sm text-[var(--red)]">
                              <div className="text-[10px] font-mono uppercase tracking-wider mb-2">Error</div>
                              <div>{msg.content}</div>
                            </div>
                          );
                        }
                        const orderedCards = (msg.cards ?? []).map((card: any, index: number) => ({
                          ...card,
                          role: card.role ?? (index === 0 ? 'primary' : 'supporting'),
                        }));
                        const primaryCards = orderedCards.filter((card: any) => card.role === 'primary');
                        const displayCards = primaryCards.length > 0
                          ? [...primaryCards, ...orderedCards.filter((card: any) => card.role !== 'primary')]
                          : orderedCards;

                        return (
                          <>
                            <ResponseJumpNav cards={displayCards} />
                            <div className="grid grid-cols-1 gap-3 mt-2">
                              {displayCards.map((card: any, ci: number) => (
                                <VenusCard
                                  key={`${ci}-${card.title ?? 'card'}`}
                                  card={card}
                                  index={ci}
                                  contextQuery={msg.contextQuery || priorUserQuery}
                                  previousContextQuery={priorUserQuery}
                                  isPrimary={card.role === 'primary' || (primaryCards.length === 0 && ci === 0)}
                                  companyReports={companyReports}
                                  onGenerateCompanyReport={handleGenerateCompanyReport}
                                />
                              ))}
                            </div>
                          </>
                        );
                      })()}

                      {/* Response actions: copy markdown, download .md, save */}
                      <VenusResponseActions msg={msg} onSave={() => handleSaveResponse(msg)} />
                    </div>
                  )}
                </div>
              );
            })}

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
        {messages.length > 0 && (
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] shrink-0">
            <form
              onSubmit={e => { e.preventDefault(); handleSend(); }}
              className="flex items-end gap-2 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--indigo)] transition-colors max-w-4xl mx-auto"
            >
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask Venus for unvarnished analysis..."
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
        )}
      </div>
    </div>
  );
}

/* Render Venus response with basic markdown-like formatting */
function VenusMessage({ content, confidence }: { content: string; confidence?: 'verified' | 'exploratory'; confidenceNote?: string }) {
  const stripped = confidence === 'exploratory'
    ? content.replace(/^⚠️ No verified precedent match — this is general strategic reasoning, not backed by Venus AI's dataset\. Treat as an unverified starting point only\.\s*/i, '').trim()
    : content;
  const lines = stripped.split('\n');
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

const FIGURE_SPLIT_RE = /(\$\d[\d,.]*\s?[KMBT]?|\d[\d,.]*\s?%|\b\d[\d,.]*x\b|\b(?:19|20)\d{2}\b)/g;
const FIGURE_TEST_RE = /^(\$\d[\d,.]*\s?[KMBT]?|\d[\d,.]*\s?%|\d[\d,.]*x|(?:19|20)\d{2})$/;

function highlightFigures(text: string): React.ReactNode {
  const parts = text.split(FIGURE_SPLIT_RE);
  return parts.map((p, i) =>
    p && FIGURE_TEST_RE.test(p) ? (
      <span key={i} className="font-mono text-[var(--mint)] font-medium">{p}</span>
    ) : (
      p
    ),
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{highlightFigures(part)}</span>;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCompetitorLabel(competitor: unknown): string {
  if (typeof competitor === 'string') return competitor.trim() || 'Unknown competitor';
  if (!isRecord(competitor)) return 'Unknown competitor';
  const name = typeof competitor.name === 'string' ? competitor.name.trim() : '';
  const description = typeof competitor.description === 'string' ? competitor.description.trim() : '';
  const marketShare = competitor.marketShare != null ? String(competitor.marketShare) : '';
  if (name && description) return `${name} — ${description}`;
  if (name && marketShare) return `${name} — ${marketShare}`;
  return name || 'Unknown competitor';
}

function isMarketQueryRelevant(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(market|competitor|competition|tam|sam|som|growth|sizing|size|opportunity|demand|landscape|category)\b/.test(normalized);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function renderStructuredValue(value: unknown, depth = 0): React.ReactNode {
  const parsed = parseMaybeJson(value);
  if (typeof parsed === 'string') {
    return <span>{renderInline(parsed)}</span>;
  }
  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return <span className="font-mono text-white">{String(parsed)}</span>;
  }
  if (Array.isArray(parsed)) {
    return (
      <ul className="space-y-1.5 list-disc pl-5">
        {parsed.map((item, index) => (
          <li key={index} className="text-sm text-[var(--muted)]">
            {renderStructuredValue(item, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(parsed)) {
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;
    return (
      <div className="space-y-2">
        {entries.map(([key, entryValue]) => (
          <div key={key} className="rounded border border-[var(--border)] bg-[var(--surface)]/70 p-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">{key.replace(/_/g, ' ')}</div>
            <div className="text-sm text-[var(--muted)]">{renderStructuredValue(entryValue, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function normalizeCompetitors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return normalizeCompetitors(parsed);
          }
          if (isRecord(parsed)) {
            return [formatCompetitor(parsed)];
          }
        } catch {
          return [trimmed];
        }
        return [trimmed];
      }
      if (isRecord(item)) {
        return [formatCompetitor(item)];
      }
      return [String(item)];
    });
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeCompetitors(parsed);
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function formatCompetitor(competitor: Record<string, unknown>): string {
  const name = typeof competitor.name === 'string' && competitor.name.trim()
    ? competitor.name.trim()
    : typeof competitor.company === 'string' && competitor.company.trim()
      ? competitor.company.trim()
      : typeof competitor.title === 'string' && competitor.title.trim()
        ? competitor.title.trim()
        : 'Competitor';
  const description = typeof competitor.description === 'string' && competitor.description.trim()
    ? competitor.description.trim()
    : typeof competitor.summary === 'string' && competitor.summary.trim()
      ? competitor.summary.trim()
      : typeof competitor.notes === 'string' && competitor.notes.trim()
        ? competitor.notes.trim()
        : '';
  const marketShare = competitor.marketShare != null ? String(competitor.marketShare) : '';
  if (description && marketShare) return `${name} — ${description} (${marketShare})`;
  if (description) return `${name} — ${description}`;
  if (marketShare) return `${name} — ${marketShare}`;
  return name;
}

function CompetitorList({ competitors }: { competitors: unknown }) {
  if (import.meta.env.DEV) {
    console.debug('[Venus] competitor payload', competitors);
  }
  const normalized = normalizeCompetitors(competitors);
  if (normalized.length === 0) return null;
  return (
    <ul className="space-y-1.5 list-disc pl-5 text-sm text-[var(--muted)]">
      {normalized.map((item, idx) => (
        <li key={`${item}-${idx}`}>{renderInline(item)}</li>
      ))}
    </ul>
  );
}

function ConfidenceBadge({ confidence, note }: { confidence?: 'verified' | 'exploratory'; note?: string }) {
  const isExploratory = confidence === 'exploratory';
  const label = isExploratory ? 'Exploratory — no precedent match' : 'Verified precedent';
  const classes = isExploratory
    ? 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]'
    : 'border-[var(--mint)]/30 bg-[var(--mint)]/10 text-[var(--mint)]';

  return (
    <div className="relative group shrink-0">
      <button type="button" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${classes}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${isExploratory ? 'bg-[var(--amber)]' : 'bg-[var(--mint)]'}`} />
        {label}
      </button>
      {note && (
        <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-2.5 text-[11px] leading-relaxed text-[var(--muted)] shadow-lg group-hover:block group-focus-within:block">
          {note}
        </div>
      )}
    </div>
  );
}

function ResponseJumpNav({ cards }: { cards: any[] }) {
  return (
    <div className="sticky top-2 z-10 mb-2 flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/80 p-2 backdrop-blur">
      {cards.map((card, index) => (
        <a key={index} href={`#venus-card-${index}`} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] hover:border-[var(--indigo)] hover:text-white">
          {card.title?.replace(/\s+/g, ' ').trim() || `Section ${index + 1}`}
        </a>
      ))}
    </div>
  );
}

// Renders a single precedent entry (e.g. one company in a precedent card) with its
// own independent "Show report / Hide report" toggle. Previously this toggle lived
// on the parent VenusCard and was shared across every precedent rendered inside it,
// so clicking "Show report" on one company (e.g. Ask Jeeves) also revealed the report
// panel for every other unrelated company in the same card (e.g. Zume). Each entry now
// owns its own state so toggling one never affects the others.
function PrecedentEntry({ precedent: p, companyReports, onGenerateCompanyReport }: { precedent: any; companyReports: Record<string, CompanyReportState>; onGenerateCompanyReport: (companyName: string) => Promise<void> }) {
  const [reportExpanded, setReportExpanded] = useState(false);
  const reportKey = p.company ? normalizeCompanyKey(String(p.company)) : null;
  const reportState = reportKey ? companyReports[reportKey] : undefined;

  return (
    <div className="relative bg-[var(--surface)] border-l-2 border border-[var(--mint)]/40 border-l-[var(--mint)] rounded-r-lg rounded-l-sm p-4 pl-[18px]">
      <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="font-syne font-bold text-[15px] text-white">{p.company}</span>
          <span className="font-mono text-[11px] text-[var(--mint)]">{p.year}</span>
        </div>
        {p.outcome && (
          <span className="text-[9.5px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--mint)]/15 text-[var(--mint)] tracking-wider">
            {p.outcome}
          </span>
        )}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">Causal lesson</div>
      <p className="text-[13px] text-[var(--muted)] leading-relaxed">{renderInline(p.lesson)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            if (!p.company) return;
            if (reportState?.status === 'loading') return;
            if (reportState?.status === 'ready') {
              setReportExpanded(v => !v);
              return;
            }
            setReportExpanded(true);
            await onGenerateCompanyReport(String(p.company));
          }}
          className="rounded border border-[var(--mint)]/30 bg-[var(--mint)]/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--mint)] disabled:cursor-wait disabled:opacity-70"
          disabled={reportState?.status === 'loading'}
        >
          {reportState?.status === 'loading' ? 'Researching…' : reportState?.status === 'ready' ? (reportExpanded ? 'Hide report' : 'Show report') : 'Generate Report'}
        </button>
      </div>

      {reportExpanded && reportState && (
        <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface)]/70 p-3">
          {reportState.status === 'loading' && <div className="text-sm text-[var(--muted)]">Gathering public details and sources…</div>}
          {reportState.status === 'error' && <div className="text-sm text-[var(--red)]">{reportState.error ?? 'Report generation failed.'}</div>}
          {reportState.status === 'ready' && reportState.report && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">Snapshot</div>
                <div className="space-y-1 text-sm text-[var(--muted)]">
                  {reportState.report.snapshot.foundedYear && <div>Founded: {renderInline(reportState.report.snapshot.foundedYear)}</div>}
                  {reportState.report.snapshot.founders && reportState.report.snapshot.founders.length > 0 && <div>Founders: {renderInline(reportState.report.snapshot.founders.join(', '))}</div>}
                  {reportState.report.snapshot.fundingRaised && <div>Funding: {renderInline(reportState.report.snapshot.fundingRaised)}</div>}
                  {reportState.report.snapshot.whatTheyBuilt && <div>Built: {renderInline(reportState.report.snapshot.whatTheyBuilt)}</div>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">Timeline</div>
                <ul className="space-y-1.5 list-disc pl-5 text-sm text-[var(--muted)]">
                  {reportState.report.timeline.map((entry, entryIndex) => (
                    <li key={`${entry.label}-${entryIndex}`}><span className="text-white">{entry.label}</span>: {renderInline(entry.detail)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">What happened</div>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{renderInline(reportState.report.analysis)}</p>
              </div>
              {reportState.report.sources.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">Sources</div>
                  <ul className="space-y-1 text-sm">
                    {reportState.report.sources.map((source, sourceIndex) => (
                      <li key={`${source.url}-${sourceIndex}`}>
                        <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--mint)] hover:text-white underline decoration-dotted">
                          {source.title || source.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VenusCard({ card, index = 0, contextQuery = '', previousContextQuery = '', isPrimary = false, companyReports, onGenerateCompanyReport }: { card: any; index?: number; contextQuery?: string; previousContextQuery?: string; isPrimary?: boolean; companyReports: Record<string, CompanyReportState>; onGenerateCompanyReport: (companyName: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(isPrimary);
  const typeColors: Record<string, string> = {
    analysis: 'var(--indigo-light)',
    market: 'var(--mint)',
    risk: 'var(--red)',
    roadmap: 'var(--amber)',
    decision: 'var(--green)',
    precedent: 'var(--mint)',
  };
  const color = typeColors[card.type] ?? 'var(--dim)';
  const content = parseMaybeJson(card.content);
  const normalizedContent = isRecord(content) ? content : { value: content };
  const shouldRenderMarket = card.type !== 'market' || isMarketQueryRelevant(contextQuery);
  const changedScopeNote = previousContextQuery && contextQuery && previousContextQuery !== contextQuery ? 'Refined for current scope' : null;
  const primary = Boolean(isPrimary || card.role === 'primary');
  const precedentCompany = card.type === 'precedent' ? (typeof normalizedContent.precedents?.[0]?.company === 'string' ? normalizedContent.precedents[0].company : null) : null;
  const companyReportKey = precedentCompany ? normalizeCompanyKey(precedentCompany) : null;
  const companyReportState = companyReportKey ? companyReports[companyReportKey] : undefined;

  if (!shouldRenderMarket) return null;

  const body = (
    <div className="mt-4 space-y-4">
      {changedScopeNote && (
        <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--mint)]">{changedScopeNote}</div>
      )}

      {card.type === 'analysis' && (
        <ul className="space-y-3">
          {(normalizedContent.points ?? []).map((pt: any, i: number) => (
            <li key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 sm:gap-4 text-sm border-b border-[var(--border)] border-dashed pb-3 last:border-0">
              <span className="text-[var(--muted)] sm:shrink-0">{pt.label}</span>
              <span className="font-mono text-white sm:text-right">{pt.value}</span>
            </li>
          ))}
        </ul>
      )}

      {card.type === 'risk' && (
        <div className="space-y-3">
          {(normalizedContent.risks ?? []).map((risk: any, i: number) => (
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
          {normalizedContent.horizon && (
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)]">Horizon: {String(normalizedContent.horizon)}</div>
          )}
          {(normalizedContent.phases ?? normalizedContent.milestones ?? []).map((m: any, i: number) => (
            <div key={i} className="rounded border border-[var(--border)] bg-[var(--surface)]/60 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div className="font-mono text-[var(--amber)] text-xs">{m.period ?? m.phase ?? `Q${i + 1}`}</div>
                {m.title && <div className="text-sm font-semibold text-white">{m.title}</div>}
              </div>
              <div className="text-sm text-[var(--muted)] mb-2">{m.goal ?? m.description ?? renderStructuredValue(m)}</div>
              {m.actions && Array.isArray(m.actions) && m.actions.length > 0 && (
                <ul className="space-y-1.5 list-disc pl-5 text-sm text-[var(--muted)] mt-2">
                  {m.actions.map((action: string, actionIndex: number) => <li key={actionIndex}>{renderInline(String(action))}</li>)}
                </ul>
              )}
              {m.metric && <div className="mt-2 text-[11px] font-mono text-[var(--mint)]">Metric: {renderInline(String(m.metric))}</div>}
            </div>
          ))}
        </div>
      )}

      {card.type === 'precedent' && (
        <div className="space-y-3">
          {(normalizedContent.precedents ?? []).map((p: any, i: number) => (
            <PrecedentEntry
              key={i}
              precedent={p}
              companyReports={companyReports}
              onGenerateCompanyReport={onGenerateCompanyReport}
            />
          ))}
        </div>
      )}

      {card.type === 'market' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['TAM', normalizedContent.tam],
              ['SAM', normalizedContent.sam],
              ['SOM', normalizedContent.som],
              ['Growth', normalizedContent.growth],
            ].filter(([, value]) => value != null && value !== '').map(([label, value]) => (
              <div key={label} className="rounded border border-[var(--border)] bg-[var(--surface)]/70 p-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">{label}</div>
                <div className="text-sm text-white font-mono">{String(value)}</div>
              </div>
            ))}
          </div>
          {normalizedContent.competitors != null && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-2">Competitors</div>
              <CompetitorList competitors={normalizedContent.competitors} />
            </div>
          )}
          {normalizedContent.whitespace && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-2">Whitespace</div>
              <div className="text-sm text-[var(--muted)]">{renderInline(String(normalizedContent.whitespace))}</div>
            </div>
          )}
        </div>
      )}

      {card.type === 'decision' && (
        <div className="space-y-3">
          {(normalizedContent.options ?? []).map((option: any, i: number) => (
            <div key={i} className="rounded border border-[var(--border)] bg-[var(--surface)]/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-white">{option.name ?? `Option ${i + 1}`}</div>
                {option.verdict && <div className="text-sm text-[var(--muted)]">{renderInline(String(option.verdict))}</div>}
              </div>
              {option.scores && isRecord(option.scores) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Object.entries(option.scores).map(([scoreKey, scoreValue]) => (
                    <div key={scoreKey} className="rounded border border-[var(--border)] bg-[var(--surface)]/70 p-2.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)] mb-1">{scoreKey.replace(/_/g, ' ')}</div>
                      <div className="text-sm font-mono text-white">{String(scoreValue)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {normalizedContent.recommendation && (
            <div className="rounded border border-[var(--mint)]/30 bg-[var(--mint)]/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--mint)] mb-1">Recommendation</div>
              <div className="text-sm text-[var(--muted)]">{renderInline(String(normalizedContent.recommendation))}</div>
            </div>
          )}
        </div>
      )}

      {card.type === 'funnel' && (
        <div className="space-y-2">
          {(normalizedContent.stages ?? normalizedContent.steps ?? []).map((stage: any, stageIndex: number) => (
            <div key={stageIndex} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--indigo)]/20 text-[10px] font-mono text-[var(--indigo-light)]">{stageIndex + 1}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{renderInline(String(stage.stage_title ?? stage.title ?? stage.name ?? 'Stage'))}</div>
                  <div className="mt-1 text-sm text-[var(--muted)] leading-snug">{renderInline(String(stage.stage_detail ?? stage.detail ?? stage.description ?? ''))}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {card.type === 'solution' && (
        <div className="space-y-2">
          {(normalizedContent.solutions ?? normalizedContent.options ?? []).map((solution: any, solutionIndex: number) => (
            <div key={solutionIndex} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-3">
              <div className="text-sm font-semibold text-white">{renderInline(String(solution.stage_title ?? solution.title ?? solution.name ?? 'Solution'))}</div>
              <div className="mt-1 text-sm text-[var(--muted)] leading-snug">{renderInline(String(solution.stage_detail ?? solution.detail ?? solution.description ?? ''))}</div>
            </div>
          ))}
        </div>
      )}

      {!['analysis', 'risk', 'roadmap', 'precedent', 'market', 'decision', 'funnel', 'solution'].includes(card.type) && (
        <div className="space-y-2">
          {renderStructuredValue(normalizedContent)}
        </div>
      )}
    </div>
  );

  return (
    <div id={`venus-card-${index}`} className={`bg-[var(--surface2)] border border-[var(--border2)] rounded-lg p-5 overflow-hidden ${primary ? 'ring-1 ring-[var(--indigo)]/20 border-[var(--indigo)]/30' : ''}`}>
      {primary ? (
        <div>
          <div className="flex items-start justify-between gap-3 text-left">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <h4 className="text-xs font-mono uppercase tracking-wider" style={{ color }}>{card.title}</h4>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)]">Primary answer</span>
          </div>
          {body}
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <h4 className="text-xs font-mono uppercase tracking-wider" style={{ color }}>{card.title}</h4>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--dim)]">{expanded ? 'Hide' : 'Show'}</span>
          </button>
          {expanded && body}
        </>
      )}
    </div>
  );
}

/* ---- Markdown export ---------------------------------------------------- */

function cardToMarkdown(card: any): string {
  const c = card?.content ?? {};
  const lines: string[] = [`### ${card.title ?? 'Card'}`];

  switch (card.type) {
    case 'analysis':
      (c.points ?? []).forEach((p: any) => lines.push(`- **${p.label}:** ${p.value}`));
      break;
    case 'risk':
      (c.risks ?? []).forEach((r: any) =>
        lines.push(`- **${r.name}** (${r.impact}${r.probability != null ? `, ${r.probability}%` : ''}) — ${r.mitigation}`),
      );
      break;
    case 'roadmap':
      (c.milestones ?? c.phases ?? []).forEach((m: any) => {
        const head = m.period ?? m.phase ?? '';
        const title = m.title ? ` — ${m.title}` : '';
        lines.push(`- **${head}${title}:** ${m.goal ?? m.description ?? ''}`);
        (m.actions ?? []).forEach((a: string) => lines.push(`  - ${a}`));
        if (m.metric) lines.push(`  - _Success metric: ${m.metric}_`);
      });
      break;
    case 'market':
      if (c.tam || c.sam || c.som || c.growth)
        lines.push(`- TAM ${c.tam ?? '—'} · SAM ${c.sam ?? '—'} · SOM ${c.som ?? '—'} · Growth ${c.growth ?? '—'}`);
      (c.competitors ?? []).forEach((x: string) => lines.push(`- ${x}`));
      if (c.whitespace) lines.push(`- **Whitespace:** ${c.whitespace}`);
      break;
    case 'decision':
      (c.options ?? []).forEach((o: any) => lines.push(`- **${o.name}:** ${o.verdict ?? ''}`));
      if (c.recommendation) lines.push(`- **Recommendation:** ${c.recommendation}`);
      break;
    case 'precedent':
      (c.precedents ?? []).forEach((p: any) =>
        lines.push(`- **${p.company}** (${p.year}${p.outcome ? `, ${p.outcome}` : ''}): ${p.lesson}`),
      );
      break;
    default:
      lines.push('```json', JSON.stringify(c, null, 2), '```');
  }
  return lines.join('\n');
}

function messageToMarkdown(msg: ChatMessage): string {
  const parts: string[] = ['# Venus AI Analysis', ''];
  if (msg.content) parts.push(msg.content, '');
  (msg.cards ?? []).forEach((card: any) => {
    parts.push(cardToMarkdown(card), '');
  });
  parts.push(`---`, `_Generated by Venus AI · ${new Date().toLocaleString()}_`);
  return parts.join('\n');
}

function VenusResponseActions({ msg, onSave }: { msg: ChatMessage; onSave: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageToMarkdown(msg));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([messageToMarkdown(msg)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `venus-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const btn =
    'flex items-center gap-1.5 text-[10px] font-mono text-[var(--dim)] hover:text-[var(--mint)] transition-colors border border-[var(--border)] hover:border-[var(--mint)]/40 px-2.5 py-1 rounded';

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
      <button onClick={handleCopy} className={btn} title="Copy as Markdown">
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy MD'}
      </button>
      <button onClick={handleDownload} className={btn} title="Download as .md report">
        <Download className="w-3 h-3" />
        .md
      </button>
      <button onClick={handleSave} className={btn} title="Save to library">
        <Check className={`w-3 h-3 ${saved ? 'text-[var(--mint)]' : ''}`} />
        {saved ? 'Saved' : `Save as ${typeLabel(detectAnalysisType(msg.content ?? '', msg.cards))}`}
      </button>
    </div>
  );
}
