import { beforeAll, describe, expect, it } from "vitest";

import { hiddenExerciseIds, type Reader } from "@/lib/auth/sulit-store";
import { listRegister } from "@/lib/award/repo";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The Contracts list's "Securities expiring or not verified" view (MN-01; AC-15) against the scratch database: its rows and its counts
 * agree, and an instrument on a contract from a restricted exercise is listed for every reader, with nothing of the tender (AC-45, superseding FR-MTD-007 here).
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let outsider = "";
let named = "";
const ids: { open?: string; restricted?: string; verified?: string } = {};
const reader = (personId: string): Reader => ({ organisationId, organisationCode: "REG_TEST", personId, isAdministrator: false, sessionId: `sess_${randomId()}`, sourceAddress: "198.51.100.9" }) as Reader;

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `REG_${randomId()}`, name: "Register test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  outsider = (await makePerson(organisationId, `Reg outsider ${randomId()}`)).id;
  named = (await makePerson(organisationId, `Reg named ${randomId()}`)).id;
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `RG/REQ/${randomId()}`, requestingUnitCode: "RG_DEPT", requestingPersonId: named, title: "Register test requisition", justification: "Tests.", needStatement: "None.",
      costCentreCode: "RG_CC", accountCode: "RG_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "SOURCING",
    },
  });
  const contract = async (restricted: boolean) => {
    const ex = await db.sourcingExercise.create({ data: { organisationId, reference: `RG/EX/${randomId()}`, requisitionId: requisition.id, title: "Register test exercise", estimatedValue: "1000.00", sourcingMethodCode: "RG_METHOD", restricted, status: "DRAFT" } });
    const aw = await db.award.create({ data: { organisationId, reference: `RG/AW/${randomId()}`, exerciseId: ex.id, instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Register awardee", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED" } });
    if (restricted) await db.exerciseParticipant.create({ data: { exerciseId: ex.id, personId: named } });
    return db.contract.create({ data: { organisationId, number: `RG/CON/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: aw.id, contractSum: "1000.00", status: "ACTIVE" } });
  };
  const security = (contractId: string, status: "LODGED" | "VERIFIED") =>
    db.securityInstrument.create({ data: { contractId, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", value: "50.00", effectiveFrom: day("2026-01-01"), expiresOn: day("2099-01-01"), status, lodgedOn: day("2026-01-02") } });
  const open = await contract(false);
  const restricted = await contract(true);
  ids.open = (await security(open.id, "LODGED")).id;
  ids.restricted = (await security(restricted.id, "LODGED")).id;
  ids.verified = (await security(open.id, "VERIFIED")).id;
});

describe("listRegister: the securities view (AC-15)", () => {
  it("holds what its count says, and the attention view is the union of not verified and expiring", async () => {
    const r = await listRegister(organisationId, 0, "attention");
    expect(r.total).toBe(2);
    expect(r.securities.map((s) => s.id).sort()).toEqual([ids.open, ids.restricted].sort());
    expect(r.counts).toEqual({ all: 3, unverified: 2, expiring: 0, attention: 2 });
  });

  // Changed for AC-45 (it pinned AC-15's FR-MTD-007 absence): a security on a contract whose contract stages the reader sees is listed and counted, whoever is named on the exercise.
  it("lists the instrument of a restricted exercise for a reader not named on it, in rows and counts, with nothing of the tender", async () => {
    const hidden = await hiddenExerciseIds(db, reader(outsider));
    expect(hidden.length).toBe(1);
    const r = await listRegister(organisationId, 0, "attention");
    expect(r.securities.map((s) => s.id).sort()).toEqual([ids.open, ids.restricted].sort());
    expect(r.counts).toEqual({ all: 3, unverified: 2, expiring: 0, attention: 2 });
    // Only the contract's own cells are read: the award contributes its awardee's name and nothing else (no reference, no exercise).
    expect(Object.keys(r.securities[0].contract.award)).toEqual(["awardeeName"]);
  });

  it("lists it the same for a reader named on the exercise", async () => {
    expect(await hiddenExerciseIds(db, reader(named))).toEqual([]);
    const r = await listRegister(organisationId, 0, "attention");
    expect(r.securities.map((s) => s.id)).toContain(ids.restricted);
  });
});

describe("listRegister: the search and the page size (7.4)", () => {
  it("finds an instrument by its contract number, counts the matches as the total, and leaves the header counts over the whole register", async () => {
    const contract = await db.securityInstrument.findUniqueOrThrow({ where: { id: ids.restricted! }, select: { contract: { select: { number: true } } } });
    const r = await listRegister(organisationId, 0, "all", false, { words: [contract.contract.number.toLowerCase()] });
    expect(r.securities.map((s) => s.id)).toEqual([ids.restricted]);
    expect(r.total).toBe(1);
    expect(r.counts).toEqual({ all: 3, unverified: 2, expiring: 0, attention: 2 });
    // A wildcard is literal; the award's own reference is not searched (AC-45).
    expect((await listRegister(organisationId, 0, "all", false, { words: ["%"] })).total).toBe(0);
    const award = await db.award.findFirstOrThrow({ where: { organisationId }, select: { reference: true } });
    expect((await listRegister(organisationId, 0, "all", false, { words: [award.reference] })).total).toBe(0);
  });

  it("pages by the size asked for, and a page past the end is the last", async () => {
    const first = await listRegister(organisationId, 0, "all", false, { size: 2 });
    expect(first.order).toHaveLength(2);
    expect(first.total).toBe(3);
    const past = await listRegister(organisationId, 9, "all", false, { size: 2 });
    expect(past.page).toBe(1);
    expect(past.order).toHaveLength(1);
  });
});
