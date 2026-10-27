import type { Eligibility, SourceRef } from "./types";

/**
 * SF-02, FS-4: may this source fund a matter of this project category? Three-state on the source, as quorum is: only these, any
 * category, or not set (passes, with a warning, never silently and never a block). Nothing reads the source's label. Pure.
 */
export function eligibilityOf(source: Pick<SourceRef, "categoriesRestricted" | "eligibleCategoryCodes">, categoryCode: string | null): Eligibility {
  if (source.categoriesRestricted === false) return { state: "UNRESTRICTED" };
  if (source.categoriesRestricted == null) return { state: "NOT_SET" };
  if (!categoryCode) return { state: "CATEGORY_MISSING" };
  return source.eligibleCategoryCodes.includes(categoryCode) ? { state: "ELIGIBLE" } : { state: "NOT_ELIGIBLE", categoryCode };
}

/// Whether the eligibility refuses (a warning, not set, never does).
export const eligibilityBlocks = (e: Eligibility): boolean => e.state === "CATEGORY_MISSING" || e.state === "NOT_ELIGIBLE";

/// In force on the day: not retired by then.
export const inForce = (s: Pick<SourceRef, "retiredOn">, on: Date): boolean => s.retiredOn == null || s.retiredOn > on;
