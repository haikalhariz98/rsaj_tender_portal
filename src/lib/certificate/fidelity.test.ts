import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { ANY_CERTIFICATE_FIELD, mergeFields } from "./fields";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";
import { renderIssue, renderText } from "./issue";
import { fidelityLine, type PrintedField } from "./printed";
import { pinFaults, pinRefusals, pinRevision, readRevision, type TemplateNow } from "./revision";
import type { Term } from "./terms";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/// Fixture rows only (FR-CRT-010, 011): the product ships no correction, term or printed field.
const DLP: Term = { code: "dlp", canonicalEn: "Defects Liability Period", canonicalMs: "Tempoh Liabiliti Kecacatan", aliases: ["Tempoh Tanggungan Kecacatan"] };
const NUMBER: PrintedField = { key: "contract_no", labelEn: "Contract No.", labelMs: "No. Kontrak", bound: true, computedKey: "contract.number", sortOrder: 1 };
const FORM: TemplateNow = {
  id: "tpl",
  code: "interim",
  nameEn: "Interim certificate (fixture)",
  nameMs: null,
  formCode: "FX-1",
  revisionDate: "2025-06-01",
  bodyVersion: 3,
  bodyEn: "INTERIM CERTICATE {{contract.number}}. {{term:dlp}} applies.",
  bodyMs: "PERAKUAN INTERIM {{contract.number}}. {{term:dlp}} terpakai.",
  blocks: [INTERIM_BLOCKS[0], INTERIM_BLOCKS[1]],
  distribution: FIVE_RECIPIENTS,
  pageCount: 2,
  fields: [NUMBER],
  corrections: [{ fromText: "CERTICATE", toText: "CERTIFICATE" }],
  terms: [DLP, { code: "unused", canonicalEn: "Unused", canonicalMs: null, aliases: [] }],
};
const values = (lang: "EN" | "MS") => ({ "contract.number": "DEMO/KP/T/005/2026", "certificate.kind": lang });

describe("the pinned form carries its printed form, corrections and terms (OD-2 A)", () => {
  const rev = pinRevision(FORM, "2026-10-03");
  it("pins the page count, the printed fields, the corrections and only the terms its text cites", () => {
    expect(rev.pageCount).toBe(2);
    expect(rev.fields).toEqual([NUMBER]);
    expect(rev.corrections).toEqual([{ fromText: "CERTICATE", toText: "CERTIFICATE" }]);
    expect(rev.terms).toEqual([{ code: "dlp", en: "Defects Liability Period", ms: "Tempoh Liabiliti Kecacatan" }]);
    expect(readRevision(JSON.parse(JSON.stringify(rev)))).toEqual(rev);
  });
  it("a correction or a term changed after the pin never reaches the text signed under (both orders)", () => {
    const form = { ...FORM, corrections: [...FORM.corrections!], terms: [...FORM.terms!] };
    const pinned = pinRevision(form, "2026-10-03");
    form.corrections.push({ fromText: "applies", toText: "APPLIES" });
    form.terms[0] = { ...DLP, canonicalEn: "DLP" };
    const issued = renderIssue(pinned, "INTERIM_PAYMENT", values);
    expect(issued.texts.find((t) => t.language === "EN")!.text).toBe("INTERIM CERTIFICATE DEMO/KP/T/005/2026. Defects Liability Period applies.");
    // The other order: a draft (nothing pinned yet) follows the form as it stands.
    const draft = pinRevision(form, "2026-10-04");
    expect(renderIssue(draft, "INTERIM_PAYMENT", values).texts.find((t) => t.language === "EN")!.text).toBe("INTERIM CERTIFICATE DEMO/KP/T/005/2026. DLP APPLIES.");
  });
  it("a form pinned before increment 2 (no such keys) reads as none: its text renders as written", () => {
    const old = { ...rev } as Record<string, unknown>;
    delete old.pageCount;
    delete old.fields;
    delete old.corrections;
    delete old.terms;
    const r = readRevision(JSON.parse(JSON.stringify({ ...old, bodyEn: "INTERIM CERTICATE {{contract.number}}.", bodyMs: null })))!;
    const out = renderIssue(r, "INTERIM_PAYMENT", values);
    expect(out.faults).toEqual([]);
    expect(out.texts).toEqual([{ language: "EN", text: "INTERIM CERTICATE DEMO/KP/T/005/2026." }]);
    expect(out.corrected).toBe(0);
  });
});

describe("worked example (FR-CRT-010): CERTICATE reads CERTIFICATE, the form code and revision unchanged", () => {
  it("the issued text is corrected, the fidelity line names the same form code and revision and says a correction was applied", () => {
    const rev = pinRevision(FORM, "2026-10-03");
    const r = renderIssue(rev, "INTERIM_PAYMENT", values);
    expect(r.faults).toEqual([]);
    // Founder, 2026-10-20: a new certificate is English only. The form's stored Malay text is not issued.
    expect(r.texts).toEqual([{ language: "EN", text: "INTERIM CERTIFICATE DEMO/KP/T/005/2026. Defects Liability Period applies." }]);
    expect(r.corrected).toBe(1);
    expect(fidelityLine({ name: rev.nameEn, formCode: rev.formCode, revisionDate: rev.revisionDate, pageCount: rev.pageCount ?? null, bodyVersion: rev.bodyVersion }, r.corrected).en).toBe("Interim certificate (fixture) · FX-1 · revision 01 Jun 2025 · 2 pages · form version 3 · 1 typing correction applied, form code and revision unchanged");
  });
  it("the page's preview renders through the same function, so the screen and the issue never word a text apart", () => {
    const rev = pinRevision(FORM, "2026-10-03");
    const issued = renderIssue(rev, "INTERIM_PAYMENT", values).texts.find((t) => t.language === "EN")!.text;
    const preview = renderText(rev.bodyEn!, "EN", "INTERIM_PAYMENT", values("EN"), rev.corrections!, rev.terms!);
    expect(preview.paragraphs.join("\n\n")).toBe(issued);
  });
});

describe("the first signature refuses a form whose terms or printed fields could not be filled", () => {
  it("a cited term not configured: refused, named; configured: pinned", () => {
    expect(pinFaults(FORM, ANY_CERTIFICATE_FIELD, fieldsNamed)).toEqual([]);
    const fs = pinFaults({ ...FORM, terms: [] }, ANY_CERTIFICATE_FIELD, fieldsNamed);
    expect(codes(fs)).toEqual(["UNKNOWN_TERM"]);
    expect(fs[0].data).toEqual({ form: "Interim certificate (fixture)", terms: "dlp" });
  });
  it("a term with no English wording: refused; one with no Malay wording is not (founder, 2026-10-20: English only)", () => {
    expect(codes(pinFaults({ ...FORM, terms: [{ ...DLP, canonicalEn: null }] }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["TERM_NO_WORDING"]);
    expect(codes(pinFaults({ ...FORM, terms: [{ ...DLP, canonicalMs: null }] }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual([]);
  });
  it("a printed field bound to the Contract Date, before the baseline holds one: refused as a field the text names would be (M-2)", () => {
    const form = { ...FORM, fields: [{ ...NUMBER, key: "cdate", computedKey: "contract.date" }] };
    expect(codes(pinRefusals(form, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { contractDate: null, figures: null }))).toEqual(["FIELD_NO_VALUE"]);
    expect(pinRefusals(form, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { contractDate: "2026-09-30", figures: null })).toEqual([]);
  });
});
