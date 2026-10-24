import { beforeAll, describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { search } from "./store";

/**
 * Global search against Postgres (plan 7.2, ADR 0044): the case group from any case key (FR-REQ-002), a restricted exercise neither shown nor
 * counted (FR-MTD-007, AC-18), a sitting shown by reference, committee, date and status only (ST-3), no SULIT value, two organisations.
 * It also proves the relation paths 7.1 only declared: `contract.number` (a to-one back-relation), `exercise.requisition.*` and `committee.nameEn`.
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ref = (kind: string) => `SRCH/${kind}/${run}`;
const ERP = `ERP${run}`;
const VALUE_DIGITS = "7654321";
const SECRET = `zebra${run}`;

let orgA = "";
let orgB = "";
const id = { req: "", open: "", restricted: "", supplier: "", meeting: "", reqB: "" };
const person = { named: "", outsider: "", b: "" };
const viewer = (organisationId: string, personId: string): Viewer => ({ organisationId, organisationCode: "X", personId, isAdministrator: false });
const asNamed = () => viewer(orgA, person.named);
const asOutsider = () => viewer(orgA, person.outsider);
const asB = () => viewer(orgB, person.b);
const find = (v: Viewer, q: string) => search(db, v, q);

async function award(organisationId: string, exerciseId: string, reference: string, contract: string | null, erpCommitmentNo: string | null = null) {
  const a = await db.award.create({
    data: { organisationId, reference, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: "Search Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", erpCommitmentNo },
  });
  if (contract) await db.contract.create({ data: { organisationId, number: contract, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: a.id, contractSum: "1000.00" } });
  return a.id;
}

beforeAll(async () => {
  const mk = (code: string) => db.organisation.upsert({ where: { code }, update: {}, create: { code, name: code, timeZone: "Asia/Kuala_Lumpur" } });
  orgA = (await mk("P7_SEARCH_A")).id;
  orgB = (await mk("P7_SEARCH_B")).id;
  person.named = (await makePerson(orgA)).id;
  person.outsider = (await makePerson(orgA)).id;
  person.b = (await makePerson(orgB)).id;

  const requisition = (organisationId: string, requestingPersonId: string, reference: string, title: string, erpRequisitionNo: string | null) =>
    db.requisition.create({
      data: {
        organisationId, reference, erpRequisitionNo, requestingUnitCode: "SRCH_UNIT", requestingPersonId, title, justification: "Tests.", needStatement: "None.", costCentreCode: "SRCH_CC",
        accountCode: "SRCH_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: `${VALUE_DIGITS}.00`, raisedOn: day("2026-10-01"),
      },
    });
  id.req = (await requisition(orgA, person.named, ref("REQ"), `Roof repair ${run}`, ERP)).id;
  id.reqB = (await requisition(orgB, person.b, ref("REQ"), `Roof repair ${run}`, null)).id;

  const exercise = (reference: string, title: string, restricted: boolean) =>
    db.sourcingExercise.create({ data: { organisationId: orgA, reference, requisitionId: id.req, title, estimatedValue: "1000.00", sourcingMethodCode: "SRCH_METHOD", restricted } });
  id.open = (await exercise(ref("EX"), `Open tender ${run}`, false)).id;
  id.restricted = (await exercise(ref("RX"), `Secret ${SECRET} tender ${run}`, true)).id;
  await db.exerciseParticipant.create({ data: { exerciseId: id.restricted, personId: person.named } });

  await award(orgA, id.open, ref("AW1"), ref("CON1"), `COMMIT${run}`);
  await award(orgA, id.open, ref("AW2"), null);
  await award(orgA, id.restricted, ref("AW3"), ref("CON3"));
  await award(orgA, id.restricted, ref("AW4"), null);

  id.supplier = (
    await db.supplier.create({
      data: { organisationId: orgA, reference: ref("V"), registeredName: `Search Supplier ${run} Sdn Bhd`, registrationNo: `00${run}-X`, registrationNoKey: `00${run}X`, entityTypeCode: "SRCH_TYPE", countryCode: "my", registeredAddress: "Nowhere", companyEmail: "s@example.invalid" },
    })
  ).id;

  const committee = await db.committee.create({ data: { organisationId: orgA, code: `SRCH_${run}`, nameEn: `Search Board ${run}`, mandate: "Tests.", governingSource: "None." } });
  const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: ref("MT"), meetingDate: day("2026-10-05"), agenda: `Agenda about ${SECRET}` } });
  id.meeting = meeting.id;
  await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "requisition", subject: `Restricted matter ${SECRET}` } });
  const committeeB = await db.committee.create({ data: { organisationId: orgB, code: `SRCH_${run}`, nameEn: `Search Board ${run}`, mandate: "Tests.", governingSource: "None." } });
  await db.meeting.create({ data: { committeeId: committeeB.id, reference: ref("MT"), meetingDate: day("2026-10-06") } });
});

const titles = (g: { hits: { title: string }[] } | undefined) => g?.hits.map((h) => h.title).sort() ?? [];
const group = (r: Awaited<ReturnType<typeof find>>, entity: string) => r.groups.find((g) => g.entity === entity);

describe("the case group (FR-REQ-002)", () => {
  it("opens from the requisition reference, the finance-system number, an exercise reference, an award reference, a commitment number and a contract number", async () => {
    for (const q of [ref("REQ"), ERP, ref("EX"), ref("AW1"), `COMMIT${run}`, ref("CON1")]) {
      const r = await find(asNamed(), q);
      expect(r.caseGroup?.requisition.href, q).toBe(`/requisitions/${id.req}`);
      expect(r.caseGroup?.exercises.map((e) => e.hit.id).sort(), q).toEqual([id.open, id.restricted].sort());
    }
  });
  it("holds the exercises, their awards and the contract number as one case", async () => {
    const g = (await find(asNamed(), ref("REQ"))).caseGroup!;
    const open = g.exercises.find((e) => e.hit.id === id.open)!;
    expect(open.projects.map((p) => p.title).sort()).toEqual([ref("AW2"), ref("CON1")].sort());
  });
  it("leaves a restricted exercise out for a reader not named on it, and shows only its contract, without its words", async () => {
    const g = (await find(asOutsider(), ref("REQ"))).caseGroup!;
    expect(g.exercises.map((e) => e.hit.id)).toEqual([id.open]);
    expect(g.projects.map((p) => p.title)).toEqual([ref("CON3")]);
    const text = JSON.stringify(g);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(ref("RX"));
    expect(text).not.toContain(ref("AW4"));
  });
  it("is not given by a restricted exercise's reference to a reader not named on it", async () => {
    const r = await find(asOutsider(), ref("RX"));
    expect(r.caseGroup).toBeNull();
    expect(r.groups).toEqual([]);
  });
});

describe("hidden exercises are neither shown nor counted (FR-MTD-007)", () => {
  it("exercise group: missing and uncounted for the outsider, present for the named reader", async () => {
    const out = group(await find(asOutsider(), run), "exercise")!;
    const named = group(await find(asNamed(), run), "exercise")!;
    expect([out.total, titles(out)]).toEqual([1, [`Open tender ${run}`]]);
    expect(named.total).toBe(2);
  });
  it("project group: the hidden exercise's award with no contract is gone and not counted; the contract stage stays", async () => {
    const out = group(await find(asOutsider(), run), "project")!;
    const named = group(await find(asNamed(), run), "project")!;
    expect(out.total).toBe(3);
    expect(named.total).toBe(4);
    expect(titles(out)).not.toContain(ref("AW4"));
  });
  it("a project is not found through its hidden exercise's title or reference", async () => {
    expect(group(await find(asOutsider(), SECRET), "project")).toBeUndefined();
    expect(group(await find(asNamed(), SECRET), "project")?.total).toBe(2);
  });
});

describe("what a search reads", () => {
  it("finds a requisition by its finance-system number, and its exercises and projects through exercise.requisition.*", async () => {
    const r = await find(asNamed(), ERP);
    expect(group(r, "requisition")?.total).toBe(1);
    expect(group(r, "exercise")?.total).toBe(2);
    expect(group(r, "project")?.total).toBe(4);
  });
  it("does not find a requisition by the digits of its estimated value, and no value is in a result", async () => {
    const r = await find(asNamed(), VALUE_DIGITS);
    expect(r.groups).toEqual([]);
    expect(JSON.stringify(await find(asNamed(), run))).not.toContain(VALUE_DIGITS);
  });
  it("finds a supplier by a registration number with leading zeros", async () => {
    expect(titles(group(await find(asNamed(), `00${run}`), "supplier"))).toEqual([`Search Supplier ${run} Sdn Bhd`]);
  });
});

describe("committee sittings (ST-3)", () => {
  it("are found by reference and by committee name, and the hit shows reference, committee, date and status only", async () => {
    for (const q of [ref("MT"), `Search Board ${run}`]) {
      const g = group(await find(asNamed(), q), "sitting")!;
      expect(g.total, q).toBe(1);
      expect(g.hits[0]).toMatchObject({ title: `Search Board ${run}`, href: `/committees/${id.meeting}`, status: { text: "Scheduled" } });
      expect(g.hits[0].sub).toContain(ref("MT"));
      expect(JSON.stringify(g)).not.toContain(SECRET);
    }
  });
  it("are not found by an agenda or a matter's words, and are not in the case group", async () => {
    expect(group(await find(asNamed(), SECRET), "sitting")).toBeUndefined();
    expect((await find(asNamed(), ref("MT"))).caseGroup).toBeNull();
  });
});

describe("organisations", () => {
  it("another organisation's reader gets nothing of A's and sees only its own records", async () => {
    for (const q of [ref("CON1"), ERP, ref("EX"), `Search Supplier ${run}`]) {
      const r = await find(asB(), q);
      expect(r.caseGroup, q).toBeNull();
      expect(r.groups, q).toEqual([]);
    }
    const own = await find(asB(), ref("REQ"));
    expect(own.groups.map((g) => g.entity)).toEqual(["requisition"]);
    expect(own.groups[0].hits[0].id).toBe(id.reqB);
    expect(group(await find(asB(), ref("MT")), "sitting")?.total).toBe(1);
  });
});
