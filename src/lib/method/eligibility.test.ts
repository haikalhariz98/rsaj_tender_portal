import { describe, expect, it } from "vitest";

import { methodOptions, proposedMethod, selectionFaults, type SelectionDraft } from "./eligibility";
import { SPEC_METHODS } from "./fixture";

const on = new Date("2026-09-30T00:00:00Z");
const draft = (d: Partial<SelectionDraft>): SelectionDraft => ({ methodCode: null, methodReason: "", externalRouteNote: "", parentContractRef: null, justificationText: "", ...d });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const tender = { methods: SPEC_METHODS, regime: "tender" as const, posture: "PROCURES" as const, on };

describe("the method the regime proposes (FR-MTD-005)", () => {
  it("above RM300K it is open tender, which needs no justification", () => {
    expect(proposedMethod(SPEC_METHODS, "tender", on)).toEqual({ state: "PROPOSED", code: "open_tender" });
    expect(selectionFaults(draft({ methodCode: "open_tender" }), tender)).toEqual([]);
  });
  it("an empty list is unset, not 'no default'", () => {
    expect(proposedMethod([], "tender", on).state).toBe("UNSET");
    expect(codes(selectionFaults(draft({ methodCode: "open_tender" }), { ...tender, methods: [] }))).toEqual(["METHODS_NOT_SET"]);
  });
  it("a retired default proposes nothing", () => {
    const retired = SPEC_METHODS.map((m) => (m.code === "open_tender" ? { ...m, retiredOn: new Date("2026-01-01") } : m));
    expect(proposedMethod(retired, "tender", on).state).toBe("NO_DEFAULT");
  });
});

describe("choosing a method (FR-MTD-004, 005)", () => {
  it("a method is required", () => {
    expect(codes(selectionFaults(draft({}), tender))).toEqual(["METHOD_REQUIRED"]);
  });
  it("selected tender without a justification is refused", () => {
    const f = selectionFaults(draft({ methodCode: "selected_tender", methodReason: "Specialist works" }), tender);
    expect(codes(f)).toContain("JUSTIFICATION_REQUIRED");
    expect(codes(selectionFaults(draft({ methodCode: "selected_tender", methodReason: "Specialist works", justificationText: "Only three firms hold the licence." }), tender))).toEqual([]);
  });
  it("a method other than the proposed one needs a reason (ruling R-12)", () => {
    expect(codes(selectionFaults(draft({ methodCode: "selected_tender", justificationText: "x" }), tender))).toEqual(["OVERRIDE_REASON_REQUIRED"]);
  });
  it("a method outside the regime is refused, and a retired one", () => {
    expect(codes(selectionFaults(draft({ methodCode: "open_quotation", methodReason: "x" }), tender))).toEqual(["METHOD_NOT_IN_REGIME"]);
    const retired = SPEC_METHODS.map((m) => (m.code === "direct" ? { ...m, retiredOn: new Date("2026-01-01") } : m));
    expect(codes(selectionFaults(draft({ methodCode: "direct", methodReason: "x" }), { ...tender, methods: retired }))).toEqual(["METHOD_RETIRED"]);
  });
  it("a route on which the organisation does not procure offers nothing", () => {
    expect(methodOptions(SPEC_METHODS, "tender", "RECORDS_ONLY", on)).toEqual([]);
    expect(codes(selectionFaults(draft({ methodCode: "open_tender" }), { ...tender, posture: "RECORDS_ONLY" }))).toEqual(["SOURCING_NOT_PERMITTED"]);
  });
  it("where an external body sets the route, the regime does not narrow the list, and its decision is recorded", () => {
    expect(methodOptions(SPEC_METHODS, "tender", "ROUTE_SET_EXTERNALLY", on).map((m) => m.code)).toContain("open_quotation");
    const f = selectionFaults(draft({ methodCode: "open_quotation", methodReason: "The funder chose it" }), { ...tender, posture: "ROUTE_SET_EXTERNALLY" });
    expect(codes(f)).toEqual(["EXTERNAL_ROUTE_NOTE_REQUIRED"]);
  });
  it("a call-off needs the parent contract's reference (ruling R-15)", () => {
    const below = { ...tender, regime: "below" as const };
    expect(codes(selectionFaults(draft({ methodCode: "call_off", methodReason: "Term contract in place" }), below))).toEqual(["PARENT_CONTRACT_REQUIRED"]);
    expect(selectionFaults(draft({ methodCode: "call_off", methodReason: "Term contract in place", parentContractRef: "KT/2026/01" }), below)).toEqual([]);
  });
});
