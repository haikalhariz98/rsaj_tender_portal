import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";

import { applyAppRole } from "../../../scripts/db-role-apply";

/**
 * Wave 3c step 3 (build plan section 2, SR-14, ruling 22): the offer's column revision moves forward by exactly one, proved against the database.
 *
 * The trigger of migration 20261108100000 refuses any UPDATE naming `OpenedBid.columnRevision` that does not set it to the old value plus one (SQLSTATE PA032).
 * The app's login is played by `perolehan_app_test` (NOLOGIN), given the grants `scripts/db-roles.ts` gives the real one through the same function, and reached with
 * SET LOCAL ROLE, as in `sealing/triggers.db.test.ts`. The offer is a paper one, written as the owner: the trigger, not the fixture, is under test.
 */

const TEST_ROLE = "perolehan_app_test";
type Tx = Prisma.TransactionClient;

function sqlState(error: unknown): string {
  type Cause = { originalCode?: string; code?: string; kind?: string };
  const e = error as { meta?: { driverAdapterError?: { cause?: Cause } }; name?: string; cause?: Cause };
  const cause = e.meta?.driverAdapterError?.cause ?? (e.name === "DriverAdapterError" ? e.cause : undefined);
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 400)}`;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

const asApp = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
    return fn(tx);
  });

const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const DAY = 24 * 60 * 60 * 1000;

let organisationId = "";
let personId = "";
let openedBidId = "";

const revisionOf = async () => (await db.openedBid.findUniqueOrThrow({ where: { id: openedBidId }, select: { columnRevision: true } })).columnRevision;
const setRevision = (value: number) => asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OpenedBid" SET "columnRevision" = $2 WHERE "id" = $1`, openedBidId, value));

beforeAll(async () => {
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
  organisationId = (await db.organisation.create({ data: { code: `CR_${randomId()}`, name: "Column revision test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  personId = (await db.person.create({ data: { organisationId, name: `Officer ${randomId()}` } })).id;
  const requisitionId = (
    await db.requisition.create({
      data: {
        organisationId, reference: `CR/REQ/${randomId()}`, requestingUnitCode: "CR_DEPT", requestingPersonId: personId, title: "Revision", justification: "Tests.", needStatement: "None.",
        costCentreCode: "CR_CC", accountCode: "CR_AC", placeOfDelivery: "Nowhere", dateRequired: D(new Date(Date.now() + 100 * DAY)), estimatedValue: "1000.00", raisedOn: D(new Date(Date.now() - 5 * DAY)),
      },
    })
  ).id;
  const committeeId = (await db.committee.create({ data: { organisationId, code: `CR_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "A test" } })).id;
  const closingAt = new Date(Date.now() - DAY);
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `CR/EX/${randomId()}`, requisitionId, title: "Column revision", estimatedValue: "1000.00", sourcingMethodCode: "BID_METHOD", status: "OPENING_IN_PROGRESS", closingAt },
  });
  const opening = await db.opening.create({
    data: {
      organisationId, exerciseId: ex.id, kind: "MAIN", sequenceNo: 1, committeeId, committeeNameSnapshot: "Opening committee", startedAt: new Date(), startedByPersonId: personId, unsealedAt: new Date(),
      checklistSnapshot: { items: [], notJudged: [], notReturned: [] }, policySnapshot: {},
    },
  });
  const envelope = await db.bidEnvelope.create({
    data: { organisationId, exerciseId: ex.id, sequence: 1, kind: "BID", channel: "COUNTER", receivedAt: new Date(closingAt.getTime() - DAY), receivedSource: "SERVER", receivedByPersonId: personId, markings: "Sealed", late: false, closingAtJudged: closingAt, recordedAfterClosing: false },
  });
  const party = await db.exerciseParty.create({ data: { organisationId, exerciseId: ex.id, source: "BIDDER_AT_OPENING", name: "Bidder", registrationNo: `REG-${randomId()}` } });
  openedBidId = (
    await db.openedBid.create({
      data: { organisationId, exerciseId: ex.id, openingId: opening.id, envelopeId: envelope.id, listingNo: 1, partyId: party.id, openedAt: new Date(), bidderNameAsRead: "Bidder", priceAsRead: "1000.00", saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED" },
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("OpenedBid.columnRevision moves forward by exactly one (SR-14, ruling 22, PA032)", () => {
  it("starts at 0 on a new offer and on a new confirmation: no backfill, every existing initial stands", async () => {
    expect(await revisionOf()).toBe(0);
    const initial = await db.openedBidInitial.create({ data: { organisationId, openedBidId, personId, recordedAt: new Date() } });
    expect(initial.columnRevision).toBe(0);
  });

  it("passes a +1 update, as the app's login", async () => {
    expect(await refusal(setRevision(1))).toBeNull();
    expect(await revisionOf()).toBe(1);
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OpenedBid" SET "columnRevision" = "columnRevision" + 1 WHERE "id" = $1`, openedBidId)))).toBeNull();
    expect(await revisionOf()).toBe(2);
  });

  it("refuses 0 (written to its own value), -1 and +2, and the revision stays where it was", async () => {
    const before = await revisionOf();
    expect(await refusal(setRevision(before))).toBe("PA032");
    expect(await refusal(setRevision(before - 1))).toBe("PA032");
    expect(await refusal(setRevision(before + 2))).toBe("PA032");
    expect(await revisionOf()).toBe(before);
  });

  it("refuses the same moves from the table's owner too", async () => {
    const before = await revisionOf();
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "OpenedBid" SET "columnRevision" = $2 WHERE "id" = $1`, openedBidId, before - 1))).toBe("PA032");
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "OpenedBid" SET "columnRevision" = $2 WHERE "id" = $1`, openedBidId, before + 2))).toBe("PA032");
    expect(await revisionOf()).toBe(before);
  });

  it("leaves an update that does not name the column alone", async () => {
    const before = await revisionOf();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "OpenedBid" SET "verdictReason" = 'Read again' WHERE "id" = $1`, openedBidId)))).toBeNull();
    expect(await revisionOf()).toBe(before);
  });

  it("is ENABLE ALWAYS, so a replica session does not skip it", async () => {
    const rows = await db.$queryRawUnsafe<{ enabled: string }[]>(`SELECT tgenabled::text AS enabled FROM pg_trigger WHERE tgname = 'OpenedBid_column_revision_forward' AND NOT tgisinternal`);
    expect(rows).toEqual([{ enabled: "A" }]);
  });
});
