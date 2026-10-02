import { describe, expect, it } from "vitest";

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
});
