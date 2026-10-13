/**
 * Whether a supplier's sale of the tender documents stands for a bid (ruling 17c, 20m; build plan §1.3). Pure.
 *
 * One predicate, shared by every reader that asks it (ADR 0036 D8): the purchase's `holdsBidStanding` and its documents' release (`purchase.ts`), the opening's reading
 * of each sale (`saleFactsOf`, where a sale that does not stand reads as voided), and the online submission's door (`submitFaults` takes its answer). A sale stands
 * when there is one and it is not voided; a sale paid on the payment simulator stands only while the deployment allows the simulator (SEC-1), because it stands for
 * no money. A counter sale stands whether or not its finance receipt is recorded (17c: the receipt is finance's paperwork).
 *
 * The invitee list is a separate check, kept where it was: the purchase's own (`portal/bids/checks.ts`, INVITED) and the door's NOT_ON_INVITEE_LIST, which matches it
 * (20m). It is not folded in here: on the advertised path there is no list to be on.
 */

// src/lib/sales/standing.ts (17c, 20m)
export function saleStands(sale: { voidedAt: Date | null; paymentChannel: "COUNTER" | "SIMULATED" } | null, simulatorAllowed: boolean): boolean {
  return sale != null && sale.voidedAt == null && (sale.paymentChannel !== "SIMULATED" || simulatorAllowed);
}

/// The opening's reading of a sale (`saleFactsOf`, X-11): voided exactly when it does not stand. A sale row the opening reads is never null.
export function voidedAtOpening(sale: { voidedAt: Date | null; paymentChannel: "COUNTER" | "SIMULATED" }, simulatorAllowed: boolean): boolean {
  return !saleStands(sale, simulatorAllowed);
}
