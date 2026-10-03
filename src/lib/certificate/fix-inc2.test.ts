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
    // Residual M-1: the sheet carries whether its route is approved and its values in both languages; the day received
    // is due once approved, and its refusal is the sheet value's own (SHEET_VALUE_EMPTY), not FIELD_NO_VALUE.
    const started = (received: string) => ({ state: "STARTED" as const, decided: true, typeLabel: "Interim sheet", target: "SET", values: { EN: { "sheet.received": received }, MS: { "sheet.received": received } } });
    expect(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true })).toEqual([]);
    expect(codes(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true, sheet: started("") }))).toEqual(["SHEET_VALUE_EMPTY"]);
    expect(pinRefusals(FORM, mergeFields("INTERIM_PAYMENT"), fieldsNamed, { ...CTX, routed: true, sheet: started("1 September 2026") })).toEqual([]);
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

describe("BD-614-26 as ruled: a pin and an issue record which corrections applied", () => {
  const form: TemplateNow = { ...FORM, fields: [], bodyEn: "INTERIM CERTICATE for {{contract.number}}. PARTICAL.", corrections: [{ id: "c1", fromText: "CERTICATE", toText: "CERTIFICATE" }, { id: "c2", fromText: "PARTICAL", toText: "PARTIAL" }, { id: "c3", fromText: "BORAD", toText: "BOARD" }] };
  it("the pin keeps every correction on the form with its record; the issue names those that changed words", () => {
    const rev = pinRevision(form, "2026-10-01");
    expect(rev.corrections).toEqual([{ id: "c3", fromText: "BORAD", toText: "BOARD" }, { id: "c1", fromText: "CERTICATE", toText: "CERTIFICATE" }, { id: "c2", fromText: "PARTICAL", toText: "PARTIAL" }]);
    const r = renderIssue(rev, "INTERIM_PAYMENT", () => ({ "contract.number": "DEMO/1" }));
    expect(r.texts[0].text).toBe("INTERIM CERTIFICATE for DEMO/1. PARTIAL.");
    expect(r.applied).toEqual([{ id: "c1", fromText: "CERTICATE", toText: "CERTIFICATE" }, { id: "c2", fromText: "PARTICAL", toText: "PARTIAL" }]);
    expect(r.corrected).toBe(2);
  });
  it("the Print tab and the pin's trail name them in words", async () => {
    const { correctionsWords } = await import("./printed");
    expect(correctionsWords([{ fromText: "CERTICATE", toText: "CERTIFICATE" }]).en).toBe("Typing corrections applied (the form code and revision unchanged): CERTICATE → CERTIFICATE");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/certificate/write.ts", "utf8")).toMatch(/corrections: r\.applied,/);
    expect(readFileSync("src/lib/certificate/write.ts", "utf8")).toMatch(/typingCorrectionsPinned: pinning && rev\.corrections\?\.length \? correctionsWords\(rev\.corrections\)\.en : null/);
  });
});

describe("S-2: a term is found in a query only as whole words", () => {
  it("\"approval\" does not contain the alias \"P.P.\"-style fragment \"pp\": no swap inside a word", async () => {
    const { searchVariants, wordAt } = await import("./terms");
    const pp = { code: "pp", canonicalEn: null, canonicalMs: "Pegawai Penguasa", aliases: ["pp"] };
    expect(searchVariants("approval", [pp])).toEqual(["approval"]);
    expect(searchVariants("PP approval", [pp])).toEqual(["PP approval", "Pegawai Penguasa approval"]);
    expect(wordAt("Fasal 43", "fasal")).toBe(0);
    expect(wordAt("Fasalnya 43", "fasal")).toBe(-1);
    // Unicode-aware: a letter with a diacritic is part of the word.
    expect(wordAt("kecacatané", "kecacatan")).toBe(-1);
    expect(wordAt("S.O. delegates", "s.o.")).toBe(0);
  });
});

describe("BD-614-33 as ruled: a replaced wording stays as an alias", () => {
  it("worked example: an issued certificate frozen in the old wording is still found after the wording changes", async () => {
    const { aliasesKeeping, searchVariants, termSaveFaults } = await import("./terms");
    const before = { code: "so", canonicalEn: "Superintending Officer", canonicalMs: "Pegawai Penguasa", aliases: ["S.O."] };
    const edited = { ...before, canonicalEn: "Superintending Officer (S.O.)" };
    const after = { ...edited, aliases: aliasesKeeping(before, edited) };
    expect(after.aliases).toEqual(["S.O.", "Superintending Officer"]);
    // A search by any other wording also searches the old one, which the frozen text says.
    expect(searchVariants("S.O.", [after])).toContain("Superintending Officer");
    expect(termSaveFaults(after, [])).toEqual([]);
  });
  it("the old wording already another term's: the edit is refused naming that term; an unchanged wording adds nothing", async () => {
    const { aliasesKeeping, termSaveFaults } = await import("./terms");
    const before = { code: "so", canonicalEn: "Officer", canonicalMs: null, aliases: [] };
    const edited = { ...before, canonicalEn: "Superintending Officer" };
    const other = { code: "off", canonicalEn: null, canonicalMs: "Pegawai", aliases: ["officer"] };
    const fs = termSaveFaults({ ...edited, aliases: aliasesKeeping(before, edited) }, [other]);
    expect(fs.map((f) => f.code)).toEqual(["TERM_WORDING_TAKEN"]);
    expect(fs[0].data).toEqual({ term: "off" });
    expect(aliasesKeeping(before, { ...before })).toEqual([]);
  });
  it("removing an alias an issued certificate's text still says is found, by whole words", async () => {
    const { removedAliasesInUse } = await import("./terms.oracle");
    expect(removedAliasesInUse(["S.O.", "P.P."], [{ label: "DEMO/CERT/1", text: "The S.O. delegates." }, { label: "DEMO/CERT/2", text: "Approval." }])).toEqual([{ alias: "S.O.", certificates: ["DEMO/CERT/1"] }]);
  });
});
