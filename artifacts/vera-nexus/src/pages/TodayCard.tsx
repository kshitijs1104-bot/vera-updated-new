import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Sunrise, ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, Minus, X, Check } from 'lucide-react';
import {
  useGoals,
  useDailyBrief,
  useAddCompanyFact,
  useRoadmap,
  useSetRoadmapActionStatus,
} from '../lib/venusApi';
import { reportSubTaskOutcome, type OutcomeSentiment } from './GoalPanel';

// Morning Check-In + Decision Inbox — NOT new features, both are views over
// the same Goal/Roadmap/Decision/Company-Memory data GoalPanel,
// RoadmapTracker, and DecisionsOverview already read and write. This card
// renders nothing on a day with nothing to say, and disappears for the rest
// of the day the moment the founder engages with it (answers/skips the
// check-in, or dismisses the inbox) — same once-a-day localStorage gate
// GoalPanel's OutcomeReminderBanner already uses, just for the whole card
// rather than one goal's reminder.
const DISMISS_KEY = 've_today_seen';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === todayKey();
  } catch {
    return false;
  }
}

function dismissToday() {
  try {
    localStorage.setItem(DISMISS_KEY, todayKey());
  } catch {
    // Best-effort — a private-browsing tab with no localStorage just means
    // the card can reappear next reload, which is harmless.
  }
}

type CheckinStep =
  | { kind: 'subtask'; subtaskId: number; summary: string }
  | { kind: 'roadmap'; roadmapId: number; phaseIndex: number; actionIndex: number; text: string }
  | { kind: 'freeform' };

const SENTIMENT_OPTIONS: { value: OutcomeSentiment; label: string; Icon: typeof ThumbsUp; color: string }[] = [
  { value: 'positive', label: 'Worked', Icon: ThumbsUp, color: 'var(--v7-cyan)' },
  { value: 'mixed', label: 'Mixed', Icon: Minus, color: 'var(--amber, #d9a441)' },
  { value: 'negative', label: "Didn't work", Icon: ThumbsDown, color: 'var(--red, #e5555c)' },
];

// The one question for the day — chosen by adapting to the active goal, in
// priority order: an unresolved outcome first (it's the only thing that
// moves the goal's evidence score), then the next pending roadmap action,
// then — only if there's no active goal to ask about at all — a single
// open-ended prompt. Never more than one question.
function SubtaskStep({ subtaskId, summary, onDone }: { subtaskId: number; summary: string; onDone: () => void }) {
  const [sentiment, setSentiment] = useState<OutcomeSentiment | null>(null);
  const [outcome, setOutcome] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = sentiment && outcome.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !sentiment) return;
    setSubmitting(true);
    try {
      await reportSubTaskOutcome(subtaskId, outcome.trim(), sentiment);
      onDone();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="text-[12.5px] mb-2" style={{ color: 'var(--v7-text)' }}>
        Any movement on <span style={{ color: 'var(--v7-text-dim)' }}>&ldquo;{summary}&rdquo;</span>?
      </div>
      <div className="flex gap-1.5 mb-2">
        {SENTIMENT_OPTIONS.map(({ value, label, Icon, color }) => {
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
      <div className="flex items-center gap-2">
        <input
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="What actually happened? (one line)"
          className="flex-1 text-[12px] rounded-md px-2 py-1.5"
          style={{ background: 'var(--v7-bg-raised-2)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))', color: 'var(--v7-text)' }}
        />
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md shrink-0"
          style={{
            background: canSubmit ? 'var(--v7-cyan-soft)' : 'transparent',
            border: `1px solid ${canSubmit ? 'var(--v7-cyan-strong)' : 'var(--v7-border, rgba(255,255,255,0.08))'}`,
            color: canSubmit ? 'var(--v7-cyan)' : 'var(--v7-text-mute)',
          }}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function RoadmapStep({
  roadmapId,
  phaseIndex,
  actionIndex,
  text,
  onDone,
}: {
  roadmapId: number;
  phaseIndex: number;
  actionIndex: number;
  text: string;
  onDone: () => void;
}) {
  const setAction = useSetRoadmapActionStatus();

  const markDone = () => {
    setAction.mutate({ roadmapId, phaseIndex, actionIndex, status: 'done' }, { onSuccess: onDone });
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[12.5px]" style={{ color: 'var(--v7-text)' }}>
        Did you get to <span style={{ color: 'var(--v7-text-dim)' }}>&ldquo;{text}&rdquo;</span>?
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          disabled={setAction.isPending}
          onClick={markDone}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md"
          style={{ background: 'var(--v7-cyan-soft)', border: '1px solid var(--v7-cyan-strong)', color: 'var(--v7-cyan)' }}
        >
          <Check className="w-3 h-3" />
          Done
        </button>
        <button onClick={onDone} className="text-[11px]" style={{ color: 'var(--v7-text-mute)' }}>
          Not yet
        </button>
      </div>
    </div>
  );
}

function FreeformStep({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const addFact = useAddCompanyFact();

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addFact.mutate({ factText: trimmed, sourceType: 'checkin' }, { onSuccess: onDone });
  };

  return (
    <div>
      <div className="text-[12.5px] mb-2" style={{ color: 'var(--v7-text)' }}>
        Anything changed since last time?
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="e.g. we shipped the pricing change"
          className="flex-1 text-[12px] rounded-md px-2 py-1.5"
          style={{ background: 'var(--v7-bg-raised-2)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))', color: 'var(--v7-text)' }}
        />
        <button
          disabled={!text.trim() || addFact.isPending}
          onClick={handleSubmit}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md shrink-0"
          style={{
            background: text.trim() ? 'var(--v7-cyan-soft)' : 'transparent',
            border: `1px solid ${text.trim() ? 'var(--v7-cyan-strong)' : 'var(--v7-border, rgba(255,255,255,0.08))'}`,
            color: text.trim() ? 'var(--v7-cyan)' : 'var(--v7-text-mute)',
          }}
        >
          {addFact.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function TodayCard() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(isDismissedToday);

  const goalsQuery = useGoals();
  const activeGoal = useMemo(() => {
    // /api/goals already orders most-recently-updated first, so the first
    // active row IS "the" active goal a founder is currently pushing on.
    return goalsQuery.data?.goals.find((g) => g.status === 'active') ?? null;
  }, [goalsQuery.data]);

  const roadmapQuery = useRoadmap(activeGoal?.chatId);
  const briefQuery = useDailyBrief();

  const checkinStep = useMemo<CheckinStep | null>(() => {
    if (activeGoal) {
      const openSubtask = activeGoal.subTasks.find((t) => t.status === 'open');
      if (openSubtask) return { kind: 'subtask', subtaskId: openSubtask.id, summary: openSubtask.summary };

      const roadmap = roadmapQuery.data;
      if (roadmap) {
        for (let phaseIndex = 0; phaseIndex < roadmap.phases.length; phaseIndex++) {
          const actionIndex = roadmap.phases[phaseIndex].actions.findIndex((a) => a.status === 'pending');
          if (actionIndex !== -1) {
            return { kind: 'roadmap', roadmapId: roadmap.id, phaseIndex, actionIndex, text: roadmap.phases[phaseIndex].actions[actionIndex].text };
          }
        }
      }
      // Active goal exists but nothing open to ask about — genuinely
      // nothing to check in on, not a fallback-to-generic-question moment.
      return null;
    }
    // No active goal at all. Wait for the goals list to actually resolve so
    // this doesn't briefly show, then disappear, once real goals load.
    return goalsQuery.isSuccess ? { kind: 'freeform' } : null;
  }, [activeGoal, roadmapQuery.data, goalsQuery.isSuccess]);

  const inboxItems = useMemo(() => {
    const brief = briefQuery.data;
    if (!brief) return [];
    const items: { key: string; label: string; text: string; onClick?: () => void }[] = [];
    if (brief.topDecision) {
      items.push({ key: 'decision', label: 'Decision', text: brief.topDecision.query, onClick: () => navigate('/venus/decisions') });
    }
    if (brief.biggestRisk) {
      items.push({
        key: 'risk',
        label: brief.biggestRisk.risk === 'off_track' ? 'Off track' : 'At risk',
        text: brief.biggestRisk.title,
        onClick: () => navigate('/venus/goals'),
      });
    }
    if (brief.blockedTask) {
      items.push({ key: 'blocked', label: 'Blocked', text: brief.blockedTask.actionText });
    }
    if (brief.assumptionChange) {
      const text = brief.assumptionChange.previousText
        ? `Was "${brief.assumptionChange.previousText}" — now "${brief.assumptionChange.currentText}"`
        : brief.assumptionChange.currentText;
      items.push({ key: 'assumption', label: 'Changed', text });
    }
    return items;
  }, [briefQuery.data, navigate]);

  const handleDismiss = () => {
    dismissToday();
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!checkinStep && inboxItems.length === 0) return null;

  if (!open) {
    const parts: string[] = [];
    if (checkinStep) parts.push('1 quick question');
    if (inboxItems.length > 0) parts.push(`${inboxItems.length} flagged`);
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left mb-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
        style={{ background: 'var(--v7-bg-raised)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Sunrise className="w-3 h-3 shrink-0" style={{ color: 'var(--v7-cyan)' }} />
          <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--v7-text)' }}>
            Good morning — {parts.join(' · ')}
          </span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--v7-text-mute)' }} />
      </button>
    );
  }

  return (
    <div className="mb-2.5 p-3 rounded-xl" style={{ background: 'var(--v7-bg-raised)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--v7-text)' }}>
          <Sunrise className="w-3.5 h-3.5" style={{ color: 'var(--v7-cyan)' }} />
          Today
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(false)}>
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--v7-text-mute)' }} />
          </button>
          <button onClick={handleDismiss} aria-label="Dismiss for today">
            <X className="w-3.5 h-3.5" style={{ color: 'var(--v7-text-mute)' }} />
          </button>
        </div>
      </div>

      {checkinStep && (
        <div className="pb-2.5 mb-2.5" style={{ borderBottom: inboxItems.length > 0 ? '1px solid var(--v7-border, rgba(255,255,255,0.08))' : 'none' }}>
          {checkinStep.kind === 'subtask' && (
            <SubtaskStep subtaskId={checkinStep.subtaskId} summary={checkinStep.summary} onDone={handleDismiss} />
          )}
          {checkinStep.kind === 'roadmap' && (
            <RoadmapStep
              roadmapId={checkinStep.roadmapId}
              phaseIndex={checkinStep.phaseIndex}
              actionIndex={checkinStep.actionIndex}
              text={checkinStep.text}
              onDone={handleDismiss}
            />
          )}
          {checkinStep.kind === 'freeform' && <FreeformStep onDone={handleDismiss} />}
        </div>
      )}

      {inboxItems.length > 0 && (
        <div className="space-y-1.5">
          {inboxItems.map((item) => (
            <div
              key={item.key}
              onClick={item.onClick}
              role={item.onClick ? 'button' : undefined}
              tabIndex={item.onClick ? 0 : undefined}
              onKeyDown={item.onClick ? (e) => { if (e.key === 'Enter') item.onClick!(); } : undefined}
              className="w-full flex items-baseline gap-2 text-left"
              style={{ cursor: item.onClick ? 'pointer' : 'default' }}
            >
              <span
                className="text-[9.5px] font-mono uppercase shrink-0 px-1.5 py-0.5 rounded"
                style={{ background: 'var(--v7-bg-raised-2)', color: 'var(--v7-text-mute)' }}
              >
                {item.label}
              </span>
              <span
                className="text-[12px] truncate"
                style={{
                  color: item.onClick ? 'var(--v7-text-dim)' : 'var(--v7-text-mute)',
                  textDecoration: item.onClick ? 'underline' : 'none',
                  textUnderlineOffset: '2px',
                }}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
