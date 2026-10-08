import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { scopeOf } from "@/lib/org-scope";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { loadWorklist } from "./load";
import { myStepsOf } from "./queue";

/**
 * My steps against a real database (product owner, 2026-10-08, rulings on log lines 1790 and 1792): the worklist shows an officer who keyed the requisition for someone
 * else as barred, with words of their own, from one batched read of the routes it lists; and an office whose only available person is a delegate who would be refused
 * is "nobody able to act", not a step somebody can decide.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const run = randomId();
const OFFICE = `WL_${run}`;

let organisationId = "";
let scope: Parameters<typeof loadWorklist>[0];
let keyer = "";
let colleague = "";
let free = "";
let requisitionOwner = "";

async function requisitionRoute(requestingPersonId: string, steps: { roleCode: string; nonDelegable?: boolean }[] = [{ roleCode: OFFICE }]) {
  const reference = `WL/REQ/${randomId()}`;
  const req = await db.requisition.create({
    data: {
      organisationId, reference, requestingUnitCode: `WL_UNIT_${run}`, requestingPersonId, title: "A requisition for the worklist tests",
      justification: "For the worklist suite.", needStatement: "None.", costCentreCode: "WL_CC", accountCode: "WL_AC", placeOfDelivery: "Nowhere",
      dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
    },
  });
  const id = `wl_route_${randomId()}`;
  await db.approvalInstance.create({ data: { id, organisationId, matterKind: "REQUISITION", domain: "requisition", requisitionId: req.id, openedAt: new Date("2026-10-03T02:00:00Z"), value: "1000.00" } });
  const stepIds: string[] = [];
  for (const [i, s] of steps.entries()) {
    const stepId = `wl_step_${randomId()}`;
    stepIds.push(stepId);
    await db.approvalStep.create({ data: { id: stepId, instanceId: id, sequence: i + 1, roleCode: s.roleCode, roleLabel: `Office ${s.roleCode}`, act: "A", nonDelegable: s.nonDelegable ?? false } });
  }
  return { requisitionId: req.id, routeId: id, stepIds, label: `${reference} · A requisition for the worklist tests` };
}

beforeAll(async () => {
  const org = await db.organisation.upsert({ where: { code: "P3R_WORKLIST_TEST" }, update: {}, create: { code: "P3R_WORKLIST_TEST", name: "Worklist test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  scope = scopeOf(org);
  keyer = (await makePerson(organisationId, `Keyer ${run}`)).id;
  colleague = (await makePerson(organisationId, `Colleague ${run}`)).id;
  free = (await makePerson(organisationId, `Free ${run}`)).id;
  requisitionOwner = (await makePerson(organisationId, `Owner ${run}`)).id;
  await db.authorityRole.create({ data: { organisationId, code: OFFICE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` } });
  await db.roleAssignment.createMany({
    data: [keyer, free].map((personId) => ({ personId, roleCode: OFFICE, effectiveFrom: day("2020-01-01") })),
  });
});

describe("an officer who keyed the requisition for someone else (ruling on log line 1792)", () => {
  it("is shown as barred, with the words of keying it for someone else, while a free holder is told it is waiting for them", async () => {
    const r = await requisitionRoute(colleague);
    // The keyer raised the requisition on the colleague's behalf, from paper.
    await db.actAttribution.create({
      data: { organisationId, entity: "Requisition", entityId: r.requisitionId, slot: "requestingPerson", subjectPersonId: colleague, recordedByPersonId: keyer, mode: "RECORDED_ON_BEHALF", paperReference: "Form 1", reason: "Paper" },
    });
    const w = (await loadWorklist(scope, []))!;
    const item = w.groups.flatMap((g) => g.items).find((i) => i.routeId === r.routeId)!;
    expect(item.barredIds).toEqual([colleague, keyer]);
    expect(item.barredRelations).toEqual({ [colleague]: "RAISED", [keyer]: "KEYED" });
    expect(myStepsOf(w.groups, keyer).find((m) => m.item.routeId === r.routeId)).toMatchObject({ barred: true, relation: "KEYED" });
    expect(myStepsOf(w.groups, free).find((m) => m.item.routeId === r.routeId)).toMatchObject({ barred: false, relation: null });
  });

  it("is not shown as barred on a requisition whose raising was their own signed act", async () => {
    const r = await requisitionRoute(keyer);
    const w = (await loadWorklist(scope, []))!;
    const item = w.groups.flatMap((g) => g.items).find((i) => i.routeId === r.routeId)!;
    // They raised it themselves: barred as the raiser (RAISED), not as someone who keyed it for another.
    expect(item.barredRelations).toEqual({ [keyer]: "RAISED" });
  });
});

describe("an office whose only available person is a delegate who would be refused (ruling on log line 1790)", () => {
  it("is 'nobody able to act' on a step only the holder may decide, and on one above the delegation's ceiling, and not on one the delegate may decide", async () => {
    const OFFICE2 = `WL2_${run}`;
    await db.authorityRole.create({ data: { organisationId, code: OFFICE2, nameEn: `Office two ${run}`, nameMs: `Pejabat dua ${run}` } });
    const away = (await makePerson(organisationId, `Away ${run}`)).id;
    const delegate = (await makePerson(organisationId, `Delegate ${run}`)).id;
    await db.person.update({ where: { id: away }, data: { isAvailable: false } });
    await db.roleAssignment.create({ data: { personId: away, roleCode: OFFICE2, effectiveFrom: day("2020-01-01") } });
    await db.delegation.create({
      data: { organisationId, fromPersonId: away, toPersonId: delegate, roleCode: OFFICE2, capabilityCodes: [], valueCeiling: "500.00", reason: "Cover", reasonMs: "Liputan", noSubDelegation: true, effectiveFrom: day("2020-01-01") },
    });
    const capped = await requisitionRoute(requisitionOwner, [{ roleCode: OFFICE2 }]); // value 1000.00, above the 500.00 ceiling
    const alone = await requisitionRoute(requisitionOwner, [{ roleCode: OFFICE2, nonDelegable: true }]);
    const w = (await loadWorklist(scope, []))!;
    const items = w.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.routeId === capped.routeId)!.noneAvailable).toBe(true);
    expect(items.find((i) => i.routeId === alone.routeId)!.noneAvailable).toBe(true);
    // Raise the ceiling past the value: now the delegate can decide the delegable step, and the holder-only step is still stuck.
    await db.delegation.updateMany({ where: { fromPersonId: away, toPersonId: delegate, roleCode: OFFICE2 }, data: { valueCeiling: "5000.00" } });
    const after = (await loadWorklist(scope, []))!.groups.flatMap((g) => g.items);
    expect(after.find((i) => i.routeId === capped.routeId)!.noneAvailable).toBe(false);
    expect(after.find((i) => i.routeId === alone.routeId)!.noneAvailable).toBe(true);
  });
});
