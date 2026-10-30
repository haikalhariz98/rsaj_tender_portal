/**
 * The lead (WS-3; 3b B-13, WB-7; 0008 §4.9): the contract's Project manager when one is named and still active, else every holder and acting holder of the
 * contract's S.O. office on the organisation's today (3a's W-4). The store reads the team, the office (`soOfficeOn`, supervision/load.ts) and the active
 * people, and passes them here.
 *
 * - The Project manager needs no time zone; the S.O. fallback does (no today: no lead from the office).
 * - A Project manager who is no longer active is not the lead (WB-7): the lead falls back as if none were named, so the team card can never be locked shut.
 * - No PM, no time zone or no S.O. in force: no lead, and only the raiser closes.
 * - The lead is NOT who changes the team: that is `teamChangerIds` (WSEC-2). Pure.
 */

import type { SoOffice } from "@/lib/supervision/authority";

import type { Day, TeamMember } from "./types";

/// Who may change the team (WSEC-2, amending WB-7): the active Project manager, and the S.O. office's holders and acting holders in force today, each once. Not `leadIds`:
/// that is the Project manager ALONE once one is named, and the S.O. keeps the right to change the team beside them. With neither (no manager, and no S.O. in force or no time
/// zone) nobody may, and the card is locked: the first manager is named by a role the data already defines, never by whoever happened to open the case.
export function teamChangerIds(team: readonly TeamMember[], so: SoOffice | null, today: Day | null, activeIds: ReadonlySet<string>): string[] {
  const pm = team.filter((m) => m.role === "PROJECT_MANAGER" && activeIds.has(m.personId)).map((m) => m.personId);
  const side = !so || today === null ? [] : [...so.holderIds, ...so.actingIds];
  return [...new Set([...pm, ...side])].sort();
}

export function leadIds(team: readonly TeamMember[], so: SoOffice | null, today: Day | null, activeIds: ReadonlySet<string>): string[] {
  const pm = team.find((m) => m.role === "PROJECT_MANAGER" && activeIds.has(m.personId));
  if (pm) return [pm.personId];
  if (!so || today === null) return [];
  return [...new Set([...so.holderIds, ...so.actingIds])].sort();
}
