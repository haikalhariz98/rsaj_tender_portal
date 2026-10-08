import { describe, expect, it } from "vitest";

import { bytesOfMegabytes, declarationTextErrors, megabytesOfBytes, registrationSettingErrors, type RegistrationSettingsInput } from "./registration-settings";

const blank: RegistrationSettingsInput = { helpEmail: null, helpPhone: null, helpProvenance: null, maxFiles: null, maxMegabytes: null, uploadLimitProvenance: null, uploadClassId: null, statementClassId: null, uploadClassProvenance: null, onlineDeclarationReplacesPaper: null, onlineDeclarationProvenance: null };
const classes = [
  { id: "c1", classification: "INTERNAL" },
  { id: "c2", classification: "SULIT" },
  { id: "c3", classification: null },
];
const errs = (v: Partial<RegistrationSettingsInput>) => registrationSettingErrors({ ...blank, ...v }, { classes }).map((e) => e.field);

describe("registration settings", () => {
  it("accepts everything left not set", () => expect(errs({})).toEqual([]));
  it("asks where a help contact comes from", () => expect(errs({ helpEmail: "a@b.org" })).toEqual(["helpProvenance"]));
  it("refuses a malformed email", () => expect(errs({ helpEmail: "nope", helpProvenance: "STATED" })).toEqual(["helpEmail"]));
  it("takes the two limits together", () => {
    expect(errs({ maxFiles: 5, uploadLimitProvenance: "ASSUMED" })).toEqual(["maxMegabytes"]);
    expect(errs({ maxMegabytes: 5, uploadLimitProvenance: "ASSUMED" })).toEqual(["maxFiles"]);
    expect(errs({ maxFiles: 5, maxMegabytes: 20 })).toEqual(["uploadLimitProvenance"]);
    expect(errs({ maxFiles: 5, maxMegabytes: 20, uploadLimitProvenance: "ASSUMED" })).toEqual([]);
  });
  it("refuses nonsense limits", () => {
    expect(errs({ maxFiles: 0, maxMegabytes: 20, uploadLimitProvenance: "STATED" })).toEqual(["maxFiles"]);
    expect(errs({ maxFiles: 5, maxMegabytes: 99999, uploadLimitProvenance: "STATED" })).toEqual(["maxMegabytes"]);
  });
  it("requires the statement class to be SULIT, and an unclassified one is not enough", () => {
    expect(errs({ statementClassId: "c1", uploadClassProvenance: "STATED" })).toEqual(["statementClassId"]);
    expect(errs({ statementClassId: "c3", uploadClassProvenance: "STATED" })).toEqual(["statementClassId"]);
    expect(errs({ statementClassId: "c2", uploadClassId: "c1", uploadClassProvenance: "STATED" })).toEqual([]);
    expect(errs({ statementClassId: "gone", uploadClassProvenance: "STATED" })).toEqual(["statementClassId"]);
  });
  it("asks where the online-declaration ruling comes from", () => expect(errs({ onlineDeclarationReplacesPaper: false })).toEqual(["onlineDeclarationProvenance"]));
  it("converts megabytes without rounding the stored figure down", () => {
    expect(bytesOfMegabytes(10)).toBe(BigInt(10485760));
    expect(bytesOfMegabytes(null)).toBeNull();
    expect(megabytesOfBytes(BigInt(10485760))).toBe(10);
    expect(megabytesOfBytes(BigInt(10485761))).toBe(11);
  });
});

describe("declaration text", () => {
  const kinds = ["GIRO_AUTHORISATION", "FALSE_DECLARATION"];
  it("needs a kind, wording and a provenance", () => {
    expect(declarationTextErrors({ kind: null, bodyEn: " ", bodyMs: null, provenance: null }, kinds).map((e) => e.field)).toEqual(["kind", "bodyEn", "provenance"]);
    expect(declarationTextErrors({ kind: "FALSE_DECLARATION", bodyEn: "x", bodyMs: null, provenance: "ASSUMED" }, kinds)).toEqual([]);
    expect(declarationTextErrors({ kind: "OTHER", bodyEn: "x", bodyMs: null, provenance: "ASSUMED" }, kinds).map((e) => e.field)).toEqual(["kind"]);
  });
});
