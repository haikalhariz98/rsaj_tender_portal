/**
 * Buying the tender documents online (SR-10, rulings 16 and 17; FR-VND-012, FR-ADV-010). Pure.
 *
 * On an exercise sold online the supplier presses "Buy documents" and a purchase is made, "awaiting payment". It is paid in one of two ways and no other:
 *  - through the payment gateway (today only the simulator), which records the payment with the channel "Simulated" and releases the documents exactly as a real
 *    payment would; or
 *  - by an officer recording the finance receipt, where online payment is not switched on (the fallback): the channel is then the finance receipt's.
 * A simulated payment is never a finance receipt (`payment-gateway.ts`).
 *
 * The pre-sale checks are the counter's (`preSaleChecks`), with the proof of authority an officer sights at the counter (FR-ADV-010) replaced by a reading of the signed-in person's standing on the supplier record, because there is no counter. The status certificate
 * of a restricted tender cannot be shown online either, so a restricted tender is not sold online at all (M1, a product owner question: it needs a reading from the supplier register to be ruled).
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
      // M1 (SR-10 review): nothing records a status certificate for an online buyer, and the opening would find it not evidenced and eliminate the bid, so a restricted tender is not sold online until a reading from the supplier register is ruled.
      out.push({ key: "RESTRICTION", state: "BLOCK", detail: "The notice restricts who may tender, and a purchase online has no counter where your status certificate could be shown, so the documents of this tender are not sold online. Ask the procurement office how to buy them." });
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

type SaleOfSupplier = { voidedAt: Date | null; financeReceiptNo: string | null; paymentChannel: "COUNTER" | "SIMULATED" };

/// SEC-1: a sale paid on the payment simulator stands for no money, so it counts only while the deployment allows the simulator. A counter sale is not affected.
const standsHere = (sale: SaleOfSupplier | null, simulatorAllowed: boolean): SaleOfSupplier | null => (sale && !sale.voidedAt && (sale.paymentChannel !== "SIMULATED" || simulatorAllowed) ? sale : null);

/**
 * Whether the DOCUMENTS are released to a supplier (FR-VND-012): it holds a paid online purchase whose sale stands, by either payment and no other, or a counter sale with its finance
 * receipt recorded where the organisation releases documents online (OD-11). Pure and independent of the phase: a purchase released at the sale stays released after the closing.
 * `simulatorAllowed` is the deployment's permission (SEC-1, `simulatorAllowedByDeployment`), required so no caller can forget it: a simulated payment releases nothing where it is withheld.
 * The bid is a different question with a different answer (`holdsBidStanding`).
 */
export function holdsReleasedPurchase(i: {
  releaseOnline: boolean | null;
  purchase: { state: PurchaseState } | null;
  /// The supplier's sale on the exercise that stands or was voided; null: none.
  sale: SaleOfSupplier | null;
  simulatorAllowed: boolean;
}): { released: boolean; basis: "PAID_PURCHASE" | "COUNTER_SALE_WITH_RECEIPT" | null } {
  const sale = standsHere(i.sale, i.simulatorAllowed);
  // A paid purchase was released when it was taken (a purchase is refused unless documents are released online), so a later change of the organisation's setting does not unmake it: a gate on an exercise in flight is not rewritten (G1).
  if (i.purchase?.state === "PAID" && sale) return { released: true, basis: "PAID_PURCHASE" };
  // The counter's own flow: an officer sold the documents and recorded the finance receipt, and the organisation releases documents online.
  if (i.releaseOnline === true && sale && sale.paymentChannel === "COUNTER" && !!sale.financeReceiptNo?.trim()) return { released: true, basis: "COUNTER_SALE_WITH_RECEIPT" };
  return { released: false, basis: null };
}

/**
 * Whether a supplier stands as a buyer of the documents for the purpose of SUBMITTING A BID (wave 3b), which is the opening's own reading (`LIVE_SALE`, X-11): it holds a sale that
 * stands, a counter sale with or without its receipt recorded (the receipt is finance's paperwork and does not decide who may tender), or a paid online purchase. The documents' release
 * is stricter, and rightly (`holdsReleasedPurchase`): a bid is judged by the same sale the opening will find, so a supplier is not let to tender only to be found "no live purchase".
 * A simulated payment counts only while the deployment allows the simulator (SEC-1), as at the opening. Product owner to confirm (the wave 3a builder raised the same question).
 */
export function holdsBidStanding(i: { sale: SaleOfSupplier | null; simulatorAllowed: boolean }): boolean {
  return standsHere(i.sale, i.simulatorAllowed) != null;
}
