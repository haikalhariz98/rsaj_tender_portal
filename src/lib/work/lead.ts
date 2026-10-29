/**
 * The lead in 3a (W-4, OQ-2; 0008 §4.9's fallback): every holder and acting holder of the contract's S.O. office on the organisation's today. The store
 * reads the office with `soOfficeOn` (supervision/load.ts) and passes it here. No time zone, or no S.O. in force: no lead, and only the raiser closes.
 * 3b replaces this with "the Project manager, else the S.O." through the same `leadIds`. Pure.
 */

import type { SoOffice } from "@/lib/supervision/authority";

import type { Day } from "./types";

export function leadIds(so: SoOffice | null, today: Day | null): string[] {
  if (!so || today === null) return [];
  return [...new Set([...so.holderIds, ...so.actingIds])].sort();
}
