/**
 * The smaller supervision records (FR-SUP-009, 011–015) and the contract's parties (B1). Each act's rule, pure:
 * what refuses it, by code, worded in labels.ts.
 */

import type { ContractPartyKind, Day, EarlyActionBranch, Finding, SiteRecordsSet } from "./types";

const fault = <C extends string>(code: C, data: Record<string, string | number | null> = {}): Finding<C> => ({ code, level: "block", data });

export type MeetingFault = "NOT_IN_DELAY" | "MINUTES_REQUIRED" | "FUTURE_DATE" | "NO_ATTENDEES";

/// FR-SUP-011: a special meeting follows an In Delay classification; the S.O. chairs it (checked by authority.ts).
export function meetingFaults(i: { inDelay: boolean; heldOn: Day; today: Day; minutes: string; attendees: readonly string[] }): Finding<MeetingFault>[] {
  const out: Finding<MeetingFault>[] = [];
  if (!i.inDelay) out.push(fault("NOT_IN_DELAY"));
  if (!i.minutes.trim()) out.push(fault("MINUTES_REQUIRED"));
  if (i.heldOn > i.today) out.push(fault("FUTURE_DATE", { day: i.heldOn }));
  if (i.attendees.length === 0) out.push(fault("NO_ATTENDEES"));
  return out;
}

export type DatedNoteFault = "FUTURE_DATE" | "NOTE_REQUIRED" | "BEFORE_POSSESSION" | "NOT_POSSESSED";

/// FR-SUP-014 observations and FR-SUP-012 directions: on site (from possession), never in the future, with words.
export function onSiteFaults(i: { possessionOn: Day | null; on: Day; today: Day; note: string }): Finding<DatedNoteFault>[] {
  const out: Finding<DatedNoteFault>[] = [];
  if (!i.possessionOn) out.push(fault("NOT_POSSESSED"));
  else if (i.on < i.possessionOn) out.push(fault("BEFORE_POSSESSION", { day: i.possessionOn }));
  if (i.on > i.today) out.push(fault("FUTURE_DATE", { day: i.on }));
  if (!i.note.trim()) out.push(fault("NOTE_REQUIRED"));
  return out;
}

export type SelfHelpFault = "POLICY_NOT_ON_CONTRACT" | "AMOUNT_NOT_POSITIVE" | "FUTURE_DATE" | "EXTENDED_NOT_LATER" | "NOTE_REQUIRED";

/**
 * FR-SUP-013: the S.O.'s self-help on insurance: the employer extends a policy of this contract and pays the
 * premium; the amount becomes a deduction waiting for the next interim certificate. The policy is the
 * contract's own; the cover runs on past its present end.
 */
export function selfHelpFaults(i: { policyOnContract: boolean; amount: bigint; paidOn: Day; today: Day; extendedTo: Day | null; periodEnd: Day | null; note: string }): Finding<SelfHelpFault>[] {
  const out: Finding<SelfHelpFault>[] = [];
  if (!i.policyOnContract) out.push(fault("POLICY_NOT_ON_CONTRACT"));
  if (i.amount <= 0n) out.push(fault("AMOUNT_NOT_POSITIVE"));
  if (i.paidOn > i.today) out.push(fault("FUTURE_DATE", { day: i.paidOn }));
  if (i.extendedTo && i.periodEnd && i.extendedTo <= i.periodEnd) out.push(fault("EXTENDED_NOT_LATER", { day: i.periodEnd }));
  if (!i.note.trim()) out.push(fault("NOTE_REQUIRED"));
  return out;
}

export type EarlyActionFault = "NO_BRANCH" | "REASON_REQUIRED" | "FUTURE_DATE" | "NOT_POSSESSED";

/// FR-SUP-015: one or more branches, with the reason; each branch opens its module (shown where it is not built).
export function earlyActionFaults(i: { possessed: boolean; branches: readonly EarlyActionBranch[]; reason: string; on: Day; today: Day }): Finding<EarlyActionFault>[] {
  const out: Finding<EarlyActionFault>[] = [];
  if (!i.possessed) out.push(fault("NOT_POSSESSED"));
  if (i.branches.length === 0) out.push(fault("NO_BRANCH"));
  if (!i.reason.trim()) out.push(fault("REASON_REQUIRED"));
  if (i.on > i.today) out.push(fault("FUTURE_DATE", { day: i.on }));
  return out;
}

/// Where each early-action branch goes: the module that opens it, and whether it is built yet (EOT and termination
/// are 6.13 Part B; liquidated damages are Part A's LAD chain, step 3).
export const BRANCH_OPENS: Readonly<Record<EarlyActionBranch, "PART_B" | "LAD_CHAIN">> = {
  EXTEND_TIME: "PART_B",
  IMPOSE_LAD: "LAD_CHAIN",
  TERMINATE: "PART_B",
};

export type HandoverFault = "NO_LIVE_VERSION" | "TO_REQUIRED" | "RECEIVER_REQUIRED" | "FUTURE_DATE" | "NOT_POSSESSED";

/// FR-SUP-009: a set is handed over with the versions live on the contract at that moment, pinned.
export function handoverFaults(i: { possessed: boolean; set: SiteRecordsSet; liveVersions: number; toLabel: string; receivedByName: string; on: Day; today: Day }): Finding<HandoverFault>[] {
  const out: Finding<HandoverFault>[] = [];
  if (!i.possessed) out.push(fault("NOT_POSSESSED"));
  if (i.liveVersions === 0) out.push(fault("NO_LIVE_VERSION", { set: i.set }));
  if (!i.toLabel.trim()) out.push(fault("TO_REQUIRED"));
  if (!i.receivedByName.trim()) out.push(fault("RECEIVER_REQUIRED"));
  if (i.on > i.today) out.push(fault("FUTURE_DATE", { day: i.on }));
  return out;
}

export type PartyFault = "NAME_REQUIRED" | "SUM_NEGATIVE" | "RETIRED" | "REASON_REQUIRED" | "PARTY_BEFORE_EXECUTION" | "DUPLICATE_NAME";

/// B1 (ADR 0025): a party is recorded with its name; its sum and direct-payment answer may stay unset.
export function partyFaults(i: { executed: boolean; kind: ContractPartyKind; name: string; sum: bigint | null; others: readonly { kind: ContractPartyKind; name: string; retired: boolean }[] }): Finding<PartyFault>[] {
  const out: Finding<PartyFault>[] = [];
  if (!i.executed) out.push(fault("PARTY_BEFORE_EXECUTION"));
  if (!i.name.trim()) out.push(fault("NAME_REQUIRED"));
  if (i.sum != null && i.sum < 0n) out.push(fault("SUM_NEGATIVE"));
  if (i.others.some((o) => !o.retired && o.kind === i.kind && o.name.trim().toLowerCase() === i.name.trim().toLowerCase())) out.push(fault("DUPLICATE_NAME"));
  return out;
}

export function retirePartyFaults(i: { retired: boolean; reason: string }): Finding<PartyFault>[] {
  const out: Finding<PartyFault>[] = [];
  if (i.retired) out.push(fault("RETIRED"));
  if (!i.reason.trim()) out.push(fault("REASON_REQUIRED"));
  return out;
}

export type ProgressFault = "NOT_POSSESSED" | "BEFORE_POSSESSION" | "FUTURE_DATE" | "NOT_A_PERCENT" | "ALREADY_RECORDED" | "FALLS";

/// FR-SUP-010: actual progress on a day, once a day, 0–100, never below an earlier day's.
export function progressFaults(i: { possessionOn: Day | null; day: Day; today: Day; pct: string; exists: boolean; earlier: { day: Day; pct: bigint } | null; later: { day: Day; pct: bigint } | null; parsed: bigint | null }): Finding<ProgressFault>[] {
  const out: Finding<ProgressFault>[] = [];
  if (!i.possessionOn) out.push(fault("NOT_POSSESSED"));
  else if (i.day < i.possessionOn) out.push(fault("BEFORE_POSSESSION", { day: i.possessionOn }));
  if (i.day > i.today) out.push(fault("FUTURE_DATE", { day: i.day }));
  if (i.parsed == null || i.parsed > 100_0000n) out.push(fault("NOT_A_PERCENT"));
  if (i.exists) out.push(fault("ALREADY_RECORDED", { day: i.day }));
  if (i.parsed != null && ((i.earlier && i.parsed < i.earlier.pct) || (i.later && i.parsed > i.later.pct))) out.push(fault("FALLS"));
  return out;
}
