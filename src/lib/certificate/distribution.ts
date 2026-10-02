/**
 * A certificate's distribution (FR-CRT-006). Pure.
 *
 * At issue the pinned distribution rows become addressed copies (IssuedCopy, owner the certificate), each with
 * its row's flags as pinned. A conditional row is resolved from the contract on the day of issue: the
 * guarantor's copy only where a performance bond is live (addressed to its issuer), the consulting engineer's
 * only where one is engaged; an unanswered question refuses the issue rather than guessing. Each copy then
 * records how and when it went, and its acknowledgement where the row asks for one. The certificate is
 * "distributed" only when every mandatory copy has gone.
 */

import type { DistributionRow, Finding } from "./types";

export interface PlannedCopy {
  copyNo: number;
  distributionCode: string;
  recipientName: string;
  addressedTo: string;
  mandatory: boolean;
  ackRequired: boolean;
  isOriginal: boolean;
}

export interface ContractFacts {
  /// A performance bond verified and in force on the day of issue, with its issuer's name. Null: none.
  liveBond: { issuerName: string } | null;
  /// Whether a consulting engineer is engaged on the contract. Null: not answered.
  consultingEngineer: boolean | null;
}

export interface CopyPlan {
  copies: PlannedCopy[];
  /// Rows left out, with why (shown on the certificate).
  skipped: { recipientName: string; why: "NO_LIVE_BOND" | "NO_CONSULTANT" }[];
  faults: Finding[];
}

export function copiesFor(rows: readonly DistributionRow[], contract: ContractFacts): CopyPlan {
  const copies: PlannedCopy[] = [];
  const skipped: CopyPlan["skipped"] = [];
  const faults: Finding[] = [];
  if (rows.length === 0) faults.push({ code: "NO_DISTRIBUTION_LIST", level: "block" });
  for (const r of [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.recipientCode.localeCompare(b.recipientCode))) {
    let addressedTo = r.labelEn;
    if (r.condition === "GUARANTOR_EXISTS") {
      if (!contract.liveBond) {
        skipped.push({ recipientName: r.labelEn, why: "NO_LIVE_BOND" });
        continue;
      }
      addressedTo = contract.liveBond.issuerName;
    }
    if (r.condition === "CONSULTANT_ENGAGED") {
      if (contract.consultingEngineer == null) {
        faults.push({ code: "CONSULTANT_NOT_ANSWERED", level: "block", data: { recipient: r.labelEn } });
        continue;
      }
      if (!contract.consultingEngineer) {
        skipped.push({ recipientName: r.labelEn, why: "NO_CONSULTANT" });
        continue;
      }
    }
    copies.push({ copyNo: copies.length + 1, distributionCode: r.recipientCode, recipientName: r.labelEn, addressedTo, mandatory: r.mandatory, ackRequired: r.ackRequired, isOriginal: r.isOriginal });
  }
  return { copies, skipped, faults };
}

export interface CopyFacts {
  mandatory: boolean;
  ackRequired: boolean;
  /// YYYY-MM-DD.
  despatchedOn: string | null;
  acknowledgedOn: string | null;
}

export interface DistributionState {
  distributed: boolean;
  /// Mandatory copies not yet gone.
  undespatchedMandatory: number;
  /// Copies gone whose acknowledgement is asked for and not yet back.
  awaitingAck: number;
}

export function distributionState(copies: readonly CopyFacts[]): DistributionState {
  const undespatchedMandatory = copies.filter((c) => c.mandatory && !c.despatchedOn).length;
  const awaitingAck = copies.filter((c) => c.ackRequired && c.despatchedOn && !c.acknowledgedOn).length;
  return { distributed: copies.length > 0 && undespatchedMandatory === 0, undespatchedMandatory, awaitingAck };
}

/// The findings a distributed certificate is judged on: a mandatory copy not gone blocks "distributed".
export function distributionFaults(copies: readonly CopyFacts[]): Finding[] {
  const s = distributionState(copies);
  return s.undespatchedMandatory > 0 ? [{ code: "NOT_DISTRIBUTED", level: "block", data: { count: s.undespatchedMandatory } }] : [];
}

export function despatchFaults(copy: CopyFacts, on: string, today: string, issuedOn: string): Finding[] {
  const out: Finding[] = [];
  if (copy.despatchedOn) out.push({ code: "ALREADY_DESPATCHED", level: "block", data: { day: copy.despatchedOn } });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: on } });
  if (on < issuedOn) out.push({ code: "BEFORE_ISSUE", level: "block", data: { day: issuedOn } });
  return out;
}

export function acknowledgeFaults(copy: CopyFacts, on: string, today: string): Finding[] {
  const out: Finding[] = [];
  if (!copy.despatchedOn) {
    out.push({ code: "ACK_BEFORE_DESPATCH", level: "block" });
    return out;
  }
  if (copy.acknowledgedOn) out.push({ code: "ALREADY_ACKNOWLEDGED", level: "block", data: { day: copy.acknowledgedOn } });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: on } });
  if (on < copy.despatchedOn) out.push({ code: "BEFORE_DESPATCH", level: "block", data: { day: copy.despatchedOn } });
  return out;
}
