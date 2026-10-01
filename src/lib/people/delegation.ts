/**
 * One officer standing in for another.
 *
 * Deliberately not escalation. `AuthorityRole.escalatesToCode` moves authority upward
 * when a holder cannot act and belongs to the office; a delegation is the holder's own
 * act, naming a person, a period, and often a ceiling. A decision signed under one has
 * to be able to name the delegation that permitted it, so this resolves rather than
 * infers.
 */

import { inForceOn, periodsOverlap, type Effective } from "@/lib/effective";

export interface Delegation extends Effective {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  roleCode: string;
  /// Empty means the whole office, which is a larger act than a listed subset.
  capabilityCodes: string[];
  /// Null means no ceiling was set. Not a ceiling of zero.
  valueCeiling: string | null;
  reason: string;
  /// The same reason in Malay.
  reasonMs: string;
  noSubDelegation: boolean;
  /// The absent holder's recommendation to re-delegate (FR-APR-012): its summary, as text.
  /// The signed recommendation itself is a document attached to the delegation (OD-6).
  holderRecommendation?: string | null;
  holderRecommendedOn?: Date | null;
  /// Whether the signed recommendation is attached, live (OD-6). Read for display.
  recommendationAttached?: boolean;
  /// Whether one was ever attached, live or not. Read for display.
  recommendationEverAttached?: boolean;
  /// The migration's mark: recorded as text before attachments existed. Read, never written.
  recommendationTextOnlyAtLanding?: boolean;
}

export type DelegationStatus = "IN_FORCE" | "SCHEDULED" | "ENDED";

export function statusOf(delegation: Delegation, on: Date): DelegationStatus {
  if (delegation.effectiveFrom > on) return "SCHEDULED";
  return inForceOn(delegation, on) ? "IN_FORCE" : "ENDED";
}

export function inForce(delegations: readonly Delegation[], on: Date): Delegation[] {
  return delegations.filter((d) => statusOf(d, on) === "IN_FORCE");
}

/// What one person may exercise on someone else's behalf today.
export function heldOnBehalf(
  delegations: readonly Delegation[],
  personId: string,
  on: Date,
): Delegation[] {
  return inForce(delegations, on).filter((d) => d.toPersonId === personId);
}

/// Who is covering for a person today, if anyone.
export function coverFor(
  delegations: readonly Delegation[],
  personId: string,
  on: Date,
): Delegation | null {
  return inForce(delegations, on).find((d) => d.fromPersonId === personId) ?? null;
}

/**
 * What is wrong with a proposed delegation.
 *
 * Returned as codes rather than sentences so the caller renders the wording. Every one
 * of these is refused at entry: a delegation that cannot be honoured is worse than no
 * delegation, because the work stops with nobody expecting it to.
 */
export type DelegationFault =
  | "TO_SELF"
  | "OVERLAPS_EXISTING"
  | "SUB_DELEGATION_FORBIDDEN"
  | "CAPABILITY_NOT_HELD"
  | "OFFICE_UNDECIDED"
  | "ENDS_BEFORE_IT_STARTS"
  | "UNBOUNDED"
  | "GRANTOR_DOES_NOT_HOLD"
  | "MANDATORY_ACT"
  | "ABSENT_GRANTOR_NO_RECOMMENDATION"
  | "ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED";

/**
 * What the caller knows about the office being delegated, beyond its capabilities.
 * Optional so a check that has not looked stays silent rather than guessing.
 */
export interface DelegationContext {
  /// Whether the person delegating holds the office over the whole period.
  grantorHoldsOffice?: boolean;
  /// Whether an approval rule gives the office a mandatory act (MR, MJR, MA).
  officeHasMandatoryActs?: boolean;
  /// Whether the grantor is away (`Person.isAvailable` false). Authority has then
  /// reverted upward, and passes down again only on the absent holder's recommendation.
  grantorUnavailable?: boolean;
  /// The absent holder's recommendation to re-delegate, as recorded (FR-APR-012).
  holderRecommendation?: string | null;
  /// Whether the signed recommendation is attached, live (OD-6). Not given: not looked
  /// at, and the attachment rule stays silent, as every other optional fact here does.
  recommendationAttached?: boolean;
  /// A delegation recorded on a text recommendation before attachments existed: it
  /// stands to its end date on the text, labelled, and may have the scan attached later.
  /// The caller decides it with `standsOnTextBeforeAttachments` (recommendation.ts), from
  /// the stored mark, never from the text.
  recordedBeforeAttachments?: boolean;
}

/**
 * Not enforced here, because nothing on record can decide it: that the delegate is a
 * direct line subordinate, and that the grant is made by the jobholder's superior
 * (FR-APR-011). There are no reporting lines in the data and no sign-in to say who is
 * granting. Both arrive with authentication; until then they are a known gap.
 */
export function faultsIn(
  proposed: Delegation,
  existing: readonly Delegation[],
  /// Capability codes the delegating office actually holds.
  heldByOffice: readonly string[],
  context: DelegationContext = {},
): DelegationFault[] {
  const faults: DelegationFault[] = [];

  if (proposed.fromPersonId === proposed.toPersonId) faults.push("TO_SELF");

  // Time-limited or task-limited, or it is not a delegation — it is a transfer of the
  // office with no way back. No end date and the whole role is neither.
  if (proposed.effectiveTo == null && proposed.capabilityCodes.length === 0) {
    faults.push("UNBOUNDED");
  }

  if (context.grantorHoldsOffice === false) faults.push("GRANTOR_DOES_NOT_HOLD");

  // FR-APR-012, DAL p.42: on a holder's absence authority reverts upward; it is passed
  // down again only where the absent holder has recommended it — the summary as text,
  // and (OD-6) the signed recommendation attached. One recorded on text alone before
  // attachments existed stands.
  if (context.grantorUnavailable && !(context.holderRecommendation ?? "").trim()) faults.push("ABSENT_GRANTOR_NO_RECOMMENDATION");
  if (context.grantorUnavailable && context.recommendationAttached === false && !context.recordedBeforeAttachments) faults.push("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");

  // A mandatory step cannot be delegated, skipped or substituted. Handing over the
  // whole office would hand over that step with it; a listed subset of capabilities
  // does not carry an approval act.
  if (context.officeHasMandatoryActs && proposed.capabilityCodes.length === 0) {
    faults.push("MANDATORY_ACT");
  }

  if (proposed.effectiveTo && proposed.effectiveTo <= proposed.effectiveFrom) {
    faults.push("ENDS_BEFORE_IT_STARTS");
  }

  // One office, one delegate at a time: two would make the same act resolvable to two
  // different people.
  const clash = existing.some(
    (d) =>
      d.id !== proposed.id &&
      d.roleCode === proposed.roleCode &&
      d.fromPersonId === proposed.fromPersonId &&
      periodsOverlap(d, proposed),
  );
  if (clash) faults.push("OVERLAPS_EXISTING");

  // Delegating something the office does not itself hold would manufacture authority.
  // Where nobody has decided what the office may do, that cannot be checked either —
  // which is a reason to refuse, not to wave it through.
  if (proposed.capabilityCodes.length > 0) {
    if (heldByOffice.length === 0) faults.push("OFFICE_UNDECIDED");
    else if (proposed.capabilityCodes.some((c) => !heldByOffice.includes(c))) {
      faults.push("CAPABILITY_NOT_HELD");
    }
  }

  // Onward delegation from an office that forbids it.
  const upstream = existing.find(
    (d) =>
      d.id !== proposed.id &&
      d.toPersonId === proposed.fromPersonId &&
      d.roleCode === proposed.roleCode &&
      periodsOverlap(d, proposed),
  );
  if (upstream?.noSubDelegation) faults.push("SUB_DELEGATION_FORBIDDEN");

  return faults;
}
