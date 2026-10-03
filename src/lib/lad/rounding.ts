/**
 * The rounding beside a damages figure (BD-613-47, ruled; BD-613-92 applies it to §8.9 and the final account). Moved here
 * from payment/interim.ts at 6.13 Part B run 0, unchanged; interim.ts re-exports it, so Part A's callers and tests read
 * the same function.
 *
 * The signed rounding is a rounding to the ringgit (the worked example's +0.20 brings 2,693.80 to 2,694.00), never a
 * waiver: strictly between −RM1.00 and RM1.00, and never taking the figure it sits beside below nothing. RM1.00 is the
 * definition of the rounding, not a customer threshold. The same rule serves every place the sources print "± Rounding":
 * - the interim certificate's damages line (rate × days − waived, then the rounding);
 * - §8.9's Cost of Completion, beside the cost of loss (`costOfLoss + roundingLoss ≥ 0`);
 * - §8.9's Adjusted Original Contract Price, beside the LAD imposed (`ladImposed + roundingLad ≥ 0`);
 * - the final account's LAD_ROUNDING line in its deduct block.
 * Pure.
 */

import type { Sen } from "@/lib/money";
import type { Finding } from "@/lib/payment/types";

export const LAD_ROUNDING_LIMIT: Sen = 100n;

/// The rounding `rounding` beside the figure `damages` (each in sen): out of range, or taking the figure below nothing.
export function ladRoundingFaults(damages: Sen, rounding: Sen): Finding[] {
  const out: Finding[] = [];
  if (rounding <= -LAD_ROUNDING_LIMIT || rounding >= LAD_ROUNDING_LIMIT) out.push({ code: "LAD_ROUNDING_OUT_OF_RANGE", level: "block", data: { rounding: rounding.toString() } });
  if (damages + rounding < 0n) out.push({ code: "LAD_ROUNDING_BELOW_NOTHING", level: "block", data: { damages: damages.toString(), rounding: rounding.toString() } });
  return out;
}
