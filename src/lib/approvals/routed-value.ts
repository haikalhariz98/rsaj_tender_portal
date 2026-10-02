/**
 * What a route was routed on (6.15 OD-2 A, against accepted 6.9). `ApprovalInstance.value` is null only
 * on a matter the engine routes with no value (a supplier matter: only a rule with no value band
 * matches). A requisition's, an exercise's and an award's routes are always routed on their value, so a
 * reader of those that meets a null has met a broken invariant: it says so, never reads it as 0.
 */

import { parseSen, type Sen } from "@/lib/money";

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
