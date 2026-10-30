import { describe, expect, it } from "vitest";

import { defaultAssignee, mayChangeTeam, teamFaults } from "./team";
import type { TeamMember, WorkActor } from "./types";

/** The Project team (3b B-12, B-16; WB-7, WB-8): one manager, one row per role and person, active people only; the lead changes it; default assignees. */

const ACTIVE = new Set(["pm", "ca", "ca2", "se", "nurul", "hafiz", "new"]);
const staff = (personId: string, leadIds: string[]): WorkActor => ({ side: "STAFF", personId, leadIds, mayReadContract: true });
const team: TeamMember[] = [
  { role: "PROJECT_MANAGER", personId: "pm" },
  { role: "CONTRACT_ADMINISTRATOR", personId: "ca" },
  { role: "SITE_ENGINEER", personId: "se" },
];
const lead = staff("pm", ["pm"]);

describe("who changes the team (WB-7)", () => {
  it("the lead; anyone else is refused", () => {
    expect(mayChangeTeam(lead)).toBe(true);
    expect(mayChangeTeam(staff("se", ["pm"]))).toBe(false);
    expect(teamFaults(team, { op: "ADD", role: "CONSULTANT", personId: "new" }, staff("se", ["pm"]), ACTIVE)).toEqual([{ code: "NOT_LEAD" }]);
  });
  it("with no lead, any staff reader of the case, so the first manager can be named", () => {
    expect(teamFaults([], { op: "ADD", role: "PROJECT_MANAGER", personId: "new" }, staff("hafiz", []), ACTIVE)).toEqual([]);
  });
  it("never the contractor, nor someone who may not read the case", () => {
    expect(mayChangeTeam({ side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true })).toBe(false);
    expect(mayChangeTeam({ ...staff("hafiz", []), mayReadContract: false })).toBe(false);
  });
});

describe("teamFaults", () => {
  it("a second Project manager is refused: change the manager instead", () => {
    expect(teamFaults(team, { op: "ADD", role: "PROJECT_MANAGER", personId: "new" }, lead, ACTIVE)).toEqual([{ code: "MANAGER_NAMED" }]);
  });
  it("the same person twice in one role is refused; in another role is fine", () => {
    expect(teamFaults(team, { op: "ADD", role: "CONTRACT_ADMINISTRATOR", personId: "ca" }, lead, ACTIVE)).toEqual([{ code: "ALREADY_IN_ROLE" }]);
    expect(teamFaults(team, { op: "ADD", role: "SITE_ENGINEER", personId: "ca" }, lead, ACTIVE)).toEqual([]);
    expect(teamFaults(team, { op: "ADD", role: "CONTRACT_ADMINISTRATOR", personId: "ca2" }, lead, ACTIVE)).toEqual([]);
  });
  it("an inactive person, or one who may not read the case, is refused", () => {
    expect(teamFaults(team, { op: "ADD", role: "CONSULTANT", personId: "gone" }, lead, ACTIVE)).toEqual([{ code: "PERSON_NOT_ELIGIBLE" }]);
    expect(teamFaults(team, { op: "CHANGE_MANAGER", personId: "gone" }, lead, ACTIVE)).toEqual([{ code: "PERSON_NOT_ELIGIBLE" }]);
  });
  it("changing the manager: to someone else, or naming the first; never to the same person", () => {
    expect(teamFaults(team, { op: "CHANGE_MANAGER", personId: "new" }, lead, ACTIVE)).toEqual([]);
    expect(teamFaults([], { op: "CHANGE_MANAGER", personId: "new" }, staff("hafiz", []), ACTIVE)).toEqual([]);
    expect(teamFaults(team, { op: "CHANGE_MANAGER", personId: "pm" }, lead, ACTIVE)).toEqual([{ code: "ALREADY_IN_ROLE" }]);
  });
  it("removing asks a reason, and the row must be there", () => {
    expect(teamFaults(team, { op: "REMOVE", role: "SITE_ENGINEER", personId: "se", reason: "Moved site" }, lead, ACTIVE)).toEqual([]);
    expect(teamFaults(team, { op: "REMOVE", role: "SITE_ENGINEER", personId: "se", reason: "  " }, lead, ACTIVE)).toEqual([{ code: "REASON_NEEDED" }]);
    expect(teamFaults(team, { op: "REMOVE", role: "CONSULTANT", personId: "se", reason: "x" }, lead, ACTIVE)).toEqual([{ code: "NOT_ON_TEAM" }]);
  });
});

describe("defaultAssignee on a contractor raise (B-16, WB-8)", () => {
  it("an RFI goes to the one Contract administrator", () => {
    expect(defaultAssignee("RFI", team, ["pm"], ACTIVE)).toEqual({ assignee: "ca", told: [] });
  });
  it("several administrators: unassigned, and every one told", () => {
    const two = [...team, { role: "CONTRACT_ADMINISTRATOR" as const, personId: "ca2" }];
    expect(defaultAssignee("RFI", two, ["pm"], ACTIVE)).toEqual({ assignee: null, told: ["ca", "ca2"] });
  });
  it("no administrator: unassigned, and the lead told", () => {
    expect(defaultAssignee("RFI", [], ["nurul", "hafiz"], ACTIVE)).toEqual({ assignee: null, told: ["hafiz", "nurul"] });
    expect(defaultAssignee("RFI", [], [], ACTIVE)).toEqual({ assignee: null, told: [] });
  });
  it("an inactive administrator counts for nothing", () => {
    expect(defaultAssignee("RFI", team, ["pm"], new Set(["pm"]))).toEqual({ assignee: null, told: ["pm"] });
  });
  it("an incident goes to the lead: one is assigned; several are told; none is nobody", () => {
    expect(defaultAssignee("SAFETY_INCIDENT", team, ["pm"], ACTIVE)).toEqual({ assignee: "pm", told: [] });
    expect(defaultAssignee("SAFETY_INCIDENT", [], ["nurul", "hafiz"], ACTIVE)).toEqual({ assignee: null, told: ["hafiz", "nurul"] });
    expect(defaultAssignee("SAFETY_INCIDENT", [], [], ACTIVE)).toEqual({ assignee: null, told: [] });
  });
});
