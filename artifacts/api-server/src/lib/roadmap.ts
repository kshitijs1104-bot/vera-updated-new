import { db, roadmapsTable, type Roadmap, type RoadmapPhase } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

// Service layer for the durable Roadmap Tracker (see
// lib/db/src/schema/roadmaps.ts). Turns the ephemeral "roadmap" card type
// already produced by /ai/analyze into trackable state: phases/actions
// persist and can be marked done, instead of being regenerated from
// scratch (with no memory of prior progress) every time a founder asks.

// Raw shape of a "roadmap" card's `content` field as produced by the model
// (see groq.ts's card schema and summarizeCardForLogging in ai.ts) — phases
// carry actions as plain strings, not yet the {text,status} shape this
// table stores them in.
interface RawRoadmapCardContent {
  horizon?: string;
  phases?: Array<{ period?: string; title?: string; metric?: string; actions?: string[] }>;
}

function normalizePhases(raw: RawRoadmapCardContent): RoadmapPhase[] {
  if (!Array.isArray(raw.phases)) return [];
  return raw.phases
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      period: typeof p.period === "string" ? p.period : "",
      title: typeof p.title === "string" ? p.title : "",
      metric: typeof p.metric === "string" ? p.metric : undefined,
      actions: (Array.isArray(p.actions) ? p.actions : [])
        .filter((a) => typeof a === "string" && a.trim())
        .map((a) => ({ text: a, status: "pending" as const })),
    }));
}

function normalizeActionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Reconciles a freshly-generated roadmap card onto the founder's EXISTING
// roadmap for this chat, additive-only: an existing phase is matched to an
// incoming one by `period` (case-insensitive), and only genuinely new
// actions (deduped by normalized text) get appended to it. An existing
// action's text and status are never touched, and no phase or action is
// ever removed.
//
// WHY additive-only rather than a smarter diff/replace: Venus regenerates a
// roadmap card every time a founder asks a roadmap-shaped question, often a
// few prompts apart, from scratch with no memory of the founder's own
// phrasing of an action they already checked off. A text-similarity merge
// that tries to be clever about "this is the same action, just reworded"
// risks silently losing a founder's completed progress the moment the
// model's wording drifts even slightly — a MUCH worse failure than the
// roadmap slowly accumulating a few actions that turned out redundant.
// Additive-only trades a small amount of eventual clutter for a hard
// guarantee that nothing done ever un-happens.
function mergePhases(existingPhases: RoadmapPhase[], incomingPhases: RoadmapPhase[]): RoadmapPhase[] {
  const merged = existingPhases.map((p) => ({ ...p, actions: p.actions.map((a) => ({ ...a })) }));

  for (const incoming of incomingPhases) {
    const match = merged.find((p) => p.period.trim().toLowerCase() === incoming.period.trim().toLowerCase());
    if (!match) {
      merged.push(incoming);
      continue;
    }
    if (incoming.title) match.title = incoming.title;
    if (incoming.metric) match.metric = incoming.metric;

    const existingTexts = new Set(match.actions.map((a) => normalizeActionText(a.text)));
    for (const action of incoming.actions) {
      const norm = normalizeActionText(action.text);
      if (existingTexts.has(norm)) continue;
      match.actions.push(action);
      existingTexts.add(norm);
    }
  }

  return merged;
}

// Materializes a roadmap card into durable state for this chat. The first
// time, this inserts a new active row. Every time after, it UPDATES that
// same row in place via mergePhases above rather than replacing it — a
// chat's roadmap is meant to be one evolving plan, not a new snapshot every
// couple of prompts (which either buries the founder in stale "superseded"
// roadmaps or, worse, silently discards whatever they'd already checked
// off). `status: "superseded"` still exists on the schema for a possible
// future explicit "start this roadmap over" action, but the automatic path
// here no longer uses it.
// Best-effort: returns null on any failure rather than throwing, since this
// is always called fire-and-forget alongside autoLogDecisionCards and must
// never affect the chat response the founder is waiting on.
export async function materializeRoadmapFromCard(params: {
  userId: string;
  chatId: number;
  sourceDecisionId?: number | null;
  title: string;
  cardContent: unknown;
}): Promise<Roadmap | null> {
  try {
    const raw = (params.cardContent && typeof params.cardContent === "object" ? params.cardContent : {}) as RawRoadmapCardContent;
    const incomingPhases = normalizePhases(raw);
    if (incomingPhases.length === 0) return null; // nothing meaningful to track

    const existing = await getActiveRoadmap(params.chatId);

    if (existing) {
      const merged = mergePhases(parsePhases(existing), incomingPhases);
      const [updated] = await db
        .update(roadmapsTable)
        .set({
          title: params.title,
          horizon: raw.horizon ?? existing.horizon,
          phasesJson: JSON.stringify(merged),
          sourceDecisionId: params.sourceDecisionId ?? existing.sourceDecisionId,
          updatedAt: new Date(),
        })
        .where(eq(roadmapsTable.id, existing.id))
        .returning();
      return updated ?? null;
    }

    const [row] = await db
      .insert(roadmapsTable)
      .values({
        chatId: params.chatId,
        userId: params.userId,
        title: params.title,
        horizon: raw.horizon ?? null,
        phasesJson: JSON.stringify(incomingPhases),
        status: "active",
        sourceDecisionId: params.sourceDecisionId ?? null,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    console.error("[roadmap] failed to materialize roadmap from card", err);
    return null;
  }
}

export async function getActiveRoadmap(chatId: number): Promise<Roadmap | null> {
  try {
    const [row] = await db
      .select()
      .from(roadmapsTable)
      .where(and(eq(roadmapsTable.chatId, chatId), eq(roadmapsTable.status, "active")))
      .orderBy(desc(roadmapsTable.createdAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("[roadmap] failed to load active roadmap, degrading to none", err);
    return null;
  }
}

export function parsePhases(roadmap: Roadmap): RoadmapPhase[] {
  try {
    const parsed = JSON.parse(roadmap.phasesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Marks a single action within a phase done/pending/skipped in place. This
// is the mechanism that makes the roadmap an actually-tracked plan instead
// of a static snapshot — accountability requires being able to check
// something off and have it stay checked off on the next read.
export async function setRoadmapActionStatus(
  roadmapId: number,
  phaseIndex: number,
  actionIndex: number,
  status: "pending" | "done" | "skipped",
): Promise<Roadmap | null> {
  try {
    const [existing] = await db.select().from(roadmapsTable).where(eq(roadmapsTable.id, roadmapId)).limit(1);
    if (!existing) return null;

    const phases = parsePhases(existing);
    const phase = phases[phaseIndex];
    if (!phase || !Array.isArray(phase.actions) || !phase.actions[actionIndex]) return null;

    phase.actions[actionIndex] = {
      ...phase.actions[actionIndex],
      status,
      completedAt: status === "done" ? new Date().toISOString() : undefined,
    };

    const [updated] = await db
      .update(roadmapsTable)
      .set({ phasesJson: JSON.stringify(phases), updatedAt: new Date() })
      .where(eq(roadmapsTable.id, roadmapId))
      .returning();
    return updated ?? null;
  } catch (err) {
    console.error("[roadmap] failed to update action status", err);
    return null;
  }
}
