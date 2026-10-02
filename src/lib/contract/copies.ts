/**
 * Controlled copies of the executed contract (FR-CON-012): who receives one, numbered, stamped with the
 * customer's words, addressed and logged, recalled and reissued under a new number linked to the old.
 *
 * The recipients and the stamp's words are the customer's list (`ControlledCopyRecipient`,
 * `ContractPolicy.controlledCopyStamp…`), frozen when preparation started; a recipient that applies only
 * where a consulting engineer is engaged is on the list only when the contract says one is, and until
 * that is answered nothing is distributed.
 */

import type { ContractStatus, Finding } from "./types";

export interface RecipientFacts {
  id: string;
  name: string;
  mandatory: boolean;
  onlyWithConsultingEngineer: boolean;
}

export interface CopyFacts {
  id: string;
  copyNo: number;
  recipientId: string | null;
  despatchedOn: string | null;
  acknowledgedOn: string | null;
  recalledOn: string | null;
  reissuedAs: string | null;
}

/// The recipients this contract's copies go to; NOT_ANSWERED while the consulting engineer question is open.
export function recipientsFor<T extends RecipientFacts>(frozen: readonly T[], consultingEngineer: boolean | null): T[] | "CONSULTANT_NOT_ANSWERED" {
  if (consultingEngineer == null) return "CONSULTANT_NOT_ANSWERED";
  return frozen.filter((r) => !r.onlyWithConsultingEngineer || consultingEngineer);
}

/// A copy that stands: not recalled.
export const liveCopy = (c: CopyFacts) => c.recalledOn == null;

/// The mandatory recipients with no live copy yet: distribution is complete when none is left.
export function missingMandatory<T extends RecipientFacts>(recipients: readonly T[], copies: readonly CopyFacts[]): T[] {
  return recipients.filter((r) => r.mandatory && !copies.some((c) => c.recipientId === r.id && liveCopy(c)));
}

export const nextCopyNo = (copies: readonly { copyNo: number }[]) => copies.reduce((m, c) => Math.max(m, c.copyNo), 0) + 1;

const EXECUTED: readonly ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE"];

export type IssueFault = "NOT_EXECUTED" | "STAMP_NOT_FROZEN" | "CONSULTANT_NOT_ANSWERED" | "NOT_A_RECIPIENT" | "ALREADY_HOLDS_ONE" | "FUTURE_DATE" | "BEFORE_CONTRACT_DATE";

/// Issuing a copy to a recipient on the contract's list: executed, the stamp frozen, one live copy each.
export function issueFaults(i: { status: ContractStatus; stampText: string | null; consultingEngineer: boolean | null; recipientId: string; recipients: readonly RecipientFacts[]; copies: readonly CopyFacts[]; despatchedOn: string | null; contractDate: string | null; today: string }): Finding<IssueFault>[] {
  const out: Finding<IssueFault>[] = [];
  if (!EXECUTED.includes(i.status)) out.push({ code: "NOT_EXECUTED", level: "block" });
  if (!i.stampText?.trim()) out.push({ code: "STAMP_NOT_FROZEN", level: "block" });
  const list = recipientsFor(i.recipients, i.consultingEngineer);
  if (list === "CONSULTANT_NOT_ANSWERED") out.push({ code: "CONSULTANT_NOT_ANSWERED", level: "block" });
  else if (!list.some((r) => r.id === i.recipientId)) out.push({ code: "NOT_A_RECIPIENT", level: "block" });
  if (i.copies.some((c) => c.recipientId === i.recipientId && liveCopy(c))) out.push({ code: "ALREADY_HOLDS_ONE", level: "block" });
  if (i.despatchedOn && i.despatchedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (i.despatchedOn && i.contractDate && i.despatchedOn < i.contractDate) out.push({ code: "BEFORE_CONTRACT_DATE", level: "block" });
  return out;
}

export type CopyActFault = "RECALLED" | "NOT_RECALLED" | "ALREADY_REISSUED" | "NOT_DESPATCHED" | "ALREADY_ACKNOWLEDGED" | "ALREADY_DESPATCHED" | "REASON_REQUIRED" | "FUTURE_DATE" | "BEFORE_DESPATCH" | "BEFORE_CONTRACT_DATE";

/// Recording the despatch of a copy issued without one.
export function despatchFaults(c: CopyFacts, on: string, today: string, contractDate: string | null): Finding<CopyActFault>[] {
  const out: Finding<CopyActFault>[] = [];
  if (c.recalledOn) out.push({ code: "RECALLED", level: "block" });
  if (c.despatchedOn) out.push({ code: "ALREADY_DESPATCHED", level: "block" });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (contractDate && on < contractDate) out.push({ code: "BEFORE_CONTRACT_DATE", level: "block" });
  return out;
}

/// Recording a recipient's acknowledgement.
export function acknowledgeFaults(c: CopyFacts, on: string, today: string): Finding<CopyActFault>[] {
  const out: Finding<CopyActFault>[] = [];
  if (c.recalledOn) out.push({ code: "RECALLED", level: "block" });
  if (!c.despatchedOn) out.push({ code: "NOT_DESPATCHED", level: "block" });
  if (c.acknowledgedOn) out.push({ code: "ALREADY_ACKNOWLEDGED", level: "block" });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (c.despatchedOn && on < c.despatchedOn) out.push({ code: "BEFORE_DESPATCH", level: "block" });
  return out;
}

/// Recalling a copy: once, with a reason, not before it went out.
export function recallFaults(c: CopyFacts, on: string, today: string, reason: string): Finding<CopyActFault>[] {
  const out: Finding<CopyActFault>[] = [];
  if (c.recalledOn) out.push({ code: "RECALLED", level: "block" });
  if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (c.despatchedOn && on < c.despatchedOn) out.push({ code: "BEFORE_DESPATCH", level: "block" });
  return out;
}

/// Reissuing: only a recalled copy, once; the new copy takes the next number and names the one it replaces.
export function reissueFaults(c: CopyFacts): Finding<CopyActFault>[] {
  const out: Finding<CopyActFault>[] = [];
  if (!c.recalledOn) out.push({ code: "NOT_RECALLED", level: "block" });
  if (c.reissuedAs) out.push({ code: "ALREADY_REISSUED", level: "block" });
  return out;
}
