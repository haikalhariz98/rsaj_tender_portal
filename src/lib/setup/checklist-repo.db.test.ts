import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

import { loadChecklist } from "./checklist-repo";

/// The checklist read from a real organisation (plan step 4.5): empty is all to do, what is written shows as done, a draft matrix asks to be confirmed and once issued names who did.
let orgId = "";
const state = async (key: string) => (await loadChecklist(db, orgId)).items.find((i) => i.key === key)!;

const matrix = { label: "Limits", effectiveFrom: new Date("2026-01-01"), boundaryValue: 100, quotationFloor: 1, tenderFloor: 2, requisitionBoundary: 3 };

beforeAll(async () => {
  orgId = (await db.organisation.create({ data: { code: `CHK_${Date.now().toString(36).toUpperCase()}`, name: "Your organisation", timeZone: "Asia/Kuala_Lumpur" }, select: { id: true } })).id;
});

describe("the checklist, from the database", () => {
  it("reads every item as to do on an empty organisation; the switch reads on, as the guards do, so it is done", async () => {
    const { items } = await loadChecklist(db, orgId);
    expect(items.filter((i) => i.state !== "todo").map((i) => i.key)).toEqual(["two-person"]);
  });

  it("marks a written fee floor done, and the switch off as to do with the one-person link", async () => {
    await db.documentFeeFloor.create({ data: { organisationId: orgId, regime: "TENDER", minimum: 10 } });
    expect((await state("fees")).state).toBe("done");
    await db.securityPolicy.create({ data: { organisationId: orgId, twoPersonChanges: false } });
    expect(await state("two-person")).toMatchObject({ state: "todo", also: { href: "/configuration/audit?filter=one-person" } });
  });

  it("asks to confirm a draft matrix, and once it is issued names the issuer", async () => {
    const m = await db.authorityMatrix.create({ data: { organisationId: orgId, ...matrix } });
    expect((await state("limits")).state).toBe("confirm");
    const person = await db.person.create({ data: { organisationId: orgId, name: "Aini Issuer" } });
    const maker = await db.person.create({ data: { organisationId: orgId, name: "Bakar Maker" } });
    await db.authorityMatrixMaker.create({ data: { matrixId: m.id, personId: maker.id } });
    await db.authorityMatrix.update({ where: { id: m.id }, data: { issuedAt: new Date(), issuedByPersonId: person.id } });
    expect(await state("limits")).toMatchObject({ state: "done", confirmedBy: { name: "Aini Issuer" } });
  });
});
