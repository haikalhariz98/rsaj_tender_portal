import { describe, expect, it } from "vitest";

import { awardChips } from "./case-list-words";
import { endedKind, phaseKind, primaryCaseStatus, STATUS_PRIORITY, type StatusCandidate } from "./case-status";

// Founder, 2026-10-20: "I feel like the status is too much status. can we simplify this or show only one status." Each row shows one
// chip; the rest are kept, in priority order, for the tooltip and the download.

const c = (kind: StatusCandidate["kind"], text: string): StatusCandidate => ({ kind, text });
const texts = (xs: StatusCandidate[]) => xs.map((x) => x.text);

describe("primaryCaseStatus, over the founder's screenshot rows", () => {
  it("Number allocated, Awaiting return, No securities lodged, Indent expired: the expired indent", () => {
    const r = primaryCaseStatus([c("LIFECYCLE", "Number allocated"), c("AWAITING_RETURN", "Awaiting return"), c("NO_SECURITIES", "No securities lodged"), c("INDENT_EXPIRED", "Indent expired")]);
    expect(r.primary?.text).toBe("Indent expired");
    expect(texts(r.others)).toEqual(["No securities lodged", "Awaiting return", "Number allocated"]);
  });
  it("Returned for amendment, Awaiting return, 1 to verify: the amendment", () => {
    const r = primaryCaseStatus([c("RETURNED_FOR_AMENDMENT", "Returned for amendment"), c("AWAITING_RETURN", "Awaiting return"), c("TO_VERIFY", "1 to verify")]);
    expect(r.primary?.text).toBe("Returned for amendment");
    expect(texts(r.others)).toEqual(["Awaiting return", "1 to verify"]);
  });
  it("built from the real chips of an issued award with a contract at Number allocated", () => {
    const chips = awardChips({ status: "ISSUED", returned: false, toVerify: 0, registered: 0, hasCommitmentNo: true, indentExpired: true });
    const r = primaryCaseStatus([c(phaseKind("NUMBER_ALLOCATED"), "Number allocated"), ...chips]);
    expect(r.primary?.text).toBe("Indent expired");
    expect(r.others).toHaveLength(3);
  });
});

describe("primaryCaseStatus, the order", () => {
  it("problems come before waiting, and waiting before the lifecycle", () => {
    expect(primaryCaseStatus([c("LIFECYCLE", "Active"), c("AWAITING_RETURN", "Awaiting return")]).primary?.text).toBe("Awaiting return");
    expect(primaryCaseStatus([c("AWAITING_RETURN", "Awaiting return"), c("NO_SECURITIES", "No securities lodged")]).primary?.text).toBe("No securities lodged");
    expect(primaryCaseStatus([c("LIFECYCLE", "Active"), c("IN_DELAY", "In Delay")]).primary?.text).toBe("In Delay");
  });
  it("worst problem first", () => {
    const r = primaryCaseStatus([c("NO_SECURITIES", "a"), c("CANCELLED", "b"), c("RETURNED_FOR_AMENDMENT", "c"), c("IN_DELAY", "d"), c("INDENT_EXPIRED", "e"), c("TERMINATED", "f")]);
    expect(texts([r.primary!, ...r.others])).toEqual(["f", "e", "d", "c", "b", "a"]);
  });
  it("equal kinds keep the row's own order", () => {
    expect(texts(primaryCaseStatus([c("LIFECYCLE", "Draft"), c("LIFECYCLE", "Active")]).others)).toEqual(["Active"]);
  });
  it("one status alone has no others, and none has no primary", () => {
    expect(primaryCaseStatus([c("LIFECYCLE", "Draft")])).toEqual({ primary: c("LIFECYCLE", "Draft"), others: [] });
    expect(primaryCaseStatus([])).toEqual({ primary: null, others: [] });
  });
  it("loses nothing: primary and others are exactly the candidates", () => {
    const r = primaryCaseStatus([c("LIFECYCLE", "x"), c("TO_ISSUE", "y"), c("IN_DELAY", "z")]);
    expect([r.primary!, ...r.others].map((x) => x.text).sort()).toEqual(["x", "y", "z"]);
  });
  it("no kind is ranked twice", () => {
    expect(new Set(STATUS_PRIORITY).size).toBe(STATUS_PRIORITY.length);
  });
});

describe("kinds", () => {
  it("phases and endings map to kinds", () => {
    expect(phaseKind("RETURNED_FOR_AMENDMENT")).toBe("RETURNED_FOR_AMENDMENT");
    expect(phaseKind("PENDING_LEGAL_ENDORSEMENT")).toBe("AWAITING_APPROVAL");
    expect(phaseKind("ACTIVE")).toBe("LIFECYCLE");
    expect(endedKind("TERMINATED")).toBe("TERMINATED");
    expect(endedKind("CONTRACT_CANCELLED")).toBe("CANCELLED");
  });
});
