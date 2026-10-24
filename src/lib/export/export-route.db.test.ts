import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { STAFF_FIXTURE } from "@/lib/test-support/staff";

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/route", () => ({
  refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 401 }),
  staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor } : { ok: false as const, response: Response.json({ ok: false, code: "NOT_SIGNED_IN" }, { status: 401 }) }),
}));

import { GET as exportRequisitions, HEAD as headRequisitions } from "@/app/requisitions/export/route";
import { GET as exportExercises } from "@/app/sourcing/export/route";
import { db } from "@/lib/db";
import { LIST_EXPORT_MAX_ROWS } from "@/lib/list-query";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The export routes against Postgres (plan 7.5, ST-9 to ST-11): the same rows as the screen, the organisation's own, a restricted exercise
 * left out, no SULIT column, the boundary view and an oversized view refused, and exactly one `ListExport` audit entry per file.
 */

const run = randomId();
const VALUE_DIGITS = "7654321";
let orgA = "";
let orgB = "";
let orgBig = "";
const person = { named: "", outsider: "", b: "", big: "" };
const actorOf = (organisationId: string, personId: string): StaffActor => ({ ...STAFF_FIXTURE, organisationId, personId, organisationTimeZone: "Asia/Kuala_Lumpur" });
const get = (route: typeof exportRequisitions, base: string, qs = "", headers: Record<string, string> = {}) => route(new Request(`http://localhost${base}${qs}`, { headers }));
const sheetOf = async (res: Response) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
  const sheet = book.worksheets[0];
  return { header: (sheet.getRow(1).values as unknown[]).slice(1) as string[], rows: sheet.getRows(2, Math.max(0, sheet.rowCount - 1))?.map((r) => (r.values as unknown[]).slice(1) as string[]) ?? [] };
};
const exports = (organisationId: string) => db.auditEntry.findMany({ where: { organisationId, entity: "ListExport" }, orderBy: { at: "asc" } });

const requisition = (organisationId: string, requestingPersonId: string, reference: string, title: string) => ({
  organisationId, reference, requestingUnitCode: "XP_UNIT", requestingPersonId, title, justification: "Tests.", needStatement: "None.", costCentreCode: "XP_CC",
  accountCode: "XP_AC", placeOfDelivery: "Nowhere", dateRequired: new Date("2026-12-31T00:00:00Z"), estimatedValue: `${VALUE_DIGITS}.00`, raisedOn: new Date("2026-10-01T00:00:00Z"),
});

beforeAll(async () => {
  const mk = (code: string) => db.organisation.upsert({ where: { code }, update: {}, create: { code, name: code, timeZone: "Asia/Kuala_Lumpur" } });
  orgA = (await mk("P7_EXPORT_A")).id;
  orgB = (await mk("P7_EXPORT_B")).id;
  orgBig = (await mk("P7_EXPORT_BIG")).id;
  person.named = (await makePerson(orgA)).id;
  person.outsider = (await makePerson(orgA)).id;
  person.b = (await makePerson(orgB)).id;
  person.big = (await makePerson(orgBig)).id;

  const a = await db.requisition.create({ data: requisition(orgA, person.named, `XP/A/${run}`, `Zebra roof ${run}`) });
  await db.requisition.create({ data: requisition(orgB, person.b, `XP/B/${run}`, `Zebra roof ${run}`) });
  const ex = (reference: string, title: string, restricted: boolean) =>
    db.sourcingExercise.create({ data: { organisationId: orgA, reference, requisitionId: a.id, title, estimatedValue: `${VALUE_DIGITS}.00`, sourcingMethodCode: "XP_METHOD", restricted } });
  await ex(`0123/${run}`, `Open tender ${run}`, false);
  const secret = await ex(`XP/R/${run}`, `Secret tender ${run}`, true);
  await db.exerciseParticipant.create({ data: { exerciseId: secret.id, personId: person.named } });

  await db.requisition.createMany({ data: Array.from({ length: LIST_EXPORT_MAX_ROWS + 1 }, (_, i) => requisition(orgBig, person.big, `XP/BIG/${run}/${i}`, `Big ${i}`)) });
}, 120_000);

describe("the requisitions export", () => {
  it("refuses nobody signed in", async () => {
    who.actor = null;
    expect((await get(exportRequisitions, "/requisitions/export")).status).toBe(401);
  });

  it("writes the organisation's rows as text, with no SULIT column and no value, and one audit entry holding labels", async () => {
    who.actor = actorOf(orgA, person.named);
    const res = await get(exportRequisitions, "/requisitions/export", `?q=zebra&view=over&sort=title`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="requisitions-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { header, rows } = await sheetOf(res);
    expect(header.join("|")).toBe("Reference|Requisition|Funding|Status|Requester|Department|Required by");
    expect(header.join(" ")).not.toMatch(/value|estimate|amount/i);
    expect(rows).toEqual([]); // "over" is a view this requisition is not in
    const all = await get(exportRequisitions, "/requisitions/export", `?q=zebra`);
    const file = await sheetOf(all);
    expect(file.rows.map((r) => r[0])).toEqual([`XP/A/${run}`]);
    expect(JSON.stringify(file.rows)).not.toContain(VALUE_DIGITS);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(2);
    expect(entries[1].action).toBe("CREATE");
    expect(entries[1].entityLabel).toBe("Requisitions export, 1 row");
    const changes = Object.fromEntries((entries[1].changes as { field: string; after: unknown }[]).map((c) => [c.field, c.after]));
    expect(changes).toMatchObject({ list: "Requisitions", view: "Open", search: "zebra", rowCount: "1" });
    expect(String(changes.fileName)).toMatch(/^requisitions-/);
    expect(JSON.stringify(entries[0].changes)).toContain("Over budget");
    expect(JSON.stringify(entries)).not.toContain(VALUE_DIGITS);
  });

  it("names the active facets in the audit entry as labels, never codes", async () => {
    await db.orgUnit.create({ data: { organisationId: orgA, code: "XP_UNIT", nameEn: `Roads Department ${run}`, kind: "DEPARTMENT", effectiveFrom: new Date("2020-01-01T00:00:00Z") } });
    who.actor = actorOf(orgA, person.named);
    const res = await get(exportRequisitions, "/requisitions/export", "?unit=XP_UNIT&stage=approved&from=2026-01-01&to=2027-01-01");
    expect(res.status).toBe(200);
    const entry = (await exports(orgA)).at(-1)!;
    const changes = Object.fromEntries((entry.changes as { field: string; after: unknown }[]).map((c) => [c.field, c.after]));
    expect(changes).toMatchObject({ department: `Roads Department ${run}`, stage: "Approved", dateRange: "01 Jan 2026 to 31 Dec 2026" });
    expect(JSON.stringify(entry.changes)).not.toContain("XP_UNIT");
    expect(changes).not.toHaveProperty("fundingRoute");
  });

  it("gives another organisation's actor none of this organisation's rows", async () => {
    who.actor = actorOf(orgB, person.b);
    const file = await sheetOf(await get(exportRequisitions, "/requisitions/export", `?q=zebra`));
    expect(file.rows.map((r) => r[0])).toEqual([`XP/B/${run}`]);
  });

  it("refuses a cross-site request, and a HEAD, and writes nothing", async () => {
    who.actor = actorOf(orgB, person.b);
    const before = (await exports(orgB)).length;
    expect((await get(exportRequisitions, "/requisitions/export", "", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await headRequisitions()).status).toBe(405);
    expect(await exports(orgB)).toHaveLength(before);
  });

  it("refuses a view of more than 5,000 rows with the words, and writes no audit entry", async () => {
    who.actor = actorOf(orgBig, person.big);
    const res = await get(exportRequisitions, "/requisitions/export");
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "EXPORT_TOO_LARGE", message: expect.stringContaining("5,000") });
    expect(await exports(orgBig)).toHaveLength(0);
  });
});

describe("the tenders and quotations export", () => {
  it("keeps a reference's leading zero as text, and leaves a restricted exercise out for a reader not named on it", async () => {
    who.actor = actorOf(orgA, person.outsider);
    const outsider = await sheetOf(await get(exportExercises, "/sourcing/export", `?q=${run}`));
    expect(outsider.rows.map((r) => r[0])).toEqual([`0123/${run}`]);
    expect(outsider.header.join(" ")).not.toMatch(/value|estimate|amount/i);
    expect(JSON.stringify(outsider.rows)).not.toContain(VALUE_DIGITS);
    who.actor = actorOf(orgA, person.named);
    const named = await sheetOf(await get(exportExercises, "/sourcing/export", `?q=${run}`));
    expect(named.rows.map((r) => r[0]).sort()).toEqual([`0123/${run}`, `XP/R/${run}`].sort());
  });

  it("gives another organisation's actor none of these rows", async () => {
    who.actor = actorOf(orgB, person.b);
    expect((await sheetOf(await get(exportExercises, "/sourcing/export", `?q=${run}`))).rows).toEqual([]);
  });

  it("refuses the boundary view with 400 and writes nothing, and writes no SULIT access event for any export", async () => {
    who.actor = actorOf(orgA, person.named);
    const entries = (await exports(orgA)).length;
    const access = await db.sulitAccessEvent.count({ where: { organisationId: orgA } });
    const res = await get(exportExercises, "/sourcing/export", "?view=boundary");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VIEW_NOT_EXPORTABLE", message: "This view cannot be exported." });
    expect(await exports(orgA)).toHaveLength(entries);
    await get(exportExercises, "/sourcing/export", `?q=${run}&view=open`);
    expect(await db.sulitAccessEvent.count({ where: { organisationId: orgA } })).toBe(access);
  });

  it("writes one audit entry holding the list and the view as labels", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    await get(exportExercises, "/sourcing/export", `?q=${run}&view=drafts`);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(before + 1);
    const last = entries[entries.length - 1];
    expect(last.entityLabel).toMatch(/^Tenders & quotations export, \d+ rows?$/);
    const changes = Object.fromEntries((last.changes as { field: string; after: unknown }[]).map((c) => [c.field, c.after]));
    expect(changes).toMatchObject({ list: "Tenders & quotations", view: "Draft", search: run });
    expect(JSON.stringify(last.changes)).not.toContain("drafts");
  });
});
