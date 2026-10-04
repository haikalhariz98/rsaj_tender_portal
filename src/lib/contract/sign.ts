/**
 * Signing and executing the contract (FR-CON-007, 008, 009, 010, 011; FR-REQ-016).
 *
 * The contractor signs first, recorded on their behalf: only once the contract is ready to sign (legally
 * endorsed, the readiness gate met, the company resolution on file), with the signatory's and the
 * witness's full names and identity-card numbers. The RSAJ officer's signature is the act that executes
 * the contract: `signFaults` lists everything that refuses it, each named, and it is re-run on locked
 * rows. The Contract Date is not asked for: it is the organisation's day of that act (`contract-date.ts`).
 */

import type { CommitmentFault } from "@/lib/requisition/commitment";
import type { SignatoryFault, SignerFault } from "@/lib/award/signatory";
import { IC_FORMAT } from "@/lib/award/mask";

import { isExecuted } from "./status";
import type { ContractStatus, Finding } from "./types";

export interface GateFacts {
  ready: boolean;
  items: readonly { key: string; state: "MET" | "NOT_MET" | "NOT_SET"; detail: readonly string[] }[];
}

/// Each gate item not met, as a finding naming it (FR-CON-008: all three green before signature).
export const gateFindings = (gate: GateFacts): Finding<"GATE_NOT_MET">[] =>
  gate.items.filter((x) => x.state !== "MET").map((x) => ({ code: "GATE_NOT_MET" as const, level: "block" as const, data: { item: x.key, state: x.state, detail: x.detail.join("|") } }));

export interface PersonEntry {
  name: string;
  icNumber: string;
}

export type PersonFault = "NAME_REQUIRED" | "IC_REQUIRED" | "IC_FORMAT";

/// FR-CON-007: a full name and an identity-card number in the expected shape.
export function personFaults(p: PersonEntry): PersonFault[] {
  const out: PersonFault[] = [];
  if (!p.name.trim()) out.push("NAME_REQUIRED");
  if (!p.icNumber.trim()) out.push("IC_REQUIRED");
  else if (!IC_FORMAT.test(p.icNumber.trim())) out.push("IC_FORMAT");
  return out;
}

export type ContractorSignFault = "NOT_ENDORSED" | "GATE_NOT_MET" | "NO_RESOLUTION" | "ALREADY_SIGNED" | "SIGNATORY" | "WITNESS" | "FUTURE_DATE" | "BEFORE_ENDORSEMENT";

/**
 * The contractor's signature and its witness (FR-CON-007, 008). Refused where no company resolution is
 * live on the contract, while the gate is not met, before legal endorsement, or with either person's
 * name or identity-card number missing.
 */
export function contractorSignFaults(i: { status: ContractStatus; gate: GateFacts; resolutionLive: boolean; alreadySigned: boolean; signatory: PersonEntry; witness: PersonEntry; signedOn: string; today: string; endorsedOn: string | null }): Finding<ContractorSignFault>[] {
  const out: Finding<ContractorSignFault>[] = [];
  if (i.status !== "LEGALLY_ENDORSED") out.push({ code: "NOT_ENDORSED", level: "block" });
  out.push(...gateFindings(i.gate));
  if (!i.resolutionLive) out.push({ code: "NO_RESOLUTION", level: "block" });
  if (i.alreadySigned) out.push({ code: "ALREADY_SIGNED", level: "block" });
  for (const f of personFaults(i.signatory)) out.push({ code: "SIGNATORY", level: "block", data: { fault: f } });
  for (const f of personFaults(i.witness)) out.push({ code: "WITNESS", level: "block", data: { fault: f } });
  if (i.signedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (i.endorsedOn && i.signedOn < i.endorsedOn) out.push({ code: "BEFORE_ENDORSEMENT", level: "block" });
  return out;
}

export type SignFault =
  | "NOT_ENDORSED"
  | "GATE_NOT_MET"
  | "NO_RESOLUTION"
  | "CONTRACTOR_NOT_SIGNED"
  | "WITNESS_NOT_RECORDED"
  | "ALREADY_EXECUTED"
  | "FORMATION_INCOMPLETE"
  | "COMMITMENT"
  | "SIGNATORY_COND_NOT_FROZEN"
  | "NO_ISSUE_IN_FORCE"
  | "SIGNATORY_NOT_RESOLVED"
  | "SIGNER"
  | "BASELINE_INCOMPLETE"
  | "CONTRACTOR_SIGNED_LATER"
  | "SO_UNRESOLVED";

export interface SignInputs {
  status: ContractStatus;
  gate: GateFacts;
  resolutionLive: boolean;
  contractorSignedOn: string | null;
  witnessRecorded: boolean;
  formationFaults: number;
  /// 6.1's `commitmentFault` on the requisition and its approved route (FR-REQ-016): the one PO and contract signature share.
  commitment: CommitmentFault | null;
  /// The `award_signatory` condition for the contract agreement, as frozen when preparation started (OD-4 A).
  signatoryCond: string | null;
  /// The matrix's answer on that condition at the contract sum; null where it was not asked (no condition, or no issue in force).
  signatory: { ok: true } | { ok: false; fault: SignatoryFault } | null;
  /// Whether an approval matrix issue is in force today (6.12 review R-4): false, the signatory cannot be
  /// resolved at all, and the signature is refused naming it, as the award's evaluation does. The act and
  /// the screen always give it.
  issueInForce?: boolean;
  /// 6.11's `checkSignatory` on the Person recorded as signing, on the day of the act.
  signer: readonly SignerFault[];
  /// The baseline's blocking findings (FR-CON-014): the executed version cannot be incomplete.
  baselineBlocks: number;
  /**
   * 6.13 Part A (FR-SUP-001, against accepted 6.12): the S.O. the matrix in force gives at the contract's value and
   * regime, resolved by this signature. Not resolved: refused, naming the matrix, as nobody would supervise the
   * contract it executes. Absent: not asked (a caller from before 6.13).
   */
  so?: { ok: true } | { ok: false; matrix: string | null; why: string } | null;
  /// The organisation's day of the act: the Contract Date it would give.
  today: string;
}

/**
 * Everything that refuses the RSAJ signature, each named. Empty: the contract may be executed. Re-run on
 * the locked rows inside the act; the screen shows the same list from the same function.
 */
export function signFaults(i: SignInputs): Finding<SignFault>[] {
  const out: Finding<SignFault>[] = [];
  if (isExecuted(i.status)) return [{ code: "ALREADY_EXECUTED", level: "block" }];
  if (i.status !== "LEGALLY_ENDORSED") out.push({ code: "NOT_ENDORSED", level: "block" });
  out.push(...gateFindings(i.gate));
  if (!i.resolutionLive) out.push({ code: "NO_RESOLUTION", level: "block" });
  if (!i.contractorSignedOn) out.push({ code: "CONTRACTOR_NOT_SIGNED", level: "block" });
  else if (i.contractorSignedOn > i.today) out.push({ code: "CONTRACTOR_SIGNED_LATER", level: "block" });
  if (!i.witnessRecorded) out.push({ code: "WITNESS_NOT_RECORDED", level: "block" });
  if (i.formationFaults > 0) out.push({ code: "FORMATION_INCOMPLETE", level: "block", data: { count: i.formationFaults } });
  if (i.commitment) out.push({ code: "COMMITMENT", level: "block", data: { fault: i.commitment.code, outstanding: i.commitment.code === "NOT_APPROVED" ? i.commitment.outstanding : null } });
  if (!i.signatoryCond) out.push({ code: "SIGNATORY_COND_NOT_FROZEN", level: "block" });
  else if (i.issueInForce === false) out.push({ code: "NO_ISSUE_IN_FORCE", level: "block" });
  else if (i.signatory && !i.signatory.ok) out.push({ code: "SIGNATORY_NOT_RESOLVED", level: "block", data: { fault: i.signatory.fault } });
  for (const f of i.signer) out.push({ code: "SIGNER", level: "block", data: { fault: f } });
  if (i.baselineBlocks > 0) out.push({ code: "BASELINE_INCOMPLETE", level: "block", data: { count: i.baselineBlocks } });
  if (i.issueInForce !== false && i.so && !i.so.ok) out.push({ code: "SO_UNRESOLVED", level: "block", data: { matrix: i.so.matrix, why: i.so.why } });
  return out;
}

// ------------------------------------------------------------------ stamping (FR-CON-011)

export type StampFault = "NOT_EXECUTED" | "ALREADY_STAMPED" | "DAY_REQUIRED" | "REFERENCE_REQUIRED" | "FUTURE_DATE" | "BEFORE_CONTRACT_DATE";

/// "Fully executed" (STAMPED) only with both the stamping day and the LHDN reference.
export function stampFaults(i: { status: ContractStatus; stampedOn: string | null; reference: string; contractDate: string | null; today: string }): Finding<StampFault>[] {
  const out: Finding<StampFault>[] = [];
  if (isExecuted(i.status) && i.status !== "EXECUTED") out.push({ code: "ALREADY_STAMPED", level: "block" });
  else if (i.status !== "EXECUTED") out.push({ code: "NOT_EXECUTED", level: "block" });
  if (!i.stampedOn) out.push({ code: "DAY_REQUIRED", level: "block" });
  if (!i.reference.trim()) out.push({ code: "REFERENCE_REQUIRED", level: "block" });
  if (i.stampedOn && i.stampedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (i.stampedOn && i.contractDate && i.stampedOn < i.contractDate) out.push({ code: "BEFORE_CONTRACT_DATE", level: "block" });
  return out;
}

// ------------------------------------------------------------------ Integrity Pact Stage Three (FR-CON-010)

export type BriefingFault = "NOT_YET_ENDORSED" | "ALREADY_RECORDED" | "NO_PARTICIPANTS" | "NO_ATTENDEES" | "FUTURE_DATE";

/// Where the briefing may be recorded: an endorsed or executed contract (its own rule; the act and the panel both ask it).
export const briefingOpen = (status: ContractStatus) => status === "LEGALLY_ENDORSED" || isExecuted(status);

/// The briefing at signing: on an endorsed or executed contract, with RSAJ's participants and the contractor's attendees.
export function briefingFaults(i: { status: ContractStatus; exists: boolean; participants: number; attendees: number; heldOn: string; today: string }): Finding<BriefingFault>[] {
  const out: Finding<BriefingFault>[] = [];
  if (!briefingOpen(i.status)) out.push({ code: "NOT_YET_ENDORSED", level: "block" });
  if (i.exists) out.push({ code: "ALREADY_RECORDED", level: "block" });
  if (i.participants === 0) out.push({ code: "NO_PARTICIPANTS", level: "block" });
  if (i.attendees === 0) out.push({ code: "NO_ATTENDEES", level: "block" });
  if (i.heldOn > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  return out;
}

/// FR-CON-010 is a Should: a signed contract without its briefing is shown so, and nothing is refused.
export const briefingMissing = (status: ContractStatus, exists: boolean) => !exists && isExecuted(status);
