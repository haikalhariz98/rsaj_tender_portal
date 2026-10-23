import { describe, expect, it } from "vitest";

import { openFault, transitionFault } from "./exercise";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
// Close-out ruling C2: the gate is a required input. These fixtures predate the gate and
// describe a requisition with no gate to pass — the minimal faithful update (flagged).
const ok = { today: "2026-09-30", methodsConfigured: true, gate: { code: "CLEAR" } as const };

describe("opening an exercise (spec §7.3.2, ruling R-6)", () => {
  it("a requisition that cannot take an exercise whatever its gates say is refused with a fault other than the time zone (the new-exercise list leaves it out before reading its gates)", () => {
    const base = { status: "APPROVED", sourcingPermitted: true, approvedRoute: true, remaining: 1n };
    for (const over of [{ sourcingPermitted: false }, { sourcingPermitted: null }, { approvedRoute: false }, { remaining: 0n }, { remaining: -1n }]) {
      for (const gate of [{ code: "CLEAR" }, { code: "GATES_NOT_DETERMINED", why: "NOT_CHECKED" }] as const) {
        const f = openFault({ ...base, ...over }, { today: null, methodsConfigured: true, gate });
        expect(f).not.toBeNull();
        expect(f!.code).not.toBe("TIME_ZONE_UNSET");
      }
    }
  });
  it("only against an approved requisition whose route lets the organisation procure", () => {
    expect(openFault({ status: "APPROVED", sourcingPermitted: true, approvedRoute: true }, ok)).toBeNull();
    expect(openFault({ status: "SOURCING", sourcingPermitted: true, approvedRoute: true }, ok)).toBeNull();
    expect(openFault({ status: "PENDING_APPROVAL", sourcingPermitted: true, approvedRoute: false }, ok)?.code).toBe("REQUISITION_NOT_APPROVED");
    expect(openFault({ status: "APPROVED", sourcingPermitted: false, approvedRoute: true }, ok)?.code).toBe("SOURCING_NOT_PERMITTED");
    expect(openFault({ status: "APPROVED", sourcingPermitted: null, approvedRoute: true }, ok)?.code).toBe("SOURCING_NOT_RECORDED");
  });
  it("needs the organisation's day and a configured method list", () => {
    expect(openFault({ status: "APPROVED", sourcingPermitted: true, approvedRoute: true }, { ...ok, today: null })?.code).toBe("TIME_ZONE_UNSET");
    expect(openFault({ status: "APPROVED", sourcingPermitted: true, approvedRoute: true }, { ...ok, methodsConfigured: false })?.code).toBe("METHODS_NOT_SET");
  });
});

describe("a requisition fully in exercises (UX 7)", () => {
  it("offers no new exercise while its live exercises hold all its approved value", () => {
    expect(openFault({ status: "SOURCING", sourcingPermitted: true, approvedRoute: true, remaining: 0n }, ok)?.code).toBe("FULLY_IN_EXERCISES");
    expect(openFault({ status: "SOURCING", sourcingPermitted: true, approvedRoute: true, remaining: 1n }, ok)).toBeNull();
    expect(openFault({ status: "APPROVED", sourcingPermitted: true, approvedRoute: true, remaining: null }, ok)).toBeNull();
  });
});

describe("the committee gate before the first exercise (FR-REQ-012, rulings CO-1, C2)", () => {
  const approved = { status: "APPROVED", sourcingPermitted: true, approvedRoute: true };
  it("never opens on an undetermined gate, whatever the reason", () => {
    for (const why of ["NOT_SET", "RULE_MISSING", "NOT_CHECKED"] as const) {
      expect(openFault(approved, { ...ok, gate: { code: "GATES_NOT_DETERMINED", why } })).toMatchObject({ code: "GATES_NOT_DETERMINED", data: { why } });
    }
  });
  it("reads a caller that did not look as undetermined, never as a pass", () => {
    expect(openFault(approved, { today: "2026-09-30", methodsConfigured: true } as never)?.code).toBe("GATES_NOT_DETERMINED");
  });
  it("refuses while a gate is awaited, returned, ended or unreadable", () => {
    for (const code of ["GATE_AWAITING", "GATE_RETURNED", "GATE_ENDED", "GATE_OUTCOME_NOT_RECORDED"] as const) {
      expect(openFault(approved, { ...ok, gate: { code, committee: "Technical Committee" } })).toMatchObject({ code, data: { committee: "Technical Committee" } });
    }
  });
  it("still says first that the funding route does not let the organisation procure (F4/F5)", () => {
    expect(openFault({ ...approved, sourcingPermitted: false }, { ...ok, gate: { code: "GATES_NOT_DETERMINED", why: "NOT_SET" } })?.code).toBe("SOURCING_NOT_PERMITTED");
  });
});

describe("leaving Draft", () => {
  const ready = { today: "2026-09-30", methodSet: true, typeSet: true, basisSet: true, proposalRequired: false, ambiguousTaxonomies: 0, blockingFaults: 0, packKind: "TENDER" as const };
  it("needs method, contract type and basis", () => {
    expect(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", ready)).toEqual([]);
    expect(codes(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", { ...ready, typeSet: false, basisSet: false }))).toEqual(["TYPE_NOT_SET", "BASIS_NOT_SET"]);
  });
  it("needs the proposal reviewed where the method asks for one, and no ambiguous classification or other fault", () => {
    expect(codes(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", { ...ready, proposalRequired: true, proposalState: "SUBMITTED" }))).toEqual(["PROPOSAL_NOT_REVIEWED"]);
    expect(codes(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", { ...ready, ambiguousTaxonomies: 1, blockingFaults: 2 }))).toEqual(["TAXONOMY_AMBIGUOUS", "BLOCKING_FAULTS"]);
  });
  it("cancelling needs a reason; cancelled is terminal", () => {
    expect(codes(transitionFault("DRAFT", "CANCELLED", { today: "2026-09-30" }))).toEqual(["CANCEL_REASON_REQUIRED"]);
    expect(transitionFault("DOCUMENTS_IN_PREPARATION", "CANCELLED", { today: "2026-09-30", reason: "Need withdrawn" })).toEqual([]);
    expect(codes(transitionFault("CANCELLED", "DRAFT", { today: "2026-09-30" }))).toEqual(["TERMINAL"]);
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "DRAFT", { today: "2026-09-30" }))).toEqual(["NOT_ALLOWED"]);
  });
});
