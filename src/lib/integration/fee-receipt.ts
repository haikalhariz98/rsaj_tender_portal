/**
 * The finance system's receipt for a document fee (FR-ADV-009, §9.5, 6.5 OD-11), behind a façade.
 *
 * Finance owns revenue (hasil): it issues the receipt at its counter and the portal consumes the
 * number, never minting one — receipts are not among the five series the portal generates. Until
 * an adapter exists the only one is manual: the officer types the number the finance receipt
 * carries, checked against a configured format where one is set. The register's sales with no
 * receipt are the reconciliation exceptions; reconciling to the ledger waits on D5, and online
 * payment (INT-10) is Phase 3.
 */

import { matchesFormat } from "./award-commitment";
import { isFinanceReceipt } from "./payment-gateway";

export interface FeeReceipt {
  number: string;
  /// The organisation's day it was recorded, YYYY-MM-DD.
  recordedOn: string;
}

export type ReceiptFault = "NUMBER_REQUIRED" | "FORMAT" | "FUTURE_DATE" | "TAKEN";

export interface FeeReceiptGateway {
  /// Where an adapter exists, ask the finance system for the receipt. Manual: nothing to ask.
  requestReceipt(saleReference: string): Promise<void>;
  /// Check a number as it is recorded. `taken`: another sale of the organisation holds it.
  check(r: FeeReceipt, ctx: { pattern: string | null; today: string; taken: boolean }): ReceiptFault[];
}

export const manualFeeReceipt: FeeReceiptGateway = {
  async requestReceipt() {
    // Manual: the purchaser pays at the finance counter and the officer records the number here.
  },
  check(r, ctx) {
    const out: ReceiptFault[] = [];
    if (!r.number.trim()) out.push("NUMBER_REQUIRED");
    else if (matchesFormat(r.number.trim(), ctx.pattern) === false) out.push("FORMAT");
    if (r.recordedOn > ctx.today) out.push("FUTURE_DATE");
    if (ctx.taken) out.push("TAKEN");
    return out;
  },
};

type ReconcilableSale = { voidedAt: Date | null; financeReceiptNo: string | null; soldOn: Date; paymentChannel?: "COUNTER" | "SIMULATED" };

/// A sale with no `paymentChannel` is a counter sale (the column's default).
const channelOf = (s: { paymentChannel?: "COUNTER" | "SIMULATED" }) => s.paymentChannel ?? "COUNTER";

/**
 * The reconciliation exceptions: live counter sales with no finance receipt recorded, oldest first. A simulated payment (SR-10) is never one: it is not a finance receipt and never
 * will be, so finance has nothing to reconcile it to and it must not appear to be waiting for one. It is listed apart (`simulatedSales`), never dropped. A sale is "with a receipt" by
 * `isFinanceReceipt`, the one definition, so what finance counts and what this list leaves out cannot differ.
 */
export function uncollectedReceipts<S extends ReconcilableSale>(sales: readonly S[]): S[] {
  return sales.filter((s) => !s.voidedAt && channelOf(s) !== "SIMULATED" && !isFinanceReceipt({ paymentChannel: channelOf(s), financeReceiptNo: s.financeReceiptNo, voidedAt: s.voidedAt })).sort((a, b) => a.soldOn.getTime() - b.soldOn.getTime());
}

/// The live sales paid on the payment simulator, oldest first: "Simulated, no money received". Listed for the officer so a sale that stands for nothing is seen, and never counted as a receipt.
export const simulatedSales = <S extends ReconcilableSale>(sales: readonly S[]): S[] => sales.filter((s) => !s.voidedAt && channelOf(s) === "SIMULATED").sort((a, b) => a.soldOn.getTime() - b.soldOn.getTime());

/// How the reconciliation list calls a simulated sale.
export const SIMULATED_NO_MONEY = "Simulated, no money received";
