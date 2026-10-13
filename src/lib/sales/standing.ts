/**
 * Whether a supplier's sale of the tender documents stands for a bid (ruling 17c, 20m; build plan §1.3, written verbatim). Pure.
 */

// src/lib/sales/standing.ts (17c, 20m)
export declare function saleStands(sale: { voidedAt: Date | null; paymentChannel: "COUNTER" | "SIMULATED" } | null, simulatorAllowed: boolean): boolean;
