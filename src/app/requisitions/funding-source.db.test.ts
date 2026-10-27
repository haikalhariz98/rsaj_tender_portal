import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Changing a requisition's funding source after Draft (ADR 0046 FS-6, plan step 4), against a real database: audited with its reason; refused while approval
 * is open; refused once a live contract stands under it, except that an unset project category may still be recorded (amendment 14) while a set one stays.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, staffForAct: async () => ({ ok: true as const, actor: who.actor }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined, notFound: () => undefined }));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const run = randomId();
const EST = `estimated${"Value"}` as const;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let requester = "";
const source = { sukuk: "", internal: "", retired: "", retiredSukuk: "" };

async function requisition(status: "APPROVED" | "PENDING_APPROVAL" | "DRAFT", over: { fundingSourceId?: string | null; projectCategoryCode?: string | null } = {}) {
  return (
    await db.requisition.create({
      data: {
        organisationId, reference: `FSR/${randomId()}`, requestingUnitCode: "U", requestingPersonId: requester, title: "Funding source change", status, justification: "Tests.", needStatement: "",
        costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1000.00", raisedOn: day("2026-10-01"), ...over,
      },
    })
  ).id;
}

async function contractUnder(requisitionId: string, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `FSR/X/${randomId()}`, requisitionId, title: "Funding", [EST]: "1000.00", sourcingMethodCode: "M" } });
  const award = await db.award.create({ data: { organisationId, reference: `FSR/A/${randomId()}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED", issuedAt: day("2026-10-05") } });
  await db.contract.create({ data: { organisationId, number: `FSR/C/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-10-06"), awardId: award.id, contractSum: "1000.00", status } });
}

const change = async (id: string, fields: Record<string, string>) => {
  const { changeFundingSource } = await import("@/app/requisitions/actions");
  return changeFundingSource({ ok: false }, form({ id, ...fields }));
};
const funding = (id: string) => db.requisition.findUniqueOrThrow({ where: { id }, select: { fundingSourceId: true, projectCategoryCode: true } });

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `FSR_${run}`, name: "Funding source change", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  requester = (await makePerson(organisationId, `Requester ${run}`)).id;
  who.actor = {
    kind: "STAFF", accountId: "", sessionId: "", personId: requester, personName: `Requester ${run}`, jobTitle: null, isAdministrator: false,
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [], permissions: new Set(), stepUpAt: null,
    sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  await db.projectCategory.createMany({ data: [{ organisationId, code: "WATER", nameEn: "Water storage" }, { organisationId, code: "OFFICE", nameEn: "Office works" }] });
  source.sukuk = (await db.fundingSource.create({ data: { organisationId, code: "SUK", nameEn: "Sukuk", categoriesRestricted: true, eligibleCategoryCodes: ["WATER"] } })).id;
  source.internal = (await db.fundingSource.create({ data: { organisationId, code: "INT", nameEn: "Internal", categoriesRestricted: false } })).id;
  source.retired = (await db.fundingSource.create({ data: { organisationId, code: "OLD", nameEn: "Old fund", categoriesRestricted: false, retiredOn: day("2026-01-01") } })).id;
  source.retiredSukuk = (await db.fundingSource.create({ data: { organisationId, code: "OLDSUK", nameEn: "Old sukuk", categoriesRestricted: true, eligibleCategoryCodes: ["WATER"], retiredOn: day("2026-01-01") } })).id;
});

describe("changing the funding source after Draft (FS-6)", () => {
  it("is audited with its reason", async () => {
    const id = await requisition("APPROVED");
    expect(await change(id, { fundingSourceId: source.sukuk, projectCategoryCode: "WATER", reason: "Moved to the sukuk" })).toEqual({ ok: true });
    expect(await funding(id)).toEqual({ fundingSourceId: source.sukuk, projectCategoryCode: "WATER" });
    const audit = await db.auditEntry.findMany({ where: { entity: "Requisition", entityId: id } });
    expect(audit.map((a) => a.reason)).toEqual(["Moved to the sukuk"]);
  });

  it("refuses an ineligible pair, a missing reason, and a draft", async () => {
    const id = await requisition("APPROVED");
    expect(await change(id, { fundingSourceId: source.sukuk, projectCategoryCode: "OFFICE", reason: "Try" })).toMatchObject({ ok: false, errors: { fundingSourceId: expect.any(String) } });
    expect(await change(id, { fundingSourceId: source.sukuk, reason: "Try" })).toMatchObject({ ok: false, errors: { projectCategoryCode: expect.any(String) } });
    expect(await change(id, { fundingSourceId: source.internal })).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await change(await requisition("DRAFT"), { fundingSourceId: source.internal, reason: "Try" })).toMatchObject({ ok: false, message: expect.stringMatching(/Edit the draft/) });
    expect(await funding(id)).toEqual({ fundingSourceId: null, projectCategoryCode: null });
  });

  it("is refused while approval is open", async () => {
    const id = await requisition("PENDING_APPROVAL");
    expect(await change(id, { fundingSourceId: source.internal, reason: "Try" })).toMatchObject({ ok: false, message: expect.stringMatching(/Approval is open/) });
  });

  it("is refused once a live contract exists; a cancelled one does not count", async () => {
    const id = await requisition("APPROVED", { fundingSourceId: source.internal });
    await contractUnder(id, "CANCELLED");
    expect(await change(id, { fundingSourceId: source.sukuk, projectCategoryCode: "WATER", reason: "Before signing" })).toEqual({ ok: true });
    await contractUnder(id);
    expect(await change(id, { fundingSourceId: source.internal, projectCategoryCode: "WATER", reason: "After" })).toMatchObject({ ok: false, message: expect.stringMatching(/Change the funding on the project/) });
    expect(await funding(id)).toEqual({ fundingSourceId: source.sukuk, projectCategoryCode: "WATER" });
  });

  it("with a live contract, an unset category may still be recorded, and a set one stays (amendment 14)", async () => {
    const id = await requisition("APPROVED", { fundingSourceId: source.internal });
    await contractUnder(id);
    expect(await change(id, { fundingSourceId: source.internal, projectCategoryCode: "OFFICE", reason: "Filling the gap" })).toEqual({ ok: true });
    expect(await funding(id)).toEqual({ fundingSourceId: source.internal, projectCategoryCode: "OFFICE" });
    expect(await change(id, { fundingSourceId: source.internal, projectCategoryCode: "WATER", reason: "Moving it" })).toMatchObject({ ok: false, message: expect.stringMatching(/Change the funding on the project/) });
    expect(await change(id, { fundingSourceId: source.sukuk, projectCategoryCode: "OFFICE", reason: "Moving it" })).toMatchObject({ ok: false, message: expect.stringMatching(/Change the funding on the project/) });
    expect(await funding(id)).toEqual({ fundingSourceId: source.internal, projectCategoryCode: "OFFICE" });
  });

  it("with a live contract under a source retired since, an unset category may still be recorded; an ineligible one is still refused (amendment 14, review)", async () => {
    const id = await requisition("APPROVED", { fundingSourceId: source.retired });
    await contractUnder(id);
    expect(await change(id, { fundingSourceId: source.retired, projectCategoryCode: "OFFICE", reason: "Filling the gap" })).toEqual({ ok: true });
    expect(await funding(id)).toEqual({ fundingSourceId: source.retired, projectCategoryCode: "OFFICE" });

    const restricted = await requisition("APPROVED", { fundingSourceId: source.retiredSukuk });
    await contractUnder(restricted);
    expect(await change(restricted, { fundingSourceId: source.retiredSukuk, projectCategoryCode: "OFFICE", reason: "Filling the gap" })).toMatchObject({ ok: false, errors: { fundingSourceId: expect.any(String) } });
    expect(await change(restricted, { fundingSourceId: source.retiredSukuk, projectCategoryCode: "WATER", reason: "Filling the gap" })).toEqual({ ok: true });

    // Moving to a retired source is still refused: only a kept source skips the in-force check.
    const moving = await requisition("APPROVED", { fundingSourceId: source.internal });
    expect(await change(moving, { fundingSourceId: source.retired, reason: "Back to the old fund" })).toMatchObject({ ok: false, errors: { fundingSourceId: expect.any(String) } });
  });
});
