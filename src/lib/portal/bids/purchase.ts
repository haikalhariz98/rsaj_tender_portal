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
 * of a restricted tender cannot be shown online either, so it is evidenced from the supplier register instead (ruling 17a): the organisation's configured evidence document, verified by an officer, and never the declared claim.
 */

import { formatDate } from "@/lib/format";
import type { StandingBar } from "@/lib/portal/standing-gate";
import { saleStands } from "@/lib/sales/standing";
import type { LapseKind, PurchaseRefusal, PurchaseRestriction } from "@/lib/suppliers/restriction-register";

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

/// Who reads the words: the buyer on the portal ("your company"), or the officer at the sale register and on the receipt ("the supplier"). Each is told the true thing in its own voice.
export type WordsFor = "BUYER" | "STAFF";

/// Why a purchase of a restricted tender is refused, in words for the buyer. The supplier register is named, and nothing is "brought" to a counter.
const RESTRICTION_REFUSAL: Readonly<Record<PurchaseRefusal, string>> = {
  EVIDENCE_TYPE_NOT_SET: "The notice restricts who may tender, and the office has not set which document on the supplier register evidences that, so the documents cannot be sold to your company yet. Tell the procurement office.",
  NONE_LODGED: "The notice restricts who may tender, and your company has no status document on the supplier register. Lodge it under Company, wait for an officer to verify it, and then buy the documents.",
  NOT_VERIFIED: "The notice restricts who may tender, and your company's status document on the supplier register has not been verified by an officer yet. Once it is verified you can buy the documents.",
  NOT_IN_ORDER: "The notice restricts who may tender, and your company's status document on the supplier register was found not in order. Lodge a corrected one under Company and wait for an officer to verify it.",
  NOT_APPLICABLE: "The notice restricts who may tender, and your company's status document is recorded on the supplier register as not applicable, so it does not evidence the restriction. Ask the procurement office.",
  NOT_YET_VALID: "The notice restricts who may tender, and your company's verified status document on the supplier register is not valid yet. It can evidence the restriction only once it is valid.",
  EXPIRED: "The notice restricts who may tender, and your company's status document on the supplier register has expired. Lodge the renewal under Company and wait for an officer to verify it, and then buy the documents.",
  EXPIRED_RENEWAL_WAITING: "The notice restricts who may tender, and your company's status document on the supplier register has expired. The renewal you lodged is waiting for an officer to verify it. Once it is verified you can buy the documents.",
};

/// The same refusals for the officer: who is refused is the supplier, and nothing is said to the officer about "lodging under Company".
const RESTRICTION_REFUSAL_STAFF: Readonly<Record<PurchaseRefusal, string>> = {
  EVIDENCE_TYPE_NOT_SET: "The notice restricts who may tender, and the organisation has not set which document on the supplier register evidences that (Configuration, Suppliers), so the documents cannot be sold.",
  NONE_LODGED: "The notice restricts who may tender, and the supplier has no status document on the supplier register, so the documents cannot be sold.",
  NOT_VERIFIED: "The notice restricts who may tender, and the supplier's status document on the supplier register has not been verified by an officer yet, so the documents cannot be sold.",
  NOT_IN_ORDER: "The notice restricts who may tender, and the supplier's status document on the supplier register was found not in order, so the documents cannot be sold.",
  NOT_APPLICABLE: "The notice restricts who may tender, and the supplier's status document is recorded on the supplier register as not applicable, so it does not evidence the restriction and the documents cannot be sold.",
  NOT_YET_VALID: "The notice restricts who may tender, and the supplier's verified status document on the supplier register is not valid yet, so the documents cannot be sold.",
  EXPIRED: "The notice restricts who may tender, and the supplier's status document on the supplier register has expired and no renewal is lodged, so the documents cannot be sold.",
  EXPIRED_RENEWAL_WAITING: "The notice restricts who may tender, and the supplier's status document on the supplier register has expired. A renewal is lodged and waits for an officer to verify it, so the documents cannot be sold until it is.",
};

const lapseWords = (kind: LapseKind, waiting: boolean, by: WordsFor): string => {
  const you = by === "BUYER";
  const bid = you ? "your bid" : "the supplier's bid";
  const renewal = waiting ? (you ? "the renewal you lodged must be verified by an officer" : "the renewal lodged must be verified by an officer") : you ? "a renewal must be lodged and verified by an officer" : "a renewal must be lodged and verified";
  switch (kind) {
    case "BEFORE_CLOSING":
      return `It expires before the closing day, so ${renewal} before the closing day or ${bid} will be found not evidenced.`;
    case "ON_CLOSING_DAY_NOT_COUNTED":
      return `It expires on the closing day, and the organisation does not count a document expiring on the closing day as valid, so ${renewal} before the closing day or ${bid} will be found not evidenced.`;
    case "ON_CLOSING_DAY_NOT_SET":
      return `It expires on the closing day, and the organisation has not yet set whether that counts as valid, so ${waiting ? renewal : you ? "lodge and have a renewal verified" : "a renewal should be lodged and verified"} before the closing day to be safe.`;
  }
};

/**
 * The restricted tender's check for an ONLINE purchase (ruling 17a), in place of the counter's "bring the certificate": the register's reading of the configured evidence document. Allowed
 * with a warning when it lapses before the closing day. The document's reference and validity are in the words, so the purchase keeps them. The buyer is told in its own voice; the sale register
 * and the officer's receipt are given the staff words (`by`) from the structured reading frozen on the sale.
 */
export function restrictionPurchaseCheck(r: PurchaseRestriction, label: string | null, by: WordsFor = "BUYER"): PreSaleCheck {
  if (r.outcome === "REFUSE") return { key: "RESTRICTION", state: "BLOCK", detail: (by === "BUYER" ? RESTRICTION_REFUSAL : RESTRICTION_REFUSAL_STAFF)[r.reason] };
  const d = r.document;
  const cited = `${d.reference ? `document ${d.reference}` : "status document"}${d.expiresOn ? `, valid until ${formatDate(d.expiresOn)}` : ", with no expiry"}`;
  const lead = `${label ? `${label}: ` : "The notice restricts who may tender. "}Verified on the supplier register: ${by === "BUYER" ? "your " : "the supplier's "}${cited}.`;
  return r.lapses ? { key: "RESTRICTION", state: "WARN", detail: `${lead} ${lapseWords(r.lapses.kind, r.lapses.renewalWaiting === true, by)}` } : { key: "RESTRICTION", state: "PASS", detail: lead };
}

/// The counter's checks made fit for an online purchase: the officer's sighting of authority is replaced by the reading above, and a restricted tender's certificate by the register's reading of the evidence document (17a).
export function onlinePurchaseChecks(counter: readonly PreSaleCheck[], buyer: PreSaleCheck, restriction: PreSaleCheck | null): PreSaleCheck[] {
  const out: PreSaleCheck[] = [];
  for (const c of counter) {
    if (c.key === "AUTHORITY") continue;
    if (c.key === "RESTRICTION" && c.state === "BRING") {
      // Never passed on its own say-so: a restricted tender with no reading is stopped, not let through.
      out.push(restriction ?? { key: "RESTRICTION", state: "BLOCK", detail: "The notice restricts who may tender, and the supplier register could not be read for your company's status document. Tell the procurement office." });
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
/// Wave 3b (17c, 20m): the one predicate (`saleStands`) the opening and the online submission's door read too.
const standsHere = (sale: SaleOfSupplier | null, simulatorAllowed: boolean): SaleOfSupplier | null => (saleStands(sale, simulatorAllowed) ? sale : null);

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
 * A simulated payment counts only while the deployment allows the simulator (SEC-1), as at the opening. The product owner confirmed this predicate (ruling 17c, wave 3a review S9): a bid does not also require the finance receipt, and a counter sale counts whatever `electronicDocumentRelease` says, because the release setting governs the online documents only.
 */
export function holdsBidStanding(i: { sale: SaleOfSupplier | null; simulatorAllowed: boolean }): boolean {
  return saleStands(i.sale, i.simulatorAllowed);
}
