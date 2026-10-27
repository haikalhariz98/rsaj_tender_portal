/**
 * Finance's payment of a supply claim (ADR 0045 D7; WV-13; FR-PAY-019, INT-07's manual adapter, beside the certificate's). Pure.
 *
 * Recorded once per claim, only once the claim is verified (its latest version marked "Taken up", which reads "Verified" on this kind), paid on a day not before the
 * day it was verified and not after today, with Finance's batch number and the amount Finance paid, typed from its remittance. Nothing is matched: the amount is never
 * compared with the invoice, the contract sum or the budget (AC-33), and no budget-ledger line is written, as with `FinancePayment`.
 */

import { fitsMoneyColumn, formatMoney, type Sen } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { DocumentReading } from "@/lib/project-docs/state";

import { correctionFaultText } from "./correction";

import type { Day, Finding } from "./types";

export type SupplyPaymentFault = "NOT_VERIFIED" | "PAYMENT_ALREADY_RECORDED" | "BATCH_REQUIRED" | "FUTURE_DATE" | "PAID_BEFORE_VERIFIED" | "AMOUNT_REQUIRED" | "AMOUNT_NOT_POSITIVE" | "AMOUNT_TOO_LARGE";

/// `verifiedOn`: the day the claim's latest version was marked verified, or null where it is not verified. `amount`: null where none was typed.
export function supplyPaymentFaults(i: { verifiedOn: Day | null; already: boolean; batchNo: string; paidOn: Day; today: Day; amount: Sen | null }): Finding[] {
  const out: Finding[] = [];
  const f = (code: SupplyPaymentFault, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.verifiedOn === null) f("NOT_VERIFIED");
  if (i.already) f("PAYMENT_ALREADY_RECORDED");
  if (!i.batchNo.trim()) f("BATCH_REQUIRED");
  if (i.paidOn > i.today) f("FUTURE_DATE", { day: i.paidOn });
  // The verified day itself is allowed: Finance may pay the day the claim is verified.
  if (i.verifiedOn !== null && i.paidOn < i.verifiedOn) f("PAID_BEFORE_VERIFIED", { day: i.verifiedOn });
  if (i.amount === null) f("AMOUNT_REQUIRED");
  else if (i.amount <= 0n) f("AMOUNT_NOT_POSITIVE");
  else if (!fitsMoneyColumn(i.amount)) f("AMOUNT_TOO_LARGE");
  return out;
}

/// A refusal of the payment in words. An unknown code fails closed: "Refused."
export function supplyFaultText(f: Finding): string {
  const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
  switch (f.code) {
    case "NOT_VERIFIED":
      return "Finance pays a verified claim: this one is not verified.";
    case "PAYMENT_ALREADY_RECORDED":
      return "Finance's payment of this claim is already recorded.";
    case "BATCH_REQUIRED":
      return "Give Finance's payment batch number.";
    case "FUTURE_DATE":
      return `${day(f.data?.day)} is after today: nothing is recorded ahead of its day.`;
    case "PAID_BEFORE_VERIFIED":
      return `It cannot be paid before it was verified (${day(f.data?.day)}).`;
    case "AMOUNT_REQUIRED":
      return "Give the amount Finance paid.";
    case "AMOUNT_NOT_POSITIVE":
      return "The amount paid must be more than zero.";
    case "AMOUNT_TOO_LARGE":
      return "The amount paid is too large to record.";
    case "NOT_A_SUPPLY_CLAIM":
      return "That is not a delivery order and invoice on this contract.";
    case "PERSON_REQUIRED":
      return "Name who it is recorded for: someone on record and active.";
    default:
      return correctionFaultText(f) ?? "Refused.";
  }
}

export const supplyRefusal = (lead: string, fs: readonly Finding[]): string => [lead, ...fs.map(supplyFaultText)].join(" ");

// ------------------------------------------------------------------ a claim's state

/// A supply claim as both sides read it: with the organisation (received, not yet marked), returned with remarks, verified, or paid.
export type SupplyClaimState = "WITH_ORGANISATION" | "RETURNED" | "VERIFIED" | "PAID";

export function supplyClaimState(reading: Pick<DocumentReading, "state">, paid: boolean): SupplyClaimState {
  if (paid) return "PAID";
  if (reading.state === "TAKEN_UP") return "VERIFIED";
  if (reading.state === "RETURNED") return "RETURNED";
  return "WITH_ORGANISATION";
}

/// The claim's state in words. A paid claim says what Finance paid, when and in which batch (WV-13), as a certificate's payment does.
export function supplyClaimWords(state: SupplyClaimState, orgName: string, payment: { amount: Sen; paidOn: Day; batchNo: string } | null): string {
  switch (state) {
    case "PAID":
      return payment ? `Paid ${formatMoney(payment.amount)} on ${formatDate(payment.paidOn)}, batch ${payment.batchNo}` : "Paid";
    case "VERIFIED":
      return "Verified";
    case "RETURNED":
      return "Returned";
    case "WITH_ORGANISATION":
      return `With ${orgName}`;
  }
}
