import { beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { makePerson, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { applyAppRole } from "../../../scripts/db-role-apply";

/**
 * The issue triggers under the two-person switch (ADR 0043 D3, migration 20261127000000_two_person_switch), against the scratch database
 * and as the app's role: a maker may put their own draft in force only while that organisation's switch is off. The switch on, or no
 * SecurityPolicy row, refuses it (PA005). Every other refusal of the trigger stands with the switch off, and one organisation's switch
 * never opens another's draft.
 */

const TEST_ROLE = "perolehan_app_test";
type Tx = Prisma.TransactionClient;

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
/// Runs the write as the app's role; null when it is accepted, else its SQLSTATE. A refused write rolls back with its transaction.
async function asApp(fn: (tx: Tx) => Promise<unknown>): Promise<string | null> {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
      await fn(tx);
    });
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

beforeAll(async () => {
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
});

/// A new organisation whose switch reads `on`, `off`, or has no SecurityPolicy row at all.
async function organisation(policy: "on" | "off" | "none") {
  const org = await db.organisation.create({ data: { code: `TP_${randomId()}`, name: "Two-person switch", timeZone: "Asia/Kuala_Lumpur" } });
  if (policy !== "none") {
    await setPolicy(org.id, SETTINGS);
    await db.securityPolicy.update({ where: { organisationId: org.id }, data: { twoPersonChanges: policy === "on" } });
  }
  return org.id;
}

/// One draft of each kind the triggers guard, with `maker` on record as having made it, and the update that puts it in force.
type Kind = "AuthorityMatrix" | "EvaluationModel" | "RateSchedule";
async function draft(kind: Kind, organisationId: string, maker: string | null) {
  if (kind === "AuthorityMatrix") {
    const m = await db.authorityMatrix.create({
      data: { organisationId, label: `Draft ${randomId()}`, effectiveFrom: new Date("2030-01-01T00:00:00Z"), boundaryValue: "500000.00", quotationFloor: "50000.00", tenderFloor: "500000.00", requisitionBoundary: "500000.00" },
    });
    if (maker) await db.authorityMatrixMaker.create({ data: { matrixId: m.id, personId: maker } });
    return {
      issue: (issuer: string | null) => (tx: Tx) => tx.authorityMatrix.update({ where: { id: m.id }, data: { issuedAt: new Date(), issuedByPersonId: issuer } }),
      rewrite: (issuer: string) => (tx: Tx) => tx.authorityMatrix.update({ where: { id: m.id }, data: { issuedByPersonId: issuer } }),
    };
  }
  const row =
    kind === "EvaluationModel"
      ? await db.evaluationModel.create({ data: { organisationId, code: `t_${randomId()}`, version: 1, nameEn: "T", route: "TRADITIONAL", provenance: "ASSUMED" } })
      : await db.rateSchedule.create({ data: { organisationId, label: `Rates ${randomId()}`, issueNo: 1, provenance: "ASSUMED" } });
  if (maker) await db.configurationDraftMaker.create({ data: { organisationId, entity: kind, entityId: row.id, personId: maker } });
  const issue = (issuer: string | null) => (tx: Tx) =>
    kind === "EvaluationModel"
      ? tx.evaluationModel.update({ where: { id: row.id }, data: { status: "ISSUED", issuedAt: new Date(), contentSnapshot: {}, issuedByPersonId: issuer } })
      : tx.rateSchedule.update({ where: { id: row.id }, data: { status: "ISSUED", issuedOn: new Date(), effectiveFrom: new Date(), issuedByPersonId: issuer } });
  const rewrite = (issuer: string) => (tx: Tx) =>
    kind === "EvaluationModel" ? tx.evaluationModel.update({ where: { id: row.id }, data: { issuedByPersonId: issuer } }) : tx.rateSchedule.update({ where: { id: row.id }, data: { issuedByPersonId: issuer } });
  return { issue, rewrite };
}

describe.each<Kind>(["AuthorityMatrix", "EvaluationModel", "RateSchedule"])("putting a %s in force", (kind) => {
  it("by its own maker is refused while the switch is on (PA005)", async () => {
    const org = await organisation("on");
    const maker = (await makePerson(org)).id;
    const d = await draft(kind, org, maker);
    expect(await asApp(d.issue(maker))).toBe("PA005");
  });

  it("by its own maker is refused when the organisation has no SecurityPolicy row: a missing row reads as on", async () => {
    const org = await organisation("none");
    const maker = (await makePerson(org)).id;
    const d = await draft(kind, org, maker);
    expect(await asApp(d.issue(maker))).toBe("PA005");
  });

  it("by its own maker is accepted while the switch is off, and who issued it is still never changed", async () => {
    const org = await organisation("off");
    const maker = (await makePerson(org)).id;
    const other = (await makePerson(org)).id;
    const d = await draft(kind, org, maker);
    expect(await asApp(d.issue(maker))).toBeNull();
    expect(await asApp(d.rewrite(other))).toBe("PA005");
  });

  it("with the switch off still refuses an issue that names no issuer, or a draft nobody is on record as having made", async () => {
    const org = await organisation("off");
    const person = (await makePerson(org)).id;
    expect(await asApp((await draft(kind, org, person)).issue(null))).toBe("PA005");
    expect(await asApp((await draft(kind, org, null)).issue(person))).toBe("PA005");
  });

  it("is judged by the draft's own organisation: another organisation's switch off does not open it", async () => {
    await organisation("off");
    const org = await organisation("on");
    const maker = (await makePerson(org)).id;
    const d = await draft(kind, org, maker);
    expect(await asApp(d.issue(maker))).toBe("PA005");
  });
});
