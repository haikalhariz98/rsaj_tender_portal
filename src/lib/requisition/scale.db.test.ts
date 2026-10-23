import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { listExercises } from "@/lib/method/repo";
import { loadDelegations } from "@/lib/people/load";
import { anyReportingLine } from "@/lib/people/reporting-line-store";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { gatesForRequisition, gatesForRequisitions, listRequisitions, REQUISITIONS_PAGE } from "./repo";

/**
 * Audit batch C (scale), against the scratch database: the requisitions list pages, the new-exercise picker reads gates in one go and gets what the one-by-one read gets, the worklist's
 * delegations are the ones in force, and "any reporting line" is one row.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId: string;
let organisationCode: string;
let personId: string;
const ids: Record<string, string> = {};

const requisition = (over: Record<string, unknown>) => ({
  organisationId, reference: `SC/REQ/${randomId()}`, requestingUnitCode: "SC_DEPT", requestingPersonId: personId, title: "Scale", justification: "Tests.", needStatement: "None.", costCentreCode: "SC_CC",
  accountCode: "SC_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "APPROVED" as const, ...over,
});

beforeAll(async () => {
  organisationCode = `SC_${randomId()}`;
  organisationId = (await db.organisation.create({ data: { code: organisationCode, name: "Scale test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  personId = (await makePerson(organisationId)).id;
  await db.fundingRoute.createMany({
    data: [
      { organisationId, code: "NEEDS", nameEn: "Needs a gate", committeeGateRequired: true, committeeGateProvenance: "STATED" },
      { organisationId, code: "FREE", nameEn: "Needs none", committeeGateRequired: false, committeeGateProvenance: "STATED" },
      { organisationId, code: "UNSET", nameEn: "Not set" },
    ],
  });
  const rule = await db.committeeGateRule.create({ data: { organisationId, fundingRouteCode: "NEEDS", committeeCode: "SC_COM", subjectEn: "Subject", act: "A", effectiveFrom: day("2020-01-01"), provenance: "STATED" } });
  for (const [name, fundingRouteCode] of [["needs", "NEEDS"], ["free", "FREE"], ["unset", "UNSET"], ["none", null], ["determined", "NEEDS"]] as const) {
    ids[name] = (await db.requisition.create({ data: requisition({ fundingRouteCode, ...(name === "determined" ? { gatesDeterminedOn: day("2026-10-01") } : {}) }) })).id;
  }
  await db.requisitionGate.create({ data: { requisitionId: ids.determined, gateRuleId: rule.id, committeeCode: "SC_COM", committeeLabel: "Committee", subjectEn: "Subject", act: "A", ruleProvenance: "STATED", determinedOn: day("2026-10-01") } });
}, 60_000);

describe("gatesForRequisitions", () => {
  it("gives each requisition what the one-by-one read gives it, undetermined and determined alike", async () => {
    const all = Object.values(ids);
    const batch = await gatesForRequisitions(organisationId, all);
    expect(batch.size).toBe(all.length);
    for (const id of all) expect(batch.get(id)).toEqual(await gatesForRequisition(id));
    expect(batch.get(ids.determined)!.gates).toHaveLength(1);
  });
  it("leaves out a requisition that is not the organisation's, and asks nothing of an empty list", async () => {
    const other = (await db.organisation.create({ data: { code: `SC_${randomId()}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } })).id;
    expect((await gatesForRequisitions(other, [ids.needs])).size).toBe(0);
    expect((await gatesForRequisitions(organisationId, [])).size).toBe(0);
  });
});

describe("listRequisitions pages", () => {
  it("serves the rest on the next page, with the counts over the whole set", async () => {
    const extra = REQUISITIONS_PAGE - 5 + 3; // 5 exist; 103 in all
    await db.requisition.createMany({ data: Array.from({ length: extra }, (_, i) => requisition({ reference: `SC/BULK/${String(i).padStart(4, "0")}`, raisedOn: day("2026-09-01") })) });
    const first = await listRequisitions(organisationId, 0);
    const second = await listRequisitions(organisationId, 1);
    expect(first.rows).toHaveLength(REQUISITIONS_PAGE);
    expect(first.total).toBe(REQUISITIONS_PAGE + 3);
    expect(second.rows).toHaveLength(3);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(REQUISITIONS_PAGE + 3);
    expect(second.counts).toEqual(first.counts);
  });
});

describe("listExercises", () => {
  it("counts the whole set by status, and the name approvals waiting, whatever the page", async () => {
    const mk = (status: "DRAFT" | "CANCELLED", over: Record<string, unknown> = {}) =>
      db.sourcingExercise.create({ data: { organisationId, reference: `SC/EX/${randomId()}`, requisitionId: ids.needs, title: "E", estimatedValue: "1000.00", sourcingMethodCode: "M", status, ...over } });
    await mk("DRAFT");
    await mk("DRAFT", { onBoundary: true });
    await mk("CANCELLED", { onBoundary: true });
    const got = await listExercises(organisationId, [], 5);
    expect(got.rows).toEqual([]);
    expect(got.total).toBe(3);
    expect(got.byStatus.get("DRAFT")).toBe(2);
    expect(got.byStatus.get("CANCELLED")).toBe(1);
    expect(got.awaitingName).toBe(0);
    expect(got.onBoundary).toHaveLength(1);
  });
});

describe("loadDelegations in force", () => {
  it("reads only those in force on the day when asked, and all otherwise", async () => {
    const to = (await makePerson(organisationId)).id;
    const d = (effectiveFrom: string, effectiveTo: string | null) => ({ organisationId, fromPersonId: personId, toPersonId: to, roleCode: "R", capabilityCodes: [], effectiveFrom: day(effectiveFrom), effectiveTo: effectiveTo ? day(effectiveTo) : null });
    await db.delegation.createMany({ data: [d("2026-01-01", "2026-03-01"), d("2026-02-01", null), d("2026-05-01", "2026-06-01"), d("2026-12-01", null), d("2026-04-01", "2026-05-01")] });
    expect(await loadDelegations(organisationCode)).toHaveLength(5);
    const on = async (iso: string) => (await loadDelegations(organisationCode, db, { inForceOn: day(iso) })).map((x) => x.effectiveFrom.toISOString().slice(0, 10)).sort();
    expect(await on("2026-02-15")).toEqual(["2026-01-01", "2026-02-01"]);
    // The end day is not in force (exclusive), the start day is.
    expect(await on("2026-03-01")).toEqual(["2026-02-01"]);
    expect(await on("2026-05-01")).toEqual(["2026-02-01", "2026-05-01"]);
  });
});

describe("anyReportingLine", () => {
  it("is false until a line is recorded, and true after", async () => {
    expect(await anyReportingLine(db, organisationId)).toBe(false);
    await db.reportingLine.create({ data: { organisationId, personId, superiorPersonId: null, effectiveFrom: day("2026-01-01") } });
    expect(await anyReportingLine(db, organisationId)).toBe(true);
  });
});
