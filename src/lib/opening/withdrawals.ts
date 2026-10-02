/**
 * Withdrawals at opening (FR-BID-004, X-11). A withdrawal is its own record (6.6); one received over
 * the counter or by post already names its envelope, and one for an envelope in the box is matched
 * here, once the box envelopes are registered. A matched envelope is never opened: it is listed
 * "Withdrawn, not opened". A withdrawal no envelope matches needs a recorded finding (what the panel
 * found) before the opening is finalised. A late envelope is never matched: a withdrawal after the
 * closing is refused (6.6), so a late envelope was never withdrawn. Pure.
 */

import type { EnvelopeKind, EnvelopeStatus, ReceiptSource } from "@/lib/bids/types";

import { actFaults, type ActFault, type OpeningState } from "./state";
import type { Finding } from "./types";

export interface WithdrawalFacts {
  id: string;
  envelopeId: string | null;
  unmatchedFinding: string;
}

export interface EnvelopeForWithdrawal {
  id: string;
  kind: EnvelopeKind;
  status: EnvelopeStatus;
  late: boolean;
  receivedSource: ReceiptSource;
}

/// FR-BID-004: a matched envelope is never opened.
export const openFault = (envelopeId: string, withdrawals: readonly Pick<WithdrawalFacts, "envelopeId">[]): Finding<"OPEN_REFUSED_WITHDRAWN"> | null =>
  withdrawals.some((w) => w.envelopeId === envelopeId) ? { code: "OPEN_REFUSED_WITHDRAWN", level: "block" } : null;

export type MatchFault = ActFault | "NOT_MAIN" | "ALREADY_MATCHED" | "FINDING_RECORDED" | "NOT_A_BOX_ENVELOPE" | "NOT_A_BID" | "LATE_ENVELOPE" | "ENVELOPE_NOT_RECEIVED" | "ENVELOPE_MATCHED";

export function matchFaults(i: { state: OpeningState; withdrawal: WithdrawalFacts; envelope: EnvelopeForWithdrawal; withdrawals: readonly WithdrawalFacts[] }): Finding<MatchFault>[] {
  const out: Finding<MatchFault>[] = [...actFaults(i.state)];
  const f = (code: MatchFault) => out.push({ code, level: "block" });
  if (i.state.kind !== "MAIN") f("NOT_MAIN");
  if (i.withdrawal.envelopeId) f("ALREADY_MATCHED");
  if (i.withdrawal.unmatchedFinding.trim()) f("FINDING_RECORDED");
  if (i.envelope.kind === "COMPANY_ESTIMATE") f("NOT_A_BID");
  else if (i.envelope.late) f("LATE_ENVELOPE");
  if (i.envelope.receivedSource !== "BOX_AT_OPENING") f("NOT_A_BOX_ENVELOPE");
  if (i.envelope.status !== "RECEIVED") f("ENVELOPE_NOT_RECEIVED");
  if (i.withdrawals.some((w) => w.id !== i.withdrawal.id && w.envelopeId === i.envelope.id)) f("ENVELOPE_MATCHED");
  return out;
}

export type FindingFault = ActFault | "ALREADY_MATCHED" | "ALREADY_FOUND" | "FINDING_REQUIRED" | "PERSON_REQUIRED";

/// Recording what the panel found of a withdrawal no envelope matched.
export function findingFaults(i: { state: OpeningState; withdrawal: WithdrawalFacts; finding: string; personActive: boolean }): Finding<FindingFault>[] {
  const out: Finding<FindingFault>[] = [...actFaults(i.state)];
  const f = (code: FindingFault) => out.push({ code, level: "block" });
  if (i.withdrawal.envelopeId) f("ALREADY_MATCHED");
  else if (i.withdrawal.unmatchedFinding.trim()) f("ALREADY_FOUND");
  if (!i.finding.trim()) f("FINDING_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

/// Finalising waits for every withdrawal to be matched or explained.
export function withdrawalsResolved(withdrawals: readonly WithdrawalFacts[]): Finding<"WITHDRAWAL_UNRESOLVED"> | null {
  const open = withdrawals.filter((w) => !w.envelopeId && !w.unmatchedFinding.trim()).length;
  return open ? { code: "WITHDRAWAL_UNRESOLVED", level: "block", data: { count: open } } : null;
}
