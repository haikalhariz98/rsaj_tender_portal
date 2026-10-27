/**
 * When the retention balance and the securities are released (plan closeout-plan.md CO-6, CO-7, §4.5; ADR 0032, ADR 0047 D3; rulings 7, 11,
 * 14, 16). Pure.
 *
 * - `retentionBalanceReleaseAt` and `performanceBondReleaseAt` are MAKING_GOOD or FINAL_PAYMENT; unset refuses, naming the setting.
 * - MAKING_GOOD is reached when the CMGD is issued with its final inspection's day recorded. A contract with no defects liability period has
 *   no CMGD, so its MAKING_GOOD reads as FINAL_PAYMENT.
 * - Under FINAL_PAYMENT the retention balance is part of the final certificate's payment, written with Finance's payment of it (stage C), so
 *   it is never released by its own act (BALANCE_WITH_FINAL_PAYMENT): one ledger, never twice.
 * - Securities are returned one at a time: the performance bond at its switch's event, the retention bond at the retention balance's, the
 *   advance payment guarantee once its advance is fully recouped on issued certificates; the design guarantee bond survives the close
 *   (its release is deferred). A cash or banker's draft security needs its official receipt's reference. A rejected one holds nothing.
 */

import type { BalanceEvent, Finding, ReleaseEvent } from "./types";

export interface EventFacts {
  /// The CPC's frozen DLP applies.
  dlpApplies: boolean;
  /// The CMGD is issued, and its final defects inspection's day.
  cmgdIssued: boolean;
  finalInspectionRecorded: boolean;
  /// Finance's payment of the final certificate is recorded (stage C; false until then).
  finalPaid: boolean;
}

export function balanceEventOf(setting: ReleaseEvent | null, f: EventFacts): BalanceEvent {
  if (setting == null) return { state: "NOT_SET" };
  const event: ReleaseEvent = setting === "MAKING_GOOD" && !f.dlpApplies ? "FINAL_PAYMENT" : setting;
  if (event === "FINAL_PAYMENT") return f.finalPaid ? { state: "REACHED", event } : { state: "NOT_REACHED", event, missing: "FINAL_PAYMENT" };
  if (!f.cmgdIssued) return { state: "NOT_REACHED", event, missing: "MAKING_GOOD" };
  if (!f.finalInspectionRecorded) return { state: "NOT_REACHED", event, missing: "FINAL_INSPECTION" };
  return { state: "REACHED", event };
}

/// The retention balance's own act (`releaseRetention`): its event's refusal, or none.
export function balanceReleaseFaults(e: BalanceEvent): Finding[] {
  if (e.state === "NOT_SET") return [{ code: "RELEASE_EVENT_NOT_SET", level: "block", data: { setting: "retention" } }];
  if (e.event === "FINAL_PAYMENT") return [{ code: "BALANCE_WITH_FINAL_PAYMENT", level: "block" }];
  if (e.state === "NOT_REACHED") return [{ code: e.missing === "FINAL_INSPECTION" ? "FINAL_INSPECTION_NOT_RECORDED" : "MAKING_GOOD_NOT_ISSUED", level: "block" }];
  return [];
}

export interface SecurityReturnInput {
  kind: "PERFORMANCE_BOND" | "ADVANCE_PAYMENT_GUARANTEE" | "DESIGN_GUARANTEE_BOND" | "RETENTION_BOND";
  form: "BANK_GUARANTEE" | "INSURANCE_GUARANTEE" | "CASH" | "BANKERS_DRAFT";
  status: "LODGED" | "VERIFIED" | "REJECTED";
  returned: boolean;
  officialReceiptRef: string;
  /// The performance bond's event, and the retention balance's (which the retention bond follows).
  performanceEvent: BalanceEvent;
  retentionEvent: BalanceEvent;
  /// Every advance this guarantee secures is fully recouped on issued certificates (null: it secures none).
  advanceRecouped: boolean | null;
}

/// The event a security is returned at (its ledger row's trigger): null where it has none.
export function returnTriggerOf(i: Pick<SecurityReturnInput, "kind" | "performanceEvent" | "retentionEvent">): ReleaseEvent | "ADVANCE_RECOUPED" | null {
  if (i.kind === "ADVANCE_PAYMENT_GUARANTEE") return "ADVANCE_RECOUPED";
  const e = i.kind === "PERFORMANCE_BOND" ? i.performanceEvent : i.kind === "RETENTION_BOND" ? i.retentionEvent : null;
  return e && e.state !== "NOT_SET" ? e.event : null;
}

export function securityReturnFaults(i: SecurityReturnInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.status === "REJECTED") f("NOT_HELD");
  if (i.returned) f("ALREADY_RETURNED");
  if (out.length) return out;
  if (i.kind === "DESIGN_GUARANTEE_BOND") f("DGB_SURVIVES");
  else if (i.kind === "ADVANCE_PAYMENT_GUARANTEE") {
    if (i.advanceRecouped === false) f("ADVANCE_NOT_RECOUPED");
  } else {
    const e = i.kind === "PERFORMANCE_BOND" ? i.performanceEvent : i.retentionEvent;
    if (e.state === "NOT_SET") f("EVENT_NOT_SET", { setting: i.kind === "PERFORMANCE_BOND" ? "performance bond" : "retention" });
    else if (e.state === "NOT_REACHED") f("EVENT_NOT_REACHED", { event: e.missing });
  }
  if ((i.form === "CASH" || i.form === "BANKERS_DRAFT") && !i.officialReceiptRef.trim()) f("OFFICIAL_RECEIPT_REQUIRED");
  return out;
}

/// Code review of close-out stage B, F4: a release or a return the CMGD authorises is not dated before the CMGD's issue day (null: not judged).
export const beforeCertificateFault = (on: string, issuedOn: string | null): Finding | null => (issuedOn && on < issuedOn ? { code: "BEFORE_CERTIFICATE", level: "block", data: { day: issuedOn } } : null);
