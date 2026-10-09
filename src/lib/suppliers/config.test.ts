import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { documentTypeFaults, listValueFaults, valueFaults, type ValueInput } from "./config";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const grade: ValueInput = { kind: "GRADE", code: "G5", nameEn: "Grade 5", parentCode: null, rank: 5, valueCeiling: "5000000.00", ceilingProvenance: "ASSUMED", provenance: "ASSUMED" };
const ctx = { bodyExists: true, codeTaken: false, categoryCodes: ["CIVIL"], gradeRanks: [1, 2, 3, 4] };

describe("registration values (FR-VND-003)", () => {
  it("a grade takes a rank and a ceiling with its provenance", () => {
    expect(valueFaults(grade, ctx)).toEqual([]);
  });

  it("the rank is configuration, unique in the body's grades, a whole number from 1", () => {
    expect(codes(valueFaults({ ...grade, rank: 4 }, ctx))).toEqual(["RANK_TAKEN"]);
    expect(codes(valueFaults({ ...grade, rank: 0 }, ctx))).toEqual(["RANK_NOT_VALID"]);
    expect(codes(valueFaults({ ...grade, kind: "CATEGORY", valueCeiling: null }, ctx))).toEqual(["RANK_ONLY_FOR_GRADE"]);
  });

  it("a ceiling only on a grade, an amount above nothing, with where it comes from", () => {
    expect(codes(valueFaults({ ...grade, valueCeiling: "0" }, ctx))).toEqual(["CEILING_NOT_VALID"]);
    expect(codes(valueFaults({ ...grade, valueCeiling: "1.005" }, ctx))).toEqual(["CEILING_NOT_VALID"]);
    expect(codes(valueFaults({ ...grade, ceilingProvenance: null }, ctx))).toEqual(["CEILING_PROVENANCE_REQUIRED"]);
    expect(codes(valueFaults({ ...grade, kind: "CLASS", rank: null }, ctx))).toEqual(["CEILING_ONLY_FOR_GRADE"]);
  });

  it("a specialisation sits under one of the body's categories; nothing else takes a parent", () => {
    const spec = { ...grade, kind: "SPECIALISATION" as const, rank: null, valueCeiling: null, parentCode: "CIVIL" };
    expect(valueFaults(spec, ctx)).toEqual([]);
    expect(codes(valueFaults({ ...spec, parentCode: "NOPE" }, ctx))).toEqual(["PARENT_NOT_CATEGORY"]);
    expect(codes(valueFaults({ ...grade, parentCode: "CIVIL" }, ctx))).toEqual(["PARENT_ONLY_FOR_SPECIALISATION"]);
  });

  it("names, codes, kinds and provenance are required; codes unique; the body configured", () => {
    expect(codes(valueFaults({ ...grade, kind: null, code: "", nameEn: "", provenance: null, rank: null, valueCeiling: null }, ctx))).toEqual(["VALUE_KIND_REQUIRED", "CODE_REQUIRED", "NAME_REQUIRED", "PROVENANCE_REQUIRED"]);
    expect(codes(valueFaults(grade, { ...ctx, codeTaken: true }))).toEqual(["CODE_TAKEN"]);
    expect(codes(valueFaults(grade, { ...ctx, bodyExists: false }))).toEqual(["BODY_NOT_CONFIGURED"]);
  });
});

describe("document types (FR-VND-002)", () => {
  it("values only of a body the type names", () => {
    expect(documentTypeFaults({ code: "works", nameEn: "Works certificate", bodyId: "b", valueKinds: ["GRADE"], provenance: "ASSUMED" }, { codeTaken: false, bodyExists: true })).toEqual([]);
    expect(codes(documentTypeFaults({ code: "x", nameEn: "X", bodyId: null, valueKinds: ["GRADE"], provenance: "ASSUMED" }, { codeTaken: false, bodyExists: false }))).toEqual(["KINDS_WITHOUT_BODY"]);
  });
});

describe("the register's lists", () => {
  it("an entry needs a code, a name and its provenance", () => {
    expect(listValueFaults({ code: "MY", nameEn: "Malaysia", provenance: "ASSUMED" }, { codeTaken: false, kindListed: true })).toEqual([]);
    expect(codes(listValueFaults({ code: "", nameEn: "", provenance: null }, { codeTaken: false, kindListed: false }))).toEqual(["KIND_NOT_LISTED", "CODE_REQUIRED", "NAME_REQUIRED", "PROVENANCE_REQUIRED"]);
  });

  it("a dial code belongs to a country: a plus sign and up to six digits, and nowhere else (Phase 4a)", () => {
    const ok = { code: "MY", nameEn: "Malaysia", provenance: "ASSUMED" };
    const ctx = { codeTaken: false, kindListed: true, list: "COUNTRY" };
    expect(listValueFaults({ ...ok, callingCode: "+60" }, ctx)).toEqual([]);
    expect(listValueFaults({ ...ok, callingCode: "+1684" }, ctx)).toEqual([]);
    expect(listValueFaults({ ...ok, callingCode: null }, ctx)).toEqual([]);
    for (const bad of ["60", "+", "+0", "+60 1", "+1234567", "+6A", " +60"]) expect(codes(listValueFaults({ ...ok, callingCode: bad }, ctx)), bad).toEqual(["CALLING_CODE_NOT_VALID"]);
    expect(codes(listValueFaults({ ...ok, callingCode: "+60" }, { ...ctx, list: "STATE" }))).toEqual(["CALLING_CODE_ONLY_FOR_COUNTRY"]);
    expect(codes(listValueFaults({ ...ok, callingCode: "+60" }, { ...ctx, list: "ENTITY_TYPE" }))).toEqual(["CALLING_CODE_ONLY_FOR_COUNTRY"]);
    // The words exist in both languages, and name no code.
    expect(supplierFaultText({ code: "CALLING_CODE_NOT_VALID", level: "block" }, "ms")).toMatch(/Kod dailan/);
  });
});

describe("a grade's rank does not move while a frozen requirement is compared by it (615-C1, review fix)", () => {
  const grade = { kind: "GRADE" as const, code: "G4", nameEn: "Grade four", parentCode: null, rank: 5, valueCeiling: null, ceilingProvenance: null, provenance: "ASSUMED" };
  const ctx = { bodyExists: true, codeTaken: false, categoryCodes: [], gradeRanks: [] as number[] };
  it("refuses a change of rank, and the clearing of one, naming the exercises", () => {
    const held = { was: 4, byExercises: ["DEMO/SX/0018/2026", "DEMO/SX/0020/2026"] };
    const fs = valueFaults(grade, { ...ctx, rankHeld: held });
    expect(codes(fs)).toEqual(["RANK_HELD"]);
    expect(supplierFaultText(fs[0]!)).toContain("DEMO/SX/0018/2026, DEMO/SX/0020/2026");
    expect(supplierFaultText(fs[0]!, "ms")).toContain("DEMO/SX/0018/2026");
    expect(codes(valueFaults({ ...grade, rank: null }, { ...ctx, rankHeld: held }))).toEqual(["RANK_HELD"]);
    expect(codes(valueFaults({ ...grade, rank: 4 }, { ...ctx, rankHeld: { ...held, was: null } }))).toEqual(["RANK_HELD"]);
  });
  it("lets the rank stand as it is, and any other change, and a rank when nothing is held", () => {
    expect(valueFaults(grade, { ...ctx, rankHeld: { was: 5, byExercises: ["X"] } })).toEqual([]);
    expect(valueFaults(grade, { ...ctx, rankHeld: { was: 4, byExercises: [] } })).toEqual([]);
    expect(valueFaults(grade, ctx)).toEqual([]);
  });
});
