/**
 * Whether this DEPLOYMENT allows the payment simulator (SR-10 review SEC-1). Deployment configuration, not customer policy: it is an environment variable, absent by default.
 *
 * The simulator moves no money, yet a "paid" simulated purchase releases the documents and gives the buyer a sale. That is right for a demonstration and wrong for a copy that
 * sells for real, so a copy must be told, by whoever runs it, that it is a demonstration. Where it is not told:
 *  - the organisation's switch cannot be turned on (the configuration refuses in words), and `gatewayReading` and `settlePayment` say the simulator is not allowed here;
 *  - a purchase already paid on the simulator stops entitling its buyer to the documents, or to a bid, even if the organisation's switch is still on, and the officer's
 *    reconciliation lists it as "Simulated, no money received".
 * Read at the moment of asking (not at import), so a test can set it and a restart is the only thing a deployment needs after changing it.
 */

export const PAYMENT_SIMULATOR_ENV = "PAYMENT_SIMULATOR_ALLOWED";

/// Only the word "true" (any case) or "1" allows it. Anything else, including an empty value, does not.
export function simulatorAllowedByDeployment(env: Record<string, string | undefined> = process.env): boolean {
  const v = env[PAYMENT_SIMULATOR_ENV]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/// What the configuration says when the switch is refused for want of the deployment's permission.
export const SIMULATOR_NOT_ALLOWED_WORDS =
  "The payment simulator cannot be switched on: this copy of the system has not been told it is a demonstration. Whoever runs the system must allow the simulator in the deployment settings first (the file .env.example says how), because a simulated payment moves no money.";
