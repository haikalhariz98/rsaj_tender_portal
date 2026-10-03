import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { ANY_CERTIFICATE_FIELD, fieldNeed, figureField } from "./fields";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";
import { pinRefusals, type PinContext, type TemplateNow } from "./revision";

/**
 * 6.14 inc 1 fix M-2: the first signature refuses a form that could never issue on this certificate. A
 * pinned revision is never edited, and by then the figures and the baseline version are frozen, so a field
 * the text prints with no value at issue would leave the certificate no exit but voiding. Refused at the pin,
 * naming the field: {{certificate.date}} on a form with no dating block; {{contract.date}} where the pinned
 * baseline version holds none; and, by the same rule, a figure the frozen figures do not carry (6.13 fills
 * KIND_FIGURE_KEYS; here a whitelist stands in for it).
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const FORM: TemplateNow = { id: "t", code: "c", nameEn: "Interim certificate", nameMs: null, formCode: "", revisionDate: null, bodyVersion: 1, bodyEn: "Dated {{certificate.date}}. Contract Date {{contract.date}}.", bodyMs: null, blocks: INTERIM_BLOCKS, distribution: FIVE_RECIPIENTS };
const CTX: PinContext = { contractDate: "2026-09-30", figures: null };

describe("M-2: a field the text prints must have its value at issue", () => {
  it("a whole form, every field fillable: pinned", () => {
    expect(pinRefusals(FORM, ANY_CERTIFICATE_FIELD, fieldsNamed, CTX)).toEqual([]);
  });
  it("the certificate's date on a form none of whose blocks dates it: refused", () => {
    const noDating = { ...FORM, blocks: INTERIM_BLOCKS.map((b) => ({ ...b, datesCertificate: false })) };
    const fs = pinRefusals(noDating, ANY_CERTIFICATE_FIELD, fieldsNamed, CTX);
    expect(codes(fs)).toEqual(["DATE_FIELD_NO_DATING_BLOCK"]);
    expect(fs[0].data).toEqual({ form: "Interim certificate" });
    // The same form without the date in its text is fine: it dates nothing and prints nothing.
    expect(pinRefusals({ ...noDating, bodyEn: "Contract Date {{contract.date}}." }, ANY_CERTIFICATE_FIELD, fieldsNamed, CTX)).toEqual([]);
  });
  it("the Contract Date where the pinned baseline version holds none (before execution): refused, named", () => {
    const fs = pinRefusals(FORM, ANY_CERTIFICATE_FIELD, fieldsNamed, { ...CTX, contractDate: null });
    expect(codes(fs)).toEqual(["FIELD_NO_VALUE"]);
    expect(fs[0].data).toEqual({ form: "Interim certificate", fields: "{{contract.date}}" });
  });
  it("a figure field gets the same rule the day its kind lists it: carried with a value, or refused", () => {
    const allowed = new Set([...ANY_CERTIFICATE_FIELD, figureField("amountDue")]);
    const form = { ...FORM, bodyEn: "Due {{figure.amountDue}}." };
    expect(codes(pinRefusals(form, allowed, fieldsNamed, { ...CTX, figures: null }))).toEqual(["FIELD_NO_VALUE"]);
    expect(codes(pinRefusals(form, allowed, fieldsNamed, { ...CTX, figures: [{ key: "amountDue", value: null }] }))).toEqual(["FIELD_NO_VALUE"]);
    expect(codes(pinRefusals(form, allowed, fieldsNamed, { ...CTX, figures: [{ key: "other", value: "1.00" }] }))).toEqual(["FIELD_NO_VALUE"]);
    expect(pinRefusals(form, allowed, fieldsNamed, { ...CTX, figures: [{ key: "amountDue", value: "64000.00" }] })).toEqual([]);
  });
  it("a field the certificate does not fill at all is the unknown-field refusal, once", () => {
    expect(codes(pinRefusals({ ...FORM, bodyEn: "{{figure.amountDue}}" }, ANY_CERTIFICATE_FIELD, fieldsNamed, CTX))).toEqual(["UNKNOWN_FIELDS"]);
  });
  it("both faults at once, in the Malay text too", () => {
    const fs = pinRefusals({ ...FORM, bodyEn: null, bodyMs: "Bertarikh {{certificate.date}}; {{contract.date}}", blocks: [INTERIM_BLOCKS[0]] }, ANY_CERTIFICATE_FIELD, fieldsNamed, { ...CTX, contractDate: null });
    expect(codes(fs)).toEqual(["DATE_FIELD_NO_DATING_BLOCK", "FIELD_NO_VALUE"]);
  });
  it("no form: the form's own refusal only", () => {
    expect(codes(pinRefusals(null, ANY_CERTIFICATE_FIELD, fieldsNamed, CTX))).toEqual(["TEMPLATE_NOT_SET"]);
  });
  it("every merge field has a need", () => {
    for (const k of ANY_CERTIFICATE_FIELD) expect(fieldNeed(k).need, k).toMatch(/^(ALWAYS|DATING_BLOCK|BASELINE|FIGURE)$/);
    expect(fieldNeed("certificate.date")).toEqual({ need: "DATING_BLOCK" });
    expect(fieldNeed("contract.date")).toEqual({ need: "BASELINE", key: "contractDate" });
    expect(fieldNeed("figure.x")).toEqual({ need: "FIGURE", key: "x" });
    expect(fieldNeed("contract.number")).toEqual({ need: "ALWAYS" });
  });
});

describe("M-2: every caller judges the pin by pinRefusals, never the form's own faults alone", () => {
  it("the signature act, the page's blocker and the demo", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
    for (const p of ["src/lib/certificate/write.ts", "src/app/projects/[id]/certificates/[certId]/page.tsx", "prisma/demo-certificates.ts"]) {
      expect(read(p), p).toMatch(/pinRefusals\(/);
      expect(read(p), p).not.toMatch(/\bpinFaults\(/);
    }
  });
});
