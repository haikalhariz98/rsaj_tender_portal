/**
 * Who endorses a requisition before it may enter the approval chain (FR-REQ-003).
 *
 * The tiers are policy (`RequisitionPolicy.endorsementTiers`), shipped empty: unset
 * blocks, it is never read as "no endorsement needed" (ruling OD-3). Each tier's
 * endorser is the head of the unit of that kind on the requesting unit's path, as the
 * structure stood on the endorsement date. An endorsement names a Person; "named
 * user" waits for sign-in.
 */

import { inForceOn } from "@/lib/effective";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";

import type { OrgUnitKind } from "./types";

export interface TierEndorser {
  tier: OrgUnitKind;
  unit: OrgUnit | null;
  headPersonId: string | null;
  fault: "TIER_NOT_ON_PATH" | "NO_HEAD" | null;
}

/**
 * For each tier, the unit of that kind nearest the requesting unit on its path, and
 * its head on `on`. A tier with no such unit on the path is a fault, not skipped: the
 * policy asks for an endorsement nobody on this path can give.
 */
export function endorsersFor(
  unitCode: string,
  tiers: readonly OrgUnitKind[],
  units: readonly OrgUnit[],
  on: Date,
): TierEndorser[] {
  const path = pathTo(units, unitCode, on);
  return tiers.map((tier) => {
    const unit = [...path].reverse().find((u) => u.kind === tier) ?? null;
    if (!unit) return { tier, unit: null, headPersonId: null, fault: "TIER_NOT_ON_PATH" };
    return { tier, unit, headPersonId: unit.headPersonId, fault: unit.headPersonId ? null : "NO_HEAD" };
  });
}

export interface Endorsement {
  tier: OrgUnitKind;
  unitCode: string;
  personId: string;
  /// YYYY-MM-DD.
  endorsedOn: string;
}

export type EndorsementFault =
  | { code: "NOT_SET" }
  | { code: "TIER_NOT_ON_PATH"; tier: OrgUnitKind }
  | { code: "NO_HEAD"; tier: OrgUnitKind; unitCode: string }
  | { code: "MISSING"; tier: OrgUnitKind }
  | { code: "NOT_HEAD"; tier: OrgUnitKind; personId: string }
  | { code: "FUTURE_DATE"; tier: OrgUnitKind }
  | { code: "REQUESTER" }
  | { code: "BEFORE_RAISED"; tier: OrgUnitKind }
  | { code: "TIME_ZONE_UNSET" };

const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

/// Whether `personId` headed the unit `unitCode` on `day`, by the revision in force then.
export function headedOn(units: readonly OrgUnit[], unitCode: string, personId: string, day: string): boolean {
  const on = dayDate(day);
  return units.some((u) => u.code === unitCode && inForceOn(u, on) && u.headPersonId === personId);
}

/**
 * Who may endorse a tier: the head of the tier's unit on any day from `from` to `to` (both
 * YYYY-MM-DD, the day raised and today), never the requester. Read through endorsersFor on
 * each day a unit's version starts, so it offers exactly the people endorsementEntryFault would
 * accept on some day in the window, and no one it would refuse on every day (founder,
 * 2026-10-05: choosing a tier should leave only that tier's head to choose).
 */
export function eligibleEndorsers(
  unitCode: string,
  tier: OrgUnitKind,
  units: readonly OrgUnit[],
  from: string,
  to: string,
  requesterId?: string,
): string[] {
  const days = new Set<string>([from, to]);
  for (const u of units) {
    const start = u.effectiveFrom.toISOString().slice(0, 10);
    if (start > from && start <= to) days.add(start);
  }
  const out: string[] = [];
  for (const day of [...days].sort()) {
    const e = endorsersFor(unitCode, [tier], units, dayDate(day))[0];
    if (!e.fault && e.headPersonId && e.headPersonId !== requesterId && !out.includes(e.headPersonId)) out.push(e.headPersonId);
  }
  return out;
}

/**
 * Why one endorsement cannot be recorded, or null. The person must head the tier's
 * unit on the endorsement date, and the date may not be after today.
 */
export function endorsementEntryFault(
  e: Endorsement,
  unitCode: string,
  tiers: readonly OrgUnitKind[],
  units: readonly OrgUnit[],
  today: string | null,
  /// The requesting officer, who may not endorse their own requisition.
  requesterId?: string,
  /// YYYY-MM-DD the requisition was raised: nothing endorses it before it existed.
  raisedOn?: string,
): EndorsementFault | null {
  if (today == null) return { code: "TIME_ZONE_UNSET" };
  if (requesterId && e.personId === requesterId) return { code: "REQUESTER" };
  if (tiers.length === 0) return { code: "NOT_SET" };
  if (e.endorsedOn > today) return { code: "FUTURE_DATE", tier: e.tier };
  if (raisedOn && e.endorsedOn < raisedOn) return { code: "BEFORE_RAISED", tier: e.tier };
  const endorser = endorsersFor(unitCode, [e.tier], units, dayDate(e.endorsedOn))[0];
  if (endorser.fault === "TIER_NOT_ON_PATH") return { code: "TIER_NOT_ON_PATH", tier: e.tier };
  if (endorser.fault === "NO_HEAD") return { code: "NO_HEAD", tier: e.tier, unitCode: endorser.unit!.code };
  if (!headedOn(units, endorser.unit!.code, e.personId, e.endorsedOn)) {
    return { code: "NOT_HEAD", tier: e.tier, personId: e.personId };
  }
  return null;
}

/**
 * Everything that stops the endorsements being complete. Empty means every tier is
 * endorsed by the unit's head, on a day that has come.
 */
export function endorsementFaults(
  unitCode: string,
  tiers: readonly OrgUnitKind[],
  endorsements: readonly Endorsement[],
  units: readonly OrgUnit[],
  today: string | null,
): EndorsementFault[] {
  if (tiers.length === 0) return [{ code: "NOT_SET" }];
  const faults: EndorsementFault[] = [];
  for (const tier of tiers) {
    const e = endorsements.find((x) => x.tier === tier);
    if (!e) {
      const endorser = endorsersFor(unitCode, [tier], units, today ? dayDate(today) : new Date(0))[0];
      if (endorser.fault === "TIER_NOT_ON_PATH") faults.push({ code: "TIER_NOT_ON_PATH", tier });
      else if (endorser.fault === "NO_HEAD") faults.push({ code: "NO_HEAD", tier, unitCode: endorser.unit!.code });
      else faults.push({ code: "MISSING", tier });
      continue;
    }
    const fault = endorsementEntryFault(e, unitCode, tiers, units, today);
    if (fault) faults.push(fault);
  }
  return faults;
}
