import { useAutopsyChat } from '@workspace/api-client-react';
import { useState, useRef, useEffect } from 'react';
import { GRAVEYARD, type GraveyardEntry } from '../lib/graveyard';

const MAX_ATTEMPTS = 5;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type CompanyState = 'Critical' | 'Deteriorating' | 'Stable' | 'Recovering' | 'Survived' | 'Collapsed';

const STATE_COLORS: Record<string, string> = {
  Critical: 'var(--red)',
  Deteriorating: '#f97316',
  Stable: 'var(--amber)',
  Recovering: 'var(--mint)',
  Survived: 'var(--green)',
  Collapsed: 'var(--red)',
};

const STATE_ICONS: Record<string, string> = {
  Critical: '🔴',
  Deteriorating: '🟠',
  Stable: '🟡',
  Recovering: '🟢',
  Survived: '✅',
  Collapsed: '💀',
};

function CompanyStateBar({ state, attempt }: { state: CompanyState; attempt: number }) {
  const color = STATE_COLORS[state] || 'var(--muted)';
  const attemptsLeft = MAX_ATTEMPTS - attempt;

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border)] bg-[var(--surface2)]/60">
      <div className="flex items-center gap-2">
        <span className="text-lg">{STATE_ICONS[state] || '⚪'}</span>
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color }}>
          {state}
        </span>
      </div>
      <div className="h-4 w-px bg-[var(--border)]"></div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-[var(--dim)]">Decisions remaining:</span>
        <div className="flex gap-1">
          {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded border flex items-center justify-center text-[10px] font-mono"
              style={{
                borderColor: i < attempt ? 'transparent' : 'var(--border2)',
                background: i < attempt ? 'var(--surface3)' : 'var(--indigo)',
                color: i < attempt ? 'var(--dim)' : 'white',
                opacity: i < attempt ? 0.3 : 1,
              }}
            >
              {i < attempt ? '✓' : i + 1}
            </div>
          ))}
        </div>
        <span className="text-xs font-mono text-[var(--muted)]">
          {attemptsLeft > 0 ? `${attemptsLeft} left` : 'Final'}
        </span>
      </div>
    </div>
  );
}

function AutopsyChatModal({ entry, onClose }: { entry: GraveyardEntry; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [companyState, setCompanyState] = useState<CompanyState>('Critical');
  const [gameOver, setGameOver] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [briefingDone, setBriefingDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = useAutopsyChat();

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  // Auto-request opening briefing
  useEffect(() => {
    chatMutation.mutate(
      { id: entry.id, data: { message: '', attempt: 0, history: [] } },
      {
        onSuccess: (data) => {
          setMessages([{ role: 'assistant', content: data.reply }]);
          setCompanyState((data.companyState as CompanyState) || 'Critical');
          setBriefingDone(true);
          scrollToBottom();
        },
      }
    );
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending || gameOver || !briefingDone) return;
    const nextAttempt = attempt + 1;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    chatMutation.mutate(
      {
        id: entry.id,
        data: {
          message: userMsg.content,
          attempt: nextAttempt,
          history: newMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
          setCompanyState((data.companyState as CompanyState) || 'Critical');
          setAttempt(nextAttempt);
          if (data.gameOver) {
            setGameOver(true);
            setOutcome(data.outcome || null);
          }
          scrollToBottom();
          inputRef.current?.focus();
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95">
      <div className="w-full h-full max-w-4xl bg-[var(--bg)] border border-[var(--red)]/30 rounded-xl relative flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        {/* Top bar */}
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-[var(--red)] via-[var(--amber)] to-transparent"></div>
        <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <div className="text-[10px] font-mono text-[var(--red)] uppercase tracking-widest mb-1">Interim CEO Simulation</div>
            <h2 className="text-xl font-syne font-bold text-white">
              Saving <span className="text-[var(--amber)]">{entry.name}</span>
            </h2>
            <p className="text-xs text-[var(--dim)] font-mono mt-0.5">{entry.yearRange} · {entry.sector}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-white text-xl font-mono mt-1 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* State bar */}
        <CompanyStateBar state={companyState} attempt={attempt} />

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
          {!briefingDone && (
            <div className="flex items-center justify-center gap-3 py-12 text-[var(--red)] font-mono text-sm">
              <div className="w-5 h-5 border-2 border-[var(--red)]/20 border-t-[var(--red)] rounded-full animate-spin"></div>
              Connecting to war room...
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-full bg-[var(--red)]/20 border border-[var(--red)]/40 flex items-center justify-center text-sm shrink-0 mt-0.5">
                  🤖
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--indigo)]/20 border border-[var(--indigo)]/40 flex items-center justify-center text-sm shrink-0 mt-0.5">
                  👤
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`text-[10px] font-mono uppercase tracking-wider ${msg.role === 'user' ? 'text-[var(--indigo-light)]' : 'text-[var(--red)]'}`}>
                  {msg.role === 'user' ? 'You (Interim CEO)' : 'Company Simulator'}
                </div>
                <div
                  className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[var(--indigo)]/20 border border-[var(--indigo)]/30 text-[var(--text)]'
                      : 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)]'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {chatMutation.isPending && briefingDone && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--red)]/20 border border-[var(--red)]/40 flex items-center justify-center text-sm shrink-0 mt-0.5">
                🤖
              </div>
              <div className="bg-[var(--surface2)] border border-[var(--border)] px-4 py-3 rounded-xl">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-[var(--red)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-[var(--red)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-[var(--red)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Game over banner */}
          {gameOver && (
            <div className={`border rounded-xl p-6 text-center ${outcome === 'survived' ? 'border-[var(--mint)]/40 bg-[var(--mint)]/5' : 'border-[var(--red)]/40 bg-[var(--red)]/5'}`}>
              <div className="text-4xl mb-3">{outcome === 'survived' ? '🏆' : '⚰️'}</div>
              <div className={`text-xl font-syne font-bold mb-1 ${outcome === 'survived' ? 'text-[var(--mint)]' : 'text-[var(--red)]'}`}>
                {outcome === 'survived' ? 'Company Survived' : 'Company Collapsed'}
              </div>
              <div className="text-sm text-[var(--muted)]">
                {outcome === 'survived'
                  ? 'Your decisions steered the company through the crisis.'
                  : `${entry.name} is now part of the Corporate Graveyard.`}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        {!gameOver && briefingDone && (
          <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface2)]/40 shrink-0">
            <div className="text-[10px] font-mono text-[var(--dim)] mb-2 uppercase tracking-wider">
              Decision #{attempt + 1} of {MAX_ATTEMPTS} — What's your move as Interim CEO?
            </div>
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your decision... (Enter to send, Shift+Enter for new line)"
                rows={2}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--dim)] resize-none focus:outline-none focus:border-[var(--red)]/60 font-mono"
                disabled={chatMutation.isPending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="px-5 py-3 bg-[var(--red)] hover:bg-[var(--red)]/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shrink-0"
              >
                Execute →
              </button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="px-6 py-4 border-t border-[var(--border)] text-center shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-[var(--border2)] text-[var(--muted)] hover:text-white hover:border-white transition-colors text-sm font-mono rounded-lg"
            >
              Return to Graveyard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CryptPage() {
  const [selected, setSelected] = useState<GraveyardEntry | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-10 text-center py-10 border-b border-[var(--border2)] bg-gradient-to-b from-transparent to-[var(--surface2)]/30 rounded-t-2xl">
        <h1 className="text-4xl font-syne font-extrabold text-[var(--red)] tracking-tight mb-2 opacity-90">Corporate Graveyard</h1>
        <p className="text-sm font-mono text-[var(--muted)] uppercase tracking-widest">Step in as Interim CEO — 5 decisions to save the company</p>
      </header>

      <div className="grid grid-cols-2 gap-6">
        {GRAVEYARD.map(entry => (
          <div key={entry.id} className="bg-[var(--surface)] border border-[var(--border2)] rounded-lg p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>

            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <h2 className="text-2xl font-syne font-bold text-[var(--amber)]">{entry.name}</h2>
                <div className="text-[10px] font-mono text-[var(--dim)] uppercase tracking-wider mt-1">{entry.sector}</div>
              </div>
              <span className="text-xs font-mono text-[var(--muted)] px-2 py-1 border border-[var(--border)] rounded bg-[var(--surface2)] shrink-0 ml-4">
                {entry.yearRange}
              </span>
            </div>

            <p className="text-sm text-[var(--muted)] mb-4 line-clamp-2 leading-relaxed relative z-10">{entry.description}</p>

            {entry.keyMetrics && (
              <div className="text-[11px] font-mono text-[var(--dim)] bg-[var(--surface2)] border border-[var(--border)] rounded px-3 py-2 mb-4 relative z-10">
                {entry.keyMetrics}
              </div>
            )}

            <div className="flex items-center justify-between mt-auto relative z-10">
              <div className="flex gap-2 flex-wrap">
                {entry.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] uppercase font-mono px-2 py-1 bg-[var(--surface2)] text-[var(--dim)] rounded border border-[var(--border)]">
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setSelected(entry)}
                className="px-4 py-2 border border-[var(--red)]/50 text-[var(--red)] hover:bg-[var(--red)] hover:text-white transition-all text-xs font-bold uppercase tracking-wider rounded shrink-0 ml-4"
              >
                Enter as CEO →
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <AutopsyChatModal entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
