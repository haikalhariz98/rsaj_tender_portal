/**
 * Waiting to be tabled (founder, 2026-10-05): every open approval route, in any module, whose current step is a
 * committee's and has no matter tabled for it yet. Derived from the routes and the matters, never stored, so it cannot
 * disagree with either. Pure; `waiting-load.ts` reads what it needs.
 *
 * The current step and how long it has waited are `openStepOf`'s (approvals/queue.ts), the one reading the worklist and
 * the dashboard share: the first undecided step, waiting since the step before it was decided (or the route opened),
 * counted on the organisation's day.
 *
 * A matter counts as tabled for the step where it concerns the same record (`recordKey`), the same approval of it (the
 * route's domain: a requisition's gate matter is not its route's), before the step's committee, for the step's act;
 * and it can still discharge the step: not withdrawn, not on a cancelled sitting, not already discharging a step, not
 * deferred (a deferral decides nothing, so the step waits to be tabled again), and not decided before the route opened
 * (every module's citation refuses that). A matter decided and not yet cited still counts: it is cited by hand from the
 * record, and tabling it again would put the same question to the committee twice.
 */

import { openStepOf, type QueueStep } from "@/lib/approvals/queue";
import { storedDay } from "@/lib/dates";

export interface WaitingRoute {
  routeId: string;
  /// The record the route decides, as its matters name it: "REQUISITION:<id>", "EXERCISE:<id>" (a name or an
  /// appointment, whose matters name the exercise), "VARIATION:<id>", "CONTRACT:<id>".
  recordKey: string;
  domain: string;
  openedAt: Date;
  steps: readonly (QueueStep["steps"][number] & { committeeDecisionId: string | null })[];
}

export interface WaitingMatter {
  id: string;
  /// As `WaitingRoute.recordKey`; null for a manual matter, which names no record.
  recordKey: string | null;
  domain: string;
  committeeCode: string;
  act: string;
  outcome: "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  /// The decision's stored day, YYYY-MM-DD; null while undecided.
  decisionDay: string | null;
  withdrawn: boolean;
  sittingCancelled: boolean;
  /// A step anywhere already cites it.
  citedByStep: boolean;
}

export interface WaitingItem {
  routeId: string;
  stepId: string;
  committeeCode: string;
  act: string;
  /// The organisation's day the step has waited since.
  waitingSince: string;
  /// Whole days on the organisation's day; null while no time zone is set.
  waitingDays: number | null;
}

/// Whether a matter is tabled for a route's current committee step (see the module note).
export function tabledFor(m: WaitingMatter, r: Pick<WaitingRoute, "recordKey" | "domain" | "openedAt">, s: { committeeCode: string | null; act: string }): boolean {
  if (m.recordKey == null || m.recordKey !== r.recordKey || m.domain !== r.domain) return false;
  if (m.committeeCode !== s.committeeCode || m.act !== s.act) return false;
  if (m.withdrawn || m.sittingCancelled || m.citedByStep || m.outcome === "DEFERRED") return false;
  return m.decisionDay == null || m.decisionDay >= storedDay(r.openedAt);
}

/// The routes waiting to be tabled, longest waiting first.
export function waitingToBeTabled(routes: readonly WaitingRoute[], matters: readonly WaitingMatter[], today: string | null): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const r of routes) {
    const open = openStepOf(r, today);
    if (!open || !open.step.committeeCode) continue;
    const s = open.step;
    if (matters.some((m) => tabledFor(m, r, s))) continue;
    out.push({ routeId: r.routeId, stepId: s.id, committeeCode: s.committeeCode!, act: s.act, waitingSince: open.waitingSince, waitingDays: open.waitingDays });
  }
  return out.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince) || a.routeId.localeCompare(b.routeId));
}
