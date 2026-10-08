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
 * And, since Phase 3d (FR-SUP-004, "communication and instruction actions outside scope are unavailable"), what a delegate is shown: `hiddenFor` is what a
 * signed-in representative acts outside the scope of, which their screens do not offer: the acts their letter does not list (`hiddenActsFor`) and the acts that are not on any
 * letter's list because they are the S.O.'s own, or the Principal Representative's or the S.O.'s (`hiddenNeedsFor`). It hides nothing from the S.O., nor from an officer who is no
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

/// Whom an act is recorded for and who records it: a prepared act (`PreparedAct`) is one. `recorderId` is null where the act is the Person's own.
export interface ActWho {
  subjectPersonId: string | null;
  recorderId: string | null;
}

export type AuthorityFault = "NO_SO" | "NOT_SO" | "NOT_PRINCIPAL" | "NOT_IN_SCOPE" | "NOT_AUTHORISED" | "RECORDER_OUT_OF_SCOPE";

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
 * The officer who RECORDS an act is judged as well as the Person it is recorded for (FR-SUP-004, Phase 3d: "no communication with the contractor on matters outside the delegated
 * scope" is "a genuine security requirement, not a display rule"). `capacityFor` judges the Person named, and an act may be recorded from paper for the S.O. by any officer,
 * so a representative could otherwise record an act their letter does not list by naming the S.O. as the Person: the S.O. passes, and the scope of the delegate is never asked.
 *
 * A recorder who is a representative in force on the day (and not the S.O. or someone acting in the office) may record only what their own delegation covers: the same rule
 * `capacityFor` applies to the Person, applied to the recorder, whatever Person the act is recorded for. A recorder who is the S.O., or who is no representative (a clerk
 * keying the S.O.'s paper), or no one (the act is the Person's own, or a loader's), is not judged here: the paper path of an officer who is no representative stays. Null: allowed.
 */
export function recorderFault(recorderId: string | null, need: ActNeed, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day): Finding<AuthorityFault> | null {
  if (!recorderId || !so) return null;
  if (so.holderIds.includes(recorderId) || so.actingIds.includes(recorderId)) return null;
  if (!delegations.some((d) => d.delegatePersonId === recorderId && inForce(d, day))) return null;
  const own = capacityFor(recorderId, need, so, delegations, day);
  if (own.capacity) return null;
  const kind = "soOnly" in need ? "SO" : "principalOrSo" in need ? "PRINCIPAL" : "ACT";
  return { code: "RECORDER_OUT_OF_SCOPE", level: "block", data: { kind, act: "act" in need ? need.act : null, office: so.roleLabel } };
}

/// A day the recorder is judged on, with the S.O. office of that day (the holder of the office changes with the roster).
export interface RecorderDay {
  so: SoOffice | null;
  day: Day;
}

/**
 * `recorderFault` on every day that matters: the act's own day AND the day it is recorded (the session's today). The act's day comes from the form (a progress report's day, a
 * measurement's date, a diary entry's day), so judging the recorder on it alone lets a representative back-date an act to before their letter was issued, when they were no
 * representative, and record what the letter does not cover by naming the S.O. as the Person (review of step 5). A representative in force TODAY is a representative whatever
 * date the paper bears. The first fault found is returned; the same day twice is judged once. Null: allowed.
 */
export function recorderFaultOver(recorderId: string | null, need: ActNeed, days: readonly RecorderDay[], delegations: readonly DelegationFacts[]): Finding<AuthorityFault> | null {
  const seen = new Set<Day>();
  for (const d of days) {
    if (seen.has(d.day)) continue;
    seen.add(d.day);
    const fault = recorderFault(recorderId, need, d.so, delegations, d.day);
    if (fault) return fault;
  }
  return null;
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

/// An act left off a representative's screens that is not on the scope list: the S.O.'s own acts, and the acts of the Principal Representative or the S.O.
export type HiddenNeed = "SO_ONLY" | "PRINCIPAL_OR_SO";
/// What a screen asks of `hidden`: an act of the scope list, or one of the two needs above.
export type HiddenAct = SupervisionAct | HiddenNeed;

/**
 * The acts no letter of delegation can give, left off a representative's screens (FR-SUP-004). `capacityFor` refuses every representative the S.O.'s own acts (`soOnly`), and refuses
 * the programme's approval and the like (`principalOrSo`) to every representative who has no Principal Representative's delegation in force. Offering those drawers to a representative
 * is offering what the server will refuse whatever their letter says, so they are hidden by the same conditions: a representative in force on the day, not the S.O. or acting in the office.
 * Nothing is hidden from the S.O., from a person with no delegation in force, or where the contract has no S.O. resolved.
 */
export function hiddenNeedsFor(personId: string, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day): HiddenNeed[] {
  if (!so || so.holderIds.includes(personId) || so.actingIds.includes(personId)) return [];
  const live = delegations.filter((d) => d.delegatePersonId === personId && inForce(d, day));
  if (live.length === 0) return [];
  return live.some((d) => d.kind === "PRINCIPAL") ? ["SO_ONLY"] : ["SO_ONLY", "PRINCIPAL_OR_SO"];
}

/// Everything left off the screens of a signed-in representative: the acts their letter does not list, and the acts no letter can give them.
export function hiddenFor(personId: string, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day, acts: readonly SupervisionAct[]): HiddenAct[] {
  return [...hiddenActsFor(personId, so, delegations, day, acts), ...hiddenNeedsFor(personId, so, delegations, day)];
}

/// The words a record keeps for the capacity it was recorded in.
export const capacityText = (c: Capacity, soLabel: string): string => (c.as === "SO" ? `as ${soLabel}` : `as the S.O.'s representative under delegation`);
