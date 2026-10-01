/**
 * Who may discharge a step, and why a named Person may not (ruling OD-12).
 *
 * Nobody signs in yet, so the recording officer names the Person who decided. The
 * checks that sign-in would make are made on that Person: they must hold the office
 * for the requesting unit on the day — the unit's own holder, else the nearest
 * ancestor's, else an organisation-wide one — or hold a live delegation of the whole
 * office from such a holder. Nobody decides a requisition they raised or endorsed,
 * nobody discharges two steps of one route, and no decision is dated after today.
 */

import { inForceOn } from "@/lib/effective";
import { parseSen, type Sen } from "@/lib/money";
import type { Delegation } from "@/lib/people/delegation";
import type { Roster } from "@/lib/people/roster";

const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

export interface Holders {
  /// The scope the holders were found at: a unit code, or null for organisation-wide.
  scope: string | null;
  holderIds: string[];
  /// Delegates of the whole office from one of those holders, in force on the day.
  delegates: { personId: string; delegation: Delegation }[];
}

/**
 * The office's holders for a unit on a day. `unitPath` runs from the requesting unit
 * (or section) up to the root: the nearest scope with a holder wins.
 */
export function holdersFor(
  roleCode: string,
  unitPath: readonly string[],
  roster: Roster,
  delegations: readonly Delegation[],
  day: string,
): Holders {
  const on = dayDate(day);
  const assigned = roster.assignments.filter((a) => a.roleCode === roleCode && inForceOn(a, on));
  let scope: string | null = null;
  let holderIds: string[] = [];
  for (const unit of unitPath) {
    const here = assigned.filter((a) => a.scope === unit);
    if (here.length > 0) {
      scope = unit;
      holderIds = here.map((a) => a.personId);
      break;
    }
  }
  if (holderIds.length === 0) holderIds = assigned.filter((a) => a.scope == null || a.scope === "").map((a) => a.personId);

  // A delegation carries an approval act only when it hands over the whole office: a
  // listed subset of capabilities does not (see people/delegation.ts).
  const delegates = delegations
    .filter((d) => d.roleCode === roleCode && holderIds.includes(d.fromPersonId) && d.capabilityCodes.length === 0 && inForceOn(d, on))
    .map((d) => ({ personId: d.toPersonId, delegation: d }));
  return { scope, holderIds, delegates };
}

export type DeciderFault =
  | "TIME_ZONE_UNSET"
  | "COMMITTEE_STEP"
  | "NOT_PENDING"
  | "OUT_OF_ORDER"
  | "INACTIVE"
  | "NOT_HOLDER"
  | "DELEGATION_NOT_PERMITTED"
  | "OVER_CEILING"
  | "SELF_APPROVAL"
  | "ENDORSED_IT"
  | "ALREADY_DISCHARGED_A_STEP"
  | "FUTURE_DATE"
  | "BEFORE_SUBMISSION"
  | "DECLARED_CONFLICT";

export interface DeciderContext {
  today: string | null;
  holders: Holders;
  person: { id: string; isActive: boolean } | null;
  requesterId: string;
  /// People who endorsed it, where the unit they endorsed for is not known: barred.
  endorserIds: readonly string[];
  /// The endorsements, with the unit each endorsed for. A direct holder of this office
  /// for that same unit may still decide (ruling BD-1).
  endorsements?: readonly { personId: string; unitCode: string }[];
  /// The root of the requisition's unit path (the company). An organisation-wide office
  /// assignment, held for no unit, is tied only to an endorsement recorded for this
  /// unit (ruling R1). Unknown: an org-wide holder who endorsed is barred.
  rootUnitCode?: string | null;
  /// People who have already discharged another step of this route.
  otherDeciderIds: readonly string[];
  /// People who declared a conflict on this step and recused (FR-APR-009).
  declaredConflictIds?: readonly string[];
  /// Whether every earlier step is done.
  earlierDone: boolean;
  /// YYYY-MM-DD: the decision date, and the day the route was opened.
  decidedOn: string;
  openedOn: string;
  value: Sen;
}

export interface DeciderCheck {
  faults: DeciderFault[];
  /// The delegation the decision was made under, where it was.
  delegationId: string | null;
}

export function deciderFaults(
  step: { committeeCode: string | null; nonDelegable: boolean; decision: string },
  ctx: DeciderContext,
): DeciderCheck {
  const faults: DeciderFault[] = [];
  let delegationId: string | null = null;
  if (ctx.today == null) return { faults: ["TIME_ZONE_UNSET"], delegationId };
  // A committee step is discharged by its decision, cited from the sitting.
  if (step.committeeCode) return { faults: ["COMMITTEE_STEP"], delegationId };
  if (step.decision !== "PENDING") faults.push("NOT_PENDING");
  if (!ctx.earlierDone) faults.push("OUT_OF_ORDER");
  if (ctx.decidedOn > ctx.today) faults.push("FUTURE_DATE");
  if (ctx.decidedOn < ctx.openedOn) faults.push("BEFORE_SUBMISSION");

  const pid = ctx.person?.id ?? null;
  if (!ctx.person || !pid) return { faults: [...faults, "NOT_HOLDER"], delegationId };
  if (!ctx.person.isActive) faults.push("INACTIVE");

  if (!ctx.holders.holderIds.includes(pid)) {
    const via = ctx.holders.delegates.find((d) => d.personId === pid);
    if (!via) faults.push("NOT_HOLDER");
    else if (step.nonDelegable) faults.push("DELEGATION_NOT_PERMITTED");
    else {
      delegationId = via.delegation.id;
      // Null ceiling: none was set on the delegation, so it limits nothing.
      if (via.delegation.valueCeiling != null && ctx.value > parseSen(via.delegation.valueCeiling)) faults.push("OVER_CEILING");
    }
  }
  if (pid === ctx.requesterId) faults.push("SELF_APPROVAL");
  // Ruling BD-1: having endorsed does not disqualify a direct holder of the office tied
  // to the tier they endorsed at — the office held for the unit they endorsed for. It
  // still bars them from deciding any step as a delegate, or any other office.
  const endorsedAt = (ctx.endorsements ?? []).filter((e) => e.personId === pid);
  if (ctx.endorserIds.includes(pid) || endorsedAt.length > 0) {
    const direct = ctx.holders.holderIds.includes(pid);
    // The unit the office is held for: its scope, or for an organisation-wide
    // assignment the root of the path (ruling R1) — never "any unit".
    const heldFor = ctx.holders.scope ?? ctx.rootUnitCode ?? null;
    const tied = heldFor != null && endorsedAt.some((e) => e.unitCode === heldFor);
    if (!(direct && tied)) faults.push("ENDORSED_IT");
  }
  if (ctx.otherDeciderIds.includes(pid)) faults.push("ALREADY_DISCHARGED_A_STEP");
  if (ctx.declaredConflictIds?.includes(pid)) faults.push("DECLARED_CONFLICT");
  return { faults, delegationId };
}

/**
 * Whether the requester holds the approving office for their own requisition's unit
 * on the day — the case the engine's self-approval rule escalates. Scoped to the
 * unit's path: a head of another department holding the same office elsewhere is not
 * approving their own matter.
 */
export function requesterHoldsApprover(
  approverCode: string,
  requesterId: string,
  unitPath: readonly string[],
  roster: Roster,
  delegations: readonly Delegation[],
  day: string,
): boolean {
  return holdersFor(approverCode, unitPath, roster, delegations, day).holderIds.includes(requesterId);
}
