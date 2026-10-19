import type { GatewayUnavailable } from "@/lib/integration/payment-gateway";

/** What a screen says of how the buyer pays, for each reason online payment is or is not on (SR-10 review). Pure. */

export type PaymentReason = "AVAILABLE" | GatewayUnavailable | "TRIES_EXHAUSTED";

/// What a screen says of how the buyer pays, for each reason online payment is or is not on. `instruct` is the callout under an unpaid purchase (the organisation's name in `org`).
export function paymentSay(reason: PaymentReason, org: string): { how: string; title: string; instruct: string } {
  switch (reason) {
    case "AVAILABLE":
      return { how: "Online", title: "Pay for the documents", instruct: "Released once paid." };
    case "TRIES_EXHAUSTED":
      return { how: `Online payment stopped. Ask ${org}`, title: "Online payment has stopped for this purchase", instruct: `Online payment stopped after failed tries. Ask ${org} to record your payment.` };
    case "NOT_ALLOWED":
      return { how: "Online payment is not available here", title: "Online payment is not available here", instruct: `Pay as ${org} instructs. Released when ${org} records your receipt.` };
    default:
      return { how: "Online payment is not connected yet", title: "Online payment is not connected yet", instruct: `Pay as ${org} instructs. Released when ${org} records your receipt.` };
  }
}
