/**
 * The online payment of a document fee (SR-10, ruling 17 as amended by the founder on 2026-10-09; INT-10), behind a façade. Pure.
 *
 * Finance owns revenue and a real provider (online banking, a card gateway) is a later adapter on the founder's go-ahead. Until then the one adapter is a
 * payment SIMULATOR, so the whole flow can be shown end to end: a buyer is offered the payment methods the organisation configured, is taken to a simulated
 * provider page, and chooses "Pay successfully" or "Payment fails". No money moves, no outside service is contacted, and nothing the simulator answers is ever
 * taken for a payment made:
 *
 *  - every thing that shows a simulated payment says "Simulated payment" (`SIMULATED_LABEL`): the simulated page, the receipt, the supplier's purchase, the
 *    officer's register and every export;
 *  - a simulated payment is never a finance receipt: `countsAsFinanceReceipt` is false and `isFinanceReceipt` says so for any record, so nothing can count one
 *    towards reconciliation or put one in a finance export;
 *  - the simulator is switched on by a nullable configuration switch (`WindowPolicy.paymentSimulatorOn`, two-person path); unset or off, it refuses in words and the
 *    documents are paid for at the finance counter, the officer recording the receipt (the manual adapter in `fee-receipt.ts`).
 */

import { createHash } from "node:crypto";

import { onlinePaymentAvailable, type OnlinePaymentFacts } from "@/lib/window/sale-mode";

/// What every simulated payment is called, wherever it is shown.
export const SIMULATED_LABEL = "Simulated payment";

export type PaymentChoice = "PAY" | "FAIL";

export interface PaymentRequest {
  /// The purchase being paid for; with the attempt's number it makes the simulated reference, so a repeated settle of one attempt gives one reference.
  purchaseId: string;
  attemptNo: number;
  /// The method the buyer chose, as the organisation configured it (a label).
  method: string;
}

export type PaymentSettlement =
  | { outcome: "PAID"; channel: "SIMULATED"; reference: string; method: string }
  | { outcome: "FAILED"; channel: "SIMULATED"; reference: string; method: string; failureText: string };

export interface PaymentGateway {
  /// What the adapter is called wherever its payments are shown.
  label: string;
  /// A payment through it is a finance receipt. False for the simulator: it never reaches a finance export.
  countsAsFinanceReceipt: boolean;
  /// The provider's answer once the buyer has chosen on its page. The simulator makes the choice itself; a real provider answers by its own.
  settle(req: PaymentRequest, choice: PaymentChoice): PaymentSettlement;
}

/// A reference that is plainly not a finance receipt number: it starts with SIM and is derived from the purchase and the attempt, so it is stable.
export function simulatedReference(purchaseId: string, attemptNo: number): string {
  return `SIM-${createHash("sha256").update(`${purchaseId}:${attemptNo}`).digest("hex").slice(0, 10).toUpperCase()}`;
}

export const SIMULATED_FAILURE_TEXT = "The simulated provider declined the payment. Nothing was charged, and no money moved: this is a demonstration. Choose a method and try again.";

export const paymentSimulator: PaymentGateway = {
  label: SIMULATED_LABEL,
  countsAsFinanceReceipt: false,
  settle(req, choice) {
    const reference = simulatedReference(req.purchaseId, req.attemptNo);
    return choice === "PAY" ? { outcome: "PAID", channel: "SIMULATED", reference, method: req.method } : { outcome: "FAILED", channel: "SIMULATED", reference, method: req.method, failureText: SIMULATED_FAILURE_TEXT };
  },
};

export type GatewayUnavailable = "NOT_SET" | "OFF" | "NOT_ALLOWED" | "NO_METHODS";

export type GatewayReading = { available: true; gateway: PaymentGateway; methods: readonly string[] } | { available: false; why: GatewayUnavailable; words: string };

export const GATEWAY_UNAVAILABLE_WORDS: Readonly<Record<GatewayUnavailable, string>> = {
  NOT_SET: "The organisation has not set whether online payment is on (the payment simulator is not set), so documents cannot be paid for here.",
  OFF: "Online payment is switched off, so documents cannot be paid for here.",
  NOT_ALLOWED: "Online payment here is a demonstration only and this copy of the system is not set up for demonstrations so documents cannot be paid for here. The procurement office records the payment instead.",
  NO_METHODS: "Online payment is on, but the organisation has set no payment method to offer, so documents cannot be paid for here.",
};

/**
 * Whether a buyer can pay online now, and by which methods; if not, why, in words. The fallback is the officer-recorded receipt. `deploymentAllows` is the deployment's permission for
 * the simulator (`simulatorAllowedByDeployment`): required, so no caller can forget it, and without it the simulator is never available whatever the organisation switched on.
 */
export function gatewayReading(f: OnlinePaymentFacts, deploymentAllows: boolean): GatewayReading {
  if (f.simulatorOn == null) return { available: false, why: "NOT_SET", words: GATEWAY_UNAVAILABLE_WORDS.NOT_SET };
  if (f.simulatorOn === false) return { available: false, why: "OFF", words: GATEWAY_UNAVAILABLE_WORDS.OFF };
  if (!deploymentAllows) return { available: false, why: "NOT_ALLOWED", words: GATEWAY_UNAVAILABLE_WORDS.NOT_ALLOWED };
  if (!onlinePaymentAvailable(f)) return { available: false, why: "NO_METHODS", words: GATEWAY_UNAVAILABLE_WORDS.NO_METHODS };
  return { available: true, gateway: paymentSimulator, methods: f.methods };
}

/// Whether a method label is one the organisation offers (compared as configured: a buyer cannot name a method of its own).
export const offeredMethod = (methods: readonly string[], chosen: string): string | null => methods.find((m) => m === chosen) ?? null;

/**
 * Whether a sale's payment is a finance receipt that finance's records and any finance export may count: only a payment that carries a finance receipt number and
 * did not come through the simulator. A simulated payment is never one, whatever else it carries.
 */
export const isFinanceReceipt = (s: { paymentChannel: "COUNTER" | "SIMULATED"; financeReceiptNo: string | null; voidedAt: Date | null }): boolean => s.paymentChannel !== "SIMULATED" && !s.voidedAt && !!s.financeReceiptNo?.trim();

/// The receipt a buyer is shown for a payment made: plain words naming it as simulated, with the reference, the method and the amount.
export function simulatedReceiptLines(i: { reference: string; method: string; amount: string; paidOnText: string; organisation: string }): string[] {
  return [
    `${SIMULATED_LABEL}: no money moved and this is not a receipt of ${i.organisation}.`,
    `Reference: ${i.reference}`,
    `Method chosen: ${i.method}`,
    `Amount: ${i.amount}`,
    `Paid on: ${i.paidOnText}`,
  ];
}
