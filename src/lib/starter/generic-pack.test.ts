import { describe, expect, it } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import { columnsOf, planPacks } from "./plan";

/**
 * The generic pack (plan step 4.3). Its columns are checked when it compiles (each group and list is typed by the generated client's create
 * input); here, against the generated client's columns at run time, and against what it must never hold (SP-1, SP-7, SP-9).
 */
const fresh = { now: new Date("2026-10-23T02:00:00Z"), rows: { Organisation: { id: "o1", timeZone: null }, SecurityPolicy: null }, listSizes: {}, demoIsLoaded: false };

describe("the generic pack", () => {
  it("names only tables and columns the schema has, and plans clean into a fresh organisation", () => {
    for (const g of GENERIC_PACK.groups) for (const c of Object.keys(g.values)) expect(columnsOf(g.model), `${g.model}.${c}`).toContain(c);
    for (const l of GENERIC_PACK.lists) for (const r of l.rows) for (const c of Object.keys(r.values)) expect(columnsOf(l.model), `${l.model}.${c}`).toContain(c);
    const p = planPacks([GENERIC_PACK], fresh);
    expect(p.faults).toEqual([]);
    expect(p.skips).toEqual([]);
    expect(p.writes[0]).toMatchObject({ kind: "SWITCH_OFF", create: true });
  });

  it("holds no approval value: no authority table, committee, fee floor or window date rule", () => {
    const models = [...GENERIC_PACK.groups, ...GENERIC_PACK.lists].map((x) => x.model);
    for (const m of ["AuthorityMatrix", "AuthorityRule", "Committee", "DocumentFeeFloor", "AuthorityRole", "NotificationRule"]) expect(models).not.toContain(m);
    const windowColumns = GENERIC_PACK.groups.filter((g) => g.model === "WindowPolicy").flatMap((g) => Object.keys(g.values));
    expect(windowColumns).toEqual(["calendarId"]);
    expect("drafts" in GENERIC_PACK).toBe(false);
  });

  it("holds no legal text and no holiday date", () => {
    const columns = GENERIC_PACK.groups.flatMap((g) => Object.keys(g.values));
    for (const c of ["personalDataNoticeEn", "helpEmail", "helpPhone"]) expect(columns).not.toContain(c);
    const models = GENERIC_PACK.lists.map((l) => l.model);
    for (const m of ["DeclarationText", "PublicHoliday", "HolidayCalendarYear"]) expect(models).not.toContain(m);
  });

  it("is all ASSUMED, each with its source", () => {
    expect(GENERIC_PACK.provenance).toBe("ASSUMED");
    for (const g of GENERIC_PACK.groups) expect(g.source).toBe("generic starting value");
    for (const l of GENERIC_PACK.lists) for (const r of l.rows) expect(r.source.length, `${l.label} ${r.code}`).toBeGreaterThan(10);
  });

  it("points the bank statement at a SULIT class and the uploads at a classified one", () => {
    const classes = GENERIC_PACK.lists.find((l) => l.model === "DocumentClass")!.rows;
    const classOf = (ref: unknown) => classes.find((c) => `DocumentClass:${c.code}` === (ref as { ref: string }).ref)!.values.classification;
    const uploads = GENERIC_PACK.groups.find((g) => "supplierBankStatementClassId" in g.values)!.values;
    expect(classOf(uploads.supplierBankStatementClassId)).toBe("SULIT");
    expect(classOf(uploads.supplierUploadClassId)).not.toBeUndefined();
    for (const c of classes) expect(c.values.classification, c.code).toBeTruthy();
  });
});
