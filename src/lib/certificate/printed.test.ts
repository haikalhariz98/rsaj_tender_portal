import { describe, expect, it } from "vitest";

import { fidelityLine, labelIn, labelPair, pageCountFaults, PAGE_COUNT_MAX, PRINTABLE_FIELDS, printedFieldFaults, printedFieldPinChanged, printedLabelOf, printedRows, sheetLabelsOf, SHEET_FIELDS, SHEET_FIELD_WORDS, type PrintedField } from "./printed";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

/// Invented label pairs (fixture): the product prints its own words; a form's labels are the customer's configuration.
const RECEIVED: PrintedField = { key: "date_in", labelEn: "Date in (A)", labelMs: "Tarikh masuk (A)", bound: true, computedKey: "sheet.received", sortOrder: 1 };
const APPROVED: PrintedField = { key: "date_out", labelEn: "Date out (B)", labelMs: "Tarikh keluar (B)", bound: true, computedKey: "sheet.approved", sortOrder: 2 };
const REMARKS: PrintedField = { key: "remarks", labelEn: "Remarks", labelMs: null, bound: false, computedKey: null, sortOrder: 3 };
const NUMBER: PrintedField = { key: "no", labelEn: "Contract No.", labelMs: "No. Kontrak", bound: true, computedKey: "contract.number", sortOrder: 0 };

describe("printed fields and their label pairs (FR-CRT-001, 002)", () => {
  it("prints each field under the form's own label, in printed order; a bound field takes its value, an unbound one is left for the pen", () => {
    const rows = printedRows([REMARKS, APPROVED, RECEIVED, NUMBER], { "contract.number": "DEMO/KP/T/005/2026", "sheet.received": "1 Sep 2026", "sheet.approved": "29 Sep 2026" }, "EN");
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Contract No.", "DEMO/KP/T/005/2026"],
      ["Date in (A)", "1 Sep 2026"],
      ["Date out (B)", "29 Sep 2026"],
      ["Remarks", null],
    ]);
    expect(printedRows([NUMBER, REMARKS], {}, "MS").map((r) => r.label)).toEqual(["No. Kontrak", "Remarks"]);
  });
  it("a bound value with nothing to print reads empty, never invented", () => {
    expect(printedRows([APPROVED], {}, "EN")[0].value).toBe("");
  });
  it("a label pair reads both languages where the form prints both, else its one label", () => {
    expect(labelPair(RECEIVED)).toBe("Date in (A) · Tarikh masuk (A)");
    expect(labelPair(REMARKS)).toBe("Remarks");
    expect(labelIn(REMARKS, "MS")).toBe("Remarks");
  });
  it("a routing sheet's own values take the printed labels configured for them; the others keep the product's words", () => {
    expect(sheetLabelsOf([RECEIVED, APPROVED, REMARKS])).toEqual({ "sheet.received": { en: "Date in (A)", ms: "Tarikh masuk (A)" }, "sheet.approved": { en: "Date out (B)", ms: "Tarikh keluar (B)" } });
    expect(printedLabelOf([REMARKS], "sheet.received")).toBeNull();
    expect(SHEET_FIELD_WORDS["sheet.received"].en).toBe("Received");
    for (const k of SHEET_FIELDS) expect(PRINTABLE_FIELDS.has(k)).toBe(true);
  });
});

describe("saving a printed field", () => {
  it("a well-formed field is accepted", () => expect(printedFieldFaults(RECEIVED, [APPROVED])).toEqual([]));
  it("a bound field names a value the product fills; an unbound one names none", () => {
    expect(codes(printedFieldFaults({ ...RECEIVED, computedKey: null }, []))).toEqual(["PRINTED_BOUND_NEEDS_VALUE"]);
    expect(codes(printedFieldFaults({ ...RECEIVED, computedKey: "contractor.bank" }, []))).toEqual(["PRINTED_VALUE_UNKNOWN"]);
    expect(codes(printedFieldFaults({ ...REMARKS, computedKey: "contract.number" }, []))).toEqual(["PRINTED_UNBOUND_HAS_VALUE"]);
  });
  it("a key in small letters, unique on the form, and a label", () => {
    expect(codes(printedFieldFaults({ ...RECEIVED, key: "Date In" }, []))).toEqual(["PRINTED_KEY"]);
    expect(codes(printedFieldFaults(RECEIVED, [{ ...APPROVED, key: "date_in" }]))).toEqual(["PRINTED_KEY_TAKEN"]);
    expect(codes(printedFieldFaults({ ...RECEIVED, labelEn: " " }, []))).toEqual(["PRINTED_LABEL"]);
    expect(codes(printedFieldFaults({ ...RECEIVED, sortOrder: -1 }, []))).toEqual(["PRINTED_ORDER"]);
  });
  it("a note alone moves nothing a certificate pins; a label or a binding does", () => {
    expect(printedFieldPinChanged(RECEIVED, { ...RECEIVED })).toBe(false);
    expect(printedFieldPinChanged(RECEIVED, { ...RECEIVED, labelMs: "TARIKH" })).toBe(true);
    expect(printedFieldPinChanged(null, RECEIVED)).toBe(true);
  });
});

describe("page count and the fidelity line", () => {
  it("a page count is a whole number of pages from 1, or not recorded", () => {
    expect(pageCountFaults(null)).toEqual([]);
    expect(pageCountFaults(1)).toEqual([]);
    expect(pageCountFaults(PAGE_COUNT_MAX)).toEqual([]);
    expect(codes(pageCountFaults(0))).toEqual(["PAGE_COUNT"]);
    expect(codes(pageCountFaults(PAGE_COUNT_MAX + 1))).toEqual(["PAGE_COUNT"]);
    expect(codes(pageCountFaults(1.5))).toEqual(["PAGE_COUNT"]);
  });
  it("names the form it stands next to, says what is not recorded, and the corrections applied with the code and revision unchanged", () => {
    const f = { name: "Demo interim certificate", formCode: "DEMO-IPC-01", revisionDate: "2026-09-01", pageCount: 2, bodyVersion: 3 };
    expect(fidelityLine(f, 0)).toEqual({ en: "Demo interim certificate · DEMO-IPC-01 · revision 01 Sep 2026 · 2 pages · form version 3", ms: "Demo interim certificate · DEMO-IPC-01 · semakan 1 September 2026 · 2 muka surat · versi borang 3" });
    expect(fidelityLine({ ...f, formCode: "", revisionDate: null, pageCount: null }, 1).en).toBe("Demo interim certificate · no form code · no revision date · page count not recorded · form version 3 · 1 typing correction applied, form code and revision unchanged");
    expect(fidelityLine({ ...f, pageCount: 1 }, 2).en).toContain("1 page · form version 3 · 2 typing corrections applied");
  });
});
