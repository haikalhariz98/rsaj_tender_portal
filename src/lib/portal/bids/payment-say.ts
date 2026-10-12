import type { GatewayUnavailable } from "@/lib/integration/payment-gateway";

/** What a screen says of how the buyer pays, for each reason online payment is or is not on (SR-10 review). Pure. */

export type PaymentReason = "AVAILABLE" | GatewayUnavailable | "TRIES_EXHAUSTED";

/// What a screen says of how the buyer pays, for each reason online payment is or is not on. `instruct` is the callout under an unpaid purchase (the organisation's name in `org`).
export function paymentSay(reason: PaymentReason, org: string): { how: string; title: string; instruct: string } {
  switch (reason) {
    case "AVAILABLE":
      return { how: "Online", title: "Pay for the documents", instruct: "They are released to you once you have paid." };
    case "TRIES_EXHAUSTED":
      return { how: `Online payment has stopped for this purchase after failed tries: ask ${org}`, title: "Online payment has stopped for this purchase", instruct: `Too many tries to pay failed, so no more are taken here. Ask ${org} to record your payment; the documents are released when it does.` };
    case "NOT_ALLOWED":
      return { how: "Online payment is not available on this copy of the system", title: "Online payment is not available here", instruct: `Online payment is not available on this copy of the system. Pay the fee as ${org} instructs; the documents are released when ${org} records your receipt.` };
    default:
      return { how: "Online payment is not connected yet", title: "Online payment is not connected yet", instruct: `Online payment is not connected yet. Pay the fee as ${org} instructs; the documents are released when ${org} records your receipt.` };
  }
}
