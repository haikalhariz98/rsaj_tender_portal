import { describe, expect, it } from "vitest";

import { requirementFaults } from "./eligibility";
import { composeQualifiers, needFaults, needLabel, requirementAuditWords, type NeedValue } from "./requirement-needs";
import { conditionsFaultText } from "./conditions-labels";

const BODY: { code: string; qualifierLabelEn: string | null } = { code: "board", qualifierLabelEn: "grade and category" };
const v = (o: Partial<NeedValue> & Pick<NeedValue, "id" | "kind" | "code" | "nameEn">): NeedValue => ({ bodyCode: "board", retiredOn: null, ...o });
const VALUES: NeedValue[] = [
  v({ id: "g5", kind: "GRADE", code: "G5", nameEn: "Grade five" }),
  v({ id: "g7", kind: "GRADE", code: "G7", nameEn: "Grade seven" }),
  v({ id: "cb", kind: "CATEGORY", code: "B", nameEn: "Buildings" }),
  v({ id: "cc", kind: "CATEGORY", code: "CE", nameEn: "Civil" }),
  v({ id: "f1", kind: "FIELD_CODE", code: "12", nameEn: "Water" }),
  v({ id: "old", kind: "CATEGORY", code: "Z", nameEn: "Old", retiredOn: "2026-01-01" }),
  v({ id: "other", kind: "CATEGORY", code: "Q", nameEn: "Elsewhere", bodyCode: "another" }),
];
const faults = (c: Parameters<typeof needFaults>[0], body = BODY) => needFaults(c, VALUES, body, "2026-10-09").map((f) => f.code);

describe("needFaults (615-C1)", () => {
  it("none chosen is allowed: words alone are still a requirement", () => {
    expect(faults([])).toEqual([]);
  });
  it("a live value of the body, of the kind it was chosen as, passes", () => {
    expect(faults([{ kind: "GRADE", valueId: "g5" }, { kind: "CATEGORY", valueId: "cb" }, { kind: "CATEGORY", valueId: "cc" }, { kind: "FIELD_CODE", valueId: "f1" }])).toEqual([]);
  });
  it("another body's value, a value of another kind, a retired one and an unknown one are refused", () => {
    expect(faults([{ kind: "CATEGORY", valueId: "other" }])).toEqual(["NEED_NOT_OF_BODY"]);
    expect(faults([{ kind: "FIELD_CODE", valueId: "cb" }])).toEqual(["NEED_KIND_NOT_TAKEN"]);
    expect(faults([{ kind: "CATEGORY", valueId: "old" }])).toEqual(["NEED_RETIRED"]);
    expect(faults([{ kind: "CATEGORY", valueId: "nope" }])).toEqual(["NEED_VALUE_UNKNOWN"]);
  });
  it("a retired value is refused only from the day it retired", () => {
    expect(needFaults([{ kind: "CATEGORY", valueId: "old" }], VALUES, BODY, "2025-12-31")).toEqual([]);
  });
  it("one grade only, and none twice", () => {
    expect(faults([{ kind: "GRADE", valueId: "g5" }, { kind: "GRADE", valueId: "g7" }])).toEqual(["ONE_GRADE_ONLY"]);
    expect(faults([{ kind: "CATEGORY", valueId: "cb" }, { kind: "CATEGORY", valueId: "cb" }])).toEqual(["NEED_TWICE"]);
  });
  it("a body that takes nothing stated with it takes no needs", () => {
    expect(faults([{ kind: "GRADE", valueId: "g5" }], { code: "board", qualifierLabelEn: null })).toEqual(["NEEDS_NOT_TAKEN"]);
  });
  it("every fault has words, and none shows a code on its own", () => {
    for (const c of ["NEED_VALUE_UNKNOWN", "NEED_NOT_OF_BODY", "NEED_KIND_NOT_TAKEN", "NEED_RETIRED", "NEED_TWICE", "ONE_GRADE_ONLY", "NEEDS_NOT_TAKEN"]) {
      const text = conditionsFaultText({ code: c, level: "block", data: { value: "B — Buildings", kind: "CATEGORY" } });
      expect(text, c).not.toMatch(/^A condition of the tender is not met/);
      expect(text).not.toContain(c);
    }
  });
});

describe("composeQualifiers", () => {
  const n = (kind: Parameters<typeof composeQualifiers>[0][number]["kind"], id: string) => ({ kind, label: needLabel(VALUES.find((x) => x.id === id)!) });
  it("reads each need as code — name, in a fixed order", () => {
    expect(composeQualifiers([n("FIELD_CODE", "f1"), n("CATEGORY", "cc"), n("GRADE", "g5"), n("CATEGORY", "cb")])).toBe("minimum grade G5 — Grade five; category, any of CE — Civil or B — Buildings; field code 12 — Water");
  });
  it("nothing chosen composes nothing", () => {
    expect(composeQualifiers([])).toBe("");
  });
});

describe("a body that takes a qualifier is satisfied by needs without typed words (615-C1)", () => {
  const bodies = [{ code: "board", labelEn: "Works board", labelMs: null, qualifierLabelEn: "grade", retiredOn: null }];
  it("refuses empty words unless needs are chosen", () => {
    expect(requirementFaults({ bodyCode: "board", qualifiers: "", alternativeGroup: 1 }, bodies, "2026-10-09").map((f) => f.code)).toEqual(["QUALIFIERS_REQUIRED"]);
    expect(requirementFaults({ bodyCode: "board", qualifiers: "", alternativeGroup: 1, hasNeeds: true }, bodies, "2026-10-09")).toEqual([]);
  });
});

describe("what the trail says of a requirement (review fix: a removal keeps what it asked for)", () => {
  it("says the grade and codes compared, the same words when added and when removed", () => {
    const words = requirementAuditWords({ bodyLabel: "the works board", qualifiers: "own words beside it", needLabels: ["G5 — Grade five", "B — Buildings"], alternativeGroup: 2 });
    expect(words).toEqual({ registrationBody: "the works board", requiredWithIt: "own words beside it", compared: "G5 — Grade five; B — Buildings", alternativeGroup: "Group 2" });
    expect(requirementAuditWords({ bodyLabel: "x", qualifiers: "", needLabels: [], alternativeGroup: 1 })).toMatchObject({ requiredWithIt: null, compared: null });
  });
});
