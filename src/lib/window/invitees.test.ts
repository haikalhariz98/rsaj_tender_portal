import { describe, expect, it } from "vitest";

import { approvedNameRoute, inviteeEditFault, inviteeListFault, invitedListFaults, regKey, routesWithdrawnByListChange } from "./invitees";
import { windowFindingText } from "./labels";

/**
 * ADR 0015, OD-4 A: the name route approves the list it froze. A route approved with no list
 * approved nothing (invitation refused until it is asked again with the list); a party added or
 * removed since is another list; identical by registration number is the approved list.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const reg = (...ns: string[]) => ns.map((registrationNo) => ({ registrationNo }));

describe("the proposed list against the approved one", () => {
  it("a route approved with no invitee rows approved no list", () => {
    expect(inviteeListFault(null, reg("A1"))?.code).toBe("LIST_NOT_RECORDED");
    expect(inviteeListFault([], reg("A1"))?.code).toBe("LIST_NOT_RECORDED");
    expect(windowFindingText({ code: "LIST_NOT_RECORDED", level: "block" })).toMatch(/Request the name's approval again/); // 0005, founder 2026-10-19
  });
  it("a party added or removed is another list", () => {
    expect(inviteeListFault(reg("A1", "B2"), reg("A1", "B2", "C3"))).toMatchObject({ code: "LIST_CHANGED", data: { added: 1, removed: 0 } });
    expect(inviteeListFault(reg("A1", "B2"), reg("A1"))).toMatchObject({ code: "LIST_CHANGED", data: { added: 0, removed: 1 } });
  });
  it("identical by registration number is the approved list, however it is spaced or cased", () => {
    expect(inviteeListFault(reg("200001010001 (000001-d)", "B2"), reg("b2", " 200001010001  (000001-D) "))).toBeNull();
    expect(regKey(" a  b ")).toBe("A B");
  });
});

describe("the invited path's list faults", () => {
  const day = (d: string) => new Date(d);
  const route = (status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED", invitees = reg("A1", "B2"), openedAt = "2026-10-01") => ({ id: status, status, openedAt: day(openedAt), invitees });
  const needs = { requiresNameApproval: true };
  it("the name approved with the same list passes", () => {
    expect(invitedListFaults(needs, [route("APPROVED")], reg("A1", "B2"))).toEqual([]);
  });
  it("the name's own gate first: not requested, in progress, refused", () => {
    expect(codes(invitedListFaults(needs, [], reg("A1")))).toEqual(["NAME_NOT_REQUESTED"]);
    expect(codes(invitedListFaults(needs, [route("PENDING")], reg("A1", "B2")))).toEqual(["NAME_NOT_APPROVED"]);
    expect(codes(invitedListFaults(needs, [route("REJECTED")], reg("A1", "B2")))).toEqual(["NAME_REJECTED"]);
  });
  it("an approved route whose list differs refuses", () => {
    expect(codes(invitedListFaults(needs, [route("APPROVED")], reg("A1")))).toEqual(["LIST_CHANGED"]);
  });
  it("a pre-6.5 approved route (no list) refuses (OD-4 A)", () => {
    expect(codes(invitedListFaults(needs, [route("APPROVED", [])], reg("A1")))).toEqual(["LIST_NOT_RECORDED"]);
  });
  it("where the method asks no approval of the name, a list is all it needs", () => {
    expect(invitedListFaults({ requiresNameApproval: false }, [], reg("A1"))).toEqual([]);
    expect(codes(invitedListFaults({ requiresNameApproval: false }, [], []))).toEqual(["NO_INVITEES"]);
  });
  it("the letters are issued on the latest route, only where it is approved", () => {
    expect(approvedNameRoute([route("REJECTED", reg("A1"), "2026-09-01"), route("APPROVED", reg("A1"), "2026-09-05")])?.status).toBe("APPROVED");
    expect(approvedNameRoute([route("APPROVED", reg("A1"), "2026-09-01"), route("PENDING", reg("A1"), "2026-09-05")])).toBeNull();
  });
});

describe("changing the list", () => {
  it("is open until invited, then frozen (exit: cancel and replace)", () => {
    for (const s of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) expect(inviteeEditFault(s)).toBeNull();
    expect(inviteeEditFault("INVITED")?.code).toBe("LIST_FROZEN");
    expect(windowFindingText(inviteeEditFault("INVITED")!)).toMatch(/cancel the exercise and open a replacement/);
    expect(inviteeEditFault("CANCELLED")?.code).toBe("EXERCISE_NOT_OPEN");
  });
  it("withdraws every name route pending or approved, and no other", () => {
    const rs = [{ id: "p", status: "PENDING" }, { id: "a", status: "APPROVED" }, { id: "r", status: "REJECTED" }, { id: "w", status: "RECALLED" }];
    expect(routesWithdrawnByListChange(rs).map((r) => r.id)).toEqual(["p", "a"]);
  });
});
