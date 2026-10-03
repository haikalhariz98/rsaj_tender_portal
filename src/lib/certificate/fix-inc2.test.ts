import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { ANY_CERTIFICATE_FIELD, mergeFields } from "./fields";
import { formNeedFault, formNeeds } from "./form-needs";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";
import { renderIssue } from "./issue";
import { printedBlankFaults, type PrintedField } from "./printed";
import { pinFaults, pinRefusals, pinRevision, type PinContext, type TemplateNow } from "./revision";

/**
 * Increment 2 code review, fix-now: M-1 (a printed field the portal fills is never issued blank) and S-4 (one rule
 * decides "no form" and "no text", BD-614-23).
 */
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const RECEIVED: PrintedField = { key: "date_in", labelEn: "Date in (A)", labelMs: "Tarikh masuk (A)", bound: true, computedKey: "sheet.received", sortOrder: 1 };
const FORM: TemplateNow = { id: "t", code: "c", nameEn: "Form X", nameMs: null, formCode: "", revisionDate: null, bodyVersion: 1, bodyEn: "Contract {{contract.number}}.", bodyMs: null, blocks: INTERIM_BLOCKS, distribution: FIVE_RECIPIENTS, fields: [RECEIVED] };
const CTX: PinContext = { contractDate: "2026-09-30", figures: null };

describe("M-1: a printed field bound to a routing sheet's value", () => {
  it("on a certificate with no routing type: refused at the first signature, naming the field (never pinned to print blank)", () => {
    const fs = pinRefusals(FORM, mergeFields("DELEGATION_LETTER"), fieldsNamed, { ...CTX, routed: false });
    expect(codes(fs)).toEqual(["PRINTED_FIELD_NOT_FILLED"]);
    expect(fs[0].data).toEqual({ form: "Form X", fields: "Date in (A) · Tarikh masuk (A)" });
    expect(codes(pinRefusals(FORM, mergeFields("DELEGATION_LETTER"), fieldsNamed, CTX))).toEqual(["PRINTED_FIELD_NOT_FILLED"]);
  });
  it("on a routed certificate: accepted before its sheet starts; once started, refused while the value is empty, accepted when there", () => {
    expect(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true })).toEqual([]);
    expect(codes(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true, sheet: { "sheet.received": "" } }))).toEqual(["FIELD_NO_VALUE"]);
    expect(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true, sheet: { "sheet.received": "1 September 2026" } })).toEqual([]);
  });
  it("a printed field bound to a value the kind does not fill (a figure no kind lists) is refused too", () => {
    const form = { ...FORM, fields: [{ ...RECEIVED, key: "due", computedKey: "figure.amountDue" }] };
    expect(codes(pinRefusals(form, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true }))).toEqual(["PRINTED_FIELD_NOT_FILLED"]);
  });
  it("at issue, a bound field with nothing to print in either language refuses it; one by hand never does", () => {
    const row = { labelEn: "Date in (A)", labelMs: "Tarikh masuk (A)", bound: true, valueEn: "1 September 2026", valueMs: "1 September 2026" };
    expect(printedBlankFaults("Form X", [row])).toEqual([]);
    expect(codes(printedBlankFaults("Form X", [{ ...row, valueMs: "" }]))).toEqual(["PRINTED_VALUE_EMPTY"]);
    expect(printedBlankFaults("Form X", [{ ...row, bound: false, valueEn: null, valueMs: null }])).toEqual([]);
  });
});

describe("S-4: one rule for no form and no text (formNeedFault)", () => {
  const need = { en: "Notice of termination", ms: "Notis penamatan" };
  it("the pin, the issue and the needs list give the rule's own finding", () => {
    expect(pinFaults(null, ANY_CERTIFICATE_FIELD, fieldsNamed, need)).toEqual([formNeedFault(null, need)]);
    const empty = { ...FORM, bodyEn: " ", fields: [] };
    const f = formNeedFault({ id: "t", nameEn: "Form X", bodyEn: " ", bodyMs: null }, need);
    expect(pinFaults(empty, ANY_CERTIFICATE_FIELD, fieldsNamed)).toContainEqual(f);
    expect(renderIssue({ ...pinRevision(FORM, "2026-10-01"), bodyEn: null }, "INTERIM_PAYMENT", () => ({})).faults).toEqual([f]);
    const needs = formNeeds({ kinds: { INTERIM_PAYMENT: { id: "t", nameEn: "Form X", bodyEn: " ", bodyMs: null } }, delegation: { CONVENTIONAL: { letter: null, notice: null }, DESIGN_AND_BUILD: { letter: null, notice: null } }, sheets: [] });
    expect(needs.find((n) => n.key === "INTERIM_PAYMENT")?.state).toBe("BODY_EMPTY");
  });
  it("form-needs.ts has no second has-text test of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/certificate/form-needs.ts", "utf8");
    expect(src).not.toMatch(/const hasText/);
    expect(src.match(/bodyEn\?\.trim\(\)/g)?.length).toBe(1);
  });
});
