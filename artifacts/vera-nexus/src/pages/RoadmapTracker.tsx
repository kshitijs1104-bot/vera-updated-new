import { useState } from 'react';
import { Map, ChevronDown, ChevronRight, Check, Circle, X } from 'lucide-react';
import { useRoadmap, useSetRoadmapActionStatus, type RoadmapAction } from '../lib/venusApi';

// Durable counterpart to the ephemeral "roadmap" card rendered inline in
// chat (see VenusCard's card.type === 'roadmap' branch further down this
// file) — that card is a snapshot of what Venus said once; this reads the
// materialized roadmaps row (see roadmap.ts on the backend) that persists
// and can actually be checked off over time. Scoped to the current chat the
// same way GoalPanel is, and only renders once a roadmap card has actually
// been generated in this chat (404 = no roadmap yet, a normal state).
function actionIcon(status: RoadmapAction['status']) {
  if (status === 'done') return <Check className="w-3 h-3" />;
  if (status === 'skipped') return <X className="w-3 h-3" />;
  return <Circle className="w-2.5 h-2.5" />;
}

function actionColor(status: RoadmapAction['status']) {
  if (status === 'done') return 'var(--v7-cyan)';
  if (status === 'skipped') return 'var(--v7-text-mute)';
  return 'var(--v7-text-mute)';
}

export function RoadmapTracker({ chatId }: { chatId: number | undefined }) {
  const [open, setOpen] = useState(false);
  const roadmapQuery = useRoadmap(chatId);
  const setAction = useSetRoadmapActionStatus();

  const roadmap = roadmapQuery.data;
  if (!chatId || !roadmap || roadmapQuery.isError) return null;

  const totalActions = roadmap.phases.reduce((sum, p) => sum + p.actions.length, 0);
  const doneActions = roadmap.phases.reduce((sum, p) => sum + p.actions.filter((a) => a.status === 'done').length, 0);

  const toggleAction = (phaseIndex: number, actionIndex: number, current: RoadmapAction['status']) => {
    const next: RoadmapAction['status'] = current === 'done' ? 'pending' : 'done';
    setAction.mutate({ roadmapId: roadmap.id, phaseIndex, actionIndex, status: next });
  };

  return (
    <div
      className="mb-2.5 rounded-xl overflow-hidden"
      style={{ background: 'var(--v7-bg-raised)', border: '1px solid var(--v7-border, rgba(255,255,255,0.08))' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Map className="w-3 h-3 shrink-0" style={{ color: 'var(--v7-cyan)' }} />
          <span className="text-[12px] font-bold truncate" style={{ color: 'var(--v7-text)' }}>{roadmap.title}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--v7-text-mute)' }}>
            {doneActions}/{totalActions} done
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--v7-text-mute)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--v7-text-mute)' }} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 max-h-[420px] overflow-y-auto">
          {roadmap.phases.map((phase, phaseIndex) => (
            <div key={phaseIndex}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--v7-cyan)' }}>{phase.period}</span>
                {phase.title && <span className="text-[12px] font-semibold" style={{ color: 'var(--v7-text)' }}>{phase.title}</span>}
              </div>
              <div className="space-y-1">
                {phase.actions.map((action, actionIndex) => {
                  const color = actionColor(action.status);
                  return (
                    <button
                      key={actionIndex}
                      onClick={() => toggleAction(phaseIndex, actionIndex, action.status)}
                      disabled={setAction.isPending}
                      className="w-full flex items-start gap-2 text-left py-0.5"
                    >
                      <span
                        className="mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                        style={{ border: `1px solid ${color}`, color, background: action.status === 'done' ? `${color}1a` : 'transparent' }}
                      >
                        {actionIcon(action.status)}
                      </span>
                      <span
                        className="text-[12px] leading-snug"
                        style={{
                          color: action.status === 'done' ? 'var(--v7-text-mute)' : 'var(--v7-text-dim)',
                          textDecoration: action.status === 'done' ? 'line-through' : 'none',
                        }}
                      >
                        {action.text}
                      </span>
                    </button>
                  );
                })}
              </div>
              {phase.metric && (
                <div className="text-[10.5px] font-mono mt-1" style={{ color: 'var(--v7-text-mute)' }}>Metric: {phase.metric}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
