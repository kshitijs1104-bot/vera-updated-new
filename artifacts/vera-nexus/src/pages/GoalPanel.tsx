import { useState } from 'react';
import { Target, X, TrendingUp, AlertTriangle, CheckCircle2, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import {
  useGetChat,
  useSetChatGoal,
  useClearChatGoal,
  useSetGoalStatus,
} from '@workspace/api-client-react';
import type { ChatWithGoal, GoalWithProgress } from '@workspace/api-client-react';

// /ai/decisions/:id/outcome isn't in the OpenAPI spec yet (it predates the
// Goal feature's client generation), so there's no generated hook for it.
// Raw fetch, same pattern as the company-report call elsewhere in Venus.tsx —
// cookies carry auth for same-origin requests in this app, no bearer token
// needed. This is the ONLY write path that moves a goal's evidenceScore
// (see goalEvidence.ts): reporting a subtask's real-world outcome here is
// what lets the Origin──Target marker actually move, including backward on
// a reported failure.
type OutcomeSentiment = 'positive' | 'negative' | 'mixed';

async function reportSubTaskOutcome(id: number, outcome: string, sentiment: OutcomeSentiment) {
  const response = await fetch(`/api/ai/decisions/${id}/outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome, sentiment }),
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

// This panel is the actual UI surface for the Goal feature — set once per
// chat, like a Claude Project's custom instructions, with the three fields
// (successMetric, valueInr, deadline) that are the ONLY inputs letting Venus
// reason about urgency/expected-value/trade-offs at all. Deliberately does
// NOT render a uniform progress bar: the position on the line is driven by
// resolved evidence (see goalEvidence.ts), and sub-tasks are listed with
// their own resolved/open/outcome status rather than a checked-off count.
interface GoalPanelProps {
  serverChatId: number | undefined;
  // Called once a chat is lazily created server-side so the parent can
  // persist serverChatId onto the local ChatSession before the goal form
  // can actually target something.
  onRequireServerChat: () => Promise<number>;
}

function formatInr(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

function riskLabel(risk: GoalWithProgress['risk']): { label: string; color: string; Icon: typeof TrendingUp } {
  if (risk === 'on_track') return { label: 'On track', color: 'var(--v7-cyan)', Icon: TrendingUp };
  if (risk === 'at_risk') return { label: 'At risk', color: 'var(--amber, #d9a441)', Icon: AlertTriangle };
  return { label: 'Off track', color: 'var(--red, #e5555c)', Icon: AlertTriangle };
}

// `position` is a soft-compressed [0,1] display value, not the raw evidence
// score — rounding it straight to a percentage is the correct, honest
// reading of "how far along the line the marker sits," which is exactly
// what a founder glancing at the bar wants to know. Floor rather than round
// so a goal never reads as e.g. "100%" until it has actually reached the
// visual end of the line.
function goalPercent(goal: GoalWithProgress): number {
  return Math.max(0, Math.min(100, Math.floor(goal.position * 100)));
}

// The Origin ──────◉────── Target line itself. `position` (0..1, already
// soft-compressed past the ends server-side) places the marker; it is NEVER
// a fraction of (tasks done / total tasks) — it's evidence weight. A
// position past 1 or below 0 visually would mean the mapping broke, so the
// bar itself still clamps only the rendered dot to [2%, 98%] for layout
// safety while the raw position value (which can exceed that range slightly
// pre-clamp) is what drives color/label logic above it.
function EvidenceLine({ goal, big }: { goal: GoalWithProgress; big?: boolean }) {
  const clampedPct = Math.max(2, Math.min(98, goal.position * 100));
  const { label, color, Icon } = riskLabel(goal.risk);
  const pct = goalPercent(goal);
  return (
    <div className={big ? 'mt-2' : 'mt-3'}>
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-mono font-bold"
          style={{ color, fontSize: big ? 26 : 15, lineHeight: 1, letterSpacing: '-0.01em' }}
        >
          {pct}%
        </span>
        <span className="flex items-center gap-1 text-[11px] font-mono" style={{ color }}>
          <Icon className="w-3 h-3" />
          {label}
        </span>
      </div>
      <div className="relative rounded-full" style={{ height: big ? 8 : 6, background: 'var(--v7-bg-raised-2)' }}>
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${clampedPct}%`, background: color, opacity: 0.35, transition: 'width 0.4s ease' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: big ? 14 : 12,
            height: big ? 14 : 12,
            left: `calc(${clampedPct}% - ${big ? 7 : 6}px)`,
            background: 'var(--v7-bg)',
            borderColor: color,
            boxShadow: `0 0 10px -2px ${color}`,
            transition: 'left 0.4s ease',
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--v7-text-mute)' }}>
        <span>Origin</span>
        <span className="text-right" style={{ maxWidth: '70%' }}>{goal.successMetric}</span>
      </div>
    </div>
  );
}

// Small inline form for reporting what actually happened with an open
// subtask. This was the missing piece: the backend (goalEvidence.ts,
// /ai/decisions/:id/outcome) already knew how to move the goal's
// evidenceScore off a sentiment, but nothing in the UI ever sent one.
function ReportOutcomeForm({ taskId, onDone }: { taskId: number; onDone: () => void }) {
  const [outcome, setOutcome] = useState('');
  const [sentiment, setSentiment] = useState<OutcomeSentiment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentimentOptions: { value: OutcomeSentiment; label: string; Icon: typeof ThumbsUp; color: string }[] = [
    { value: 'positive', label: 'Worked', Icon: ThumbsUp, color: 'var(--v7-cyan)' },
    { value: 'mixed', label: 'Mixed', Icon: Minus, color: 'var(--amber, #d9a441)' },
    { value: 'negative', label: "Didn't work", Icon: ThumbsDown, color: 'var(--red, #e5555c)' },
  ];

  const canSubmit = outcome.trim() && sentiment && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !sentiment) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportSubTaskOutcome(taskId, outcome.trim(), sentiment);
      onDone();
    } catch (e) {
      setError('Failed to save — try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 p-2 rounded-lg" style={{ background: 'var(--v7-bg-raised-2)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}>
      <div className="flex gap-1.5 mb-2">
        {sentimentOptions.map(({ value, label, Icon, color }) => {
          const active = sentiment === value;
          return (
            <button
              key={value}
              onClick={() => setSentiment(value)}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md"
              style={{
                color: active ? color : 'var(--v7-text-mute)',
                background: active ? `${color}1a` : 'transparent',
                border: `1px solid ${active ? color : 'var(--v7-border, rgba(255,255,255,0.08))'}`,
              }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          );
        })}
      </div>
      <textarea
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="What actually happened?"
        rows={2}
        className="w-full text-[12px] rounded-md px-2 py-1.5"
        style={{
          background: 'var(--v7-bg)',
          border: '1px solid var(--v7-border, rgba(255,255,255,0.08))',
          color: 'var(--v7-text)',
          resize: 'none',
        }}
      />
      {error && <div className="text-[11px] mt-1" style={{ color: 'var(--red, #e5555c)' }}>{error}</div>}
      <div className="flex gap-2 mt-2">
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
          style={{
            background: canSubmit ? 'var(--v7-cyan-soft)' : 'transparent',
            border: `1px solid ${canSubmit ? 'var(--v7-cyan-strong)' : 'var(--v7-border, rgba(255,255,255,0.08))'}`,
            color: canSubmit ? 'var(--v7-cyan)' : 'var(--v7-text-mute)',
          }}
        >
          {submitting ? 'Saving…' : 'Save outcome'}
        </button>
        <button onClick={onDone} className="text-[11px]" style={{ color: 'var(--v7-text-mute)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function SubTaskList({ subTasks, onResolved }: { subTasks: GoalWithProgress['subTasks']; onResolved: () => void }) {
  const [reportingId, setReportingId] = useState<number | null>(null);

  if (subTasks.length === 0) {
    return (
      <div className="text-[12px] mt-3" style={{ color: 'var(--v7-text-mute)' }}>
        No roadmap items yet — the next decision or roadmap card Venus gives you in this chat becomes evidence here automatically.
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-1.5">
      {subTasks.map((t) => {
        const resolved = t.status === 'resolved';
        const dotColor = t.outcomeSentiment === 'positive'
          ? 'var(--v7-cyan)'
          : t.outcomeSentiment === 'negative'
            ? 'var(--red, #e5555c)'
            : 'var(--v7-text-mute)';
        const reporting = reportingId === t.id;
        return (
          <div key={t.id} className="text-[12px]" style={{ color: 'var(--v7-text-dim)' }}>
            <div className="flex items-start gap-2">
              <span
                className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: resolved ? dotColor : 'transparent', border: resolved ? 'none' : '1px solid var(--v7-text-mute)' }}
              />
              <span className="flex-1">
                {t.summary}
                {!resolved && !reporting && (
                  <>
                    <span style={{ color: 'var(--v7-text-mute)' }}> — not yet resolved · </span>
                    <button
                      onClick={() => setReportingId(t.id)}
                      className="underline underline-offset-2"
                      style={{ color: 'var(--v7-cyan)' }}
                    >
                      report outcome
                    </button>
                  </>
                )}
              </span>
            </div>
            {reporting && (
              <ReportOutcomeForm
                taskId={t.id}
                onDone={() => {
                  setReportingId(null);
                  onResolved();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SetGoalForm({ onSubmit, onCancel, submitting }: {
  onSubmit: (input: { title: string; successMetric: string; valueInr: number; deadline: string }) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [successMetric, setSuccessMetric] = useState('');
  const [valueInr, setValueInr] = useState('');
  const [deadline, setDeadline] = useState('');

  const canSubmit = title.trim() && successMetric.trim() && valueInr.trim() && deadline.trim();

  const inputStyle = {
    width: '100%',
    background: 'var(--v7-bg-raised-2)',
    border: '1px solid var(--v7-border, rgba(255,255,255,0.08))',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 13,
    color: 'var(--v7-text)',
    marginTop: 4,
    marginBottom: 10,
  } as const;
  const labelStyle = { fontSize: 11, fontFamily: 'var(--v7-font-mono)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--v7-text-mute)' };

  return (
    <div>
      <label style={labelStyle}>Goal</label>
      <input
        style={inputStyle}
        placeholder='e.g. "Close Client X"'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label style={labelStyle}>Success metric — the concrete win condition</label>
      <input
        style={inputStyle}
        placeholder='e.g. "Demo scheduled and signed by [date]"'
        value={successMetric}
        onChange={(e) => setSuccessMetric(e.target.value)}
      />
      <label style={labelStyle}>Value if hit (₹)</label>
      <input
        style={inputStyle}
        type="number"
        min={0}
        placeholder="e.g. 500000"
        value={valueInr}
        onChange={(e) => setValueInr(e.target.value)}
      />
      <label style={labelStyle}>Deadline</label>
      <input
        style={inputStyle}
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <div className="text-[11px] mb-3" style={{ color: 'var(--v7-text-mute)' }}>
        All four are required — without a concrete metric, value, and deadline Venus can't reason about urgency or trade-offs in this chat.
      </div>
      <div className="flex gap-2">
        <button
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit({
            title: title.trim(),
            successMetric: successMetric.trim(),
            valueInr: Number(valueInr),
            deadline: new Date(deadline).toISOString(),
          })}
          className="text-[13px] font-semibold px-3 py-2 rounded-lg"
          style={{
            background: canSubmit ? 'var(--v7-cyan-soft)' : 'var(--v7-bg-raised-2)',
            border: `1px solid ${canSubmit ? 'var(--v7-cyan-strong)' : 'transparent'}`,
            color: canSubmit ? 'var(--v7-cyan)' : 'var(--v7-text-mute)',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Saving…' : 'Set Goal'}
        </button>
        <button
          onClick={onCancel}
          className="text-[13px] px-3 py-2 rounded-lg"
          style={{ color: 'var(--v7-text-mute)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function GoalPanel({ serverChatId, onRequireServerChat }: GoalPanelProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const chatQuery = useGetChat(serverChatId ?? -1, { query: { enabled: !!serverChatId, queryKey: ['/api/chats', serverChatId ?? -1] } });
  const setGoal = useSetChatGoal();
  const clearGoal = useClearChatGoal();
  const setStatus = useSetGoalStatus();

  const chat = chatQuery.data as ChatWithGoal | undefined;
  const goal = chat?.goal;

  const handleSubmit = async (input: { title: string; successMetric: string; valueInr: number; deadline: string }) => {
    const id = serverChatId ?? (await onRequireServerChat());
    setGoal.mutate(
      { id, data: input },
      { onSuccess: () => { setEditing(false); chatQuery.refetch(); } },
    );
  };

  const handleClear = () => {
    if (!serverChatId) return;
    clearGoal.mutate({ id: serverChatId }, { onSuccess: () => chatQuery.refetch() });
  };

  const handleResolve = (nextStatus: 'completed' | 'abandoned') => {
    if (!serverChatId) return;
    setStatus.mutate({ id: serverChatId, data: { status: nextStatus } }, { onSuccess: () => chatQuery.refetch() });
  };

  if (!open) {
    // No goal set yet — still a real affordance, just smaller, since there's
    // nothing to show a bar for. Clicking opens the panel to set one.
    if (!goal) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg mb-3"
          style={{ color: 'var(--v7-text-mute)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}
        >
          <Target className="w-3 h-3" />
          No goal set
        </button>
      );
    }

    // The persistent, always-visible bar — replaces the old small pill
    // button. Goal title big and centered, full Origin→Target bar with a
    // percentage underneath, stays on screen whether or not the detail
    // panel is open. Clicking anywhere opens the detail view (the popup
    // from the original screenshot).
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left mb-3 p-3.5 rounded-xl block"
        style={{ background: 'var(--v7-bg-raised)', border: '1px solid var(--v7-cyan-strong)' }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <Target className="w-3.5 h-3.5" style={{ color: 'var(--v7-cyan)' }} />
          <span className="text-[15px] font-bold text-center" style={{ color: 'var(--v7-text)' }}>{goal.title}</span>
        </div>
        <div className="text-[11px] text-center mb-1" style={{ color: 'var(--v7-text-mute)' }}>
          {formatInr(goal.valueInr)} · due {new Date(goal.deadline).toLocaleDateString()}
        </div>
        <EvidenceLine goal={goal} big />
      </button>
    );
  }

  return (
    <div
      className="mb-3 p-3 rounded-xl"
      style={{ background: 'var(--v7-bg-raised)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--v7-text)' }}>
          <Target className="w-3.5 h-3.5" />
          Chat Goal
        </span>
        <button onClick={() => setOpen(false)}>
          <X className="w-3.5 h-3.5" style={{ color: 'var(--v7-text-mute)' }} />
        </button>
      </div>

      {!goal && !editing && (
        <div>
          <div className="text-[12px] mb-2" style={{ color: 'var(--v7-text-mute)' }}>
            Give this chat one named goal — Venus will weigh urgency, value, and trade-offs against it in every answer here.
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-[13px] font-semibold px-3 py-2 rounded-lg"
            style={{ background: 'var(--v7-cyan-soft)', border: '1px solid var(--v7-cyan-strong)', color: 'var(--v7-cyan)' }}
          >
            Set Goal
          </button>
        </div>
      )}

      {editing && (
        <SetGoalForm onSubmit={handleSubmit} onCancel={() => setEditing(false)} submitting={setGoal.isPending} />
      )}

      {goal && !editing && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--v7-text)' }}>{goal.title}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--v7-text-mute)' }}>
                {formatInr(goal.valueInr)} · due {new Date(goal.deadline).toLocaleDateString()}
              </div>
            </div>
            {goal.status === 'active' && (
              <div className="flex gap-1 shrink-0">
                <button
                  title="Mark completed"
                  onClick={() => handleResolve('completed')}
                  className="p-1.5 rounded-lg"
                  style={{ color: 'var(--v7-cyan)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {goal.status !== 'active' && (
            <div className="text-[11px] mt-1 font-mono uppercase" style={{ color: 'var(--v7-text-mute)' }}>
              {goal.status}
            </div>
          )}

          <EvidenceLine goal={goal} />
          <SubTaskList subTasks={goal.subTasks} onResolved={() => chatQuery.refetch()} />

          <div className="flex gap-3 mt-3">
            <button onClick={() => setEditing(true)} className="text-[11px]" style={{ color: 'var(--v7-text-mute)' }}>
              Edit
            </button>
            <button onClick={handleClear} className="text-[11px]" style={{ color: 'var(--v7-text-mute)' }}>
              Remove goal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
