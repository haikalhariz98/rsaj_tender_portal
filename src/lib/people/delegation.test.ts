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

  it("does not judge capabilities when the office's own grants are unknown", () => {
    // An empty held list means nobody has configured the office's capabilities, which
    // is not the same as the office holding none.
    expect(faultsIn(d({ id: "new", capabilityCodes: ["anything"] }), [], [])).not.toContain(
      "CAPABILITY_NOT_HELD",
    );
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
