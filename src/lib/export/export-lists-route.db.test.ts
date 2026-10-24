import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { STAFF_FIXTURE } from "@/lib/test-support/staff";

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/route", () => ({
  refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 401 }),
  staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor } : { ok: false as const, response: Response.json({ ok: false, code: "NOT_SIGNED_IN" }, { status: 401 }) }),
}));

import { GET as exportCommittees, HEAD as headCommittees } from "@/app/committees/export/route";
import { GET as exportProjects, HEAD as headProjects } from "@/app/projects/export/route";
import { GET as exportSuppliers, HEAD as headSuppliers } from "@/app/suppliers/export/route";
import { db } from "@/lib/db";
import { LIST_EXPORT_MAX_ROWS } from "@/lib/list-query";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The Projects, Suppliers and Committees export routes against Postgres (plan 7.6, ST-9 to ST-11): the screen's own rows, the organisation's own, a restricted case
 * left out of the award-work views for a reader not named on it, an unknown tab refused, an oversized view refused, and exactly one `ListExport` audit entry per file.
 */
type Route = typeof exportProjects;
const run = randomId();
const SUM = "1234567.89";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let orgA = "";
let orgB = "";
let orgBig = "";
const person = { named: "", outsider: "", b: "", big: "" };
const actorOf = (organisationId: string, personId: string): StaffActor => ({ ...STAFF_FIXTURE, organisationId, personId, organisationTimeZone: "Asia/Kuala_Lumpur" });
const get = (route: Route, base: string, qs = "", headers: Record<string, string> = {}) => route(new Request(`http://localhost${base}${qs}`, { headers }));
const sheetOf = async (res: Response) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
  const sheet = book.worksheets[0];
  return { header: (sheet.getRow(1).values as unknown[]).slice(1), rows: sheet.getRows(2, Math.max(0, sheet.rowCount - 1))?.map((r) => (r.values as unknown[]).slice(1)) ?? [] };
};
const exports = (organisationId: string) => db.auditEntry.findMany({ where: { organisationId, entity: "ListExport" }, orderBy: { at: "asc" } });
const changesOf = (entry: { changes: unknown }) => Object.fromEntries((entry.changes as { field: string; after: unknown }[]).map((c) => [c.field, c.after]));
const text = (rows: unknown[][]) => rows.map((r) => r.join(" | ")).join("\n");

const supplier = (organisationId: string, n: number, over: Record<string, unknown> = {}) => ({
  organisationId, reference: `XS/${run}/${n}`, registeredName: `Exporter ${n} ${run} Sdn Bhd`, registrationNo: `0${n}${run}`, registrationNoKey: `${run}x${n}${organisationId.slice(-4)}`,
  entityTypeCode: "XS_TYPE", countryCode: "my", registeredAddress: "Nowhere", companyEmail: "s@example.invalid", ...over,
});

beforeAll(async () => {
  const mk = (code: string) => db.organisation.upsert({ where: { code }, update: {}, create: { code, name: code, timeZone: "Asia/Kuala_Lumpur" } });
  orgA = (await mk("P76_EXPORT_A")).id;
  orgB = (await mk("P76_EXPORT_B")).id;
  orgBig = (await mk("P76_EXPORT_BIG")).id;
  person.named = (await makePerson(orgA)).id;
  person.outsider = (await makePerson(orgA)).id;
  person.b = (await makePerson(orgB)).id;
  person.big = (await makePerson(orgBig)).id;

  // Projects: an open draft award, a restricted active contract with a bond, a restricted draft; another organisation's award with the same words.
  const requisition = (organisationId: string, requestingPersonId: string, reference: string) =>
    db.requisition.create({
      data: {
        organisationId, reference, requestingUnitCode: "XP_UNIT", requestingPersonId, title: "Export test", justification: "Tests.", needStatement: "None.", costCentreCode: "XP_CC", accountCode: "XP_AC",
        placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "SOURCING",
      },
    });
  const exercise = (organisationId: string, requisitionId: string, reference: string, restricted: boolean) =>
    db.sourcingExercise.create({ data: { organisationId, reference, requisitionId, title: `Tender ${reference}`, estimatedValue: "1000.00", sourcingMethodCode: "XP_METHOD", restricted, status: "DRAFT" } });
  const award = (organisationId: string, exerciseId: string, reference: string, status: "DRAFT" | "ACCEPTED") =>
    db.award.create({ data: { organisationId, reference, exerciseId, instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: `Zeta ${run} Sdn Bhd`, awardedValue: SUM, completionPeriod: 30, completionUnit: "DAYS", status } });
  const reqA = await requisition(orgA, person.named, `XP/REQ/A/${run}`);
  await award(orgA, (await exercise(orgA, reqA.id, `XP/EX/OPEN/${run}`, false)).id, `PRJ/OPEN/${run}`, "DRAFT");
  const secretEx = await exercise(orgA, reqA.id, `XP/EX/SECRET/${run}`, true);
  await db.exerciseParticipant.create({ data: { exerciseId: secretEx.id, personId: person.named } });
  const secretActive = await award(orgA, secretEx.id, `PRJ/ACTIVE/${run}`, "ACCEPTED");
  const contract = await db.contract.create({ data: { organisationId: orgA, number: `PRJ/CON/${run}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: secretActive.id, contractSum: SUM, status: "ACTIVE" } });
  await award(orgA, secretEx.id, `PRJ/DRAFT/${run}`, "DRAFT");
  await db.securityInstrument.create({
    data: { contractId: contract.id, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerNameAsWritten: `Bank ${run}`, instrumentRef: `BG-${run}`, value: SUM, effectiveFrom: day("2026-10-01"), expiresOn: day("2027-10-01"), lodgedOn: day("2026-10-02") },
  });
  const reqB = await requisition(orgB, person.b, `XP/REQ/B/${run}`);
  await award(orgB, (await exercise(orgB, reqB.id, `XP/EX/B/${run}`, false)).id, `PRJ/B/${run}`, "DRAFT");

  // Suppliers: three in A (one an applicant), two open applications of different days; another organisation's with the same words.
  const recorder = (await makePerson(orgA)).id;
  const s1 = await db.supplier.create({ data: supplier(orgA, 1, { status: "REGISTERED" }) });
  const s2 = await db.supplier.create({ data: supplier(orgA, 2, { status: "APPLICANT" }) });
  await db.supplier.create({ data: supplier(orgA, 3, { status: "REGISTERED", registeredName: `Jalan Ampang ${run} Sdn Bhd` }) });
  await db.supplier.create({ data: supplier(orgB, 1) });
  for (const [s, on] of [[s1, "2026-10-05"], [s2, "2026-10-01"]] as const) {
    await db.supplierApplication.create({ data: { organisationId: orgA, supplierId: s.id, kind: "NEW", receivedOn: day(on), channel: "COUNTER", recordedByPersonId: recorder, recordedAt: day("2026-10-01"), status: "RECEIVED" } });
  }

  // Committees: three sittings in A, one in B.
  const committee = (organisationId: string, code: string) => db.committee.create({ data: { organisationId, code, nameEn: `Board ${run}`, mandate: "Tests.", governingSource: "None." } });
  const boardA = await committee(orgA, `XB_A_${run}`);
  await db.meeting.create({ data: { committeeId: boardA.id, reference: `SIT/A1/${run}`, meetingDate: day("2026-09-01"), status: "MINUTED" } });
  await db.meeting.create({ data: { committeeId: boardA.id, reference: `SIT/A2/${run}`, meetingDate: day("2026-10-01"), status: "SCHEDULED" } });
  await db.meeting.create({ data: { committeeId: boardA.id, reference: `SIT/A3/${run}`, meetingDate: day("2026-10-15"), status: "IN_PROGRESS" } });
  await db.meeting.create({ data: { committeeId: (await committee(orgB, `XB_B_${run}`)).id, reference: `SIT/B1/${run}`, meetingDate: day("2026-10-01") } });

  // The ceiling: one past it in each list.
  const reqBig = await requisition(orgBig, person.big, `XP/REQ/BIG/${run}`);
  const exBig = await exercise(orgBig, reqBig.id, `XP/EX/BIG/${run}`, false);
  const range = Array.from({ length: LIST_EXPORT_MAX_ROWS + 1 }, (_, i) => i);
  await db.award.createMany({
    data: range.map((i) => ({ organisationId: orgBig, reference: `PRJ/BIG/${run}/${i}`, exerciseId: exBig.id, instrumentKind: "LETTER_OF_ACCEPTANCE" as const, awardeeName: "Big", awardedValue: "1.00", completionPeriod: 30, completionUnit: "DAYS" as const, status: "DRAFT" as const })),
  });
  await db.supplier.createMany({ data: range.map((i) => supplier(orgBig, i)) });
  const bigBoard = await committee(orgBig, `XB_BIG_${run}`);
  await db.meeting.createMany({ data: range.map((i) => ({ committeeId: bigBoard.id, reference: `SIT/BIG/${run}/${i}`, meetingDate: day("2026-10-01") })) });
}, 240_000);

describe("every list export", () => {
  const routes: [string, Route, string, () => Promise<Response>][] = [
    ["projects", exportProjects, "/projects/export", headProjects as () => Promise<Response>],
    ["suppliers", exportSuppliers, "/suppliers/export", headSuppliers as () => Promise<Response>],
    ["sittings", exportCommittees, "/committees/export", headCommittees as () => Promise<Response>],
  ];
  for (const [name, route, base, head] of routes) {
    it(`${name}: refuses nobody signed in, a cross-site request and a HEAD, and writes nothing`, async () => {
      who.actor = null;
      expect((await get(route, base)).status).toBe(401);
      who.actor = actorOf(orgB, person.b);
      const before = (await exports(orgB)).length;
      expect((await get(route, base, "", { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await head()).status).toBe(405);
      expect(await exports(orgB)).toHaveLength(before);
    });
    it(`${name}: refuses a view of more than 5,000 rows with the words, and writes no audit entry`, async () => {
      who.actor = actorOf(orgBig, person.big);
      const res = await get(route, base);
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ code: "EXPORT_TOO_LARGE", message: expect.stringContaining("5,000") });
      expect(await exports(orgBig)).toHaveLength(0);
    });
  }
});

describe("the projects export", () => {
  it("shows a restricted case's contract as contract stages only, and keeps it out of the award-work views, for a reader not named on it", async () => {
    who.actor = actorOf(orgA, person.outsider);
    const all = await sheetOf(await get(exportProjects, "/projects/export", `?q=${run}`));
    const body = text(all.rows as unknown[][]);
    expect(body).toContain(`PRJ/CON/${run}`);
    expect(body).toContain(`PRJ/OPEN/${run}`);
    expect(body).not.toContain(`PRJ/DRAFT/${run}`);
    expect(body).not.toContain(`PRJ/B/${run}`);
    expect(all.header).toEqual(["Project", "Contract or award", "Contractor", "Value", "Status", "Dates"]);
    const onSite = await sheetOf(await get(exportProjects, "/projects/export", `?q=${run}&view=on_site`));
    expect(text(onSite.rows as unknown[][])).toContain(`PRJ/CON/${run}`);
    expect((await sheetOf(await get(exportProjects, "/projects/export", `?q=${run}&view=commitment`))).rows.filter((r) => String(r[1]).includes("PRJ/CON"))).toEqual([]);
    who.actor = actorOf(orgA, person.named);
    const named = await sheetOf(await get(exportProjects, "/projects/export", `?q=${run}&view=commitment`));
    expect(text(named.rows as unknown[][])).toContain(`PRJ/CON/${run}`);
    // Money is a number, not text.
    expect((await sheetOf(await get(exportProjects, "/projects/export", `?q=PRJ/CON/${run}`))).rows[0][3]).toBe(Number(SUM));
  });

  it("writes one audit entry holding labels, and none for the views it refuses", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    await get(exportProjects, "/projects/export", `?q=${run}&view=on_site`);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(before + 1);
    const last = entries[entries.length - 1];
    expect(last.entityLabel).toMatch(/^Projects export, \d+ rows?$/);
    expect(changesOf(last)).toMatchObject({ list: "Projects", search: run });
    expect(String(changesOf(last).view)).not.toContain("on_site");
    for (const view of ["commenced", "submissions"]) {
      const res = await get(exportProjects, "/projects/export", `?view=${view}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "VIEW_NOT_EXPORTABLE" });
    }
    expect(await exports(orgA)).toHaveLength(before + 1);
  });

  it("exports the securities view with the value as a number, refuses an unknown one, and gives another organisation none of it", async () => {
    who.actor = actorOf(orgA, person.outsider);
    const sec = await sheetOf(await get(exportProjects, "/projects/export", `?view=securities&sv=all&q=PRJ/CON/${run}`));
    expect(sec.rows).toHaveLength(1);
    expect(sec.rows[0][4]).toBe(Number(SUM));
    expect(String(sec.rows[0][1])).toContain(`PRJ/CON/${run}`);
    const unknown = await get(exportProjects, "/projects/export", "?view=securities&sv=nope");
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: "UNKNOWN_VIEW" });
    const entries = await exports(orgA);
    expect(changesOf(entries[entries.length - 1])).toMatchObject({ list: "Securities and insurance" });
    who.actor = actorOf(orgB, person.b);
    expect((await sheetOf(await get(exportProjects, "/projects/export", `?view=securities&sv=all`))).rows).toEqual([]);
  });

  it("gives another organisation's actor none of this organisation's projects", async () => {
    who.actor = actorOf(orgB, person.b);
    const body = text((await sheetOf(await get(exportProjects, "/projects/export", `?q=${run}`))).rows as unknown[][]);
    expect(body).toContain(`PRJ/B/${run}`);
    expect(body).not.toContain(`PRJ/OPEN/${run}`);
  });
});

describe("the suppliers export", () => {
  it("writes the register with the registration number's leading zero kept, and one audit entry", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    const file = await sheetOf(await get(exportSuppliers, "/suppliers/export", `?q=exporter&view=registered`));
    expect(file.header).toEqual(["Supplier", "Reference", "Registration number", "Standing", "Documents", "Status"]);
    expect(file.rows.map((r) => r[1])).toEqual([`XS/${run}/1`]);
    expect(file.rows[0][2]).toBe(`01${run}`);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(before + 1);
    expect(entries[entries.length - 1].entityLabel).toBe("Suppliers export, 1 row");
    expect(changesOf(entries[entries.length - 1])).toMatchObject({ list: "Suppliers", view: "Registered", search: "exporter", rowCount: "1" });
  });

  it("gives another organisation's actor none of these suppliers", async () => {
    who.actor = actorOf(orgB, person.b);
    expect((await sheetOf(await get(exportSuppliers, "/suppliers/export", `?q=exporter`))).rows.map((r) => r[1])).toEqual([`XS/${run}/1`]);
    expect((await sheetOf(await get(exportSuppliers, "/suppliers/export", `?tab=applications`))).rows).toEqual([]);
  });

  it("writes the applications tab, oldest first by default, with the day received as a date", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    const file = await sheetOf(await get(exportSuppliers, "/suppliers/export", `?tab=applications&q=exporter`));
    expect(file.header).toEqual(["Supplier", "Reference", "Kind", "Channel", "Received", "Status", "Deadline"]);
    expect(file.rows.map((r) => r[1])).toEqual([`XS/${run}/2`, `XS/${run}/1`]);
    expect(file.rows[0][4]).toEqual(day("2026-10-01"));
    const newest = await sheetOf(await get(exportSuppliers, "/suppliers/export", `?tab=applications&q=exporter&sort=date`));
    expect(newest.rows.map((r) => r[1])).toEqual([`XS/${run}/1`, `XS/${run}/2`]);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(before + 2);
    expect(changesOf(entries[before])).toMatchObject({ list: "Supplier applications", view: "All", search: "exporter" });
  });

  it("refuses a tab that is not the register or the applications with 400, and writes nothing", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    for (const tab of ["online", "expiring", "nope"]) {
      const res = await get(exportSuppliers, "/suppliers/export", `?tab=${tab}`);
      expect(res.status, tab).toBe(400);
      expect(await res.json()).toMatchObject({ code: "UNKNOWN_TAB" });
    }
    expect(await exports(orgA)).toHaveLength(before);
  });
});

describe("the sittings export", () => {
  it("writes the organisation's sittings as text, by the screen's query, with one audit entry holding labels", async () => {
    who.actor = actorOf(orgA, person.named);
    const before = (await exports(orgA)).length;
    const file = await sheetOf(await get(exportCommittees, "/committees/export", `?q=${run}&view=upcoming`));
    expect(file.header).toEqual(["Reference", "Committee", "Date", "Status", "Matters", "Quorum"]);
    expect(file.rows.map((r) => r[0])).toEqual([`SIT/A2/${run}`]);
    const all = await sheetOf(await get(exportCommittees, "/committees/export", `?q=${run}&sort=date&dir=asc`));
    expect(all.rows.map((r) => r[0])).toEqual([`SIT/A1/${run}`, `SIT/A2/${run}`, `SIT/A3/${run}`]);
    const entries = await exports(orgA);
    expect(entries).toHaveLength(before + 2);
    expect(changesOf(entries[before])).toMatchObject({ list: "Sittings", view: "Upcoming", search: run, rowCount: "1" });
    expect(JSON.stringify(entries[before].changes)).not.toContain("upcoming");
  });

  it("gives another organisation's actor none of these sittings", async () => {
    who.actor = actorOf(orgB, person.b);
    expect((await sheetOf(await get(exportCommittees, "/committees/export", `?q=${run}`))).rows.map((r) => r[0])).toEqual([`SIT/B1/${run}`]);
  });
});
