/**
 * Buying the tender documents online (SR-10, rulings 16 and 17; FR-VND-012, FR-ADV-010). Pure.
 *
 * On an exercise sold online the supplier presses "Buy documents" and a purchase is made, "awaiting payment". It is paid in one of two ways and no other:
 *  - through the payment gateway (today only the simulator), which records the payment with the channel "Simulated" and releases the documents exactly as a real
 *    payment would; or
 *  - by an officer recording the finance receipt, where online payment is not switched on (the fallback): the channel is then the finance receipt's.
 * A simulated payment is never a finance receipt (`payment-gateway.ts`).
 *
 * The pre-sale checks are the counter's (`preSaleChecks`), with the two an officer sights at the counter replaced, because there is no counter: the proof of authority
 * the officer sighted (FR-ADV-010) becomes a reading of the signed-in person's standing on the supplier record, and the status certificate of a restricted tender is
 * said to be read from the register, not passed.
 */

import type { StandingBar } from "@/lib/portal/standing-gate";

import type { PreSaleCheck } from "./checks";

export type PurchaseState = "AWAITING_PAYMENT" | "PAID";
export type PaidChannel = "SIMULATED" | "FINANCE_RECEIPT";

export const PURCHASE_STATE_WORDS: Readonly<Record<PurchaseState, string>> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
};

/// How a paid purchase was paid, as every screen and export says it.
export const PAID_CHANNEL_WORDS: Readonly<Record<PaidChannel, string>> = {
  SIMULATED: "Simulated payment",
  FINANCE_RECEIPT: "Finance receipt recorded by an officer",
};

export interface BuyerFacts {
  /// The signed-in person's name, as the supplier record holds it.
  name: string;
  /// The portal account is active (not disabled, not waiting for activation).
  accountActive: boolean;
  /// The contact the account belongs to has not been retired from the supplier.
  contactCurrent: boolean;
  /// The supplier's standing bars an act in the portal (`portalStandingBarOf`), or null.
  bar: StandingBar | null;
}

/// The reading of the signed-in person's standing on the supplier record, in place of the officer sighting a letter of authority (SR-10). A reading, in words: PASS or BLOCK.
export function buyerStandingCheck(b: BuyerFacts): PreSaleCheck {
  if (!b.accountActive) return { key: "AUTHORITY", state: "BLOCK", detail: "Your portal account is not active, so you cannot buy documents for your company. Ask the procurement office." };
  if (!b.contactCurrent) return { key: "AUTHORITY", state: "BLOCK", detail: "You are no longer a current contact of your company on the supplier register, so you cannot buy documents for it. Ask your company to update its record." };
  if (b.bar) return { key: "AUTHORITY", state: "BLOCK", detail: b.bar.en };
  return { key: "AUTHORITY", state: "PASS", detail: `You are signed in as ${b.name}, a current contact of your company on the supplier register, so you may buy the documents for it.` };
}

/// The counter's checks made fit for an online purchase: the officer's sighting of authority is replaced by the reading above, and a restricted tender's certificate is said to be read from the register.
export function onlinePurchaseChecks(counter: readonly PreSaleCheck[], buyer: PreSaleCheck): PreSaleCheck[] {
  const out: PreSaleCheck[] = [];
  for (const c of counter) {
    if (c.key === "AUTHORITY") continue;
    if (c.key === "RESTRICTION" && c.state === "BRING") {
      out.push({ key: "RESTRICTION", state: "INFO", detail: "The notice restricts who may tender. There is no counter to show your status certificate at: the office reads it from your company's record on the supplier register, which it checks when your bid is opened." });
      continue;
    }
    out.push(c);
  }
  out.push(buyer);
  return out;
}

export type PurchaseFault = "ALREADY_BOUGHT" | "PURCHASE_STANDS" | "NOT_SOLD_ONLINE" | "WINDOW_NOT_DATED" | "RELEASE_NOT_ONLINE" | "FEE_NOT_SET";

export type PurchaseJudgement = { outcome: "FAULTS"; faults: PurchaseFault[] } | { outcome: "REFUSED" } | { outcome: "MAKE" };

/**
 * Whether a purchase is made: something the supplier can put right is a fault and nothing is written; a blocking check keeps the attempt as a refusal with its reasons;
 * otherwise the purchase is made, awaiting payment. `releaseOnline` is the organisation's setting that documents are released online: without it a paid purchase would
 * release nothing, so a purchase is not taken (it would only take money for documents that stay at the counter).
 */
export function judgePurchase(i: { saleMode: "COUNTER" | "ONLINE" | null; releaseOnline: boolean | null; feeSet: boolean; checks: readonly PreSaleCheck[]; alreadyBought: boolean; purchaseStands: boolean }): PurchaseJudgement {
  const faults: PurchaseFault[] = [];
  if (i.saleMode !== "ONLINE") faults.push("NOT_SOLD_ONLINE");
  if (i.releaseOnline !== true) faults.push("RELEASE_NOT_ONLINE");
  if (!i.feeSet) faults.push("FEE_NOT_SET");
  if (i.purchaseStands) faults.push("PURCHASE_STANDS");
  if (i.alreadyBought) faults.push("ALREADY_BOUGHT");
  if (i.checks.length === 0) faults.push("WINDOW_NOT_DATED");
  if (faults.length > 0) return { outcome: "FAULTS", faults };
  return i.checks.some((c) => c.state === "BLOCK") ? { outcome: "REFUSED" } : { outcome: "MAKE" };
}

/**
 * Whether a supplier holds a RELEASED purchase of an exercise's documents, which is what lets it later submit a bid (wave 3b). Pure and independent of the phase: a
 * purchase released at the sale stays released after the closing, so a bid in time is not refused for the sale having ended. A purchase counts once it is paid and its
 * sale stands (a voided sale is no purchase), by either payment and no other, and only where the organisation releases documents online.
 */
export function holdsReleasedPurchase(i: {
  releaseOnline: boolean | null;
  purchase: { state: PurchaseState } | null;
  /// The supplier's sale on the exercise that stands or was voided; null: none.
  sale: { voidedAt: Date | null; financeReceiptNo: string | null; paymentChannel: "COUNTER" | "SIMULATED" } | null;
}): { released: boolean; basis: "PAID_PURCHASE" | "COUNTER_SALE_WITH_RECEIPT" | null } {
  if (i.releaseOnline !== true) return { released: false, basis: null };
  const sale = i.sale && !i.sale.voidedAt ? i.sale : null;
  if (i.purchase?.state === "PAID" && sale) return { released: true, basis: "PAID_PURCHASE" };
  // The counter's own flow: an officer sold the documents and recorded the finance receipt.
  if (sale && sale.paymentChannel === "COUNTER" && !!sale.financeReceiptNo?.trim()) return { released: true, basis: "COUNTER_SALE_WITH_RECEIPT" };
  return { released: false, basis: null };
}
