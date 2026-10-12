/**
 * Whether the tender documents are released to a supplier online (FR-VND-012, Phase 4d). Pure.
 *
 * Two things are read here and kept apart. The Tender Table Document is open to inspection from publication to the closing (FR-DOC-010: `tableDocumentAvailability`), to any supplier who may see the
 * exercise. The whole pack is released only when the organisation has decided to release documents online (`WindowPolicy.electronicDocumentRelease`, which ships unset) AND an officer has recorded the
 * payment for a sale to this supplier that stands: a sale not voided, with the finance receipt number recorded (OD-11). Not set means nothing is released online, and the screen says so; it is not "off".
 * SR-10 (ruling 17, as amended by the founder): an exercise sold online is bought through the portal, and its purchase is paid either on the payment simulator (channel
 * "Simulated") or by an officer recording the finance receipt. A paid purchase releases the documents exactly as a recorded receipt does. A real payment provider is not
 * connected (INT-10); the simulator is a demonstration and is never a finance receipt.
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
  | "NOT_OPEN"
  | "READY";

export interface ReleaseInput {
  setting: boolean | null;
  /// The supplier's sale that stands (not voided), or null.
  sale: { voidedAt: Date | null; financeReceiptNo: string | null; /** Absent: a counter sale. */ paymentChannel?: "COUNTER" | "SIMULATED" } | null;
  /// SR-10: the supplier's online purchase of the documents, or null.
  purchase?: { state: PurchaseState } | null;
  phase: WindowPhase;
}

export function releaseState(i: ReleaseInput): ReleaseState {
  if (i.setting == null) return "NOT_SET";
  if (i.setting === false) return "OFF";
  const held = holdsReleasedPurchase({ releaseOnline: true, purchase: i.purchase ?? null, sale: i.sale ? { voidedAt: i.sale.voidedAt, financeReceiptNo: i.sale.financeReceiptNo, paymentChannel: i.sale.paymentChannel ?? "COUNTER" } : null });
  if (!held.released) {
    if (i.purchase?.state === "AWAITING_PAYMENT") return "AWAITING_PAYMENT";
    if (!i.sale || i.sale.voidedAt) return "NO_SALE";
    return "AWAITING_RECEIPT";
  }
  // The pack is for preparing a bid: it is released from publication to the closing, and not after, nor for an exercise that was cancelled.
  if (i.phase === "PUBLISHED" || i.phase === "OPEN_FOR_PURCHASE" || i.phase === "CLOSED_FOR_PURCHASE") return "READY";
  return "NOT_OPEN";
}

export const releaseWords: Record<ReleaseState, { short: string; detail: string }> = {
  NOT_SET: { short: "Collected at the counter", detail: "The procurement office has not set whether documents are released online, so they are collected at the counter. Nothing is released here." },
  OFF: { short: "Collected at the counter", detail: "The procurement office hands the documents over at the counter only. Nothing is released here." },
  NO_SALE: { short: "Not bought yet", detail: "The documents are released here after the office has sold them to your company and recorded the payment." },
  AWAITING_PAYMENT: { short: "Waiting for your payment", detail: "You have started buying the documents. They are released here once the payment is made." },
  AWAITING_RECEIPT: { short: "Waiting for the payment to be recorded", detail: "The documents have been sold to your company. They are released here once an officer records the payment receipt." },
  NOT_OPEN: { short: "No longer released", detail: "The documents are released from publication to the closing, and not for a cancelled exercise." },
  READY: { short: "Released to you", detail: "Your payment is recorded, so the documents are open to you here until the closing." },
};
