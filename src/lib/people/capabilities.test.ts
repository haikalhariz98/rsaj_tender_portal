import { describe, expect, it } from "vitest";

import {
  byGroup,
  capabilitiesForRoles,
  capabilityState,
  codesFor,
  countFor,
  unheldCapabilities,
  type Capability,
  type Grant,
} from "./capabilities";

const cap = (id: string, code: string, groupLabel: string, sortOrder: number): Capability => ({
  id,
  code,
  nameEn: code,
  nameMs: null,
  groupLabel,
  sortOrder,
});

const CAPS: Capability[] = [
  cap("c1", "raise", "Sourcing", 1),
  cap("c2", "approve", "Sourcing", 2),
  cap("c3", "certify", "Contracts", 3),
  cap("c4", "nobody_holds", "System", 4),
];

const GRANTS: Grant[] = [
  { capabilityId: "c1", roleCode: "CLERK" },
  { capabilityId: "c1", roleCode: "HOD" },
  { capabilityId: "c2", roleCode: "HOD" },
  { capabilityId: "c3", roleCode: "FD" },
];

describe("grouping", () => {
  it("groups in configured order, groups by first appearance", () => {
    expect(byGroup(CAPS).map((g) => g.label)).toEqual(["Sourcing", "Contracts", "System"]);
    expect(byGroup(CAPS)[0].capabilities.map((c) => c.code)).toEqual(["raise", "approve"]);
  });

  it("respects sortOrder rather than input order", () => {
    const shuffled = [CAPS[2], CAPS[0], CAPS[1], CAPS[3]];
    expect(byGroup(shuffled)[0].label).toBe("Sourcing");
  });

  it("gives an ungrouped capability a home rather than dropping it", () => {
    const loose = [...CAPS, cap("c5", "loose", "", 5)];
    expect(byGroup(loose).map((g) => g.label)).toContain("Ungrouped");
  });
});

describe("whether an office holds a capability", () => {
  it("is granted where a grant exists", () => {
    expect(capabilityState(GRANTS, "HOD", "c1")).toBe("GRANTED");
  });

  it("is withheld where the office has other grants but not this one", () => {
    // Somebody decided about HOD, and did not give it c3.
    expect(capabilityState(GRANTS, "HOD", "c3")).toBe("WITHHELD");
  });

  it("is undecided where the office has no grants at all", () => {
    // Nobody has filled this office's column in. Rendering that as a refusal would
    // claim a decision was taken that was not.
    expect(capabilityState(GRANTS, "NEVER_TOUCHED", "c1")).toBe("UNDECIDED");
  });

  it("keeps undecided and withheld apart even for the same capability", () => {
    expect(capabilityState(GRANTS, "FD", "c1")).toBe("WITHHELD");
    expect(capabilityState(GRANTS, "BOARD", "c1")).toBe("UNDECIDED");
  });
});

describe("capabilities nobody holds", () => {
  it("finds them", () => {
    expect(unheldCapabilities(CAPS, GRANTS).map((c) => c.code)).toEqual(["nobody_holds"]);
  });

  it("finds all of them when nothing is granted", () => {
    expect(unheldCapabilities(CAPS, []).map((c) => c.code)).toHaveLength(CAPS.length);
  });
});

describe("what a person may do", () => {
  it("unions the offices they hold", () => {
    expect(capabilitiesForRoles(CAPS, GRANTS, ["HOD", "FD"]).map((c) => c.code)).toEqual([
      "raise",
      "approve",
      "certify",
    ]);
  });

  it("counts a capability twice held only once", () => {
    // CLERK and HOD both grant "raise". Holding two offices is not two capabilities.
    expect(capabilitiesForRoles(CAPS, GRANTS, ["CLERK", "HOD"]).map((c) => c.code)).toEqual([
      "raise",
      "approve",
    ]);
  });

  it("returns nothing for someone holding no office", () => {
    expect(capabilitiesForRoles(CAPS, GRANTS, [])).toEqual([]);
  });

  it("ignores an office nobody has granted anything", () => {
    expect(capabilitiesForRoles(CAPS, GRANTS, ["NOBODY"])).toEqual([]);
  });

  it("lists them in configured order, not the order the offices came in", () => {
    expect(capabilitiesForRoles(CAPS, GRANTS, ["FD", "CLERK"]).map((c) => c.code)).toEqual([
      "raise",
      "certify",
    ]);
  });
});

describe("counts and codes", () => {
  it("counts what an office holds", () => {
    expect(countFor(GRANTS, "HOD")).toBe(2);
    expect(countFor(GRANTS, "NOBODY")).toBe(0);
  });

  it("resolves grant ids back to codes", () => {
    expect(codesFor(CAPS, GRANTS, "HOD").sort()).toEqual(["approve", "raise"]);
    expect(codesFor(CAPS, GRANTS, "NOBODY")).toEqual([]);
  });
});
