import { describe, expect, it } from "vitest";

import { COLUMNS, emptyKnown, holderKey, planMasterData, readDate, readYearStart, type Known, type RawBook, type TabName } from "./plan";

/// A synthetic workbook: each tab is rows of cells by column, numbered from row 3 as in the template.
function book(tabs: Partial<Record<TabName, Record<string, string | undefined>[]>>): RawBook {
  const out: RawBook = {};
  for (const name of Object.keys(COLUMNS) as TabName[]) {
    const rows = tabs[name] ?? [];
    out[name] = { headers: [...COLUMNS[name]], rows: rows.map((cells, i) => ({ row: i + 3, cells: cells as Record<string, string> })) };
  }
  return out;
}
const ORG = [{ "Legal name": "Test Water Sdn Bhd", "Short name": "TW", "Financial year starts": "01-07", Address: "1 Test Road" }];
const UNITS = [
  { "Unit code": "CO", "Unit name": "Company", Kind: "Company" },
  { "Unit code": "FIN", "Unit name": "Finance", Kind: "Department", "Parent unit code": "CO" },
];
const STAFF = [{ "Staff no": "S1", "Full name": "Person One", Email: "one@example.test", "Org unit code": "FIN", Active: "Yes" }];
const known = (over: Partial<Known> = {}): Known => ({ ...emptyKnown(), ...over });

describe("reading a cell", () => {
  it("takes only DD-MM-YYYY, and a real day", () => {
    expect(readDate("05-03-2026")).toBe("2026-03-05");
    expect(readDate("2026-03-05")).toBeNull();
    expect(readDate("31-02-2026")).toBeNull();
    expect(readDate("5-3-2026")).toBeNull();
  });
  it("turns the financial year DD-MM into the MM-DD the organisation screen keeps", () => {
    expect(readYearStart("01-07")).toBe("07-01");
    expect(readYearStart("31-04")).toBeNull();
  });
});

describe("planning a workbook", () => {
  it("writes what is there, and says an empty tab is empty rather than faulting", () => {
    const p = planMasterData(book({ Organisation: ORG, "Org units": UNITS, Staff: STAFF }), emptyKnown());
    expect(p.faults).toEqual([]);
    expect(p.reports.find((r) => r.tab === "Org units")).toMatchObject({ read: 2, write: 2 });
    expect(p.reports.find((r) => r.tab === "Budget codes")).toMatchObject({ empty: true, write: 0 });
    expect(p.writes.organisation?.company.financialYearStart).toBe("07-01");
  });

  it("skips a code that is already stored, and still lets a later row refer to it", () => {
    const p = planMasterData(book({ Organisation: ORG, "Org units": UNITS }), known({ organisationExists: true, hasCompanyUnit: true, units: new Set(["CO", "FIN"]) }));
    expect(p.faults).toEqual([]);
    expect(p.reports.find((r) => r.tab === "Org units")).toMatchObject({ write: 0, skipped: 2 });
    expect(p.writes.units).toEqual([]);
  });

  it("names the tab, row and column of each fault, and never repeats a staff cell", () => {
    const p = planMasterData(
      book({
        Organisation: ORG,
        "Org units": [...UNITS, { "Unit code": "FIN", "Unit name": "Again", Kind: "Department", "Parent unit code": "NOPE" }],
        Staff: [{ "Staff no": "S9", "Full name": "Secret Name", Email: "not-an-email", "Org unit code": "GHOST", Active: "Maybe" }],
      }),
      emptyKnown(),
    );
    const by = (tab: string) => p.faults.filter((f) => f.tab === tab).map((f) => `${f.row}:${f.column}`);
    expect(by("Org units")).toEqual(expect.arrayContaining(["5:Parent unit code", "5:Unit code"]));
    expect(by("Staff")).toEqual(expect.arrayContaining(["3:Email", "3:Org unit code", "3:Active"]));
    const text = JSON.stringify(p.faults.filter((f) => f.tab === "Staff"));
    for (const secret of ["S9", "Secret Name", "not-an-email", "GHOST"]) expect(text).not.toContain(secret);
  });

  it("refuses a loose date, and money that is not a plain number", () => {
    const p = planMasterData(
      book({
        Organisation: ORG,
        "Org units": UNITS,
        "Budget codes": [{ "Budget code": "B1", Description: "Pumps", "Owning unit code": "FIN", Active: "Yes" }],
        "Budget allocations": [
          { "Budget code": "B1", Year: "2026", Movement: "Original", "Amount (RM)": "RM 1,000", Date: "2026-01-02" },
          { "Budget code": "B1", Year: "2026", Movement: "Original", "Amount (RM)": "1000.5", Date: "02-01-2026" },
        ],
      }),
      emptyKnown(),
    );
    expect(p.faults.map((f) => `${f.row}:${f.column}`).sort()).toEqual(["3:Amount (RM)", "3:Date"]);
    expect(p.writes.movements).toEqual([expect.objectContaining({ amount: "1000.50", occurredOn: "2026-01-02" })]);
    expect(p.writes.years).toEqual([2026]);
  });

  it("refuses the same movement twice in the file, and skips one already stored", () => {
    const row = { "Budget code": "B1", Year: "2026", Movement: "Original", "Amount (RM)": "10", Date: "02-01-2026" };
    const codes = [{ "Budget code": "B1", Description: "x", Active: "Yes" }];
    expect(planMasterData(book({ Organisation: ORG, "Budget codes": codes, "Budget allocations": [row, row] }), emptyKnown()).faults).toHaveLength(1);
    const stored = known({ organisationExists: true, budgetCodes: new Set(["B1"]), years: new Set([2026]), movementKeys: new Set(["B1|ORIGINAL|2026-01-02|10.00|"]) });
    const p = planMasterData(book({ "Budget allocations": [row] }), stored);
    expect(p.writes.movements).toEqual([]);
    expect(p.reports.find((r) => r.tab === "Budget allocations")).toMatchObject({ skipped: 1 });
  });

  it("resolves an office and a committee by the organisation own names, and refuses one it does not hold", () => {
    const k = known({ organisationExists: true, offices: new Map([["head of department", "HOD"]]), committees: new Map([["quotation committee", "QC"]]) });
    const p = planMasterData(
      book({
        "Org units": UNITS,
        Staff: STAFF,
        "Office holders": [{ "Staff no": "S1", Office: "Head of Department", "For unit code": "FIN", From: "01-01-2026" }, { "Staff no": "S1", Office: "Chairman" }],
        "Committee members": [{ Committee: "Quotation Committee", "Staff no": "S1", Position: "Member" }, { Committee: "Board of Directors", "Staff no": "S1", Position: "Member" }],
      }),
      k,
    );
    expect(p.writes.holders).toEqual([expect.objectContaining({ roleCode: "HOD", scope: "FIN", from: "2026-01-01" })]);
    expect(p.writes.seats).toEqual([expect.objectContaining({ committeeCode: "QC", position: "MEMBER" })]);
    expect(p.faults.map((f) => `${f.tab}:${f.row}:${f.column}`).sort()).toEqual(["Committee members:4:Committee", "Office holders:4:Office"]);
  });

  it("will not record an acting holder, and matches an undated holder on who, what and where", () => {
    const k = known({ organisationExists: true, offices: new Map([["head of department", "HOD"]]), staff: new Set(["S1"]), holderKeys: new Set([holderKey("S1", "HOD", null, null)]) });
    const rows = (acting: string) => book({ "Office holders": [{ "Staff no": "S1", Office: "Head of Department", Acting: acting }] });
    expect(planMasterData(rows("Yes"), k).faults.map((f) => f.column)).toEqual(["Acting"]);
    const again = planMasterData(rows("No"), k);
    expect(again.faults).toEqual([]);
    expect(again.writes.holders).toEqual([]);
  });

  it("needs a name for an organisation that does not exist yet", () => {
    expect(planMasterData(book({}), emptyKnown()).faults).toEqual([expect.objectContaining({ tab: "Organisation", column: "Legal name" })]);
    expect(planMasterData(book({}), known({ organisationExists: true })).faults).toEqual([]);
  });

  it("refuses a tab or a column that is missing from the file", () => {
    const b = book({ Organisation: ORG });
    delete b.Sites;
    b.Staff!.headers = b.Staff!.headers.filter((h) => h !== "Email");
    const p = planMasterData(b, emptyKnown());
    expect(p.faults).toEqual(expect.arrayContaining([expect.objectContaining({ tab: "Sites", row: 1 }), expect.objectContaining({ tab: "Staff", column: "Email" })]));
  });
});
