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
  | "ENDS_BEFORE_IT_STARTS";

export function faultsIn(
  proposed: Delegation,
  existing: readonly Delegation[],
  /// Capability codes the delegating office actually holds.
  heldByOffice: readonly string[],
): DelegationFault[] {
  const faults: DelegationFault[] = [];

  if (proposed.fromPersonId === proposed.toPersonId) faults.push("TO_SELF");

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
  const notHeld = proposed.capabilityCodes.filter((c) => !heldByOffice.includes(c));
  if (heldByOffice.length > 0 && notHeld.length > 0) faults.push("CAPABILITY_NOT_HELD");

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
