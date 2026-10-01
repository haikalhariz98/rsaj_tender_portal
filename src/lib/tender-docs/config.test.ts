import { describe, expect, it } from "vitest";

import { methodPackFault, partConfigFaults, policyFaults } from "./config";
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
