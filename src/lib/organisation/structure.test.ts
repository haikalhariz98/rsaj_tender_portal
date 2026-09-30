import { describe, expect, it } from "vitest";

import { FORMATS, UNITS } from "./fixture";
import type { OrgUnit } from "./types";
import {
  activeOn,
  assessList,
  buildStructure,
  checkCode,
  findFormat,
  flatten,
  inForceOn,
  nextTier,
  pathTo,
  placementFault,
} from "./structure";

/// After the dissolved division has closed, before the future section opens.
const NOW = new Date("2026-06-01");
/// While every unit in the fixture except the future section was still in force.
const BEFORE = new Date("2025-06-01");

const codes = (units: { code: string }[]) => units.map((u) => u.code);

describe("in force on a date", () => {
  const row = (from: string, to: string | null) => ({
    effectiveFrom: new Date(from),
    effectiveTo: to == null ? null : new Date(to),
  });

  it("is not in force before it begins", () => {
    expect(inForceOn(row("2026-01-01", null), new Date("2025-12-31"))).toBe(false);
  });

  it("is in force on the day it begins", () => {
    expect(inForceOn(row("2026-01-01", null), new Date("2026-01-01"))).toBe(true);
  });

  it("treats the end date as exclusive, so revisions can abut without overlapping", () => {
    const ending = row("2020-01-01", "2026-01-01");
    const starting = row("2026-01-01", null);
    const changeover = new Date("2026-01-01");

    expect(inForceOn(ending, changeover)).toBe(false);
    expect(inForceOn(starting, changeover)).toBe(true);

    const dayBefore = new Date("2025-12-31");
    expect(inForceOn(ending, dayBefore)).toBe(true);
    expect(inForceOn(starting, dayBefore)).toBe(false);
  });
});

describe("the structure in force", () => {
  it("hangs the tree off the units that name no parent", () => {
    const { roots } = buildStructure(UNITS, NOW);
    expect(codes(roots.map((r) => r.unit))).toEqual(["co"]);
  });

  it("nests children under their parent, deepest last", () => {
    const { roots } = buildStructure(UNITS, NOW);
    const rows = flatten(roots);
    expect(codes(rows.map((r) => r.unit))).toEqual(["co", "div_a", "dept_a1", "sect_a1x"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3]);
  });

  it("excludes a unit that has not started yet", () => {
    expect(codes(activeOn(UNITS, NOW))).not.toContain("sect_future");
    expect(codes(activeOn(UNITS, new Date("2027-06-01")))).toContain("sect_future");
  });

  it("shows last year's structure as it was, not as it is now", () => {
    const { roots, detached } = buildStructure(UNITS, BEFORE);
    const rows = codes(flatten(roots).map((r) => r.unit));
    expect(rows).toContain("div_gone");
    expect(rows).toContain("dept_orphan");
    expect(detached).toHaveLength(0);
  });
});

describe("a unit whose parent is no longer in force", () => {
  it("is reported as detached rather than quietly re-rooted", () => {
    const { roots, detached, faults } = buildStructure(UNITS, NOW);

    expect(codes(detached.map((d) => d.unit))).toEqual(["dept_orphan"]);
    expect(codes(roots.map((r) => r.unit))).not.toContain("dept_orphan");
    expect(faults).toContainEqual({
      kind: "DETACHED",
      code: "dept_orphan",
      parentCode: "div_gone",
    });
  });

  it("is still shown, because hiding it would hide the fault", () => {
    const { roots, detached } = buildStructure(UNITS, NOW);
    const shown = [...flatten(roots), ...flatten(detached)];
    expect(codes(shown.map((s) => s.unit))).toContain("dept_orphan");
  });
});

describe("a loop in the parent codes", () => {
  it("terminates instead of hanging, and is reported once", () => {
    const { faults } = buildStructure(UNITS, NOW);
    const cycles = faults.filter((f) => f.kind === "CYCLE");
    expect(cycles).toHaveLength(1);
    expect([...cycles[0].codes].sort()).toEqual(["loop_x", "loop_y"]);
  });

  it("keeps the looped units out of the tree", () => {
    const { roots, detached } = buildStructure(UNITS, NOW);
    const drawn = codes([...flatten(roots), ...flatten(detached)].map((n) => n.unit));
    expect(drawn).not.toContain("loop_x");
    expect(drawn).not.toContain("loop_y");
  });

  it("does not let a self-parented unit loop forever", () => {
    const selfish: OrgUnit[] = [
      { ...UNITS[0], code: "self", parentCode: "self", sortOrder: 1 },
    ];
    const { faults, roots } = buildStructure(selfish, NOW);
    expect(faults).toEqual([{ kind: "CYCLE", codes: ["self"] }]);
    expect(roots).toHaveLength(0);
  });
});

describe("the path to a unit", () => {
  it("runs root first and ends at the unit itself", () => {
    expect(codes(pathTo(UNITS, "sect_a1x", NOW))).toEqual(["co", "div_a", "dept_a1", "sect_a1x"]);
  });

  it("stops where the chain leaves the units in force", () => {
    expect(codes(pathTo(UNITS, "dept_orphan", NOW))).toEqual(["dept_orphan"]);
    expect(codes(pathTo(UNITS, "dept_orphan", BEFORE))).toEqual([
      "co",
      "div_gone",
      "dept_orphan",
    ]);
  });

  it("returns nothing for a unit not in force on that date", () => {
    expect(pathTo(UNITS, "sect_future", NOW)).toEqual([]);
  });

  it("terminates on a loop", () => {
    expect(codes(pathTo(UNITS, "loop_x", NOW)).sort()).toEqual(["loop_x", "loop_y"]);
  });
});

describe("code formats", () => {
  const costCentre = findFormat(FORMATS, "cost_centre");
  const accountCode = findFormat(FORMATS, "account_code");
  const broken = findFormat(FORMATS, "broken");

  it("accepts a code matching the configured pattern", () => {
    expect(checkCode("AB-123", costCentre)).toEqual({ state: "OK" });
  });

  it("rejects one that does not, and says what was expected", () => {
    const result = checkCode("nope", costCentre);
    expect(result.state).toBe("MALFORMED");
    if (result.state === "MALFORMED") {
      expect(result.example).toBe("AB-123");
      expect(result.description).toBe("Two letters, a hyphen, three digits.");
    }
  });

  it("anchors an unanchored pattern rather than trusting the author", () => {
    // "\\d{4}" unanchored would match inside anything. A cost centre that merely
    // contains four digits is not a cost centre.
    expect(checkCode("1234", accountCode)).toEqual({ state: "OK" });
    expect(checkCode("x1234x", accountCode).state).toBe("MALFORMED");
    expect(checkCode("12345", accountCode).state).toBe("MALFORMED");
  });

  it("does not call a code valid merely because no format is configured", () => {
    expect(checkCode("anything at all", null)).toEqual({ state: "NO_FORMAT" });
    expect(checkCode("", findFormat(FORMATS, "nonesuch"))).toEqual({ state: "NO_FORMAT" });
  });

  it("survives a mistyped pattern without passing everything", () => {
    const result = checkCode("anything", broken);
    expect(result.state).toBe("BAD_PATTERN");
    expect(result).not.toEqual({ state: "OK" });
  });
});

describe("readiness", () => {
  it("reports an empty list as unset rather than as zero", () => {
    expect(assessList([], NOW).state).toBe("UNSET");
  });

  it("counts only what is in force, and flags working defaults", () => {
    const r = assessList(UNITS, NOW);
    expect(r.state).toBe("CONFIGURED");
    expect(r.active).toBe(activeOn(UNITS, NOW).length);
    expect(r.assumed).toBe(1);
    expect(r.needsSignOff).toBe(true);
  });
});

describe("where a unit may sit", () => {
  it("lets a company stand alone, and nothing else", () => {
    expect(placementFault("COMPANY", null)).toBeNull();
    expect(placementFault("COMPANY", "DIVISION")).toBe("COMPANY_UNDER_SOMETHING");
    expect(placementFault("DEPARTMENT", null)).toBe("NEEDS_A_PARENT");
  });

  it("allows skipping a tier but never going back up", () => {
    expect(placementFault("DEPARTMENT", "COMPANY")).toBeNull();
    expect(placementFault("SECTION", "DEPARTMENT")).toBeNull();
    expect(placementFault("DIVISION", "DEPARTMENT")).toBe("NOT_DEEPER_THAN_PARENT");
    expect(placementFault("SECTION", "SECTION")).toBe("NOT_DEEPER_THAN_PARENT");
  });

  it("offers the next tier down, and nothing under a section", () => {
    expect(nextTier("COMPANY")).toBe("DIVISION");
    expect(nextTier("DEPARTMENT")).toBe("SECTION");
    expect(nextTier("SECTION")).toBeNull();
  });
});
