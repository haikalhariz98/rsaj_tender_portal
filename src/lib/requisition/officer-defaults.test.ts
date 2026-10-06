import { describe, expect, it } from "vitest";

import { officerDefaults, prefillFromOfficer, type CostCentreRow, type PrefillValues, type UnitRow } from "./officer-defaults";

const UNITS: UnitRow[] = [
  { code: "CO", kind: "COMPANY", parentCode: null },
  { code: "DIV", kind: "DIVISION", parentCode: "CO" },
  { code: "D1", kind: "DEPARTMENT", parentCode: "DIV" },
  { code: "D1-S1", kind: "SECTION", parentCode: "D1" },
  { code: "D1-S2", kind: "SECTION", parentCode: "D1" },
  { code: "D2", kind: "DEPARTMENT", parentCode: "DIV" },
  { code: "D2-S1", kind: "SECTION", parentCode: "D2" },
  { code: "ODD", kind: "SECTION", parentCode: "DIV" },
];
const cc = (code: string, orgUnitCode: string | null): CostCentreRow => ({ code, orgUnitCode });

describe("what the requesting officer's unit fills in", () => {
  it("fills department, section and cost centre for an officer in a section with one cost centre", () => {
    expect(officerDefaults("D1-S1", UNITS, [cc("C1", "D1-S1"), cc("C9", "D2")])).toEqual({ departmentCode: "D1", sectionCode: "D1-S1", costCentreCode: "C1" });
  });

  it("gives a department and no section for an officer in a department", () => {
    expect(officerDefaults("D1", UNITS, [cc("C1", "D1")])).toEqual({ departmentCode: "D1", sectionCode: null, costCentreCode: "C1" });
  });

  it("falls back to the department's cost centre only where the section has none", () => {
    expect(officerDefaults("D1-S2", UNITS, [cc("C0", "D1")])).toEqual({ departmentCode: "D1", sectionCode: "D1-S2", costCentreCode: "C0" });
  });

  it("does not guess between several cost centres on the section, nor settle it by the department's", () => {
    expect(officerDefaults("D1-S1", UNITS, [cc("C1", "D1-S1"), cc("C2", "D1-S1"), cc("C0", "D1")]).costCentreCode).toBeNull();
  });

  it("leaves the cost centre empty where several carry the department, or none carries anything", () => {
    expect(officerDefaults("D1", UNITS, [cc("C1", "D1"), cc("C2", "D1")]).costCentreCode).toBeNull();
    expect(officerDefaults("D1", UNITS, [cc("C1", null), cc("C2", "D2")]).costCentreCode).toBeNull();
    expect(officerDefaults("D1-S2", UNITS, [cc("C1", "D1"), cc("C2", "D1")]).costCentreCode).toBeNull();
  });

  it("fills nothing where no unit is recorded, the unit is not in force, or it is not a department or section", () => {
    const none = { departmentCode: null, sectionCode: null, costCentreCode: null };
    expect(officerDefaults(null, UNITS, [cc("C1", "D1")])).toEqual(none);
    expect(officerDefaults("", UNITS, [cc("C1", "D1")])).toEqual(none);
    expect(officerDefaults("GONE", UNITS, [cc("C1", "GONE")])).toEqual(none);
    expect(officerDefaults("DIV", UNITS, [cc("C1", "DIV")])).toEqual(none);
  });

  it("fills nothing for a section whose parent is not a department", () => {
    expect(officerDefaults("ODD", UNITS, [cc("C1", "ODD")])).toEqual({ departmentCode: null, sectionCode: null, costCentreCode: null });
  });
});

describe("applying an officer's defaults to the form", () => {
  const empty: PrefillValues = { unit: "", section: "", costCentre: "" };
  const d1s1 = { departmentCode: "D1", sectionCode: "D1-S1", costCentreCode: "C1" };

  it("fills all three into an empty form and records what it set", () => {
    const r = prefillFromOfficer(empty, {}, d1s1);
    expect(r.values).toEqual({ unit: "D1", section: "D1-S1", costCentre: "C1" });
    expect(r.filled).toEqual(["unit", "section", "costCentre"]);
    expect(r.filledBy).toEqual(r.values);
  });

  it("does not fill section or cost centre from another department when the user chose the department", () => {
    const r = prefillFromOfficer({ ...empty, unit: "D2" }, {}, d1s1);
    expect(r.values).toEqual({ unit: "D2", section: "", costCentre: "" });
    expect(r.otherDepartment).toBe(true);
    expect(r.filled).toEqual([]);
  });

  it("keeps what the user chose and says so", () => {
    const mine = { unit: "D1", section: "D1-S2", costCentre: "C7" };
    const r = prefillFromOfficer(mine, {}, d1s1);
    expect(r.values).toEqual(mine);
    expect(r.kept).toEqual(["unit", "section", "costCentre"]);
    expect(r.filled).toEqual([]);
  });

  it("lets a later officer replace what an earlier one filled, and releases a section of the old department", () => {
    const first = prefillFromOfficer(empty, {}, d1s1);
    const r = prefillFromOfficer(first.values, first.filledBy, { departmentCode: "D2", sectionCode: null, costCentreCode: "C9" });
    expect(r.values).toEqual({ unit: "D2", section: "", costCentre: "C9" });
  });

  it("fills the department only, and leaves a cost centre it cannot settle for the user", () => {
    const r = prefillFromOfficer(empty, {}, { departmentCode: "D1", sectionCode: null, costCentreCode: null });
    expect(r.values).toEqual({ unit: "D1", section: "", costCentre: "" });
    expect(r.filled).toEqual(["unit"]);
    expect(r.left).toEqual(["costCentre"]);
  });

  it("clears what an earlier officer filled when this officer's unit gives nothing, never the user's own", () => {
    const first = prefillFromOfficer(empty, {}, d1s1);
    const cleared = prefillFromOfficer(first.values, first.filledBy, { departmentCode: null, sectionCode: null, costCentreCode: null });
    expect(cleared.values).toEqual(empty);
    expect(cleared.gave).toBe(false);
    const mine = prefillFromOfficer({ unit: "D1", section: "", costCentre: "C7" }, {}, { departmentCode: null, sectionCode: null, costCentreCode: null });
    expect(mine.values).toEqual({ unit: "D1", section: "", costCentre: "C7" });
  });
});
