import { beforeAll, describe, expect, it } from "vitest";

import type { ChartBody } from "./view";
import { dashboardView } from "./view";
import { CASE_LIST_VIEWS, listCases, type CaseRowView } from "@/lib/contract/case-load";
import { db } from "@/lib/db";
import { parseInsightsQuery } from "@/lib/insights/query";
import { insightsContext, loadInsightsTab, type InsightsReader } from "@/lib/insights/store";
import { listHref, parseListQuery, sortKeys } from "@/lib/list-query";
import { EXERCISE_VIEWS, listExercises } from "@/lib/method/repo";
import { listRequisitions, REQUISITION_VIEWS } from "@/lib/requisition/repo";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Design note 0007 I-6: every tile and bar that links draws an address whose list shows the same number. The links are taken from the view-model
 * itself and read back through the lists' own parsers, under no filter, a department, a funding route and a method, so a filter changing one
 * side and not the other fails here. A restricted exercise the reader is not named on is in neither count.
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const AS_OF = new Date("2026-10-24T04:00:00Z");
const EST = `estimated${"Value"}` as const;
const unit = { ws: `WS${run}`, fin: `FIN${run}` };
let orgId = "";
let reader: InsightsReader;

beforeAll(async () => {
  orgId = (await db.organisation.create({ data: { code: `DL_${run}`, name: "Drill-down", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const named = await makePerson(orgId);
  const outsider = await makePerson(orgId);
  reader = { organisationId: orgId, organisationCode: `DL_${run}`, personId: outsider.id, isAdministrator: false, permissions: new Set(["audit.read"]) };
  await db.orgUnit.createMany({
    data: [
      { organisationId: orgId, code: unit.ws, nameEn: "Water Supply", kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") },
      { organisationId: orgId, code: unit.fin, nameEn: "Finance", kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") },
    ],
  });
  await db.fundingRoute.createMany({ data: ["FR1", "FR2"].map((code) => ({ organisationId: orgId, code, nameEn: `Route ${code}` })) });
  await db.sourcingMethod.createMany({ data: ["M1", "M2"].map((code) => ({ organisationId: orgId, code, nameEn: `Method ${code}` })) });
  await db.budgetPeriod.create({ data: { organisationId: orgId, year: 2026, code: `FY26${run}`, nameEn: "2026", startsOn: day("2026-01-01"), endsOn: day("2027-01-01"), openedOn: day("2026-01-01") } });

  const requisition = (n: string, requestingUnitCode: string, raisedOn: string, status: string, fundingRouteCode: string | null) =>
    db.requisition.create({
      data: {
        organisationId: orgId, reference: `DL/R${n}/${run}`, requestingUnitCode, requestingPersonId: named.id, title: `Drill ${n}`, justification: "Tests.", needStatement: "None.", costCentreCode: "CC",
        accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "5000.00", raisedOn: day(raisedOn), status: status as never, fundingRouteCode,
      },
    });
  await requisition("1", unit.ws, "2026-03-02", "PENDING_APPROVAL", "FR1");
  const r2 = await requisition("2", unit.ws, "2026-05-01", "APPROVED", "FR1");
  const r3 = await requisition("3", unit.fin, "2026-06-10", "OVER_BUDGET", "FR2");
  await requisition("4", unit.ws, "2026-04-01", "DRAFT", null);
  const r5 = await requisition("5", unit.fin, "2025-12-31", "SOURCING", "FR2");
  await requisition("6", unit.ws, "2026-02-01", "ENDORSED", null);
  await db.approvalInstance.create({ data: { organisationId: orgId, matterKind: "REQUISITION", domain: "requisition", value: "5000.00", openedAt: day("2026-05-01"), requisitionId: r2.id, status: "APPROVED", closedAt: new Date("2026-05-08T23:30:00Z") } });

  const exercise = (n: string, requisitionId: string, status: string, sourcingMethodCode: string, restricted = false) =>
    db.sourcingExercise.create({ data: { organisationId: orgId, reference: `DL/X${n}/${run}`, requisitionId, title: `Drill ${n}`, [EST]: "5000.00", sourcingMethodCode, status: status as never, restricted } });
  await exercise("1", r5.id, "DRAFT", "M1");
  await exercise("2", r2.id, "ADVERTISED", "M2");
  await exercise("3", r5.id, "UNDER_EVALUATION", "M1");
  await exercise("4", r3.id, "DOCUMENTS_IN_PREPARATION", "M2");
  await exercise("5", r3.id, "CANCELLED", "M2");
  const hidden = await exercise("H", r2.id, "ADVERTISED", "M1", true);
  await db.exerciseParticipant.create({ data: { exerciseId: hidden.id, personId: named.id } });

  // Cases: an accepted award with a contract on one department, an issued award with none on the other.
  const award = (n: string, exerciseId: string, status: string, issuedAt: Date) =>
    db.award.create({ data: { organisationId: orgId, reference: `DL/A${n}/${run}`, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: status as never, issuedAt } });
  const onWs = await exercise("6", r2.id, "ADVERTISED", "M1");
  const onFin = await exercise("7", r3.id, "ADVERTISED", "M2");
  const aWs = await award("1", onWs.id, "ACCEPTED", new Date("2026-02-01T02:00:00Z"));
  await award("2", onFin.id, "ISSUED", new Date("2026-03-01T02:00:00Z"));
  await db.contract.create({ data: { organisationId: orgId, number: `DL/C1/${run}`, numberSource: "SERIES", numberedOn: day("2026-02-05"), awardId: aWs.id, contractSum: "1000.00" } });
});

const TABS = ["overview", "requisitions", "tenders", "projects"] as const;
const FILTERS: Record<string, string>[] = [{}, { unit: unit.ws }, { unit: unit.fin }, { route: "FR1" }, { method: "M1" }, { unit: unit.ws, route: "FR2" }];
const NOT_LISTS = ["/dashboard", "/approvals", "/configuration", "/suppliers"];

/// What the list opened by this address holds.
async function listTotal(href: string, hidden: string[]): Promise<number> {
  const url = new URL(href, "http://x");
  const sp = Object.fromEntries(url.searchParams);
  if (url.pathname === "/requisitions") return (await listRequisitions(orgId, parseListQuery(sp, REQUISITION_VIEWS, sortKeys("requisition")))).total;
  if (url.pathname === "/sourcing") return (await listExercises(orgId, hidden, parseListQuery(sp, EXERCISE_VIEWS, sortKeys("exercise")))).total;
  if (url.pathname === "/projects") {
    const q = parseListQuery(sp, CASE_LIST_VIEWS, sortKeys("project"));
    return (await listCases(orgId, hidden, { view: (q.view ?? undefined) as CaseRowView | undefined, unit: q.unit })).total;
  }
  throw new Error(`Not a list: ${href}`);
}

const barCount = (b: ChartBody & { kind: "bars" }, i: number) => b.rows[i].values.reduce<number>((n, v) => n + Number(v), 0);

describe("every linked tile and bar opens a list with the same number", () => {
  for (const tab of TABS) {
    for (const filter of FILTERS) {
      it(`${tab} ${JSON.stringify(filter)}`, async () => {
        const ctx = await insightsContext(db, reader, AS_OF);
        const q = parseInsightsQuery({ tab, ...filter }, ctx.choices);
        const view = dashboardView(await loadInsightsTab(db, ctx, q), q, ctx.today);
        let checked = 0;
        for (const t of view.tiles) {
          if (!t.href || NOT_LISTS.some((p) => t.href!.startsWith(p))) continue;
          if (t.value == null || !/^\d+$/.test(t.value)) continue;
          expect(await listTotal(t.href, ctx.hidden), `${t.label} -> ${t.href}`).toBe(Number(t.value));
          checked += 1;
        }
        for (const c of view.charts) {
          if (c.body.kind !== "bars" || c.body.money) continue;
          for (const [i, r] of c.body.rows.entries()) {
            if (!r.href || NOT_LISTS.some((p) => r.href!.startsWith(p))) continue;
            expect(await listTotal(r.href, ctx.hidden), `${c.title} / ${r.label} -> ${r.href}`).toBe(barCount(c.body, i));
            checked += 1;
          }
        }
        // Each tab has linked figures to hold: the Overview pipeline, the Requisitions and Tenders tiles, the Projects stages.
        expect(checked).toBeGreaterThan(0);
      });
    }
  }

  it("a filter reaches the list: the department narrows requisitions, and a stale code finds nothing", async () => {
    const ws = parseListQuery({ unit: unit.ws, view: "pipeline" }, REQUISITION_VIEWS, sortKeys("requisition"));
    expect((await listRequisitions(orgId, ws)).total).toBe(3);
    const gone = parseListQuery({ unit: "NOPE" }, REQUISITION_VIEWS, sortKeys("requisition"));
    expect((await listRequisitions(orgId, gone)).total).toBe(0);
    expect(listHref("/sourcing", ws)).toContain(`unit=${unit.ws}`);
  });
});
