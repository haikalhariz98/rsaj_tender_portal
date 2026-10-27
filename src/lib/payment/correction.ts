/**
 * Phase 0.3 item 12: a payment recorded wrongly (a certificate's `FinancePayment`, a supply claim's `SupplyInvoicePayment`) is corrected by a new
 * `PaymentCorrection` row, never by an edit. Every reader takes the latest: `CORRECTIONS` in its select, `asCorrected` on the row. Pure.
 */

import type { Finding } from "./types";

/// Put in every select of a payment: its latest correction, if any.
export const CORRECTIONS = { corrections: { orderBy: { sequence: "desc" }, take: 1, select: { paidOn: true, batchNo: true, amount: true } } } as const;

type Paid<D, A> = { paidOn: D; batchNo: string; amount: A };

/// The payment as it stands: its latest correction's day, reference and amount over the row as recorded, and whether it was corrected.
export function asCorrected<D, A, P extends Paid<D, A> & { corrections: readonly Paid<D, A>[] }>(p: P): Omit<P, "corrections"> & { corrected: boolean } {
  const { corrections, ...row } = p;
  const latest = corrections[0];
  return latest ? { ...row, paidOn: latest.paidOn, batchNo: latest.batchNo, amount: latest.amount, corrected: true } : { ...row, corrected: false };
}

/// What only a correction adds to the record act's own rule (which is re-run with `already` false): a payment to correct, a reason, and a change.
export function correctionFaults(i: { recorded: boolean; reason: string; before: { paidOn: string; batchNo: string; amount: bigint }; after: { paidOn: string; batchNo: string; amount: bigint } }): Finding[] {
  if (!i.recorded) return [{ code: "NO_PAYMENT_TO_CORRECT", level: "block" }];
  const out: Finding[] = [];
  if (!i.reason.trim()) out.push({ code: "CORRECTION_REASON_REQUIRED", level: "block" });
  const same = i.before.paidOn === i.after.paidOn && i.before.batchNo.trim() === i.after.batchNo.trim() && i.before.amount === i.after.amount;
  if (same) out.push({ code: "NOTHING_CORRECTED", level: "block" });
  return out;
}

/// The words of a correction's own refusals, shared by both payment kinds. Null: not a correction's code.
export function correctionFaultText(f: Finding): string | null {
  switch (f.code) {
    case "NO_PAYMENT_TO_CORRECT":
      return "No payment is recorded, so there is nothing to correct.";
    case "CORRECTION_REASON_REQUIRED":
      return "Say why the payment is corrected.";
    case "NOTHING_CORRECTED":
      return "Nothing differs from the payment as it stands.";
    default:
      return null;
  }
}
