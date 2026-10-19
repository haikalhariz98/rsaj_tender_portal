/**
 * SEC-5 (go-live N5, plan §3.5): whether a sealed bid's file is released to its supplier, judged on the version's stored
 * scan state and a fresh scan taken at release. A threat, stored or found now, is never released; a scan that failed is
 * never taken as clean; and once a scanner is configured, a file it did not check is not released either. Without a
 * scanner, nothing is checked, so a file not scanned is served as before.
 *
 * Staff reads keep `downloadDecision` (access.ts); this rule is the release's alone, so its refusals are a separate type.
 */

import type { ScanResult } from "./store/types";
import type { ScanState } from "./types";

export type ReleaseScanRefusal = "THREAT" | "SCAN_ERROR" | "NOT_SCANNED";

export function releaseScanRefusal(i: { stored: ScanState; fresh: ScanResult; scannerConfigured: boolean }): ReleaseScanRefusal | null {
  if (i.stored === "THREAT" || i.fresh === "THREAT") return "THREAT";
  if (i.fresh === "ERROR") return "SCAN_ERROR";
  if (i.fresh === "NOT_SCANNED" && i.scannerConfigured) return "NOT_SCANNED";
  return null;
}
