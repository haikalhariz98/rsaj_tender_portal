import { describe, expect, it } from "vitest";

import { openFault, transitionFault } from "./exercise";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const ok = { today: "2026-09-30", methodsConfigured: true };

describe("opening an exercise (spec §7.3.2, ruling R-6)", () => {
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

describe("leaving Draft", () => {
  const ready = { today: "2026-09-30", methodSet: true, typeSet: true, basisSet: true, proposalRequired: false, ambiguousTaxonomies: 0, blockingFaults: 0 };
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
