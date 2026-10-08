/**
 * Who may table a matter before a committee (FR-CTE-006).
 *
 * The Secretariat is an office, `Committee.secretariatRoleCode`, resolved through
 * RoleAssignment on the tabling date. Unset means nobody has said who tables, and
 * tabling is refused rather than inferred. The tabler is the signed-in person (FR-CTE-006,
 * Phase 3d): every action that tables a matter begins its act on `CommitteeDecision.tabledBy`,
 * whose slot is not paper-capable, so the person judged here is the actor and no one else.
 */

import { dayToDate } from "@/lib/dates";
import { holdersOf, type Roster } from "@/lib/people/roster";

export type TablingFault = "SECRETARIAT_NOT_SET" | "NOT_TABLED" | "NOT_SECRETARIAT_HOLDER" | "TIME_ZONE_UNSET";

export function checkTabling(i: {
  secretariatRoleCode: string | null;
  tabledByPersonId: string | null;
  /// Active holders of the Secretariat office on the tabling date.
  holderIdsOnDate: readonly string[];
  /// The tabling day; null while the organisation has no time zone. Absent: not judged.
  tablingDay?: string | null;
}): { ok: true } | { ok: false; fault: TablingFault } {
  if (i.tablingDay === null) return { ok: false, fault: "TIME_ZONE_UNSET" };
  if (!i.secretariatRoleCode) return { ok: false, fault: "SECRETARIAT_NOT_SET" };
  if (!i.tabledByPersonId) return { ok: false, fault: "NOT_TABLED" };
  if (!i.holderIdsOnDate.includes(i.tabledByPersonId)) {
    return { ok: false, fault: "NOT_SECRETARIAT_HOLDER" };
  }
  return { ok: true };
}

/**
 * The active holders of the Secretariat office on the tabling day.
 *
 * One date for the drawer that offers the tablers and the action that checks them:
 * the day the matter is tabled, in the organisation's zone (`dayIn`).
 */
export function secretariatHoldersOn(
  roster: Roster,
  secretariatRoleCode: string | null,
  tablingDay: string | null,
): { id: string; name: string }[] {
  if (!secretariatRoleCode || !tablingDay) return [];
  return holdersOf(roster, secretariatRoleCode, dayToDate(tablingDay))
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name }));
}
