/**
 * The joint evaluation team (FR-EVL-001; E-4): members appointed to a side — the implementing
 * department, or contract and procurement — each recorded on their behalf, not signed. Both sides are
 * staffed, by two different people at least; nobody sits on both. The implementing side's members
 * belong to the requisition's unit (or a unit under it) where their unit is recorded; where it is not,
 * the screen says "Not recorded" and the appointment stands. A score or a submission is accepted only
 * from a member appointed to that stage's side (NOT_ON_TEAM), and nobody submits for both sides
 * (SAME_PERSON_BOTH_SIDES). Each member acts under their own identity (FR-EVL-001, Phase 3d): a score and a submission are the signed-in member's own and are never
 * recorded for another, so these checks run on the signed-in person. Pure.
 */

import type { SubmissionFacts, TeamFacts } from "./facts";
import { TEAM_SIDES, type Finding, type Side } from "./types";

export type TeamFault = "SIDE_NOT_STAFFED" | "PERSON_ON_BOTH_SIDES" | "PERSON_NOT_ACTIVE" | "UNIT_NOT_IMPLEMENTING" | "UNIT_NOT_RECORDED" | "ALREADY_ON_TEAM";

export interface TeamPick {
  personId: string;
  name: string;
  side: Side;
  active: boolean;
  unitCode: string | null;
}

/**
 * The team as picked (at the start, or a member added). `unitPath(code)`: the codes from the unit up
 * to the top of the structure in force; `requisitionUnit`: the requesting unit's code. `existing`: the
 * members already appointed (adding one).
 */
export function teamFaults(picks: readonly TeamPick[], requisitionUnit: string, unitPath: (code: string) => readonly string[], existing: readonly TeamFacts[] = []): Finding<TeamFault>[] {
  const out: Finding<TeamFault>[] = [];
  const all = [...existing.map((m) => ({ personId: m.personId, name: m.name, side: m.side, active: true, unitCode: m.unitCode })), ...picks];
  for (const p of picks) {
    if (!p.active) out.push({ code: "PERSON_NOT_ACTIVE", level: "block", data: { person: p.name } });
    if (existing.some((m) => m.personId === p.personId)) out.push({ code: "ALREADY_ON_TEAM", level: "block", data: { person: p.name } });
  }
  const sides = new Map<string, Set<Side>>();
  for (const p of all) sides.set(p.personId, (sides.get(p.personId) ?? new Set()).add(p.side));
  for (const [personId, s] of sides) if (s.size > 1) out.push({ code: "PERSON_ON_BOTH_SIDES", level: "block", data: { person: all.find((p) => p.personId === personId)!.name } });
  for (const side of TEAM_SIDES) if (!all.some((p) => p.side === side)) out.push({ code: "SIDE_NOT_STAFFED", level: "block", data: { side } });
  for (const p of picks.filter((x) => x.side === "IMPLEMENTING_DEPARTMENT")) {
    if (!p.unitCode) out.push({ code: "UNIT_NOT_RECORDED", level: "warn", data: { person: p.name } });
    else if (!unitPath(p.unitCode).includes(requisitionUnit)) out.push({ code: "UNIT_NOT_IMPLEMENTING", level: "block", data: { person: p.name } });
  }
  return out;
}

export type PersonFault = "PERSON_REQUIRED" | "NOT_ON_TEAM" | "SIDE_NOT_STAFFED" | "SAME_PERSON_BOTH_SIDES";

/**
 * Whether a person may score or submit on a stage of `side` (E-4). A committee stage is the
 * committee's: nobody on the team acts for it.
 */
export function personFaults(side: Side, personId: string | null, team: readonly TeamFacts[], submissions: readonly SubmissionFacts[]): Finding<PersonFault>[] {
  if (!team.some((m) => m.side === side)) return [{ code: "SIDE_NOT_STAFFED", level: "block", data: { side } }];
  if (!personId) return [{ code: "PERSON_REQUIRED", level: "block" }];
  const m = team.find((x) => x.personId === personId);
  if (!m || m.side !== side) return [{ code: "NOT_ON_TEAM", level: "block", data: { side, person: m?.name ?? null } }];
  // The technical submitter is never the financial one: nobody submits for both sides.
  if (submissions.some((s) => s.personId === personId && s.side !== side && s.side !== "COMMITTEE")) return [{ code: "SAME_PERSON_BOTH_SIDES", level: "block", data: { person: m.name } }];
  return [];
}
