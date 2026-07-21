import { db, goalsTable, venusDecisionsTable, roadmapsTable, companyFactsTable } from "@workspace/db";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { attachGoalProgress } from "../routes/chats";
import { parsePhases } from "./roadmap";

// Read-time rollup for the Decision Inbox — four independent, best-effort
// lookups over tables that already exist (goals, venus_decisions, roadmaps,
// company_facts). Nothing here is stored; like goalEvidence.ts's
// assessGoalRisk, every function is a derivation over current rows and can
// be re-tuned later without a migration. Each degrades to null on no-data
// or error rather than throwing, matching companyMemory.ts's philosophy —
// a missing inbox item is a normal day, not a failure.

export type TopOpenDecision = typeof venusDecisionsTable.$inferSelect;

// Highest-priority open decision = the one the founder has asked about
// (or been given) most often and most recently, and hasn't resolved or
// archived. reinforcedCount is the existing signal for "this keeps coming
// up" (see decisionMemory.ts) — the natural proxy for priority without
// inventing a new field.
export async function getTopOpenDecision(userId: string): Promise<TopOpenDecision | null> {
  try {
    const [row] = await db
      .select()
      .from(venusDecisionsTable)
      .where(
        and(
          eq(venusDecisionsTable.sessionId, userId),
          eq(venusDecisionsTable.status, "open"),
          eq(venusDecisionsTable.archived, false),
        ),
      )
      .orderBy(desc(venusDecisionsTable.reinforcedCount), desc(venusDecisionsTable.createdAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("[dailyBrief] failed to load top open decision", err);
    return null;
  }
}

export type GoalWithProgress = Awaited<ReturnType<typeof attachGoalProgress>>;

const RISK_RANK: Record<GoalWithProgress["risk"], number> = { off_track: 2, at_risk: 1, on_track: 0 };

// Biggest risk = the active goal whose evidence-vs-time trajectory (the
// SAME assessGoalRisk read-time judgment GoalPanel already renders) is
// worst, tie-broken by whichever deadline is soonest. A goal that's
// on_track isn't a "risk" worth an inbox slot at all, even if it's the
// least-good of a good set — this only ever surfaces real risk.
export async function getBiggestRiskGoal(userId: string): Promise<GoalWithProgress | null> {
  try {
    const rows = await db
      .select()
      .from(goalsTable)
      .where(and(eq(goalsTable.userId, userId), eq(goalsTable.status, "active")));
    if (rows.length === 0) return null;

    const withProgress = await Promise.all(rows.map((g) => attachGoalProgress(g)));
    withProgress.sort((a, b) => {
      const riskDiff = RISK_RANK[b.risk] - RISK_RANK[a.risk];
      if (riskDiff !== 0) return riskDiff;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    const worst = withProgress[0];
    return worst.risk === "on_track" ? null : worst;
  } catch (err) {
    console.error("[dailyBrief] failed to load biggest risk goal", err);
    return null;
  }
}

export interface BlockedRoadmapAction {
  roadmapId: number;
  roadmapTitle: string;
  phasePeriod: string;
  actionText: string;
}

// "Blocked task" proxy — roadmaps store actions as pending/done/skipped
// with no explicit blocked flag or per-action timestamp (see roadmap.ts),
// so this surfaces the first still-pending action in plan order (the
// current frontier of the plan), preferring whichever roadmap belongs to
// the chat behind getBiggestRiskGoal (the plan most likely to actually be
// stuck) and otherwise the active roadmap that's gone longest without any
// update.
export async function getBlockedRoadmapAction(
  userId: string,
  preferredChatId?: number | null,
): Promise<BlockedRoadmapAction | null> {
  try {
    const rows = await db
      .select()
      .from(roadmapsTable)
      .where(and(eq(roadmapsTable.userId, userId), eq(roadmapsTable.status, "active")));
    if (rows.length === 0) return null;

    const ordered = [...rows].sort((a, b) => {
      if (preferredChatId != null) {
        if (a.chatId === preferredChatId && b.chatId !== preferredChatId) return -1;
        if (b.chatId === preferredChatId && a.chatId !== preferredChatId) return 1;
      }
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return aTime - bTime;
    });

    for (const roadmap of ordered) {
      for (const phase of parsePhases(roadmap)) {
        const action = phase.actions.find((a) => a.status === "pending");
        if (action) {
          return { roadmapId: roadmap.id, roadmapTitle: roadmap.title, phasePeriod: phase.period, actionText: action.text };
        }
      }
    }
    return null;
  } catch (err) {
    console.error("[dailyBrief] failed to load blocked roadmap action", err);
    return null;
  }
}

export interface AssumptionChange {
  previousText: string | null;
  currentText: string;
  changedAt: Date | null;
}

// "Assumption that changed" — prefers a real supersession pair (a fact
// explicitly corrected via supersedeFact, see companyMemory.ts) so the
// founder sees exactly what was believed before and what replaced it.
// Falls back to the latest Morning Check-In-sourced fact when no
// supersession has happened yet, so this slot has real content from the
// very first check-in instead of staying empty until a correction occurs.
export async function getRecentAssumptionChange(userId: string): Promise<AssumptionChange | null> {
  try {
    const [superseded] = await db
      .select()
      .from(companyFactsTable)
      .where(and(eq(companyFactsTable.userId, userId), isNotNull(companyFactsTable.supersededBy)))
      .orderBy(desc(companyFactsTable.updatedAt))
      .limit(1);

    if (superseded?.supersededBy) {
      const [replacement] = await db
        .select()
        .from(companyFactsTable)
        .where(eq(companyFactsTable.id, superseded.supersededBy))
        .limit(1);
      if (replacement) {
        return { previousText: superseded.factText, currentText: replacement.factText, changedAt: replacement.createdAt };
      }
    }

    const [latestCheckin] = await db
      .select()
      .from(companyFactsTable)
      .where(
        and(
          eq(companyFactsTable.userId, userId),
          eq(companyFactsTable.sourceType, "checkin"),
          isNull(companyFactsTable.supersededBy),
        ),
      )
      .orderBy(desc(companyFactsTable.createdAt))
      .limit(1);

    if (latestCheckin) {
      return { previousText: null, currentText: latestCheckin.factText, changedAt: latestCheckin.createdAt };
    }

    return null;
  } catch (err) {
    console.error("[dailyBrief] failed to load recent assumption change", err);
    return null;
  }
}
