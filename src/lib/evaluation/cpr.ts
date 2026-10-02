/**
 * The contractor performance percentage (FR-EVL-012, OD-4 A). Until the performance register (6.16)
 * exists, the CPR is entered from the bidder's performance report, which is attached (purpose
 * CPR_REPORT): a figure with no live report attached is refused, and it reads "Entered from the
 * attached report; the performance register is not built". Its band is the configured set's;
 * none set, nothing is banded. Pure.
 */

import { placeInBands, type Band, type BandPlacement } from "./bands";
import type { Fixed } from "./fixed";
import type { Finding } from "./types";

export const CPR_SOURCE_TEXT = "Entered from the attached report; the performance register is not built.";

export type CprFault = "CPR_EVIDENCE_REQUIRED" | "CPR_NOT_ENTERED" | "BANDS_NOT_SET" | "CPR_RANGE";

export function cprBand(pct: Fixed | null, bands: readonly Band[] | null): BandPlacement | { fault: Finding<CprFault> } {
  if (bands == null || bands.length === 0) return { fault: { code: "BANDS_NOT_SET", level: "block" } };
  if (pct == null) return { fault: { code: "CPR_NOT_ENTERED", level: "block" } };
  return placeInBands(pct, bands);
}

/// An entered CPR stands on a live attached report (OD-4); and lies between 0 and 100.
export function cprEntryFaults(pct: Fixed, liveReports: number): Finding<CprFault>[] {
  const out: Finding<CprFault>[] = [];
  if (pct < 0n || pct > 1_000_000n) out.push({ code: "CPR_RANGE", level: "block" });
  if (liveReports === 0) out.push({ code: "CPR_EVIDENCE_REQUIRED", level: "block" });
  return out;
}
