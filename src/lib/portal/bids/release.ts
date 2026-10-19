/**
 * Whether the tender documents are released to a supplier online (FR-VND-012, Phase 4d). Pure.
 *
 * Two things are read here and kept apart. The Tender Table Document is open to inspection from publication to the closing (FR-DOC-010: `tableDocumentAvailability`), to any supplier who may see the
 * exercise. The whole pack is released only when the organisation has decided to release documents online (`WindowPolicy.electronicDocumentRelease`, which ships unset) AND an officer has recorded the
 * payment for a sale to this supplier that stands: a sale not voided, with the finance receipt number recorded (OD-11). Not set means nothing is released online, and the screen says so; it is not "off".
 * SR-10 (ruling 17, as amended by the founder): an exercise sold online is bought through the portal, and its purchase is paid either on the payment simulator (channel
 * "Simulated") or by an officer recording the finance receipt. A paid purchase releases the documents exactly as a recorded receipt does. A real payment provider is not
 * connected (INT-10); the simulator is a demonstration and is never a finance receipt. Where the deployment does not allow the simulator (SEC-1) a simulated payment releases nothing.
 * S2 (SR-10 review): a paid purchase is read BEFORE the organisation's release setting, so switching the setting off or unsetting it later does not take back documents a buyer paid for (G1).
 */

import type { WindowPhase } from "@/lib/window/phase";

import { holdsReleasedPurchase, type PurchaseState } from "./purchase";

export type ReleaseState =
  /// The setting has not been made: nothing is released online.
  | "NOT_SET"
  /// The organisation decided to hand documents over at the counter only.
  | "OFF"
  | "NO_SALE"
  /// An online purchase is made and not yet paid.
  | "AWAITING_PAYMENT"
  /// A sale stands, and its payment has not been recorded by an officer yet.
  | "AWAITING_RECEIPT"
  /// SEC-1: the purchase was paid on the payment simulator and the deployment does not allow the simulator, so it releases nothing.
  | "SIMULATION_NOT_ALLOWED"
  | "NOT_OPEN"
  | "READY";

export interface ReleaseInput {
  setting: boolean | null;
  /// The supplier's sale that stands (not voided), or null.
  sale: { voidedAt: Date | null; financeReceiptNo: string | null; /** Absent: a counter sale. */ paymentChannel?: "COUNTER" | "SIMULATED" } | null;
  /// SR-10: the supplier's online purchase of the documents, or null.
  purchase?: { state: PurchaseState } | null;
  phase: WindowPhase;
  /// SEC-1: whether the deployment allows the payment simulator. Required, so a caller cannot forget it.
  simulatorAllowed: boolean;
}

export function releaseState(i: ReleaseInput): ReleaseState {
  // S2: the paid purchase is read before the live setting. A counter sale with its receipt still needs the setting (`releaseOnline`), as before.
  const held = holdsReleasedPurchase({
    releaseOnline: i.setting === true,
    purchase: i.purchase ?? null,
    sale: i.sale ? { voidedAt: i.sale.voidedAt, financeReceiptNo: i.sale.financeReceiptNo, paymentChannel: i.sale.paymentChannel ?? "COUNTER" } : null,
    simulatorAllowed: i.simulatorAllowed,
  });
  if (held.released) {
    // The pack is for preparing a bid: it is released from publication to the closing, and not after, nor for an exercise that was cancelled.
    if (i.phase === "PUBLISHED" || i.phase === "OPEN_FOR_PURCHASE" || i.phase === "CLOSED_FOR_PURCHASE") return "READY";
    return "NOT_OPEN";
  }
  if (i.setting == null) return "NOT_SET";
  if (i.setting === false) return "OFF";
  if (i.purchase?.state === "PAID" && i.sale && !i.sale.voidedAt && i.sale.paymentChannel === "SIMULATED") return "SIMULATION_NOT_ALLOWED";
  if (i.purchase?.state === "AWAITING_PAYMENT") return "AWAITING_PAYMENT";
  if (!i.sale || i.sale.voidedAt) return "NO_SALE";
  return "AWAITING_RECEIPT";
}

/// The words for a counter exercise, and the base for the rest. `releaseText` is what a screen shows: it says what is true of the exercise's mode and of how it was paid.
export const releaseWords: Record<ReleaseState, { short: string; detail: string }> = {
  NOT_SET: { short: "Collected at the counter", detail: "Release online is not set. Collect at the counter." },
  OFF: { short: "Collected at the counter", detail: "Nothing is released here." },
  NO_SALE: { short: "Not bought yet", detail: "Released here after the office records payment." },
  AWAITING_PAYMENT: { short: "Waiting for your payment", detail: "Released once payment is made." },
  AWAITING_RECEIPT: { short: "Waiting for the payment to be recorded", detail: "Released once an officer records payment." },
  SIMULATION_NOT_ALLOWED: { short: "Paid on the payment simulator", detail: "No money moved. Ask the procurement office." },
  NOT_OPEN: { short: "No longer released", detail: "Released from publication to the closing." },
  READY: { short: "Released to you", detail: "Payment recorded. Open to you here until the closing." },
};

/**
 * What to say of a release state (S6). The counter's words say "collected at the counter" and "after the office has sold them", which is untrue on an exercise sold online, and
 * "Your payment is recorded" is untrue of a payment that was a simulation. So the words follow the exercise's mode and, once released, how it was paid.
 */
export function releaseText(state: ReleaseState, ctx: { saleMode: "COUNTER" | "ONLINE" | null; simulated: boolean }): { short: string; detail: string } {
  if (state === "READY" && ctx.simulated) {
    return { short: "Released to you (simulated payment)", detail: "No money moved. Open to you here until the closing." };
  }
  if (ctx.saleMode !== "ONLINE") return releaseWords[state];
  switch (state) {
    case "NOT_SET":
      return { short: "Not released online yet", detail: "Release online is not set. Ask the procurement office." };
    case "OFF":
      return { short: "Not released online", detail: "Release online is off. Ask the procurement office." };
    case "NO_SALE":
      return { short: "Not bought yet", detail: "Buy above. Released once paid." };
    case "AWAITING_RECEIPT":
      return { short: "Waiting for the payment to be recorded", detail: "Released once the office records payment." };
    default:
      return releaseWords[state];
  }
}
