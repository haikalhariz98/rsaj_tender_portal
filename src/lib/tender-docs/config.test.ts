import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { configHoldingWorkBack, methodPackFault, partConfigFaults, partRetiredOn, policyFaults } from "./config";
import { SK001_TENDER_PARTS } from "./sk001-fixture";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const base = { ...SK001_TENDER_PARTS[1], code: "new_part" };
const ctx = { others: SK001_TENDER_PARTS.map((p, i) => ({ ...p, id: `id${i}` })), bases: ["bq", "ds"], templates: ["form_of_tender", "jkr203a"], units: ["CP"], today: "2026-10-01" };

describe("a configured part, as saved", () => {
  it("a second live part of a role at the same reach is refused; a different basis, OTHER or a retired one is not", () => {
    expect(codes(partConfigFaults(base, ctx))).toEqual(["ROLE_TAKEN"]);
    expect(partConfigFaults({ ...base, contractBasisCode: "bq" }, ctx)).toEqual([]);
    expect(partConfigFaults({ ...base, role: "OTHER" }, ctx)).toEqual([]);
    expect(partConfigFaults(base, { ...ctx, others: ctx.others.map((o) => (o.role === "FORM_OF_TENDER" ? { ...o, retiredOn: "2026-10-01" } : o)) })).toEqual([]);
    // Editing the row itself is not a clash with itself.
    expect(partConfigFaults({ ...SK001_TENDER_PARTS[1], id: "id1" }, ctx)).toEqual([]);
  });
  it("a template only on a library part, never on a bespoke one, and only one configured", () => {
    const other = { ...base, role: "OTHER" as const };
    expect(codes(partConfigFaults({ ...other, source: "UPLOAD", templateCode: "form_of_tender" }, ctx))).toEqual(["TEMPLATE_FOR_SOURCE"]);
    expect(codes(partConfigFaults({ ...other, content: "BESPOKE", templateCode: "form_of_tender" }, ctx))).toEqual(["TEMPLATE_FOR_BESPOKE"]);
    expect(codes(partConfigFaults({ ...other, templateCode: "gone" }, ctx))).toEqual(["TEMPLATE_UNKNOWN"]);
  });
  it("code, label, number, basis and office", () => {
    const other = { ...base, role: "OTHER" as const };
    expect(codes(partConfigFaults({ ...other, code: "Bad Code" }, ctx))).toEqual(["CODE_REQUIRED"]);
    expect(codes(partConfigFaults({ ...other, code: "t01" }, ctx))).toEqual(["CODE_TAKEN"]);
    expect(codes(partConfigFaults({ ...other, labelEn: " ", printedNumber: "" }, ctx))).toEqual(["LABEL_REQUIRED", "NUMBER_REQUIRED"]);
    expect(codes(partConfigFaults({ ...other, contractBasisCode: "turnkey" }, ctx))).toEqual(["BASIS_UNKNOWN"]);
    expect(codes(partConfigFaults({ ...other, ownerOrgUnitCode: "XX" }, ctx))).toEqual(["UNIT_UNKNOWN"]);
  });
});

describe("the policy, as saved", () => {
  const none = { ladDailyPct: null, ladDailyPctProvenance: null, firstCertificateFloor: null, firstCertificatePct: null, firstCertificateProvenance: null, insuranceExtraMonths: null, insuranceExtraDays: null, insuranceExtraProvenance: null, dbInsuranceExtraMonths: null, dbInsuranceExtraDays: null, dbInsuranceExtraProvenance: null };
  it("nothing set is valid: not set is a state, never a default", () => {
    expect(policyFaults(none)).toEqual([]);
  });
  it("a value needs its provenance; a pair is whole or absent", () => {
    expect(codes(policyFaults({ ...none, ladDailyPct: "0.025" }))).toEqual(["PROVENANCE_REQUIRED"]);
    expect(policyFaults({ ...none, ladDailyPct: "0.025", ladDailyPctProvenance: "ASSUMED" })).toEqual([]);
    expect(codes(policyFaults({ ...none, firstCertificateFloor: "1000.00", firstCertificateProvenance: "ASSUMED" }))).toEqual(["PAIR_INCOMPLETE"]);
    expect(codes(policyFaults({ ...none, insuranceExtraMonths: 3, insuranceExtraProvenance: "ASSUMED" }))).toEqual(["PAIR_INCOMPLETE"]);
    expect(policyFaults({ ...none, insuranceExtraMonths: 3, insuranceExtraDays: 14, insuranceExtraProvenance: "ASSUMED" })).toEqual([]);
    expect(codes(policyFaults({ ...none, ladDailyPct: "0.0250001", ladDailyPctProvenance: "ASSUMED" }))).toEqual(["PCT_NOT_VALID"]);
  });
  it("a method's document pack needs where the answer comes from", () => {
    expect(methodPackFault("TENDER", null)?.code).toBe("PROVENANCE_REQUIRED");
    expect(methodPackFault("TENDER", "ASSUMED")).toBeNull();
    expect(methodPackFault(null, null)).toBeNull();
  });
});

describe("retirement and the header count, on the organisation's day (carry b)", () => {
  it("retired from the day itself or earlier; a later day is still live", () => {
    expect(partRetiredOn(null, "2026-10-01")).toBe(false);
    expect(partRetiredOn("2026-10-01", "2026-10-01")).toBe(true);
    expect(partRetiredOn("2026-09-30", "2026-10-01")).toBe(true);
    expect(partRetiredOn("2026-10-02", "2026-10-01")).toBe(false);
  });
  it("07:30 in Kuala Lumpur on 1 October is still 30 September in UTC: the organisation's day decides", () => {
    // The caller passes todayIn(now, zone); UTC's day would read the part as still live.
    expect(partRetiredOn("2026-10-01", "2026-10-01")).toBe(true);
    expect(partRetiredOn("2026-10-01", "2026-09-30")).toBe(false);
  });
  it("with the time zone unset a part with a retirement day is not judged, never guessed", () => {
    expect(partRetiredOn("2026-10-01", null)).toBeNull();
    expect(partRetiredOn(null, null)).toBe(false);
  });
  it("counts methods with no pack set and live parts with mandatory not set; a part not judged counts", () => {
    const methods = [{ retired: false, documentPackKind: null }, { retired: true, documentPackKind: null }, { retired: false, documentPackKind: "TENDER" }];
    const parts = [
      { retiredOn: null, mandatory: null },
      { retiredOn: "2026-10-01", mandatory: null },
      { retiredOn: "2026-10-02", mandatory: null },
      { retiredOn: null, mandatory: true },
    ];
    expect(configHoldingWorkBack(methods, parts, "2026-10-01")).toBe(1 + 2);
    expect(configHoldingWorkBack(methods, parts, "2026-09-30")).toBe(1 + 3);
    expect(configHoldingWorkBack(methods, parts, null)).toBe(1 + 3);
  });
  it("a part whose place in the Tender Table Document is not set holds submission back, like its mandatory flag (U3)", () => {
    const parts = [
      { retiredOn: null, mandatory: true, inTableDocument: null },
      { retiredOn: null, mandatory: null, inTableDocument: null },
      { retiredOn: null, mandatory: true, inTableDocument: false },
      { retiredOn: "2026-09-01", mandatory: true, inTableDocument: null },
    ];
    expect(configHoldingWorkBack([], parts, "2026-10-01")).toBe(1 + 2);
  });
  it("the screen and the restore act read the organisation's day, never UTC's, and the act blocks when it is unset", () => {
    const read = readFileSync(join(process.cwd(), "src/lib/tender-docs/read.ts"), "utf8");
    const config = read.slice(read.indexOf("export async function tenderDocsConfig"));
    expect(config).toMatch(/todayIn\(new Date\(\), org\.timeZone\)/);
    expect(config).not.toMatch(/storedDay\(new Date\(\)\)/);
    expect(config).toMatch(/configHoldingWorkBack\(/);
    const acts = readFileSync(join(process.cwd(), "src/app/configuration/tender-documents/core.ts"), "utf8");
    const restore = acts.slice(acts.indexOf("export async function restoreTenderPart"), acts.indexOf("// ---", acts.indexOf("export async function restoreTenderPart")));
    expect(restore).toMatch(/if \(!today\) return RESTORE_NO_ZONE;/);
    expect(restore).not.toMatch(/storedDay\(new Date\(\)\)/);
    expect(acts).toMatch(/RESTORE_NO_ZONE: FormState = \{ ok: false, message: "The organisation's time zone is not set,[^"]*Set it under Configuration, Organisation/);
  });
});
