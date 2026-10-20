import { describe, expect, it } from "vitest";

import { freezeRoutingType, routingSheet, type TypeNow } from "./routing-sheet";
import { printedSheetWords, sheetFieldValues } from "./sheet-words";

/// An invented type and printed sheet (fixture only): the labels are the customer's configuration.
const TYPE: TypeNow = {
  id: "t",
  code: "t",
  labelEn: "Interim sheet",
  labelMs: "Helaian interim",
  subject: "CERTIFICATE",
  certificateKind: "INTERIM_PAYMENT",
  upperEdgeInclusive: null,
  provenance: "ASSUMED",
  retiredOn: null,
  checks: [],
  targets: [{ pctMin: null, pctMax: null, targetDays: 28, provenance: "ASSUMED" }],
  printedForm: { name: "Demo routing sheet", formCode: "DEMO-RS", revisionDate: "2026-01-15", pageCount: 1, labels: { "sheet.received": { en: "Date in (A)", ms: "Tarikh masuk (A)" }, "sheet.approved": { en: "Date out (B)", ms: null } } },
};

describe("the routing sheet's printed sheet, frozen with its type (BD-614-3, increment 2)", () => {
  it("names the printed sheet and the labels it prints the sheet's own values under, beside the portal's words", () => {
    const frozen = freezeRoutingType(TYPE, "2026-09-01");
    const words = printedSheetWords(frozen);
    expect(words.form.en).toBe("Demo routing sheet · DEMO-RS · revision 15 Jan 2026 · 1 page");
    // Founder, 2026-10-20: English only. The English line named the label pair ("Date in (A) · Tarikh masuk (A)"); it names the English label alone now.
    expect(words.labels?.en).toBe("Received: Date in (A); Approved: Date out (B)");
    expect(words.labels?.ms).toBe("Diterima: Date in (A) · Tarikh masuk (A); Diluluskan: Date out (B)");
  });
  it("a later change to the printed sheet's labels never reaches a sheet already started", () => {
    const type = { ...TYPE, printedForm: { ...TYPE.printedForm!, labels: { ...TYPE.printedForm!.labels } } };
    const frozen = freezeRoutingType(type, "2026-09-01");
    type.printedForm.labels["sheet.received"] = { en: "CHANGED", ms: null };
    expect(printedSheetWords(frozen).labels?.en).toMatch(/^Received: Date in \(A\)/);
  });
  it("a type naming no printed sheet says so; a sheet started before increment 2 says none was recorded", () => {
    expect(printedSheetWords(freezeRoutingType({ ...TYPE, printedForm: null }, "2026-09-01"))).toEqual({ form: { en: "No printed sheet is named for its type", ms: "Tiada helaian bercetak dinamakan bagi jenisnya" }, labels: null });
    const old = { ...freezeRoutingType(TYPE, "2026-09-01") } as Record<string, unknown>;
    delete old.printedForm;
    expect(printedSheetWords(old as Parameters<typeof printedSheetWords>[0]).form.en).toMatch(/^Started before printed sheets were frozen/);
  });
  it("a printed sheet with no labels configured says so", () => {
    expect(printedSheetWords(freezeRoutingType({ ...TYPE, printedForm: { ...TYPE.printedForm!, labels: {} } }, "2026-09-01")).labels?.en).toBe("No printed labels configured for its values");
  });
});

describe("the values a printed field bound to the sheet prints", () => {
  it("worked example (the plan's 4 weeks): received 1 Sep 2026, approved 29 Sep 2026: 28 days against 28", () => {
    const sheet = routingSheet({ type: freezeRoutingType(TYPE, "2026-09-01"), receivedOn: "2026-09-01", routes: [{ id: "r", status: "APPROVED", openedOn: "2026-09-02", createdAt: new Date(0), steps: [{ sequence: 1, roleLabel: "FD", actingRoleLabel: null, act: "A", committeeCode: null, decision: "DONE", decidedByName: "x", decidedOn: "2026-09-29", receivedOn: null }] }], checks: [], ratio: null, today: "2026-10-01" });
    expect(sheetFieldValues(sheet, "EN")).toEqual({ "sheet.type": "Interim sheet", "sheet.received": "1 September 2026", "sheet.approved": "29 September 2026", "sheet.elapsed": "28 days", "sheet.target": "28 days" });
    expect(sheetFieldValues(sheet, "MS")).toMatchObject({ "sheet.type": "Helaian interim", "sheet.received": "1 September 2026", "sheet.elapsed": "28 hari" });
  });
  it("nothing is invented: no sheet, no values; not approved, no approved day or elapsed", () => {
    expect(sheetFieldValues(null, "EN")).toEqual({});
    const open = routingSheet({ type: freezeRoutingType(TYPE, "2026-09-01"), receivedOn: "2026-09-01", routes: [], checks: [], ratio: null, today: "2026-10-01" });
    expect(sheetFieldValues(open, "EN")).toMatchObject({ "sheet.approved": "", "sheet.elapsed": "" });
  });
});
