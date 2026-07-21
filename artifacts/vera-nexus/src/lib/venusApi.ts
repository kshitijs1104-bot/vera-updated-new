import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Raw-fetch helpers for backend routes that predate/sit outside the
// generated OpenAPI client (@workspace/api-client-react) — same pattern
// already used by GoalPanel's reportSubTaskOutcome and Venus.tsx's
// company-report call. Cookies carry the Clerk session for same-origin
// requests, so no bearer token needs attaching here.
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

// ---- Goals (cross-chat) ----

export interface GoalSubTask {
  id: number;
  cardType: 'decision' | 'roadmap';
  summary: string;
  status: 'open' | 'resolved' | 'abandoned';
  outcomeSentiment: 'positive' | 'negative' | 'mixed' | null;
}

export interface GoalWithChat {
  id: number;
  chatId: number;
  title: string;
  successMetric: string;
  valueInr: number;
  deadline: string;
  status: 'active' | 'completed' | 'abandoned';
  evidenceScore: number;
  position: number;
  risk: 'on_track' | 'at_risk' | 'off_track';
  chatTitle: string;
  subTasks: GoalSubTask[];
}

export function useGoals() {
  return useQuery({
    queryKey: ['/api/goals'],
    queryFn: () => apiFetch<{ goals: GoalWithChat[] }>('/api/goals'),
  });
}

// ---- Decision Memory ----

export interface VenusDecisionRow {
  id: number;
  chatId: number | null;
  query: string;
  cardType: 'decision' | 'roadmap';
  recommendationSummary: string;
  status: 'open' | 'resolved' | 'abandoned';
  outcome: string | null;
  lesson: string | null;
  outcomeSentiment: 'positive' | 'negative' | 'mixed' | null;
  decisionType: string | null;
  archived: boolean;
  reinforcedCount: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DecisionFilters {
  status?: 'open' | 'resolved' | 'abandoned';
  decisionType?: string;
  includeArchived?: boolean;
}

export function useDecisions(filters: DecisionFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.decisionType) params.set('decisionType', filters.decisionType);
  if (filters.includeArchived) params.set('includeArchived', 'true');
  const qs = params.toString();

  return useQuery({
    queryKey: ['/api/ai/decisions', filters],
    queryFn: () => apiFetch<{ decisions: VenusDecisionRow[] }>(`/api/ai/decisions${qs ? `?${qs}` : ''}`),
  });
}

export function useArchiveDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/ai/decisions/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/ai/decisions'] }),
  });
}

// ---- Roadmap Tracker ----

export interface RoadmapAction {
  text: string;
  status: 'pending' | 'done' | 'skipped';
  completedAt?: string;
}

export interface RoadmapPhase {
  period: string;
  title: string;
  metric?: string;
  actions: RoadmapAction[];
}

export interface RoadmapWithPhases {
  id: number;
  chatId: number;
  title: string;
  horizon: string | null;
  status: 'active' | 'superseded' | 'archived';
  phases: RoadmapPhase[];
}

export function useRoadmap(chatId: number | undefined) {
  return useQuery({
    queryKey: ['/api/chats', chatId, 'roadmap'],
    queryFn: () => apiFetch<RoadmapWithPhases>(`/api/chats/${chatId}/roadmap`),
    enabled: !!chatId,
    // A chat with no roadmap yet 404s — that's an expected, common state
    // (most chats never produce a roadmap card), not a real failure worth
    // retrying or surfacing as an error.
    retry: false,
  });
}

export function useSetRoadmapActionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { roadmapId: number; phaseIndex: number; actionIndex: number; status: RoadmapAction['status'] }) =>
      apiFetch<RoadmapWithPhases>(`/api/roadmaps/${input.roadmapId}/actions`, {
        method: 'PATCH',
        body: JSON.stringify({ phaseIndex: input.phaseIndex, actionIndex: input.actionIndex, status: input.status }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['/api/chats', updated.chatId, 'roadmap'], updated);
    },
  });
}

// ---- Company Memory (facts) ----

export interface CompanyFact {
  id: number;
  factText: string;
  factType: string;
  sourceType: string;
  createdAt: string;
}

export function useCompanyFacts() {
  return useQuery({
    queryKey: ['/api/company-facts'],
    queryFn: () => apiFetch<{ facts: CompanyFact[] }>('/api/company-facts'),
  });
}
