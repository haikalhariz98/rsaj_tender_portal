import type { Tx } from "@/lib/audit/record";
import { dayIn } from "@/lib/dates";
import { restrictionAtOpening, type FrozenRule } from "@/lib/suppliers/restriction-store";
import type { RestrictionReading } from "@/lib/suppliers/restriction-register";

import type { Finding, RestrictionFinding } from "./types";

/**
 * Ruling 17a at the opening: the restriction of a bidder whose sale was made from an ONLINE purchase is read from the supplier register for the closing day, to be frozen on the opened bid.
 * A configuration gap (no evidence type, or the closing-day rule not set where it decides), or a closing day that cannot be told, is a blocking fault in the opening's own codes, never a finding.
 */
export type RegisterRestriction = { finding: RestrictionFinding; reading: RestrictionReading } | { fault: Finding };

export async function registerRestrictionOf(tx: Tx, org: { id: string; timeZone: string | null }, closing: { day: string | null; at: Date | null }, supplierId: string, now: Date, frozen: FrozenRule | null = null): Promise<RegisterRestriction> {
  if (!closing.day) return { fault: { code: "TIME_ZONE_NOT_SET", level: "block" } };
  const r = await restrictionAtOpening(tx, org, supplierId, { closingDay: closing.day, closingTime: closing.at, readOn: dayIn(now, org.timeZone) }, frozen);
  if ("fault" in r) return { fault: { code: r.fault === "EVIDENCE_TYPE_NOT_SET" ? "RESTRICTION_EVIDENCE_TYPE_NOT_SET" : "RESTRICTION_CLOSING_DAY_RULE_NOT_SET", level: "block" } };
  return { finding: r.reading.finding, reading: r.reading };
}
