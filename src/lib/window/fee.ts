/**
 * The document fee and its cost basis (FR-ADV-008, 6.5 OD-6 A). The basis — paper by size,
 * copying, binding with the folding of drawings, administration — is stored and totalled in sen;
 * the fee is the figure the officer enters. The floor is the customer's, per regime, shipped
 * empty: no floor for the exercise's regime blocks naming the setting, a fee below it is refused,
 * and a fee below the basis is warned (never refused: the basis is not the fee). Pure; sen only.
 */

import { parseSen, type Sen } from "@/lib/money";

import type { FeeFloorFacts, Finding } from "./types";

export type FeeLineFault = "QUANTITY_NOT_VALID" | "UNIT_COST_WITHOUT_QUANTITY" | "AMOUNT_REQUIRED";

/// A quantity to three decimal places, in thousandths. Null where it is not one.
export function quantityMilli(q: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(q.trim().replace(/,/g, ""));
  if (!m) return null;
  const milli = BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0"));
  return milli > 0n ? milli : null;
}

/**
 * One line's amount: quantity × unit cost, rounded half up to the sen once, here; or a lump sum
 * where no quantity is given. The amount column is written only from this.
 */
export function lineAmount(l: { quantity: string | null; unitCost: Sen | null; lump: Sen | null }): { amount: Sen } | { fault: FeeLineFault } {
  if (l.quantity != null && l.quantity.trim() !== "") {
    const q = quantityMilli(l.quantity);
    if (q == null) return { fault: "QUANTITY_NOT_VALID" };
    if (l.unitCost == null) return { fault: "AMOUNT_REQUIRED" };
    const product = q * l.unitCost;
    return { amount: (product + 500n) / 1000n };
  }
  if (l.unitCost != null) return { fault: "UNIT_COST_WITHOUT_QUANTITY" };
  if (l.lump == null) return { fault: "AMOUNT_REQUIRED" };
  return { amount: l.lump };
}

/// The basis's total, in sen.
export const feeBasisTotal = (lines: readonly { amount: Sen }[]): Sen => lines.reduce((a, l) => a + l.amount, 0n);

export type FeeFault = "FEE_NOT_SET" | "REGIME_NOT_DETERMINED" | "FLOOR_NOT_SET" | "BELOW_FLOOR" | "FEE_BELOW_COST";

/**
 * The fee against the regime's floor and the basis. `regime` is the exercise's as determined
 * (tender, quotation, below); null: not determined, and the floor cannot be read.
 */
export function feeFaults(i: { fee: Sen | null; regime: string | null; floors: readonly FeeFloorFacts[]; basisTotal: Sen }): Finding<FeeFault>[] {
  const out: Finding<FeeFault>[] = [];
  if (i.fee == null) out.push({ code: "FEE_NOT_SET", level: "block" });
  if (!i.regime) return [...out, { code: "REGIME_NOT_DETERMINED", level: "block" }];
  const floor = i.floors.find((f) => f.regime === i.regime) ?? null;
  if (!floor) out.push({ code: "FLOOR_NOT_SET", level: "block", data: { regime: i.regime } });
  else if (i.fee != null && i.fee < floor.minimum) out.push({ code: "BELOW_FLOOR", level: "block", data: { fee: i.fee.toString(), floor: floor.minimum.toString(), regime: i.regime } });
  if (i.fee != null && i.basisTotal > 0n && i.fee < i.basisTotal) out.push({ code: "FEE_BELOW_COST", level: "warn", data: { fee: i.fee.toString(), basis: i.basisTotal.toString() } });
  return out;
}

/// A stored Decimal as sen, or null.
export const senOrNull = (v: { toString(): string } | null | undefined): Sen | null => (v == null ? null : parseSen(v.toString()));
