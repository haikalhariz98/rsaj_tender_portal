/**
 * The worklist (FR-APR-010, FR-APR-018, ruling CO-7): every open route's next step, under the office acting for it, and the part of it that is one person's.
 *
 * Two views of one reading. By office: every open step, grouped by the office acting for it, with how long it has waited and why it was escalated where it was.
 * A step whose office has nobody able to act is flagged, so it can be moved (FR-APR-012). My steps (`myStepsOf`): the steps a signed-in person can decide, as the
 * holder of the office acting for the step or as the delegate of a holder. The shell's count is the length of the same list, so the page and the count
 * cannot disagree. Nobody is told by email (INT-09); the staff inbox carries the notices.
 *
 * Pure.
 */

import { parseSen } from "@/lib/money";
import { daysBetween } from "@/lib/requisition/types";

import type { requesterRelation } from "./requester";

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
    /// A step only the holder of the office may decide: a delegate of it cannot (FR-APR-009). Unknown: delegable.
    nonDelegable?: boolean;
  }[];
  openedAt: Date;
  /// What the route was resolved on, in sen: the figure a delegate's ceiling is judged against. Unknown: no ceiling is judged.
  value?: bigint | null;
  /// People who may not decide this matter because they raised or sent it (FR-APR-008). Unknown: none named. Which person that is depends on the kind of route (`requester.ts`).
  barredIds?: readonly string[];
  /// How the barred person is related to the matter, for the words: they raised it, or they sent it.
  barredRelation?: ReturnType<typeof requesterRelation>;
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
  /// Who holds the acting office for this matter today, and who holds a delegation of the whole office from one of them (task-limited delegations carry no step).
  /// Empty for a committee step, which is decided at a sitting, and where the day is not known.
  holderIds: readonly string[];
  delegateIds: readonly string[];
  /// People barred from deciding it because they raised or sent it.
  barredIds: readonly string[];
  barredRelation: ReturnType<typeof requesterRelation>;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The delegates of an office who could decide a step, which is fewer than the delegates of the office: a step that only the holder may decide (`nonDelegable`) has none, and a
 * delegation capped below the route's value cannot decide it either (the very checks `deciderFaults` makes, DELEGATION_NOT_PERMITTED and OVER_CEILING). My steps lists only what a
 * person will not be refused. A null ceiling limits nothing; an unknown value (`null`) is judged against no ceiling.
 */
export function decidingDelegates<T extends { personId: string; delegation: { valueCeiling: string | null } }>(
  delegates: readonly T[],
  step: { nonDelegable?: boolean },
  value: bigint | null | undefined,
): T[] {
  if (step.nonDelegable) return [];
  return delegates.filter((d) => d.delegation.valueCeiling == null || value == null || value <= parseSen(d.delegation.valueCeiling));
}

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
  /// Who holds the office for the route's matter, or a delegation of it. Not given: nobody is named, and no step is anybody's.
  deciders: (routeId: string, officeCode: string | null, committee: boolean) => { holderIds: readonly string[]; delegateIds: readonly string[] } = () => ({ holderIds: [], delegateIds: [] }),
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
      ...(({ holderIds, delegateIds }) => ({ holderIds, delegateIds }))(deciders(r.routeId, o.officeCode, !!s.committeeCode)),
      barredIds: r.barredIds ?? [],
      barredRelation: r.barredRelation ?? "RAISED",
    });
  }
  const groups = new Map<string, QueueItem[]>();
  for (const i of items) groups.set(i.officeLabel, [...(groups.get(i.officeLabel) ?? []), i]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([officeLabel, xs]) => ({ officeLabel, items: xs.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince) || a.matterLabel.localeCompare(b.matterLabel)) }));
}

/// One step in a person's own queue.
export interface MyStep {
  item: QueueItem;
  /// How it is theirs: they hold the acting office, or hold a delegation of it.
  via: "HOLDER" | "DELEGATE";
  /// They may not decide it: they raised or sent the matter. It is listed so it is not lost, and not counted as waiting for them (FR-APR-008).
  barred: boolean;
}

/**
 * The steps a person can decide (FR-APR-018): those whose acting office they hold, or hold a whole-office delegation of, oldest wait first. A committee step is
 * the committee's, decided at its sitting, and is nobody's personal step. Pure, and the one list the page and the shell's count both read.
 */
export function myStepsOf(groups: readonly { items: readonly QueueItem[] }[], personId: string): MyStep[] {
  const out: MyStep[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      if (item.committee) continue;
      const via = item.holderIds.includes(personId) ? "HOLDER" : item.delegateIds.includes(personId) ? "DELEGATE" : null;
      if (via) out.push({ item, via, barred: item.barredIds.includes(personId) });
    }
  }
  return out.sort((a, b) => a.item.waitingSince.localeCompare(b.item.waitingSince) || a.item.matterLabel.localeCompare(b.item.matterLabel));
}

/// What the shell counts: the steps waiting for the person to act, not those they are barred from deciding.
export const waitingForCount = (mine: readonly MyStep[]): number => mine.filter((m) => !m.barred).length;
