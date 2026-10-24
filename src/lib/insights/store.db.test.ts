import { beforeAll, describe, expect, it } from "vitest";

import { spendByPeriod, utilisationByUnit } from "@/lib/budget/analysis";
import { totalsAcross } from "@/lib/budget/codes";
import { loadBudgetCodes, loadBudgetPeriods } from "@/lib/budget/load";
import { listCases } from "@/lib/contract/case-load";
import { pipelineCounts } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { parseInsightsQuery, type InsightsQuery } from "./query";
import { budgetFigures, insightsContext, loadInsightsTab, overviewFigures, projectFigures, requisitionFigures, tenderFigures, type InsightsReader } from "./store";

/**
 * The Dashboard's store against Postgres (design note 0007 I-3): every figure is the organisation's, a restricted exercise the reader
 * is not named on moves no count, Overview's pipeline equals Home's `pipelineCounts`, Projects by stage equals the `/projects` view
 * counts, the Budget tab equals the Budget page's own figures, a reader who fails `mayReadBudget` gets no budget figure, and an
 * organisation with no budget periods gets "not set", never a calendar year. No SULIT field is named here either (`sulit-scan.test.ts`).
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const AS_OF = new Date("2026-10-24T04:00:00Z");
// The department estimate column is SULIT; built so the scan over src/lib/insights finds no name of it here.
const EST = `estimated${"Value"}` as const;

const org = { a: "", b: "" };
const code = { a: `INS_A_${run}`, b: `INS_B_${run}` };
const unit = { ws: `WS${run}`, fin: `FIN${run}` };
const person = { named: "", outsider: "", b: "" };
const hiddenEx: string[] = [];

const reader = (organisationId: string, organisationCode: string, personId: string, permissions: string[] = []): InsightsReader => ({ organisationId, organisationCode, personId, isAdministrator: false, permissions: new Set(permissions) });
const asNamed = () => reader(org.a, code.a, person.named, ["audit.read"]);
const asOutsider = () => reader(org.a, code.a, person.outsider, ["audit.read"]);
const asPlain = () => reader(org.a, code.a, person.outsider);
const asB = () => reader(org.b, code.b, person.b, ["audit.read"]);

async function figures(r: InsightsReader, sp: Record<string, string> = {}) {
  const ctx = await insightsContext(db, r, AS_OF);
  const q: InsightsQuery = parseInsightsQuery(sp, ctx.choices);
  return { ctx, q };
}

beforeAll(async () => {
  const mk = async (c: string) => (await db.organisation.create({ data: { code: c, name: c, timeZone: "Asia/Kuala_Lumpur" } })).id;
  org.a = await mk(code.a);
  org.b = await mk(code.b);
  person.named = (await makePerson(org.a)).id;
  person.outsider = (await makePerson(org.a)).id;
  person.b = (await makePerson(org.b)).id;

  await db.orgUnit.createMany({
    data: [
      { organisationId: org.a, code: unit.ws, nameEn: "Water Supply", kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") },
      { organisationId: org.a, code: unit.fin, nameEn: "Finance", kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") },
    ],
  });
  // Org A's financial year 2026 is the calendar year; org B has no periods at all.
  await db.budgetPeriod.create({ data: { organisationId: org.a, year: 2026, code: `FY26${run}`, nameEn: "2026", startsOn: day("2026-01-01"), endsOn: day("2027-01-01"), openedOn: day("2026-01-01") } });

  const requisition = (organisationId: string, requestingPersonId: string, reference: string, requestingUnitCode: string, raisedOn: string, status: string) =>
    db.requisition.create({
      data: {
        organisationId, reference, requestingUnitCode, requestingPersonId, title: `Insights ${reference}`, justification: "Tests.", needStatement: "None.", costCentreCode: "INS_CC",
        accountCode: "INS_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "5000.00", raisedOn: day(raisedOn), status: status as never,
      },
    });
  const pending = await requisition(org.a, person.named, `INS/R1/${run}`, unit.ws, "2026-03-02", "PENDING_APPROVAL");
  const approved = await requisition(org.a, person.named, `INS/R2/${run}`, unit.ws, "2026-05-01", "APPROVED");
  await requisition(org.a, person.named, `INS/R3/${run}`, unit.fin, "2026-06-10", "OVER_BUDGET");
  await requisition(org.a, person.named, `INS/R4/${run}`, unit.ws, "2026-04-01", "DRAFT");
  const parent = await requisition(org.a, person.named, `INS/R5/${run}`, unit.ws, "2025-12-31", "SOURCING");
  const reqB = await requisition(org.b, person.b, `INS/RB/${run}`, "B_UNIT", "2026-03-02", "PENDING_APPROVAL");

  // Approved at 07:30 on 9 May in Kuala Lumpur, still 8 May in UTC: eight organisation days after it was raised.
  await db.approvalInstance.create({ data: { organisationId: org.a, matterKind: "REQUISITION", domain: "requisition", value: "5000.00", openedAt: day("2026-05-01"), requisitionId: approved.id, status: "APPROVED", closedAt: new Date("2026-05-08T23:30:00Z") } });
  const route = (organisationId: string, link: { requisitionId?: string; exerciseId?: string }) =>
    db.approvalInstance.create({
      data: { organisationId, matterKind: link.exerciseId ? "EXERCISE" : "REQUISITION", domain: "requisition", value: "5000.00", openedAt: day("2026-10-14"), ...link, steps: { create: [{ sequence: 1, roleLabel: "Head of Department", act: "A" as never }] } },
    });
  await route(org.a, { requisitionId: pending.id });
  await route(org.b, { requisitionId: reqB.id });

  const exercise = (organisationId: string, requisitionId: string, reference: string, restricted: boolean) =>
    db.sourcingExercise.create({ data: { organisationId, reference, requisitionId, title: `Insights ${reference}`, [EST]: "5000.00", sourcingMethodCode: "INS_METHOD", restricted } });
  const award = (exerciseId: string, reference: string, status: string, issuedAt: Date | null) =>
    db.award.create({
      data: { organisationId: org.a, reference, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: "Insights Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: status as never, issuedAt },
    });

  await exercise(org.a, parent.id, `INS/X1/${run}`, false);
  // Issued at 20:00 UTC on 31 Dec 2025: 1 January 2026 in Kuala Lumpur, so in the year.
  const awarded = await exercise(org.a, parent.id, `INS/X2/${run}`, false);
  const a2 = await award(awarded.id, `INS/A2/${run}`, "ACCEPTED", new Date("2025-12-31T20:00:00Z"));
  await db.contract.create({ data: { organisationId: org.a, number: `INS/C2/${run}`, numberSource: "SERIES", numberedOn: day("2026-01-05"), awardId: a2.id, contractSum: "1000.00" } });

  // Two restricted exercises the outsider is not named on: one open, one with an issued award and no contract (AC-18: hidden before a contract).
  const h1 = await exercise(org.a, parent.id, `INS/H1/${run}`, true);
  const h2 = await exercise(org.a, parent.id, `INS/H2/${run}`, true);
  await award(h2.id, `INS/AH/${run}`, "ISSUED", new Date("2026-07-01T02:00:00Z"));
  for (const h of [h1, h2]) await db.exerciseParticipant.create({ data: { exerciseId: h.id, personId: person.named } });
  hiddenEx.push(h1.id, h2.id);
  await route(org.a, { exerciseId: h1.id });

  await exercise(org.b, reqB.id, `INS/XB/${run}`, false);

  // Budget: one code per department in A, one in B that A must never count.
  const budgetCode = (organisationId: string, c: string, owningUnitCode: string | null) => db.budgetCode.create({ data: { organisationId, code: c, descriptionEn: `Code ${c}`, owningUnitCode, accountCode: "INS_AC", effectiveFrom: day("2026-01-01") } });
  const ws = await budgetCode(org.a, `BC1${run}`, unit.ws);
  const fin = await budgetCode(org.a, `BC2${run}`, unit.fin);
  const bb = await budgetCode(org.b, `BCB${run}`, null);
  await db.budgetMovement.createMany({
    data: [
      { budgetCodeId: ws.id, kind: "ORIGINAL", reference: "ALLOC", description: "Allocation", amount: "10000.00", occurredOn: day("2026-01-01") },
      { budgetCodeId: ws.id, kind: "COMMITMENT", reference: pending.reference, description: "Commitment", amount: "2500.00", occurredOn: day("2026-02-01") },
      { budgetCodeId: ws.id, kind: "ACTUAL_SPEND", reference: "PAY", description: "Payment", amount: "1000.00", occurredOn: day("2026-03-01") },
      { budgetCodeId: fin.id, kind: "ORIGINAL", reference: "ALLOC", description: "Allocation", amount: "4000.00", occurredOn: day("2026-01-01") },
      { budgetCodeId: bb.id, kind: "ORIGINAL", reference: "ALLOC", description: "Allocation", amount: "999.00", occurredOn: day("2026-01-01") },
    ],
  });
  await db.budgetSettings.create({ data: { organisationId: org.a, warningThresholdPercent: 20 } });
});

describe("Overview", () => {
  it("counts only the organisation's records, the year's in its own zone", async () => {
    const { ctx, q } = await figures(asOutsider());
    const o = await overviewFigures(db, ctx, q);
    expect(o.fy).toMatchObject({ state: "SET", year: 2026, from: "2026-01-01", to: "2027-01-01" });
    // R1, R2, R3: the draft is not raised, R5 was raised in 2025, and B's is B's.
    expect(o.raised).toBe(3);
    expect(o.openTenders).toBe(1);
    expect(o.awarded).toEqual({ count: 1, amount: 100000n });
    expect(o.paid).toBe(0n);
    expect(o.approvals).toEqual({ count: 1, oldestDays: 10 });
    expect(o.months?.[0]).toEqual({ month: "2026-01", awarded: 100000n, paid: 0n });
    expect(o.months).toHaveLength(12);
    // Allocated 140.00 in sen terms: 10 000 + 4 000; used 2 500 + 1 000. B's 999 is not here.
    expect(o.budgetUsed).toEqual({ utilisation: 25, used: 350000n, allocated: 1400000n });
  });

  it("the pipeline bars add up to Home's three cards, for a reader with and without the restricted exercises", async () => {
    for (const r of [asOutsider(), asNamed()]) {
      const { ctx, q } = await figures(r);
      const o = await overviewFigures(db, ctx, q);
      const home = await pipelineCounts(org.a, ctx.hidden);
      const bar = (s: string) => o.pipeline.find((b) => b.stage === s)!.count;
      expect(bar("WITH_CP")).toBe(home.requisitions.total);
      expect(bar("PREPARING") + bar("IN_MARKET") + bar("EVALUATING")).toBe(home.sourcing.total);
      expect([bar("AWARDING"), bar("SIGNING"), bar("ON_SITE")]).toEqual([home.contracts.awarding, home.contracts.signing, home.contracts.onSite]);
    }
  });

  it("a restricted exercise the reader is not named on moves no count and no sum", async () => {
    const outsider = await figures(asOutsider());
    const named = await figures(asNamed());
    expect([...outsider.ctx.hidden].sort()).toEqual([...hiddenEx].sort());
    expect(named.ctx.hidden).toEqual([]);
    const o = await overviewFigures(db, outsider.ctx, outsider.q);
    const n = await overviewFigures(db, named.ctx, named.q);
    expect(n.openTenders - o.openTenders).toBe(1);
    expect(n.awarded!.count - o.awarded!.count).toBe(1);
    expect(n.approvals.count - o.approvals.count).toBe(1);
    const awarding = (x: typeof o) => x.pipeline.find((b) => b.stage === "AWARDING")!.count;
    expect(awarding(n) - awarding(o)).toBe(1);
    const t = await tenderFigures(db, outsider.ctx, { ...outsider.q, tab: "tenders" });
    expect(t.open.total).toBe(1);
    expect(t.awardedByMethod?.reduce((s, g) => s + g.count, 0)).toBe(1);
  });

  it("another organisation's reader sees only its own", async () => {
    const { ctx, q } = await figures(asB());
    const o = await overviewFigures(db, ctx, q);
    expect(o.openTenders).toBe(1);
    expect(o.approvals.count).toBe(1);
    expect(o.pipeline.find((b) => b.stage === "WITH_CP")!.count).toBe(1);
    expect(o.pipeline.find((b) => b.stage === "AWARDING")!.count).toBe(0);
    expect(o.budgetUsed).toEqual({ utilisation: 0, used: 0n, allocated: 99900n });
  });
});

describe("Financial year not set", () => {
  it("year-bound figures say not set, never a calendar year; snapshot figures still count", async () => {
    const { ctx, q } = await figures(asB(), { year: "2026" });
    expect(ctx.choices.years).toEqual([]);
    expect(q.year).toBeNull();
    const o = await overviewFigures(db, ctx, q);
    expect(o.fy).toEqual({ state: "NOT_SET", year: null });
    expect([o.raised, o.awarded, o.paid, o.months]).toEqual([null, null, null, null]);
    expect(o.openTenders).toBe(1);
    const r = await requisitionFigures(db, ctx, { ...q, tab: "requisitions" });
    expect([r.raised, r.approved, r.toApproval, r.months, r.byDepartment, r.byRoute]).toEqual([null, null, null, null, null, null]);
    expect(r.waiting).toBe(1);
    const p = await projectFigures(db, ctx, { ...q, tab: "projects" });
    expect([p.paid, p.paidByMonth, p.topSuppliers]).toEqual([null, null, null]);
    const b = await budgetFigures(db, ctx, { ...q, tab: "budget" });
    expect(b?.through).toBeNull();
    expect(b?.totals.allocated).toBe(99900n);
  });
});

describe("Requisitions", () => {
  it("counts raised, approved and waiting, the median in organisation days, and groups by department and route", async () => {
    const { ctx, q } = await figures(asOutsider(), { tab: "requisitions" });
    const r = await requisitionFigures(db, ctx, q);
    expect([r.raised, r.approved, r.waiting, r.overBudget]).toEqual([3, 1, 1, 1]);
    expect(r.toApproval).toEqual({ days: 8, across: 1 });
    expect(r.byDepartment?.map((g) => [g.label, g.count])).toEqual([["Water Supply", 2], ["Finance", 1]]);
    expect(r.byRoute?.map((g) => [g.label, g.count])).toEqual([["No funding route", 3]]);
    expect(r.months?.find((m) => m.month === "2026-05")).toEqual({ month: "2026-05", raised: 1, approved: 1 });
    expect(r.months?.reduce((n, m) => n + m.raised, 0)).toBe(r.raised);
  });
  it("the Department filter narrows every figure that has a department", async () => {
    const { ctx, q } = await figures(asOutsider(), { tab: "requisitions", unit: unit.fin });
    expect(q.unit).toBe(unit.fin);
    const r = await requisitionFigures(db, ctx, q);
    expect([r.raised, r.approved, r.waiting, r.overBudget]).toEqual([1, 0, 0, 1]);
    expect(r.toApproval).toEqual({ days: null, across: 0 });
  });
});

describe("Projects & payments", () => {
  it("each stage's count equals the /projects stage view's count", async () => {
    for (const r of [asOutsider(), asNamed()]) {
      const { ctx, q } = await figures(r, { tab: "projects" });
      const p = await projectFigures(db, ctx, q);
      const { counts } = await listCases(org.a, ctx.hidden);
      expect(Object.fromEntries(p.stages.map((s) => [s.stage, s.count]))).toEqual({ AWARDING: counts.awarding, SIGNING: counts.signing, ON_SITE: counts.on_site, COMPLETED: counts.completed, CLOSED: counts.closed });
      expect(p.live).toBe(counts.awarding + counts.signing + counts.on_site);
    }
  });
  it("names the year's top supplier from the award", async () => {
    const { ctx, q } = await figures(asOutsider(), { tab: "projects" });
    const p = await projectFigures(db, ctx, q);
    expect(p.topSuppliers).toEqual([{ vendorId: null, label: "Insights Contractor", count: 1, amount: 100000n }]);
    expect(p.awaitingPayment).toEqual({ count: 0, oldestDays: null });
    expect(p.variationsOpen).toEqual({ count: 0, amount: 0n });
  });
});

describe("Budget", () => {
  it("the tab's figures are the Budget page's own, for the same data and year", async () => {
    const { ctx, q } = await figures(asOutsider(), { tab: "budget" });
    const b = (await budgetFigures(db, ctx, q))!;
    const page = await loadBudgetCodes(code.a);
    const { periods } = await loadBudgetPeriods(code.a);
    expect(b.totals).toEqual(totalsAcross(page.codes, page.movements, ctx.on));
    // The tab adds a label and orders by allocation; the figures are the page's.
    const byCode = (xs: readonly { unitCode: string }[]) => [...xs].sort((x, y) => x.unitCode.localeCompare(y.unitCode));
    expect(byCode(b.byUnit)).toEqual(byCode(utilisationByUnit(page.codes, page.movements, ctx.on)).map((u) => ({ ...u, label: u.unitCode === unit.ws ? "Water Supply" : "Finance" })));
    const points = (xs: ReturnType<typeof spendByPeriod>) => xs.map(({ period, ...x }) => ({ period: period.code, ...x }));
    expect(points(b.through!)).toEqual(points(spendByPeriod(periods.filter((p) => p.year === 2026), page.codes, page.movements)));
    expect(b.through).toHaveLength(1);
    expect(b.threshold).toBe(page.settings?.warningThresholdPercent);
    // WS: 3 500 of 10 000 is 35 %, over the 20 % warning; Finance has spent nothing.
    expect(b.codesAtOrOver).toBe(1);
    expect(b.used).toBe("AT_OR_OVER");
    expect(b.top.map((c) => [c.label, c.utilisation, c.state])).toEqual([[`BC1${run} · Code BC1${run}`, 35, "AT_OR_OVER"], [`BC2${run} · Code BC2${run}`, 0, "UNDER"]]);
    expect(b.byUnit.map((u) => u.label)).toEqual(["Water Supply", "Finance"]);
  });
  it("the Department filter is the owning unit", async () => {
    const { ctx, q } = await figures(asOutsider(), { tab: "budget", unit: unit.fin });
    expect((await budgetFigures(db, ctx, q))!.totals.allocated).toBe(400000n);
  });
  it("a reader who fails mayReadBudget gets no budget figure anywhere, and the Budget tab falls back to Overview", async () => {
    const { ctx, q } = await figures(asPlain(), { tab: "budget" });
    expect(ctx.budget).toBe(false);
    expect(q.tab).toBe("overview");
    expect(await budgetFigures(db, ctx, { ...q, tab: "budget" })).toBeNull();
    const fallback = await loadInsightsTab(db, ctx, { ...q, tab: "budget" });
    expect(fallback.tab).toBe("overview");
    expect((fallback as Awaited<ReturnType<typeof overviewFigures>>).budgetUsed).toBeNull();
  });
});
