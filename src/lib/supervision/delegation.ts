/**
 * Delegating the S.O.'s authority (FR-SUP-002–004). A delegation is made by the S.O. (a holder of the office
 * on the day, recorded on their behalf) to a named Person of a type (Principal, Specialist, Specialist QS), with
 * the S.O.'s recorded satisfaction with the delegate's ability and experience (FR-SUP-002), a scope of acts, and
 * the letter pair of the contract type's variant (FR-SUP-003): the Letter of Delegation (A/1 or B/1) and the
 * Notification (A/2 or B/2), each a certificate through the 6.14 core. It holds from the letter's date. No
 * sub-delegation: a representative never delegates. Pure.
 */

import { inForce, type DelegationFacts, type SoOffice } from "./authority";
import type { Day, DelegateKind, DelegationVariant, Finding, SupervisionAct } from "./types";

export type DelegationFault =
  | "NO_SO"
  | "GRANTOR_NOT_SO"
  | "SUB_DELEGATION"
  | "DELEGATE_IS_GRANTOR"
  | "DELEGATE_INACTIVE"
  | "ALREADY_DELEGATED"
  | "COMPETENCY_NOT_CONFIRMED"
  | "SCOPE_EMPTY"
  | "VARIANT_NOT_SET"
  | "FORMS_NOT_SET";

export interface DelegationInput {
  kind: DelegateKind;
  grantorId: string;
  delegate: { id: string; isActive: boolean } | null;
  competencyConfirmed: boolean;
  competencyNote: string;
  scope: readonly SupervisionAct[];
}

export function delegationFaults(i: DelegationInput, ctx: { so: SoOffice | null; delegations: readonly DelegationFacts[]; today: Day; variant: DelegationVariant | null; typeName: string | null; forms: { letter: string | null; notice: string | null } }): Finding<DelegationFault>[] {
  const out: Finding<DelegationFault>[] = [];
  const f = (code: DelegationFault, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!ctx.so) f("NO_SO");
  else {
    const isSo = ctx.so.holderIds.includes(i.grantorId) || ctx.so.actingIds.includes(i.grantorId);
    // No sub-delegation (FR-SUP-004): a representative of this contract never delegates.
    if (ctx.delegations.some((d) => d.delegatePersonId === i.grantorId && inForce(d, ctx.today)) && !isSo) f("SUB_DELEGATION");
    else if (!isSo) f("GRANTOR_NOT_SO", { office: ctx.so.roleLabel });
  }
  if (!i.delegate) f("DELEGATE_INACTIVE");
  else {
    if (i.delegate.id === i.grantorId) f("DELEGATE_IS_GRANTOR");
    if (!i.delegate.isActive) f("DELEGATE_INACTIVE");
    if (ctx.delegations.some((d) => d.delegatePersonId === i.delegate!.id && d.revokedOn == null)) f("ALREADY_DELEGATED");
  }
  if (!i.competencyConfirmed || !i.competencyNote.trim()) f("COMPETENCY_NOT_CONFIRMED");
  if (i.scope.length === 0) f("SCOPE_EMPTY");
  if (!ctx.variant) f("VARIANT_NOT_SET", { type: ctx.typeName });
  else if (!ctx.forms.letter || !ctx.forms.notice) f("FORMS_NOT_SET", { variant: ctx.variant });
  return out;
}

export type RevokeFault = "ALREADY_REVOKED" | "REASON_REQUIRED" | "FUTURE_DATE" | "BEFORE_RECORDED";

export function revokeFaults(i: { revokedOn: Day | null; recordedOn: Day; on: Day; today: Day; reason: string }): Finding<RevokeFault>[] {
  const out: Finding<RevokeFault>[] = [];
  if (i.revokedOn) out.push({ code: "ALREADY_REVOKED", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (i.on > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.on } });
  if (i.on < i.recordedOn) out.push({ code: "BEFORE_RECORDED", level: "block", data: { day: i.recordedOn } });
  return out;
}

/// Where a delegation stands, from its letter's certificate and its revocation.
export type DelegationState = "LETTER_NOT_ISSUED" | "IN_FORCE" | "REVOKED" | "LETTER_VOID";

export function delegationState(d: { letterStatus: string; revokedOn: Day | null }, today: Day): DelegationState {
  if (d.revokedOn && d.revokedOn <= today) return "REVOKED";
  if (d.letterStatus === "VOID") return "LETTER_VOID";
  return d.letterStatus === "ISSUED" ? "IN_FORCE" : "LETTER_NOT_ISSUED";
}
