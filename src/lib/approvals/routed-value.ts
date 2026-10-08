/**
 * What a route was routed on (6.15 OD-2 A, against accepted 6.9). `ApprovalInstance.value` is null only
 * on a matter the engine routes with no value (a supplier matter: only a rule with no value band
 * matches). A requisition's, an exercise's and an award's routes are always routed on their value, so a
 * reader of those that meets a null has met a broken invariant: it says so, never reads it as 0.
 */

import { parseSen, senFromDecimal, type Sen } from "@/lib/money";

export class UnvaluedRouteError extends Error {
  constructor() {
    super("This route was not routed on a value, so it has no approved value to read. Only a supplier matter is routed with none.");
    this.name = "UnvaluedRouteError";
  }
}

/// The value a valued route was routed on, in sen. Throws, never 0, on a route with none.
export function routedValue(inst: { value: { toString(): string } | null }): Sen {
  if (inst.value == null) throw new UnvaluedRouteError();
  return parseSen(inst.value.toString());
}

/**
 * The figure a delegate's ceiling is judged against on a route that is already open, in sen: the route's own value, as the decision rules read it. A supplier matter has none
 * (it is routed on no value) and a delegation's ceiling limits nothing there. The worklist's "nobody able to act" and the sweep's `escalateOne` both ask here
 * (product owner, 2026-10-08, ruling on log line 1790), so they cannot judge one step on two figures.
 */
export function ceilingValue(inst: { value: { toString(): string } | null }, supplierMatter: boolean): Sen {
  return supplierMatter ? 0n : senFromDecimal(inst.value);
}
