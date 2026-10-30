import { describe, expect, it } from "vitest";

import { CONTRACTOR, person } from "./party";
import { answerIsDraft, contractorMayPost, PORTAL_ORDER_BY, portalAction, portalGroup, portalStaffLabel } from "./portal";
import { WORK_ORDER_BY } from "./views";
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
  it("an RFI it raised whose answer staff blanked: Reply, never an Accept that is always refused", () => {
    expect(portalAction(raised("IN_REVIEW", { answer: " " }))).toBe("REPLY");
    expect(portalGroup(raised("IN_REVIEW", { answer: " " }))).toBe("WAITING_FOR_YOU");
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

describe("WSEC-5: the contractor posts on an open item only", () => {
  it("every open status may be replied to, attached to and answered; Done and Cancelled may not, whoever holds them", () => {
    expect(S.map((s) => [s, contractorMayPost({ status: s })])).toEqual([["TO_DO", true], ["IN_PROGRESS", true], ["IN_REVIEW", true], ["DONE", false], ["CANCELLED", false]]);
  });
});

describe("WSEC-9: the Answer is a draft until the contractor sends it for checking", () => {
  const rfi = (status: WorkStatus, o: Partial<WorkItemFacts> = {}) => held(status, { type: "RFI", answer: "Use detail 4", ...o });
  it("a written answer on an RFI the contractor holds, before it is sent, is a draft", () => {
    expect(answerIsDraft(rfi("TO_DO"))).toBe(true);
    expect(answerIsDraft(rfi("IN_PROGRESS"))).toBe(true);
  });
  it("not once sent for checking or closed; not with no answer; not when staff hold it; not on another type", () => {
    for (const s of ["IN_REVIEW", "DONE", "CANCELLED"] as const) expect(answerIsDraft(rfi(s)), s).toBe(false);
    expect(answerIsDraft(rfi("TO_DO", { answer: "  " }))).toBe(false);
    expect(answerIsDraft(rfi("TO_DO", { assignee: person("aisyah") }))).toBe(false);
    expect(answerIsDraft(held("TO_DO", { answer: "x" }))).toBe(false);
  });
});

describe("WSEC-10 L3: the portal's order has no internal priority", () => {
  it("due day, then type and number; the staff order keeps priority", () => {
    expect(PORTAL_ORDER_BY).toEqual([{ dueOn: { sort: "asc", nulls: "last" } }, { type: "asc" }, { number: "asc" }, { id: "asc" }]);
    expect(JSON.stringify(PORTAL_ORDER_BY)).not.toContain("priority");
    expect(JSON.stringify(WORK_ORDER_BY)).toContain("priority");
  });
});

// WR-1: on a linked item the button follows the line, whoever holds the item.
describe("portalAction on a linked defect item", () => {
  const linked = (status: WorkStatus, linkedLine: "DRAFT" | "RECORDED", o: Partial<WorkItemFacts> = {}): WorkItemFacts => ({ ...base, type: "DEFECT", status, linkedLine, ...o });
  it("offers Mark as fixed on an open line, held by staff or by the contractor", () => {
    expect(portalAction(linked("IN_PROGRESS", "RECORDED"))).toBe("MARK_AS_FIXED");
    expect(portalAction(linked("IN_PROGRESS", "RECORDED", { assignee: CONTRACTOR }))).toBe("MARK_AS_FIXED");
  });
  it("offers Reply only once reported (In review) or on a draft certificate's list, and Open when closed", () => {
    expect(portalAction(linked("IN_REVIEW", "RECORDED"))).toBe("REPLY");
    expect(portalAction(linked("IN_PROGRESS", "DRAFT"))).toBe("REPLY");
    expect(portalAction(linked("IN_PROGRESS", "DRAFT", { assignee: CONTRACTOR }))).toBe("REPLY");
    expect(portalAction(linked("DONE", "RECORDED"))).toBe("OPEN");
  });
});
