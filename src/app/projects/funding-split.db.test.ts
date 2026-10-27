import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * A contract's funding split and impact figures (ADR 0046 FS-7, FS-12; plan step 6), through the real acts: the sum not 100, a source named twice, an
 * ineligible source each refused in words; locked after an issued interim certificate; a replace audited with its reason, in labels; an impact figure
 * recorded, changed and cleared, audited. The supply payment's lock is held in `src/lib/payment/supply.db.test.ts`, which records one.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, staffForAct: async () => ({ ok: true as const, actor: who.actor }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const run = randomId();
const EST = `estimated${"Value"}` as const;
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

let organisationId = "";
let person = "";
const src = { sukuk: "", internal: "", grant: "" };
const measure = { storage: "", households: "" };

async function contract(projectCategoryCode: string | null, status: "ACTIVE" | "NUMBER_ALLOCATED" | "CLOSED" = "ACTIVE") {
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `FSP/R/${randomId()}`, requestingUnitCode: "U", requestingPersonId: person, title: "Split", justification: "Tests.", needStatement: "",
      costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1000.00", raisedOn: day("2026-01-02"), status: "SOURCING", fundingSourceId: src.sukuk, projectCategoryCode,
    },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `FSP/X/${randomId()}`, requisitionId: requisition.id, title: "Split", [EST]: "1000.00", sourcingMethodCode: "M" } });
  const award = await db.award.create({ data: { organisationId, reference: `FSP/A/${randomId()}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED", issuedAt: day("2026-02-01") } });
  return (await db.contract.create({ data: { organisationId, number: `FSP/C/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-02-05"), awardId: award.id, contractSum: "1000.00", status } })).id;
}

const split = async (contractId: string, rows: [string, string][], reason = "Shared funding") => {
  const { recordFundingSplit } = await import("@/app/projects/[id]/funding-actions");
  return recordFundingSplit({ ok: false }, form({ contractId, reason, sourceId: rows.map((x) => x[0]), sharePct: rows.map((x) => x[1]) }));
};
const impact = async (contractId: string, values: Record<string, string>, reason = "Measured on site") => {
  const { recordImpact } = await import("@/app/projects/[id]/funding-actions");
  return recordImpact({ ok: false }, form({ contractId, reason, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [`value_${k}`, v])) }));
};
const shares = async (contractId: string) => (await db.fundingAllocation.findMany({ where: { contractId }, orderBy: { sharePct: "desc" } })).map((a) => [a.fundingSourceId, a.sharePct.toString()]);

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `FSP_${run}`, name: "Funding split", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  person = (await makePerson(organisationId, `Officer ${run}`)).id;
  who.actor = {
    kind: "STAFF", accountId: "", sessionId: "", personId: person, personName: `Officer ${run}`, jobTitle: null, isAdministrator: false,
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [], permissions: new Set(), stepUpAt: null,
    sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  src.sukuk = (await db.fundingSource.create({ data: { organisationId, code: "SUK", nameEn: "Sukuk", categoriesRestricted: true, eligibleCategoryCodes: ["WATER"], sortOrder: 1 } })).id;
  src.internal = (await db.fundingSource.create({ data: { organisationId, code: "INT", nameEn: "Internal", categoriesRestricted: false, sortOrder: 2 } })).id;
  src.grant = (await db.fundingSource.create({ data: { organisationId, code: "GRA", nameEn: "Grant", sortOrder: 3 } })).id;
  measure.storage = (await db.impactMeasure.create({ data: { organisationId, code: "ML", nameEn: "Storage added", unit: "ML" } })).id;
  measure.households = (await db.impactMeasure.create({ data: { organisationId, code: "HH", nameEn: "Households served", unit: "households" } })).id;
});

describe("recording a contract's funding split (FS-7)", () => {
  it("refuses a sum that is not 100, a source named twice, and an ineligible source, in words, writing nothing", async () => {
    const id = await contract("WATER");
    expect(await split(id, [[src.sukuk, "60"], [src.internal, "30"]])).toEqual({ ok: false, message: "The shares must add up to 100%." });
    expect(await split(id, [[src.internal, "50"], [src.internal, "50"]])).toEqual({ ok: false, message: "A source is named twice." });
    const office = await contract("OFFICE");
    expect(await split(office, [[src.sukuk, "60"], [src.internal, "40"]])).toEqual({ ok: false, message: "A source may not fund this project's category." });
    expect(await shares(id)).toEqual([]);
  });

  it("replaces the split whole, audited once with its reason, before and after by label", async () => {
    const id = await contract("WATER");
    expect(await split(id, [[src.sukuk, "60"], [src.internal, "40"]], "Shared with internal funds")).toEqual({ ok: true });
    expect(await shares(id)).toEqual([[src.sukuk, "60"], [src.internal, "40"]]);
    expect(await split(id, [[src.sukuk, "33.33"], [src.grant, "66.67"]], "Grant came in")).toEqual({ ok: true });
    expect(await shares(id)).toEqual([[src.grant, "66.67"], [src.sukuk, "33.33"]]);
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "Contract", entityId: id }, orderBy: { at: "asc" } });
    expect(trail.map((t) => t.reason)).toEqual(["Shared with internal funds", "Grant came in"]);
    expect(JSON.stringify(trail[0].changes)).toContain("Sukuk 60% · Internal 40%");
    expect(JSON.stringify(trail[1].changes)).toContain("Grant 66.67% · Sukuk 33.33%");
    expect(JSON.stringify(trail)).not.toContain("SUK\"");
  });

  it("refuses a recorded split saved again unchanged, writing no audit row; the requisition's source recorded as 100% is a change (review)", async () => {
    const id = await contract("WATER");
    expect(await split(id, [[src.sukuk, "100"]], "Fixing the source on the contract")).toEqual({ ok: true });
    expect(await split(id, [[src.sukuk, "100.00"]], "Again")).toEqual({ ok: false, message: "Nothing differs from the split as it stands." });
    expect(await split(id, [[src.sukuk, "60"], [src.internal, "40"]], "Shared")).toEqual({ ok: true });
    expect(await split(id, [[src.internal, "40"], [src.sukuk, "60.0"]], "Again")).toEqual({ ok: false, message: "Nothing differs from the split as it stands." });
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "Contract", entityId: id }, orderBy: { at: "asc" } });
    expect(trail.map((t) => t.reason)).toEqual(["Fixing the source on the contract", "Shared"]);
  });

  it("is recorded from the number on, before execution, when the requisition's source no longer moves; a closed contract refuses it in the table's words (review)", async () => {
    const id = await contract("WATER", "NUMBER_ALLOCATED");
    expect(await split(id, [[src.internal, "100"]], "The wrong source was picked")).toEqual({ ok: true });
    expect(await impact(id, { [measure.storage]: "2" })).toEqual({ ok: true });
    const closed = await contract("WATER", "CLOSED");
    expect(await split(closed, [[src.internal, "100"]])).toEqual({ ok: false, message: "The contract is closed: only debts, the release of or a claim on the design guarantee bond, and where the originals are held are recorded." });
    expect(await impact(closed, { [measure.storage]: "2" })).toEqual({ ok: false, message: expect.stringMatching(/^The contract is closed/) });
  });

  it("is fixed once an interim certificate is issued", async () => {
    const id = await contract("WATER");
    const baseline = await db.contractBaseline.create({ data: { organisationId, contractId: id, version: 1, reason: "EXECUTED", contractSum: "1000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: new Date(), recordedOn: day("2026-02-06") } });
    await db.certificate.create({ data: { organisationId, contractId: id, kind: "INTERIM_PAYMENT", status: "ISSUED", baselineId: baseline.id, number: `FSP/IPC/${randomId()}`, sequence: 1, issuedAt: new Date(), issueSnapshot: {}, certificateDate: day("2026-03-01"), openedAt: new Date(), openedOn: day("2026-03-01") } });
    expect(await split(id, [[src.internal, "100"]])).toEqual({ ok: false, message: "Funding is fixed once a payment is certified." });
  });
});

describe("recording impact figures (FS-12)", () => {
  it("records, changes and clears a figure, each save audited by measure, and refuses a negative or nothing changed", async () => {
    const id = await contract("WATER");
    expect(await impact(id, { [measure.storage]: "-1" })).toMatchObject({ ok: false, errors: { [`value_${measure.storage}`]: expect.any(String) } });
    expect(await impact(id, { [measure.storage]: "4.5", [measure.households]: "" })).toEqual({ ok: true });
    expect(await impact(id, { [measure.storage]: "4.50" })).toEqual({ ok: false, message: "Nothing differs from the figures as they stand." });
    expect(await impact(id, { [measure.storage]: "6", [measure.households]: "1200" }, "Second phase")).toEqual({ ok: true });
    const rows = await db.projectImpact.findMany({ where: { contractId: id } });
    expect(rows.map((r) => [r.measureId, r.value.toString()]).sort()).toEqual([[measure.households, "1200"], [measure.storage, "6"]].sort());
    expect(await impact(id, { [measure.storage]: "" }, "Withdrawn")).toEqual({ ok: true });
    expect(await db.projectImpact.count({ where: { contractId: id } })).toBe(1);
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "Contract", entityId: id }, orderBy: { at: "asc" } });
    expect(trail.map((t) => t.reason)).toEqual(["Measured on site", "Second phase", "Withdrawn"]);
    expect(JSON.stringify(trail[1].changes)).toContain("6 ML");
  });
});
