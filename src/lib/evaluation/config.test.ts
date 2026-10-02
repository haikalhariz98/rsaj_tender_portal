import { describe, expect, it } from "vitest";

import { aspectConfigOf, contentOf, decimalField, draftFault, newVersionFault, nextVersion, parentFault, retireFault, type ModelRows } from "./config";
import { modelFindingText } from "./labels";
import { modelFaults, modelSnapshot } from "./model";

/**
 * Configuration › Evaluation models, the pure half (6.8 plan §4 item 10). A draft is the only thing
 * edited; an issue freezes the rows as the content `modelFaults` judged; a figure is typed to four
 * places and judged against its range at the edge, both ways.
 */

const dec = (s: string) => ({ toString: () => s });
const stage = (over: Partial<ModelRows["stages"][number]> = {}): ModelRows["stages"][number] => ({
  order: 1,
  code: "tech",
  labelEn: "Technical",
  labelMs: null,
  kind: "SCORED",
  side: "IMPLEMENTING_DEPARTMENT",
  unlocksAfterOrder: null,
  maxMarks: dec("100"),
  passMark: dec("65.5"),
  passInclusive: true,
  mustPass: true,
  compositeWeight: null,
  committeeCode: null,
  shortlistRule: null,
  shortlistMin: null,
  shortlistMax: null,
  shortlistOfficeCode: null,
  capitalBase: null,
  provenance: "ASSUMED",
  governingSource: "",
  criteria: [
    { id: "g", parentId: null, order: 2, code: "grp", labelEn: "Experience", labelMs: null, maxMarks: dec("60"), scale: "ENTERED_MARKS", computedInput: "NONE", bandSetCode: null, needsNamedContractor: false, provenance: "ASSUMED" },
    { id: "a", parentId: "g", order: 3, code: "a", labelEn: "Projects", labelMs: null, maxMarks: dec("60"), scale: "ENTERED_MARKS", computedInput: "NONE", bandSetCode: null, needsNamedContractor: false, provenance: "ASSUMED" },
    { id: "b", parentId: null, order: 1, code: "b", labelEn: "Method", labelMs: null, maxMarks: dec("40.0000"), scale: "ENTERED_MARKS", computedInput: "NONE", bandSetCode: null, needsNamedContractor: false, provenance: "ASSUMED" },
  ],
  factorOptions: [],
  ...over,
});
const rows = (stages = [stage(), { ...stage({ order: 2, code: "rec", labelEn: "Recommendation", kind: "RECOMMENDATION", maxMarks: null, passMark: null, passInclusive: null, mustPass: null, criteria: [] }) }]): ModelRows => ({ code: "m", version: 1, nameEn: "Model", nameMs: null, route: "TRADITIONAL", provenance: "ASSUMED", governingSource: "", stages, bandSets: [] });

describe("rows → the content an issue freezes (contentOf)", () => {
  it("decimals become four-place strings, criteria are ordered, a group is named by its code", () => {
    const c = contentOf(rows());
    expect(c.stages[0].passMark).toBe("65.5000");
    expect(c.stages[0].criteria.map((x) => x.code)).toEqual(["b", "grp", "a"]);
    expect(c.stages[0].criteria.find((x) => x.code === "a")!.parentCode).toBe("grp");
    expect(c.stages[0].criteria.find((x) => x.code === "b")!.maxMarks).toBe("40.0000");
  });
  it("stages are ordered by order, whatever order the rows came in", () => {
    const [a, b] = rows().stages;
    expect(contentOf(rows([b, a])).stages.map((s) => s.code)).toEqual(["tech", "rec"]);
  });
  it("a well-formed draft has no faults, and what an issue freezes is what was judged", () => {
    const c = contentOf(rows());
    expect(modelFaults(c, []).filter((f) => f.level === "block")).toEqual([]);
    const snap = modelSnapshot("id1", c, [], new Date("2026-10-02T03:00:00Z"));
    expect(snap.stages).toEqual(c.stages);
    expect(snap.issuedAt).toBe("2026-10-02T03:00:00.000Z");
  });
});

describe("a typed decimal (decimalField)", () => {
  it("empty is not set; four places at most; commas tolerated", () => {
    expect(decimalField("")).toEqual({ value: null });
    expect(decimalField(" 12.5 ")).toEqual({ value: "12.5000" });
    expect(decimalField("1,000.25")).toEqual({ value: "1000.2500" });
    expect(decimalField("1.23456")).toEqual({ fault: "NOT_A_DECIMAL" });
    expect(decimalField("abc")).toEqual({ fault: "NOT_A_DECIMAL" });
  });
  it("the range's edges, both ways: inclusive by default, exclusive where asked", () => {
    expect(decimalField("0", { min: 0, max: 100 })).toEqual({ value: "0.0000" });
    expect(decimalField("100", { min: 0, max: 100 })).toEqual({ value: "100.0000" });
    expect(decimalField("100.0001", { min: 0, max: 100 })).toEqual({ fault: "OUT_OF_RANGE" });
    expect(decimalField("-0.0001", { min: 0 })).toEqual({ fault: "OUT_OF_RANGE" });
    expect(decimalField("0", { min: 0, minExclusive: true })).toEqual({ fault: "OUT_OF_RANGE" });
    expect(decimalField("0.0001", { min: 0, minExclusive: true })).toEqual({ value: "0.0001" });
  });
});

describe("the lifecycle", () => {
  it("only a draft is edited", () => {
    expect(draftFault("DRAFT")).toBeNull();
    expect(draftFault("ISSUED")).toBe("MODEL_NOT_DRAFT");
    expect(draftFault("RETIRED")).toBe("MODEL_NOT_DRAFT");
  });
  it("a new version is refused while a draft is open, and numbers after the highest", () => {
    expect(newVersionFault([{ status: "ISSUED" }, { status: "RETIRED" }])).toBeNull();
    expect(newVersionFault([{ status: "ISSUED" }, { status: "DRAFT" }])).toBe("DRAFT_EXISTS");
    expect(nextVersion([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(4);
    expect(nextVersion([])).toBe(1);
  });
  it("only an issued version is retired", () => {
    expect(retireFault("ISSUED")).toBeNull();
    expect(retireFault("DRAFT")).toBe("NOT_ISSUED");
    expect(retireFault("RETIRED")).toBe("NOT_ISSUED");
  });
});

describe("a criterion's group (parentFault)", () => {
  const tree = [{ code: "grp", parentCode: null }, { code: "a", parentCode: "grp" }, { code: "b", parentCode: null }];
  it("none, or a top-level criterion of the stage", () => {
    expect(parentFault(tree, null, "a")).toBeNull();
    expect(parentFault(tree, "grp", "b")).toBeNull();
  });
  it("unknown, itself, a criterion inside a group, or a group being put in a group: refused", () => {
    expect(parentFault(tree, "zzz", "b")).toBe("PARENT_UNKNOWN");
    expect(parentFault(tree, "b", "b")).toBe("PARENT_UNKNOWN");
    expect(parentFault(tree, "a", "b")).toBe("PARENT_NESTED");
    expect(parentFault(tree, "b", "grp")).toBe("PARENT_NESTED");
  });
});

describe("aspects as the issue reads them", () => {
  it("retired from a day on or before now is retired; a future retirement is not yet", () => {
    const now = new Date("2026-10-02T00:00:00Z");
    const a = (retiredOn: Date | null) => ({ code: "c", kind: "COMPLETENESS" as const, labelEn: "C", labelMs: null, requiredOnRoute: "TRADITIONAL" as const, provenance: "ASSUMED" as const, retiredOn });
    expect(aspectConfigOf([a(null), a(now), a(new Date("2026-10-03T00:00:00Z"))], now).map((x) => x.retired)).toEqual([false, true, false]);
  });
});

describe("configuration's words for a draft's findings", () => {
  it("a pass rule not set on a draft is set there (never the frozen-rule exit)", () => {
    const t = modelFindingText({ code: "PASS_RULE_NOT_SET", level: "block", data: { stage: "Technical" } });
    expect(t).toBe("Technical: whether a figure exactly on the pass mark passes is not set.");
    expect(t).not.toMatch(/cancel/);
  });
  it("a draft with no recommendation stage is told so (not the report's 'form it first')", () => {
    expect(modelFindingText({ code: "RECOMMENDATION_MISSING", level: "block" })).toMatch(/no recommendation stage/);
  });
  it("a draft judged with its pass rule unset reads in configuration's words", () => {
    const c = contentOf(rows([stage({ passInclusive: null }), rows().stages[1]]));
    const f = modelFaults(c, []).find((x) => x.code === "PASS_RULE_NOT_SET")!;
    expect(modelFindingText(f)).toMatch(/^Technical: /);
  });
});
