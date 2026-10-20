import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { readRuntimeRole } from "@/lib/auth/runtime-role-store";
import { db } from "@/lib/db";
import { parseSen } from "@/lib/money";
import { randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { applyAppRole } from "../../../scripts/db-role-apply";

import { readSealedFigures, writeEstimateVersion, type FigureReader } from "./estimate-store";
import { loadEstimates } from "./repo";

/**
 * N6 (ruling 20ch, threat model F10) against the scratch database: the app's login cannot read the company estimate's figure, and the
 * figure leaves the version table only through the logged reader, which writes one SulitAccessEvent row in the caller's transaction.
 *
 * The app's login is played by a role of this file's own (`perolehan_app_test`, NOLOGIN) given exactly the grants `db:roles` gives the real
 * one, through the same function, and reached with SET LOCAL ROLE (the role is cluster-wide and the real login's password is the founder's).
 * A refusal aborts its transaction, so each is run in a transaction of its own.
 */

const TEST_ROLE = "perolehan_app_test";
const FIGURE = "123456.78";
type Tx = Prisma.TransactionClient;

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
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

let organisationId = "";
let otherOrganisationId = "";
let personId = "";
let exerciseId = "";
let estimateId = "";
let versionId = "";
let reader: FigureReader;

const accessRows = (entityId: string) =>
  db.sulitAccessEvent.findMany({ where: { entity: "CompanyEstimateVersion", entityId }, select: { basis: true, outcome: true, actorPersonId: true, organisationId: true, entityId: true, fields: true } });

beforeAll(async () => {
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
  organisationId = (await testOrganisation()).id;
  otherOrganisationId = (await db.organisation.create({ data: { code: `WALL_${randomId()}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  personId = (await db.person.create({ data: { organisationId, name: `Estimator ${randomId()}` } })).id;
  const requisitionId = (await db.requisition.create({ data: { organisationId, reference: `WALL/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: personId, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") } })).id;
  exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference: `WALL/EX/${randomId()}`, requisitionId, title: "Wall test", estimatedValue: "1000.00", sourcingMethodCode: "WALL_METHOD", status: "DOCUMENTS_IN_PREPARATION" } })).id;
  estimateId = (await db.companyEstimate.create({ data: { organisationId, exerciseId, preparerPersonId: personId, currentVersionNo: 1, state: "DRAFT" } })).id;
  versionId = (await db.companyEstimateVersion.create({ data: { organisationId, estimateId, versionNo: 1, value: FIGURE, reason: "first", preparedOn: new Date("2026-10-01T00:00:00.000Z"), preparerPersonId: personId }, select: { id: true } })).id;
  reader = { organisationId, personId, sessionId: null, sourceAddress: null };
});

afterAll(async () => {
  await db.$disconnect();
});

describe("the app's login cannot read the estimate's figure (ruling 20ch)", () => {
  it("a plain SELECT of the figure is refused for want of the privilege, however it is asked", async () => {
    expect(await refusal(asApp((tx) => tx.$queryRawUnsafe(`SELECT "value" FROM "CompanyEstimateVersion"`)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$queryRawUnsafe(`SELECT * FROM "CompanyEstimateVersion"`)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$queryRawUnsafe(`SELECT count(*) FROM "CompanyEstimateVersion" WHERE "value" > 0`)))).toBe("42501");
    expect(await accessRows(versionId)).toEqual([]);
  });

  it("every other column still reads", async () => {
    const rows = await asApp((tx) => tx.$queryRawUnsafe<{ id: string; versionNo: number; preparedOn: Date; reason: string }[]>(`SELECT "id", "versionNo", "preparedOn", "reason" FROM "CompanyEstimateVersion" WHERE "id" = $1`, versionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: versionId, versionNo: 1, reason: "first" });
    expect(rows[0].preparedOn).toBeInstanceOf(Date);
  });

  it("the exercise's estimates load (their versions are selected without the figure)", async () => {
    const estimates = await asApp((tx) => loadEstimates(exerciseId, tx));
    expect(estimates.map((e) => e.id)).toEqual([estimateId]);
    expect(estimates[0].versions.map((v) => v.id)).toEqual([versionId]);
  });

  it("a version is written without the figure coming back", async () => {
    const written = await asApp((tx) =>
      writeEstimateVersion(tx, { organisationId, estimateId, versionNo: 2, value: parseSen("200.00"), reason: "amended", preparedOn: new Date("2026-10-02T00:00:00.000Z"), preparerPersonId: personId, bqVersionId: null }),
    );
    expect(written).toMatchObject({ versionNo: 2 });
    const stored = await db.companyEstimateVersion.findUniqueOrThrow({ where: { id: written.id }, select: { versionNo: true, reason: true } });
    expect(stored).toEqual({ versionNo: 2, reason: "amended" });
    // Owner-side clean-up of this test's own row would be a delete of a sealed row: it is left, and the next tests read both versions.
  });
});

describe("the figure is read only through the logged reader", () => {
  it("returns the figure and writes exactly one access row naming the version and the actor", async () => {
    const before = (await accessRows(versionId)).length;
    const figures = await asApp((tx) => readSealedFigures(tx, estimateId, reader));
    const v1 = figures.versions.find((v) => v.versionNo === 1);
    expect(v1?.value).toBe(parseSen(FIGURE));
    const rows = await accessRows(versionId);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ basis: "LOGGED_FIGURE_READ", outcome: "GRANTED", actorPersonId: personId, organisationId, entityId: versionId });
    expect(rows.at(-1)?.fields).toEqual(["companyEstimate"]);
  });

  it("a wrong organisation raises and writes no row", async () => {
    const before = await db.sulitAccessEvent.count({ where: { entity: "CompanyEstimateVersion" } });
    const state = await refusal(asApp((tx) => readSealedFigures(tx, estimateId, { ...reader, organisationId: otherOrganisationId })));
    // The estimate is not that organisation's, so no version is listed: nothing is read and nothing is logged.
    expect(state).toBeNull();
    const direct = await refusal(
      asApp((tx) => tx.$queryRaw`SELECT public.read_company_estimate_figure(${otherOrganisationId}::text, ${versionId}::text, ${personId}::text, NULL::text, NULL::text, NULL::text)::text AS v`),
    );
    expect(direct).not.toBeNull();
    expect(direct).toMatch(/^PA\d{3}$/);
    expect(await db.sulitAccessEvent.count({ where: { entity: "CompanyEstimateVersion" } })).toBe(before);
  });

  it("the runtime check reads the figure as unreadable for the app's login, and readable for the owner", async () => {
    const facts = await asApp((tx) => readRuntimeRole(tx));
    expect(facts.estimateFigureReadable).toBe(false);
    expect(facts.temporaryHeld).toBe(false);
    expect((await readRuntimeRole(db)).estimateFigureReadable).toBe(true);
  });

  it("the public role may not call the reader (as the owner reads the catalogue)", async () => {
    const rows = await db.$queryRaw<{ ok: boolean }[]>`SELECT has_function_privilege('public', 'public.read_company_estimate_figure(text,text,text,text,text,text)', 'EXECUTE') AS ok`;
    expect(rows[0].ok).toBe(false);
  });
});
