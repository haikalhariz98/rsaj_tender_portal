import { describe, expect, it } from "vitest";

import { coverFor, faultsIn, heldOnBehalf, inForce, statusOf, type Delegation } from "./delegation";

const NOW = new Date("2026-08-10");

const d = (o: Partial<Delegation> & Pick<Delegation, "id">): Delegation => ({
  fromPersonId: "p1",
  toPersonId: "p2",
  roleCode: "HOD",
  capabilityCodes: [],
  valueCeiling: null,
  reason: "",
  reasonMs: "",
  noSubDelegation: true,
  effectiveFrom: new Date("2026-08-01"),
  effectiveTo: new Date("2026-08-20"),
  ...o,
});

describe("status", () => {
  it("is in force inside the period", () => {
    expect(statusOf(d({ id: "a" }), NOW)).toBe("IN_FORCE");
  });

  it("is scheduled before it starts", () => {
    expect(statusOf(d({ id: "a", effectiveFrom: new Date("2026-09-01") }), NOW)).toBe("SCHEDULED");
  });

  it("is ended after it finishes", () => {
    expect(statusOf(d({ id: "a", effectiveTo: new Date("2026-08-05") }), NOW)).toBe("ENDED");
  });

  it("treats the end date as exclusive, matching every other period in the product", () => {
    expect(statusOf(d({ id: "a", effectiveTo: NOW }), NOW)).toBe("ENDED");
  });

  it("is in force on the day it starts", () => {
    expect(statusOf(d({ id: "a", effectiveFrom: NOW }), NOW)).toBe("IN_FORCE");
  });
});

describe("who is covering", () => {
  const all = [
    d({ id: "live" }),
    d({ id: "later", effectiveFrom: new Date("2026-09-01"), effectiveTo: null }),
    d({ id: "done", effectiveTo: new Date("2026-08-02") }),
  ];

  it("lists only what is in force", () => {
    expect(inForce(all, NOW).map((x) => x.id)).toEqual(["live"]);
  });

  it("finds the cover for a person who is away", () => {
    expect(coverFor(all, "p1", NOW)?.id).toBe("live");
  });

  it("returns nobody where there is no cover", () => {
    expect(coverFor(all, "someone_else", NOW)).toBe(null);
  });

  it("lists what a delegate is carrying", () => {
    expect(heldOnBehalf(all, "p2", NOW).map((x) => x.id)).toEqual(["live"]);
  });
});

describe("faults refused at entry", () => {
  const held = ["run_sourcing", "open_bids"];

  it("accepts a clean delegation", () => {
    expect(faultsIn(d({ id: "new", capabilityCodes: ["run_sourcing"] }), [], held)).toEqual([]);
  });

  it("refuses delegating to yourself", () => {
    expect(faultsIn(d({ id: "new", toPersonId: "p1" }), [], held)).toContain("TO_SELF");
    // The officer who keys a delegation from the grantor's letter may not be the delegate (review of Phase 2b): one person would grant it and hold it.
    expect(faultsIn(d({ id: "new" }), [], held, { recorderId: "p2" })).toContain("RECORDER_IS_DELEGATE");
    expect(faultsIn(d({ id: "new" }), [], held, { recorderId: "clerk" })).not.toContain("RECORDER_IS_DELEGATE");
    expect(faultsIn(d({ id: "new" }), [], held, { recorderId: null })).not.toContain("RECORDER_IS_DELEGATE");
    expect(faultsIn(d({ id: "new" }), [], held)).not.toContain("RECORDER_IS_DELEGATE");
  });

  it("refuses a period that ends before it starts", () => {
    const bad = d({ id: "new", effectiveFrom: new Date("2026-08-20"), effectiveTo: new Date("2026-08-01") });
    expect(faultsIn(bad, [], held)).toContain("ENDS_BEFORE_IT_STARTS");
  });

  it("refuses a second delegate for one office over the same days", () => {
    const existing = [d({ id: "old", toPersonId: "p9" })];
    expect(faultsIn(d({ id: "new" }), existing, held)).toContain("OVERLAPS_EXISTING");
  });

  it("allows the same office delegated again once the first has ended", () => {
    const existing = [d({ id: "old", toPersonId: "p9", effectiveTo: new Date("2026-08-01") })];
    const later = d({ id: "new", effectiveFrom: new Date("2026-08-01") });
    expect(faultsIn(later, existing, held)).not.toContain("OVERLAPS_EXISTING");
  });

  it("refuses delegating a capability the office does not itself hold", () => {
    const over = d({ id: "new", capabilityCodes: ["sign_contract"] });
    expect(faultsIn(over, [], held)).toContain("CAPABILITY_NOT_HELD");
  });

  it("refuses onward delegation where the first forbids it", () => {
    // p1 delegated to p2 with no sub-delegation; p2 now tries to pass it to p3.
    const existing = [d({ id: "first", fromPersonId: "p1", toPersonId: "p2", noSubDelegation: true })];
    const onward = d({ id: "second", fromPersonId: "p2", toPersonId: "p3" });
    expect(faultsIn(onward, existing, held)).toContain("SUB_DELEGATION_FORBIDDEN");
  });

  it("allows onward delegation where the first permits it", () => {
    const existing = [d({ id: "first", fromPersonId: "p1", toPersonId: "p2", noSubDelegation: false })];
    const onward = d({ id: "second", fromPersonId: "p2", toPersonId: "p3" });
    expect(faultsIn(onward, existing, held)).not.toContain("SUB_DELEGATION_FORBIDDEN");
  });

  it("refuses to delegate capabilities nobody has decided the office holds", () => {
    // An empty held list means nobody has configured the office's capabilities. That is
    // not the office holding none — but it is not proof it holds these, either.
    const faults = faultsIn(d({ id: "new", capabilityCodes: ["anything"] }), [], []);
    expect(faults).toContain("OFFICE_UNDECIDED");
    expect(faults).not.toContain("CAPABILITY_NOT_HELD");
  });

  it("refuses a delegation limited neither in time nor in task", () => {
    const open = d({ id: "new", effectiveTo: null, capabilityCodes: [] });
    expect(faultsIn(open, [], held)).toContain("UNBOUNDED");
    // Either limit is enough.
    expect(faultsIn(d({ id: "new", effectiveTo: null, capabilityCodes: ["run_sourcing"] }), [], held)).not.toContain("UNBOUNDED");
  });

  it("refuses a delegation from somebody who does not hold the office", () => {
    expect(faultsIn(d({ id: "new", capabilityCodes: ["run_sourcing"] }), [], held, { grantorHoldsOffice: false })).toContain(
      "GRANTOR_DOES_NOT_HOLD",
    );
  });

  it("refuses to hand over a whole office that carries a mandatory act", () => {
    const whole = d({ id: "new", capabilityCodes: [] });
    expect(faultsIn(whole, [], held, { officeHasMandatoryActs: true })).toContain("MANDATORY_ACT");
    const listed = d({ id: "new", capabilityCodes: ["run_sourcing"] });
    expect(faultsIn(listed, [], held, { officeHasMandatoryActs: true })).not.toContain("MANDATORY_ACT");
  });

  it("reports every fault at once rather than the first", () => {
    const bad = d({
      id: "new",
      toPersonId: "p1",
      effectiveFrom: new Date("2026-08-20"),
      effectiveTo: new Date("2026-08-01"),
      capabilityCodes: ["sign_contract"],
    });
    expect(faultsIn(bad, [], held).sort()).toEqual([
      "CAPABILITY_NOT_HELD",
      "ENDS_BEFORE_IT_STARTS",
      "TO_SELF",
    ]);
  });
});

describe("re-delegation during absence (FR-APR-012, 6.9 ruling)", () => {
  const proposed = { id: "new", fromPersonId: "p1", toPersonId: "p2", roleCode: "HOD", capabilityCodes: [], valueCeiling: null, reason: "", reasonMs: "", noSubDelegation: true, effectiveFrom: new Date("2026-10-01"), effectiveTo: new Date("2026-10-15") };
  it("is refused when the grantor is away and the absent holder's recommendation is not recorded", () => {
    expect(faultsIn(proposed, [], [], { grantorUnavailable: true })).toContain("ABSENT_GRANTOR_NO_RECOMMENDATION");
    expect(faultsIn(proposed, [], [], { grantorUnavailable: true, holderRecommendation: "  " })).toContain("ABSENT_GRANTOR_NO_RECOMMENDATION");
  });
  it("is allowed on the recorded recommendation, and never asked of a grantor who is present", () => {
    expect(faultsIn(proposed, [], [], { grantorUnavailable: true, holderRecommendation: "I recommend Encik Rahman act for me while I am away." })).not.toContain("ABSENT_GRANTOR_NO_RECOMMENDATION");
    expect(faultsIn(proposed, [], [], { grantorUnavailable: false })).not.toContain("ABSENT_GRANTOR_NO_RECOMMENDATION");
  });
});

describe("the absent holder's recommendation is attached (OD-6, document store)", () => {
  const proposed = { id: "new", fromPersonId: "p1", toPersonId: "p2", roleCode: "HOD", capabilityCodes: [], valueCeiling: null, reason: "", reasonMs: "", noSubDelegation: true, effectiveFrom: new Date("2026-10-01"), effectiveTo: new Date("2026-10-15") };
  const text = "I recommend Encik Rahman act for me while I am away.";
  it("a new re-delegation by an absent holder is refused without the signed recommendation attached, even with the text", () => {
    expect(faultsIn(proposed, [], [], { grantorUnavailable: true, holderRecommendation: text, recommendationAttached: false })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("is allowed with the recommendation attached and its summary recorded", () => {
    const f = faultsIn(proposed, [], [], { grantorUnavailable: true, holderRecommendation: text, recommendationAttached: true });
    expect(f).not.toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
    expect(f).not.toContain("ABSENT_GRANTOR_NO_RECOMMENDATION");
  });
  it("one recorded as text before attachments existed stands on its text", () => {
    expect(faultsIn(proposed, [], [], { grantorUnavailable: true, holderRecommendation: text, recommendationAttached: false, recordedBeforeAttachments: true })).not.toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("a grantor who is present is never asked for it", () => {
    expect(faultsIn(proposed, [], [], { grantorUnavailable: false, recommendationAttached: false })).not.toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
});
