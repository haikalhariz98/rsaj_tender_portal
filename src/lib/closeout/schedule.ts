/**
 * The Schedule of Defects (FR-CMP-013; plan closeout-plan.md §4.3). Pure.
 *
 * Raised once the defects liability period has ended (allowed on its end day, refused on its last day), while lines are open, one at a time.
 * Its day to make good by is after today and, where the contract clock DEFECTS_RECTIFICATION is set, no later than today plus that clock
 * (FR-CMP-013's "not later than three months" is that clock's customer value). Unset, the longest period is not checked, and it says so.
 */

import { addPeriod, periodParts, type PeriodUnit } from "@/lib/securities/period";

import type { Day, Dlp, Finding } from "./types";

export interface ScheduleRaiseInput {
  cpcIssued: boolean;
  dlp: Dlp | null;
  today: Day;
  open: number;
  live: { number: string | null } | null;
  rectifyBy: Day;
  /// The DEFECTS_RECTIFICATION clock (null: not set).
  limit: { length: number; unit: PeriodUnit } | null;
}

export function scheduleRaiseFaults(i: ScheduleRaiseInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}, level: "block" | "warn" = "block") => out.push({ code, level, data });
  if (!i.cpcIssued) f("CPC_NOT_ISSUED");
  else if (!i.dlp || i.dlp.applies !== true) f("DLP_NOT_APPLICABLE");
  else if (i.today < i.dlp.endExclusive) f("DLP_NOT_ENDED", { day: i.dlp.endExclusive });
  if (i.live) f("SCHEDULE_LIVE", { number: i.live.number });
  if (i.open === 0) f("NO_OPEN_DEFECTS");
  if (i.rectifyBy <= i.today) f("RECTIFY_BY_NOT_AFTER_TODAY");
  if (i.limit) {
    const last = addPeriod(i.today, periodParts(i.limit.length, i.limit.unit));
    if (i.rectifyBy > last) f("RECTIFY_BY_PAST_LIMIT", { day: last });
  } else f("LIMIT_NOT_SET", {}, "warn");
  return out;
}
