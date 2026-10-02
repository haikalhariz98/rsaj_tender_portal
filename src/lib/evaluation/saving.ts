/**
 * The saving (FR-EVL-018): the recommended price against the disclosed company estimate, in RM and as a
 * percentage of the estimate. The estimate is read only from the opening's frozen schedule (ADR 0012:
 * never from its sealed store); sealed, it says so; where the method needs none, there is no saving to
 * state, never zero. Pure.
 */

import { ratioPct, type Fixed } from "./fixed";
import { MoneyFormatError, parseSen, type Sen } from "@/lib/money";

export type EstimateRead = { sealed: true } | { notRequired: true } | { value: Sen; label: string | null };

export type Saving = { sealed: true } | { noEstimate: true } | { amount: Sen; pct: Fixed | null };

/// 330,000.00 against 297,000.00: 33,000.00, 10.0000 %.
export function saving(estimate: EstimateRead, price: Sen): Saving {
  if ("sealed" in estimate) return { sealed: true };
  if ("notRequired" in estimate) return { noEstimate: true };
  const amount = estimate.value - price;
  return { amount, pct: ratioPct(amount, estimate.value) };
}

/**
 * The estimate as the latest finalised opening schedule froze it (6.7: `benchmark`): disclosed, with
 * its label; sealed; or not required. Anything else reads sealed — never guessed.
 */
export function estimateFromSchedule(schedule: unknown): EstimateRead {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return { sealed: true };
  const b = (schedule as { benchmark?: unknown }).benchmark;
  if (!b || typeof b !== "object") return { sealed: true };
  const x = b as { sealed?: boolean; notRequired?: boolean; companyEstimate?: string; label?: string | null };
  if (x.notRequired) return { notRequired: true };
  if (x.sealed === false && typeof x.companyEstimate === "string") {
    try {
      return { value: parseSen(x.companyEstimate), label: x.label ?? null };
    } catch (e) {
      if (e instanceof MoneyFormatError) return { sealed: true };
      throw e;
    }
  }
  return { sealed: true };
}
