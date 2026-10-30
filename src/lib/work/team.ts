/**
 * The Project team (WS-3; 3b B-12, B-16, WB-7, WB-8; ADR 0049 D4): four fixed roles per contract that route work and notices and never carry authority.
 * Pure.
 *
 * - One Project manager per contract (partial unique); one row per role and person (unique); the person is active in the organisation and may read the case.
 * - Changing the manager is a remove and an add in one act. Removing asks a reason.
 * - Who changes the team (WSEC-2, amending WB-7): the active Project manager, and the S.O. holders and acting holders in force (`teamChangerIds`, lead.ts). With neither,
 *   nobody: the first manager is named by a role the data defines, never by whoever opened the case. `teamChangeFaults` is the one rule; the acts and the card both call it.
 * - A contractor raise's default assignee (B-16): an RFI goes to the Contract administrator, an incident to the lead. One holder is assigned; several or
 *   none leave it unassigned, and every holder is told (none: the lead) (WB-8).
 */

import type { TeamMember, TeamRole, WorkActor, WorkItemType } from "./types";

export type TeamChange = { op: "ADD"; role: TeamRole; personId: string } | { op: "REMOVE"; role: TeamRole; personId: string; reason: string } | { op: "CHANGE_MANAGER"; personId: string };

export type TeamFault =
  | { code: "NOT_LEAD" } // only the Project manager or the S.O. changes the team (WSEC-2); the words name them, or say nobody can yet
  | { code: "MANAGER_NAMED" } // a second Project manager: change the manager instead
  | { code: "ALREADY_IN_ROLE" } // the same person twice in one role, or the manager changed to themselves
  | { code: "PERSON_NOT_ELIGIBLE" } // not in `activeIds`: inactive, another organisation's, or unable to read the case
  | { code: "NOT_ON_TEAM" } // removing a row that is not there
  | { code: "REASON_NEEDED" };

/// WSEC-2: a staff reader of the case who is one of `changerIds` (`teamChangerIds`). An empty list is nobody.
export function mayChangeTeam(actor: WorkActor, changerIds: readonly string[]): boolean {
  const me = actor.personId;
  return actor.side === "STAFF" && actor.mayReadContract && me !== null && changerIds.includes(me);
}

/// Who may change the team, as a fault list: the one rule the acts and the card share.
export const teamChangeFaults = (actor: WorkActor, changerIds: readonly string[]): TeamFault[] => (mayChangeTeam(actor, changerIds) ? [] : [{ code: "NOT_LEAD" }]);

/// A team change's faults: who first (alone), then the change against the team as it stands. `activeIds` are the organisation's active people who may
/// read the case; `changerIds` are who may change the team.
export function teamFaults(team: readonly TeamMember[], change: TeamChange, actor: WorkActor, activeIds: ReadonlySet<string>, changerIds: readonly string[]): TeamFault[] {
  const who = teamChangeFaults(actor, changerIds);
  if (who.length > 0) return who;
  const has = (role: TeamRole, personId: string) => team.some((m) => m.role === role && m.personId === personId);
  switch (change.op) {
    case "REMOVE": {
      const out: TeamFault[] = has(change.role, change.personId) ? [] : [{ code: "NOT_ON_TEAM" }];
      if (change.reason.trim() === "") out.push({ code: "REASON_NEEDED" });
      return out;
    }
    case "ADD": {
      const out: TeamFault[] = [];
      if (change.role === "PROJECT_MANAGER" && team.some((m) => m.role === "PROJECT_MANAGER")) out.push({ code: "MANAGER_NAMED" });
      else if (has(change.role, change.personId)) out.push({ code: "ALREADY_IN_ROLE" });
      if (!activeIds.has(change.personId)) out.push({ code: "PERSON_NOT_ELIGIBLE" });
      return out;
    }
    case "CHANGE_MANAGER": {
      const out: TeamFault[] = has("PROJECT_MANAGER", change.personId) ? [{ code: "ALREADY_IN_ROLE" }] : [];
      if (!activeIds.has(change.personId)) out.push({ code: "PERSON_NOT_ELIGIBLE" });
      return out;
    }
  }
}

/// The role each contractor-raised type is routed to (0008 §4.9); absent: the lead.
const ROUTED_TO: Readonly<Partial<Record<WorkItemType, TeamRole>>> = { RFI: "CONTRACT_ADMINISTRATOR" };

/// B-16, WB-8: who a contractor's raise is assigned to, and who is told when nobody is. Inactive holders count for nothing. `told` is the notice's
/// `roleHolders`; with an assignee it is empty (the assignee is told as the assignee).
export function defaultAssignee(type: WorkItemType, team: readonly TeamMember[], leadIds: readonly string[], activeIds: ReadonlySet<string>): { assignee: string | null; told: string[] } {
  const role = ROUTED_TO[type];
  const ids = role ? team.filter((m) => m.role === role).map((m) => m.personId) : [...leadIds];
  const holders = [...new Set(ids)].filter((id) => activeIds.has(id)).sort();
  if (holders.length === 1) return { assignee: holders[0], told: [] };
  if (holders.length > 1) return { assignee: null, told: holders };
  return { assignee: null, told: role ? [...leadIds].filter((id) => activeIds.has(id)).sort() : [] };
}
