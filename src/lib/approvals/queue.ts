/**
 * The office worklist (FR-APR-010, ruling CO-7): every open route's next step, under
 * the office acting for it.
 *
 * Partly met by design. Nobody signs in yet, so there is no personal queue and nobody
 * is notified: the list is the same for everyone, grouped by office, with how long each
 * step has waited and why it was escalated where it was. A step whose office has nobody
 * able to act is flagged, so it can be moved by escalation (FR-APR-012).
 *
 * Pure.
 */

import { daysBetween } from "@/lib/requisition/types";

export interface QueueStep {
  routeId: string;
  /// The matter by label and where it is decided: never a code.
  matterLabel: string;
  matterKindLabel: string;
  href: string;
  steps: readonly {
    id: string;
    sequence: number;
    roleCode: string | null;
    roleLabel: string;
    actingRoleCode: string | null;
    actingRoleLabel: string | null;
    act: string;
    committeeCode: string | null;
    decision: string;
    decidedOn: Date | null;
    escalation: "NO_AVAILABLE_HOLDER" | "CONFLICT_DECLARED" | null;
    escalationReason: string | null;
  }[];
  openedAt: Date;
}

export interface QueueItem {
  routeId: string;
  stepId: string;
  matterLabel: string;
  matterKindLabel: string;
  href: string;
  officeCode: string | null;
  officeLabel: string;
  /// The office the step was resolved to, where it was escalated away from it.
  escalatedFrom: string | null;
  escalation: "NO_AVAILABLE_HOLDER" | "CONFLICT_DECLARED" | null;
  escalationReason: string | null;
  act: string;
  committee: boolean;
  /// The organisation's day it has waited since: the route's opening, or the step before's decision.
  waitingSince: string;
  /// Whole days on the organisation's day; null while no time zone is set.
  waitingDays: number | null;
  /// Nobody able to act holds the acting office: the step can only move by escalation.
  noneAvailable: boolean;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/// The next step of each open route, in order: the first undecided one.
export function nextStep<T extends { sequence: number; decision: string }>(steps: readonly T[]): T | null {
  return [...steps].sort((a, b) => a.sequence - b.sequence).find((s) => s.decision === "PENDING") ?? null;
}

/// The rule for how long a step has waited, said once for every screen that shows it.
export const WAITING_RULE_TEXT = "Waiting counts from when the step opened: the day the step before it was decided, or the day the route opened for the first step. Escalating a step to another office does not restart it.";

/// The oldest wait among those counted; null when none is (no time zone, or nothing waiting).
export function oldestWaitingDays(days: readonly (number | null)[]): number | null {
  const counted = days.filter((d): d is number => d != null);
  return counted.length === 0 ? null : Math.max(...counted);
}

/**
 * The step an open route waits on, with the office acting for it and how long it has
 * waited on the organisation's day. The one reading of "who has it, and for how long":
 * the worklist and the dashboard both ask here, so they cannot disagree. The acting
 * office is the one the step was escalated to, else its own; the wait runs from the day
 * the step opened and is not restarted by escalation.
 */
export function openStepOf(
  route: { steps: QueueStep["steps"]; openedAt: Date },
  today: string | null,
) {
  const s = nextStep(route.steps);
  if (!s) return null;
  const before = [...route.steps].filter((x) => x.sequence < s.sequence && x.decidedOn).sort((a, b) => b.sequence - a.sequence)[0];
  const since = day(before?.decidedOn ?? route.openedAt);
  return {
    step: s,
    officeCode: s.actingRoleCode ?? s.roleCode,
    officeLabel: s.actingRoleLabel ?? s.roleLabel,
    escalatedFrom: s.actingRoleCode ? s.roleLabel : null,
    waitingSince: since,
    waitingDays: today ? Math.max(0, daysBetween(since, today)) : null,
  };
}

export function officeQueue(
  routes: readonly QueueStep[],
  today: string | null,
  /// Whether nobody able to act holds the office for this route's matter.
  noneAvailable: (routeId: string, officeCode: string | null, committee: boolean) => boolean,
): { officeLabel: string; items: QueueItem[] }[] {
  const items: QueueItem[] = [];
  for (const r of routes) {
    const o = openStepOf(r, today);
    if (!o) continue;
    const s = o.step;
    items.push({
      routeId: r.routeId,
      stepId: s.id,
      matterLabel: r.matterLabel,
      matterKindLabel: r.matterKindLabel,
      href: r.href,
      officeCode: o.officeCode,
      officeLabel: o.officeLabel,
      escalatedFrom: o.escalatedFrom,
      escalation: s.escalation,
      escalationReason: s.escalationReason,
      act: s.act,
      committee: !!s.committeeCode,
      waitingSince: o.waitingSince,
      waitingDays: o.waitingDays,
      noneAvailable: noneAvailable(r.routeId, o.officeCode, !!s.committeeCode),
    });
  }
  const groups = new Map<string, QueueItem[]>();
  for (const i of items) groups.set(i.officeLabel, [...(groups.get(i.officeLabel) ?? []), i]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([officeLabel, xs]) => ({ officeLabel, items: xs.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince) || a.matterLabel.localeCompare(b.matterLabel)) }));
}
