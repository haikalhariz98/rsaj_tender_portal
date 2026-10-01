/**
 * Selling the documents (FR-ADV-009–012; FR-DOC-009 at sale; 6.5 OD-9, OD-11).
 *
 * The officer attests what was sighted: the representative's proof of authority, and — where the
 * exercise is restricted — the original or a certified copy of the restriction's status
 * certificate and the day it is valid until. The registration and suspension checks cannot be
 * made until the supplier register exists (6.15): they read NOT_CHECKED, a warning that travels
 * with the sale into 6.6–6.8, never a pass. A check the officer knows failed refuses the sale.
 *
 * The sale is open only in the window's purchase phase, once per party (a voided sale frees the
 * party), and to a party present at every held mandatory event. The finance receipt number is
 * the finance system's, consumed, never minted (OD-11), unique per organisation, and may be
 * recorded later: a sale without one is on the reconciliation list (FR-ADV-009 partial). Pure.
 */

import { attendanceFaults } from "./events";
import type { WindowPhase } from "./phase";
import type { CertSighted, CheckState, EventFacts, Finding } from "./types";

export type SaleFault =
  | "SALE_CLOSED"
  | "TIME_ZONE_UNSET"
  | "RESTRICTION_NOT_ANSWERED"
  | "CERT_NOT_SHOWN"
  | "CERT_EXPIRY_NOT_RECORDED"
  | "CERT_EXPIRED"
  | "CERT_EXPIRES_BEFORE_CLOSING"
  | "AUTHORITY_NOT_SIGHTED"
  | "ATTENDANCE_REQUIRED"
  | "EVENT_NOT_HELD"
  | "REGISTRATION_NOT_CHECKED"
  | "SUSPENSION_NOT_CHECKED"
  | "REGISTRATION_FAILED"
  | "SUSPENDED"
  | "ALREADY_SOLD"
  | "RECEIPT_DUPLICATE"
  | "RECEIPT_NOT_RECORDED"
  | "FEE_NOT_SET"
  | "COLLECTOR_REQUIRED"
  | "PAYMENT_METHOD_REQUIRED";

export interface SaleInput {
  phase: WindowPhase;
  /// The organisation's day the sale is recorded on (the server's); null: zone not set.
  soldOn: string | null;
  /// The closing day, YYYY-MM-DD, in the organisation's zone.
  closingDay: string | null;
  /// The exercise's restriction answer (FR-DOC-009); null: not answered.
  restricted: boolean | null;
  certSighted: CertSighted | null;
  /// YYYY-MM-DD.
  certValidUntil: string | null;
  authoritySighted: boolean | null;
  registrationCheck: CheckState;
  suspensionCheck: CheckState;
  /// The party, where it is already on the exercise; null for a new purchaser.
  partyId: string | null;
  /// The party already holds a live (not voided) sale.
  alreadySold: boolean;
  events: readonly EventFacts[];
  mandatoryPermitted: boolean | null;
  /// The receipt number typed, or null to record it later.
  receiptNo: string | null;
  receiptTaken: boolean;
  feeSet: boolean;
  collectedBy: string;
  paymentMethod: string;
}

export function saleFaults(i: SaleInput): Finding<SaleFault>[] {
  const out: Finding<SaleFault>[] = [];
  const f = (code: SaleFault, level: Finding["level"] = "block", data?: Finding["data"]) => out.push({ code, level, ...(data ? { data } : {}) });
  if (!i.soldOn) f("TIME_ZONE_UNSET");
  if (i.phase !== "OPEN_FOR_PURCHASE") f("SALE_CLOSED", "block", { phase: i.phase });
  if (!i.feeSet) f("FEE_NOT_SET");
  if (!i.collectedBy.trim()) f("COLLECTOR_REQUIRED");
  if (!i.paymentMethod.trim()) f("PAYMENT_METHOD_REQUIRED");
  if (i.authoritySighted !== true) f("AUTHORITY_NOT_SIGHTED");
  // FR-DOC-009 at sale: the restriction's status certificate, sighted and valid.
  if (i.restricted == null) f("RESTRICTION_NOT_ANSWERED");
  else if (i.restricted) {
    if (i.certSighted == null || i.certSighted === "NOT_SHOWN") f("CERT_NOT_SHOWN");
    else if (!i.certValidUntil) f("CERT_EXPIRY_NOT_RECORDED");
    else if (i.soldOn && i.certValidUntil < i.soldOn) f("CERT_EXPIRED", "block", { validUntil: i.certValidUntil });
    else if (i.closingDay && i.certValidUntil < i.closingDay) f("CERT_EXPIRES_BEFORE_CLOSING", "warn", { validUntil: i.certValidUntil, closingDay: i.closingDay });
  }
  // FR-ADV-013: a mandatory event gates the sale on the attendance register.
  for (const a of attendanceFaults(i.partyId, i.events, i.mandatoryPermitted)) out.push(a);
  // OD-9: what the supplier register would check is not checked yet; a known failure refuses.
  if (i.registrationCheck === "FAILED") f("REGISTRATION_FAILED");
  else if (i.registrationCheck === "NOT_CHECKED") f("REGISTRATION_NOT_CHECKED", "warn");
  if (i.suspensionCheck === "FAILED") f("SUSPENDED");
  else if (i.suspensionCheck === "NOT_CHECKED") f("SUSPENSION_NOT_CHECKED", "warn");
  if (i.alreadySold) f("ALREADY_SOLD");
  if (i.receiptNo && i.receiptTaken) f("RECEIPT_DUPLICATE");
  if (!i.receiptNo) f("RECEIPT_NOT_RECORDED", "warn");
  return out;
}

/**
 * The register checks the officer may record today: NOT_CHECKED, or FAILED where the officer
 * knows of a cancellation or a suspension. CLEAR is the supplier register's to say (6.15).
 */
export const ATTESTABLE_CHECKS: readonly CheckState[] = ["NOT_CHECKED", "FAILED"];

export type VoidFault = "REASON_REQUIRED" | "ALREADY_VOID" | "WINDOW_CLOSED" | "EXERCISE_CANCELLED";

/// Voiding a sale (X-11): with a reason; refused once the window has closed.
export function voidSaleFault(s: { voidedAt: Date | null }, phase: WindowPhase, reason: string): Finding<VoidFault> | null {
  if (s.voidedAt) return { code: "ALREADY_VOID", level: "block" };
  if (phase === "CANCELLED") return { code: "EXERCISE_CANCELLED", level: "block" };
  if (phase === "CLOSED" || phase === "UNKNOWN") return { code: "WINDOW_CLOSED", level: "block", data: { phase } };
  if (!reason.trim()) return { code: "REASON_REQUIRED", level: "block" };
  return null;
}

/**
 * FR-ADV-011: what every issued set is annotated with — the purchaser's name, address, telephone
 * or fax and the closing as stated — with the issuing officer, recorded on their behalf, not
 * signed. Frozen on the sale; the printable label renders it.
 */
export function saleAnnotation(i: { purchaser: string; address: string; phone: string; fax: string; closingText: string; issuedBy: string; soldOnText: string; exerciseReference: string; receiptNo: string | null }) {
  return {
    v: 1 as const,
    exercise: i.exerciseReference,
    purchaser: i.purchaser,
    address: i.address,
    telephone: i.phone,
    fax: i.fax,
    closing: i.closingText,
    issuedBy: i.issuedBy,
    issuedOn: i.soldOnText,
    receipt: i.receiptNo,
    recorded: "recorded on behalf of, not signed",
  };
}

export type SaleAnnotation = ReturnType<typeof saleAnnotation>;

/// The printable label's lines (FR-ADV-011), from the frozen annotation. Missing particulars read "Not recorded".
export function annotationLines(a: SaleAnnotation): string[] {
  const or = (v: string | null) => (v && v.trim() ? v : "Not recorded");
  return [
    `Exercise: ${a.exercise}`,
    `Issued to: ${a.purchaser}`,
    `Address: ${or(a.address)}`,
    `Telephone: ${or(a.telephone)}`,
    `Fax: ${or(a.fax)}`,
    `Closing: ${a.closing}`,
    `Issued by: ${a.issuedBy}, on ${a.issuedOn} (${a.recorded})`,
    `Receipt: ${or(a.receipt)}`,
  ];
}

/// Whether a stored annotation is one (a malformed one renders nothing rather than a guess).
export const isAnnotation = (x: unknown): x is SaleAnnotation => !!x && typeof x === "object" && (x as { v?: unknown }).v === 1 && typeof (x as { purchaser?: unknown }).purchaser === "string";
