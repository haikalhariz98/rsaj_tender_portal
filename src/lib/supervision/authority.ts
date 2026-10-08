/**
 * Who may act in a supervision act (FR-SUP-002–004, BD-613-11), and what a delegate is shown of it.
 *
 * Each act is the signed-in person's own, or is recorded for the Person the officer names from their paper (Phase 2b). Either way this decides whether that Person may
 * act on the day:
 * - the S.O.: a holder of the contract's S.O. office on the day (from the roster), or someone acting in it
 *   under a delegation of the whole office (6.1);
 * - a representative: a delegate of the S.O. whose delegation is in force on the day (its letter issued on or
 *   before it, not revoked by it) and whose scope lists the act. Outside the scope is refused by the action (`capacityFor`);
 * - some acts are the S.O.'s own (the special meeting's chair, the early-action decision, self-help), and the
 *   programme's approval is the Principal Representative's (or the S.O.'s).
 * Nobody else is recorded for them.
 *
 * And, since Phase 3d (FR-SUP-004, "communication and instruction actions outside scope are unavailable"), what a delegate is shown: `hiddenActsFor` is the acts a
 * signed-in representative acts outside the scope of, which their screens do not offer. It hides nothing from the S.O., nor from an officer who is no
 * representative (a clerk entering the S.O.'s paper): the refusal above is theirs. Pure.
 */

import type { Day, DelegateKind, Finding, SupervisionAct } from "./types";

/// The S.O. office's holders on a day, and those acting in it under a delegation of the whole office (6.1).
export interface SoOffice {
  roleLabel: string;
  holderIds: readonly string[];
  actingIds: readonly string[];
}

export interface DelegationFacts {
  id: string;
  kind: DelegateKind;
  delegatePersonId: string;
  /// The organisation's day the delegation letter was issued (its certificate's date). Null: not yet issued.
  letterIssuedOn: Day | null;
  revokedOn: Day | null;
  scope: readonly SupervisionAct[];
}

/// In force on a day: its letter issued on or before it, and not revoked on or before it (the revocation day is
/// the first day it no longer holds).
export const inForce = (d: Pick<DelegationFacts, "letterIssuedOn" | "revokedOn">, day: Day): boolean => d.letterIssuedOn != null && d.letterIssuedOn <= day && (d.revokedOn == null || day < d.revokedOn);

/// What an act asks of the Person recorded for it.
export type ActNeed = { act: SupervisionAct } | { soOnly: true } | { principalOrSo: true };

export type Capacity = { as: "SO" } | { as: "DELEGATE"; delegationId: string; kind: DelegateKind };

export type AuthorityFault = "NO_SO" | "NOT_SO" | "NOT_PRINCIPAL" | "NOT_IN_SCOPE" | "NOT_AUTHORISED";

export function capacityFor(personId: string, need: ActNeed, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day): { capacity: Capacity | null; faults: Finding<AuthorityFault>[] } {
  const fault = (code: AuthorityFault, data: Record<string, string | number | null> = {}) => ({ capacity: null, faults: [{ code, level: "block" as const, data }] });
  if (!so) return fault("NO_SO");
  if (so.holderIds.includes(personId) || so.actingIds.includes(personId)) return { capacity: { as: "SO" }, faults: [] };
  const live = delegations.filter((d) => d.delegatePersonId === personId && inForce(d, day));
  if ("soOnly" in need) return fault("NOT_SO", { office: so.roleLabel });
  if ("principalOrSo" in need) {
    const p = live.find((d) => d.kind === "PRINCIPAL");
    return p ? { capacity: { as: "DELEGATE", delegationId: p.id, kind: p.kind }, faults: [] } : fault("NOT_PRINCIPAL", { office: so.roleLabel });
  }
  if (live.length === 0) return fault("NOT_AUTHORISED", { office: so.roleLabel, act: need.act });
  const d = live.find((x) => x.scope.includes(need.act));
  return d ? { capacity: { as: "DELEGATE", delegationId: d.id, kind: d.kind }, faults: [] } : fault("NOT_IN_SCOPE", { act: need.act });
}

/**
 * The acts to leave off the screens of a signed-in person who acts as a representative (FR-SUP-004, Phase 3d, mapped from the session): the acts of `acts` that no
 * delegation of theirs in force on the day lists. They are hidden, not only refused, so the screen of a representative offers what the letter of delegation gives them.
 *
 * Nothing is hidden from the S.O. (a holder of the office, or acting in it), from a person with no delegation in force (no representative: the rule above refuses them
 * what it refuses), or where the contract has no S.O. resolved (nothing to be a representative of). Several delegations in force give the union of their scopes.
 */
export function hiddenActsFor(personId: string, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day, acts: readonly SupervisionAct[]): SupervisionAct[] {
  if (!so || so.holderIds.includes(personId) || so.actingIds.includes(personId)) return [];
  const live = delegations.filter((d) => d.delegatePersonId === personId && inForce(d, day));
  if (live.length === 0) return [];
  return acts.filter((a) => !live.some((d) => d.scope.includes(a)));
}

/// The words a record keeps for the capacity it was recorded in.
export const capacityText = (c: Capacity, soLabel: string): string => (c.as === "SO" ? `as ${soLabel}` : `as the S.O.'s representative under delegation`);
