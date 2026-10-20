import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { certificateFaultWords } from "./fault-text";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";
import { pinCheck, pinContextOf, pinSheetOf, type PinSource } from "./pin-context";
import { inPrintedOrder, printedBlankFaults, printedRows, SHEET_FIELDS, type PrintedField } from "./printed";
import { pinRevision, sheetValueFaults, type TemplateNow } from "./revision";
import { freezeRoutingType, routingSheet, type TypeNow } from "./routing-sheet";
import { sheetFieldValues } from "./sheet-words";

/**
 * 6.14 increment 2, residual round. M-1: a routed certificate's form is not "not ready" while its sheet runs; the act
 * and the page judge the pin by one function; the pin holds a sheet value exactly as the issue does. Every type, form
 * and wording here is invented (fixture only).
 */
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

const TYPE: TypeNow = {
  id: "type-1",
  code: "interim",
  labelEn: "Interim sheet",
  labelMs: "Helaian interim",
  subject: "CERTIFICATE",
  certificateKind: "INTERIM_PAYMENT",
  upperEdgeInclusive: null,
  provenance: "ASSUMED",
  retiredOn: null,
  checks: [],
  targets: [{ pctMin: null, pctMax: null, targetDays: 28, provenance: "ASSUMED" }],
  printedForm: null,
};

const field = (key: string, computedKey: string, sortOrder: number): PrintedField => ({ key, labelEn: `${key} (EN)`, labelMs: `${key} (MS)`, bound: true, computedKey, sortOrder });
const RECEIVED = field("date_in", "sheet.received", 1);
const APPROVED = field("date_out", "sheet.approved", 2);
const ELAPSED = field("days", "sheet.elapsed", 3);
const TARGET = field("target", "sheet.target", 4);
const SHEET_TYPE = field("sheet", "sheet.type", 5);
const FORM: TemplateNow = { id: "form-1", code: "interim", nameEn: "Interim certificate form", nameMs: null, formCode: "", revisionDate: null, bodyVersion: 1, bodyEn: "Contract {{contract.number}}.", bodyMs: null, blocks: INTERIM_BLOCKS, distribution: FIVE_RECIPIENTS, fields: [RECEIVED, APPROVED, ELAPSED] };

/// A route, approved on `decidedOn` by its one approving step (null: the step carries no day), or pending.
const route = (status: "APPROVED" | "PENDING" | "REJECTED", decidedOn: string | null = null) => ({
  id: `route-${status}`,
  status,
  openedAt: dayToDate("2026-09-02"),
  createdAt: new Date(0),
  steps: [{ sequence: 1, roleLabel: "Director", actingRoleLabel: null, act: "A", committeeCode: null, decision: status === "APPROVED" ? "DONE" : status === "REJECTED" ? "REJECTED" : "PENDING", decidedByName: status === "PENDING" ? null : "Officer", decidedOn: decidedOn ? dayToDate(decidedOn) : null, receivedOn: null }],
});

/// A certificate row as loaded: IN_ROUTING with its type frozen on 1 Sep 2026.
const cert = (over: Partial<PinSource> = {}, type: TypeNow = TYPE): PinSource => ({
  kind: "INTERIM_PAYMENT",
  routingTypeId: "type-1",
  baseline: { contractDate: dayToDate("2026-08-01") },
  routingSnapshot: freezeRoutingType(type, "2026-09-01"),
  computedSnapshot: null,
  overrides: [],
  routingReceivedOn: null,
  approvalInstances: [],
  routingChecks: [],
  ...over,
});

describe("M-1: a routed certificate's form is judged on its sheet's values only once they are due", () => {
  it("worked example: in routing, no day received, no approval: the screen says nothing is wrong (the act's own function)", () => {
    const c = cert();
    expect(pinContextOf(c, "2026-09-10").sheet).toMatchObject({ state: "STARTED", decided: false });
    expect(pinCheck(FORM, c, "2026-09-10")).toEqual([]);
    // Received but the route still waiting: the approved day and elapsed time are not due yet either.
    expect(pinCheck(FORM, cert({ routingReceivedOn: dayToDate("2026-09-01"), approvalInstances: [route("PENDING")] }), "2026-09-10")).toEqual([]);
  });

  it("once approved, with the values there: it pins, and the pinned form prints them", () => {
    const c = cert({ routingReceivedOn: dayToDate("2026-09-01"), approvalInstances: [route("APPROVED", "2026-09-29")] });
    expect(pinCheck(FORM, c, "2026-10-01")).toEqual([]);
    const rev = pinRevision(FORM, "2026-10-01");
    expect(rev.fields?.map((f) => f.key)).toEqual(["date_in", "date_out", "days"]);
    // Worked example a reader can check by hand: received 1 Sep, approved 29 Sep: 28 days.
    const ctx = pinContextOf(c, "2026-10-01");
    expect(ctx.sheet).toMatchObject({ state: "STARTED", decided: true, values: { EN: { "sheet.received": "1 September 2026", "sheet.approved": "29 September 2026", "sheet.elapsed": "28 days" } } });
  });

  it("approved but a due value missing (the approving step carries no day): refused with the sheet value's own words, never 'void'", () => {
    const c = cert({ routingReceivedOn: dayToDate("2026-09-01"), approvalInstances: [route("APPROVED", null)] });
    const fs = pinCheck(FORM, c, "2026-10-01");
    expect(codes(fs)).toEqual(["SHEET_VALUE_EMPTY"]);
    expect(fs[0].data).toEqual({ form: "Interim certificate form", fields: "date_out (EN), days (EN)" });
    const words = certificateFaultWords(fs[0]);
    expect(words.en).toMatch(/Routing sheet tab/);
    expect(words.en).toMatch(/completed by hand under Configuration › Templates/);
    expect(words.ms).toMatch(/Konfigurasi › Templat/);
    for (const t of [words.en, words.ms]) expect(t).not.toMatch(/void|batalkan|baseline version|garis dasar/i);
  });

  it("the type and the target are judged from the start: an unset target names the routing type's target setting", () => {
    const form = { ...FORM, fields: [TARGET, SHEET_TYPE] };
    expect(pinCheck(form, cert(), "2026-09-10")).toEqual([]);
    const fs = pinCheck(form, cert({}, { ...TYPE, targets: [] }), "2026-09-10");
    expect(codes(fs)).toEqual(["SHEET_TARGET_NOT_SET"]);
    expect(fs[0].data).toEqual({ form: "Interim certificate form", fields: "target (EN)", type: "Interim sheet", why: "NOT_SET" });
    const words = certificateFaultWords(fs[0]);
    expect(words.en).toMatch(/routing sheet type Interim sheet sets no target for this certificate: the type has no target\. A type's targets are set on it under Configuration › Routing sheets/);
    expect(words.ms).toMatch(/jenis helaian Interim sheet tidak menetapkan sasaran bagi perakuan ini: jenis itu tiada sasaran\. .*Konfigurasi › Helaian penghalaan/);
    for (const t of [words.en, words.ms]) expect(t).not.toMatch(/void|batalkan/i);
    // Banded targets and no percentage handed in: said why.
    const banded = { ...TYPE, targets: [{ pctMin: "0", pctMax: "20", targetDays: 14, provenance: "ASSUMED" as const }] };
    const nr = pinCheck(form, cert({}, banded), "2026-09-10");
    expect(nr[0].data?.why).toBe("NO_RATIO");
    expect(certificateFaultWords(nr[0]).en).toMatch(/no percentage came with this certificate's figures/);
    for (const why of ["NO_BAND", "OVERLAP", "EDGE_UNDECIDED"]) expect(certificateFaultWords({ code: "SHEET_TARGET_NOT_SET", level: "block", data: { why } }).en).not.toMatch(/the type has no target/);
  });

  it("before its sheet starts nothing is judged on it; with no routing type, a sheet value is refused as never filled (unchanged)", () => {
    expect(pinCheck(FORM, cert({ routingSnapshot: null }), "2026-09-10")).toEqual([]);
    expect(codes(pinCheck(FORM, cert({ routingSnapshot: null, routingTypeId: null }), "2026-09-10"))).toEqual(["PRINTED_FIELD_NOT_FILLED"]);
  });

  it("the time zone not set: a started sheet's values are said to be not judged, never silently passed", () => {
    expect(pinContextOf(cert(), null).sheet).toEqual({ state: "UNJUDGED" });
    const fs = pinCheck(FORM, cert(), null);
    expect(codes(fs)).toEqual(["SHEET_NOT_JUDGED"]);
    expect(certificateFaultWords(fs[0]).en).toMatch(/is not judged: the organisation's time zone is not set.*Configuration › Organisation/);
    expect(certificateFaultWords(fs[0]).ms).toMatch(/tidak dinilai: zon waktu organisasi belum ditetapkan/);
    // A form printing nothing from the sheet has nothing to judge there, whatever the time zone.
    expect(pinCheck({ ...FORM, fields: [] }, cert(), null)).toEqual([]);
    // Not started: nothing to judge either.
    expect(pinCheck(FORM, cert({ routingSnapshot: null }), null)).toEqual([]);
  });
});

describe("M-1: the pin's sheet-value check and the issue's printedBlankFaults agree, in English", () => {
  // Every sheet value bound on one form, in printed order.
  const fields = SHEET_FIELDS.map((k, i) => field(k.replace(".", "_"), k, i));
  // As the issue builds its printed rows: the sheet's values over the certificate's, in each language (write.ts issue()).
  const issueBlank = (sheet: ReturnType<typeof routingSheet>, fs: readonly PrintedField[]) => {
    const en = printedRows(fs, sheetFieldValues(sheet, "EN"), "EN");
    return printedBlankFaults("F", inPrintedOrder(fs).map((f, i) => ({ labelEn: f.labelEn, labelMs: null, bound: f.bound, valueEn: en[i].value, valueMs: null })));
  };
  // Every combination a signed sheet can be in: received or not, the approving step's day or none, the Malay label
  // absent, blank or given, a target or none. Signing follows an approved route only, so each is approved.
  const cases: { name: string; sheet: ReturnType<typeof routingSheet> }[] = [];
  for (const received of [null, "2026-09-01"])
    for (const decidedOn of [null, "2026-09-29"])
      for (const labelMs of [null, "", "Helaian interim"])
        for (const targets of [[], TYPE.targets]) {
          const type = freezeRoutingType({ ...TYPE, labelMs, targets }, "2026-09-01");
          const r = route("APPROVED", decidedOn);
          const sheet = routingSheet({ type, receivedOn: received, routes: [{ id: r.id, status: r.status, openedOn: "2026-09-02", createdAt: r.createdAt, steps: r.steps.map((s) => ({ ...s, decidedOn: s.decidedOn ? s.decidedOn.toISOString().slice(0, 10) : null, receivedOn: null })) }], checks: [], ratio: null, today: "2026-10-01" });
          cases.push({ name: `received ${received ?? "no"}, approved ${decidedOn ?? "no day"}, Malay label ${JSON.stringify(labelMs)}, ${targets.length ? "a target" : "no target"}`, sheet });
        }

  it.each(cases)("$name: each field passes the pin exactly when the issue prints it", ({ sheet }) => {
    for (const f of fields) {
      const pin = sheetValueFaults([f], { routed: true, sheet: pinSheetOf(sheet) }, "F");
      expect(pin.length === 0, `${f.computedKey}: pin ${codes(pin)}, issue ${codes(issueBlank(sheet, [f]))}`).toBe(issueBlank(sheet, [f]).length === 0);
    }
    // And the whole form: refused at the pin whenever it would be refused at the issue, so PRINTED_VALUE_EMPTY is never
    // the first a certificate hears of it (it could then only be voided).
    expect(sheetValueFaults(fields, { routed: true, sheet: pinSheetOf(sheet) }, "F").length === 0).toBe(issueBlank(sheet, fields).length === 0);
  });

  // Founder, 2026-10-20: English only. A blank Malay label on the type was refused at the pin and the issue; the Malay value is no longer asked for, so neither refuses.
  it("a blank Malay label does not refuse the pin or the issue", () => {
    const sheet = cases.find((c) => c.name.includes('Malay label ""') && c.name.startsWith("received 2026"))!.sheet;
    expect(sheetValueFaults([SHEET_TYPE], { routed: true, sheet: pinSheetOf(sheet) }, "F")).toEqual([]);
    expect(issueBlank(sheet, [SHEET_TYPE])).toEqual([]);
  });
});
