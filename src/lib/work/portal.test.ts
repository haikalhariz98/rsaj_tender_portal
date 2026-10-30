import { describe, expect, it } from "vitest";

import { CONTRACTOR, person } from "./party";
import { portalAction, portalGroup, portalStaffLabel } from "./portal";
import type { PortalAction, PortalGroup, WorkItemFacts, WorkStatus } from "./types";

/** The portal's Work list (3b section 4; WS-11, WS-13; WB-5): three groups, one button per row, and which staff names it may show. */

const SHARED = "2026-11-01T02:00:00.000Z";
const base: WorkItemFacts = { id: "w1", type: "TASK", number: 1, status: "TO_DO", raisedBy: person("hafiz"), assignee: person("aisyah"), sharedAt: SHARED, dueOn: null, answer: "", inspectionResult: null };
const held = (status: WorkStatus, o: Partial<WorkItemFacts> = {}): WorkItemFacts => ({ ...base, status, assignee: CONTRACTOR, ...o });
const raised = (status: WorkStatus, o: Partial<WorkItemFacts> = {}): WorkItemFacts => ({ ...base, type: "RFI", answer: "Use detail 4", status, raisedBy: CONTRACTOR, ...o });
const staffSide = (status: WorkStatus): WorkItemFacts => ({ ...base, status });

const S: WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

describe("portalGroup and portalAction, by status", () => {
  // [status, held by the contractor, raised by the contractor, staff's only]: group and button
  const TABLE: [WorkStatus, [PortalGroup, PortalAction], [PortalGroup, PortalAction], [PortalGroup, PortalAction]][] = [
    ["TO_DO", ["WAITING_FOR_YOU", "SEND_FOR_CHECKING"], ["WITH_ORG", "REPLY"], ["WITH_ORG", "REPLY"]],
    ["IN_PROGRESS", ["WAITING_FOR_YOU", "SEND_FOR_CHECKING"], ["WITH_ORG", "REPLY"], ["WITH_ORG", "REPLY"]],
    ["IN_REVIEW", ["WITH_ORG", "REPLY"], ["WAITING_FOR_YOU", "ACCEPT_ANSWER"], ["WITH_ORG", "REPLY"]],
    ["DONE", ["CLOSED", "OPEN"], ["CLOSED", "OPEN"], ["CLOSED", "OPEN"]],
    ["CANCELLED", ["CLOSED", "OPEN"], ["CLOSED", "OPEN"], ["CLOSED", "OPEN"]],
  ];
  it("covers every status", () => expect(TABLE.map(([s]) => s)).toEqual(S));
  it.each(TABLE)("%s", (status, h, r, s) => {
    expect([portalGroup(held(status)), portalAction(held(status))]).toEqual(h);
    expect([portalGroup(raised(status)), portalAction(raised(status))]).toEqual(r);
    expect([portalGroup(staffSide(status)), portalAction(staffSide(status))]).toEqual(s);
  });
});

describe("the one button, by type", () => {
  it("an RFI it holds with no answer yet: Send for checking (it writes the answer in the drawer, WB-6)", () => {
    expect(portalAction(held("IN_PROGRESS", { type: "RFI" }))).toBe("SEND_FOR_CHECKING");
  });
  it("an Inspection it holds: Reply, never Send for checking, whatever the result (WB-5; OQ-8 stands)", () => {
    for (const r of ["NOT_YET", "FAILED", "PASSED"] as const) expect(portalAction(held("IN_PROGRESS", { type: "INSPECTION", inspectionResult: r })), r).toBe("REPLY");
    expect(portalGroup(held("IN_PROGRESS", { type: "INSPECTION", inspectionResult: "FAILED" }))).toBe("WAITING_FOR_YOU");
  });
  it("an incident it raised, In review: Accept", () => {
    expect(portalAction(raised("IN_REVIEW", { type: "SAFETY_INCIDENT", answer: "" }))).toBe("ACCEPT_ANSWER");
  });
});

describe("portalStaffLabel (WS-11)", () => {
  const names = new Map([
    ["aisyah", "Aisyah"],
    ["hafiz", "Hafiz"],
    ["nurul", "Nurul"],
  ]);
  const team = new Set(["aisyah"]);
  const side = new Set(["hafiz"]);
  it("a staff member is named only if on the team or the in-force side; else the organisation", () => {
    expect(portalStaffLabel(person("aisyah"), team, side, names, "JKR")).toBe("Aisyah");
    expect(portalStaffLabel(person("hafiz"), team, side, names, "JKR")).toBe("Hafiz");
    expect(portalStaffLabel(person("nurul"), team, side, names, "JKR")).toBe("JKR");
    expect(portalStaffLabel(person("ghost"), new Set(["ghost"]), side, names, "JKR")).toBe("JKR");
  });
  it("nobody is the organisation; the contractor is itself", () => {
    expect(portalStaffLabel(null, team, side, names, "JKR")).toBe("JKR");
    expect(portalStaffLabel(CONTRACTOR, team, side, names, "JKR")).toBe("You");
  });
});
