/**
 * The Dashboard's reads (design note 0007 §5, §9). Server only: every query is the organisation's, built by `insightsWhere`, and
 * every answer is a finished figure, a group or a month slot. No record leaves here, so no row reaches the browser.
 *
 * - Restricted exercises the reader may not see (`hiddenExerciseIds`) are left out of every count and sum, silently (§6.2).
 * - No SULIT field is read (DB-2; `sulit-scan.test.ts`).
 * - Budget figures are read only for a reader who passes `mayReadBudget` (DB-3); for anyone else the ledger is not even loaded.
 * - A year-bound figure is null while the financial year is NOT_SET: the calendar year is never assumed (DB-5). Snapshot figures
 *   ("now") always compute.
 * - Time is a parameter (`asOf`): no clock is read here.
 */

import type { Prisma } from "@/generated/prisma/client";

import { oldestWaitingDays, openStepOf } from "@/lib/approvals/queue";
import { approvalRouteNotHidden, hiddenExerciseIds, type Viewer } from "@/lib/auth/sulit-store";
import { spendByPeriod, utilisationByUnit, type PeriodSpend, type UnitUtilisation } from "@/lib/budget/analysis";
import { figuresFor, thresholdState, totalsAcross, type BudgetCode, type Figures, type Movement, type ThresholdState } from "@/lib/budget/codes";
import { defaultYear, yearsIn, type Period } from "@/lib/budget/periods";
import { CASE_STAGES, type CaseStage } from "@/lib/contract/case-stage";
import { CASE_PIPELINE, type CasePipelineStage } from "@/lib/dashboard/pipeline";
import { dayIn, daysFrom, organisationDay, storedDay, todayIn } from "@/lib/dates";
import type { Tx } from "@/lib/db";
import { EXERCISE_PHASE, type ExercisePhase } from "@/lib/method/phase";
import type { ExerciseStatus } from "@/lib/method/types";
import { addSen, senFromDecimal, type Sen } from "@/lib/money";
import { proceedsFigures, type ProceedsFigures } from "@/lib/funding/store";
import { asCorrected, CORRECTIONS } from "@/lib/payment/correction";
import type { RequisitionStatus } from "@/lib/requisition/types";

import { byMonth, type MonthFigure, type MonthKey } from "./months";
import { departmentUnits, mayReadBudget, type InsightsChoices, type InsightsQuery } from "./query";
import { daysToApproval, groups, median, pipelineBars, type Group, type PipelineStage } from "./tiles";
import { insightsWhere, type Filters } from "./where";
import { financialYear, inYear, type FinancialYear } from "./year";

export interface InsightsReader extends Viewer {
  readonly permissions: ReadonlySet<string>;
}

const DEPARTMENT = { none: "No department", unlisted: "Unlisted department" };
const ROUTE = { none: "No funding route", unlisted: "Unlisted funding route" };
const METHOD = { none: "No method", unlisted: "Unlisted method" };
const SUPPLIER_TOP = 10;
const CODES_TOP = 10;

/// What every tab reads first: the organisation's zone, its financial years, its labels and what the reader may not see.
export interface InsightsContext {
  organisationId: string;
  timeZone: string | null;
  /// The organisation's day as stored (midnight UTC); `asOf` itself where no zone is set, as the Budget page does.
  on: Date;
  /// The organisation's today, for waits. Null where no zone is set: a wait is then not counted (`openStepOf`).
  today: string | null;
  hidden: string[];
  periods: Period[];
  /// `mayReadBudget(reader)`.
  budget: boolean;
  /// Labels for every unit (retired ones too), route and method, by code.
  labels: { units: Map<string, string>; routes: Map<string, string>; methods: Map<string, string> };
  choices: InsightsChoices;
}

export async function insightsContext(client: Tx, reader: InsightsReader, asOf: Date): Promise<InsightsContext> {
  const organisationId = reader.organisationId;
  const [org, periods, units, routes, methods, sources, hidden] = await Promise.all([
    client.organisation.findUnique({ where: { id: organisationId }, select: { timeZone: true } }),
    client.budgetPeriod.findMany({ where: { organisationId }, orderBy: [{ year: "asc" }, { sortOrder: "asc" }] }),
    client.orgUnit.findMany({ where: { organisationId }, select: { code: true, nameEn: true, kind: true, effectiveFrom: true }, orderBy: { effectiveFrom: "asc" } }),
    client.fundingRoute.findMany({ where: { organisationId }, select: { code: true, nameEn: true } }),
    client.sourcingMethod.findMany({ where: { organisationId }, select: { code: true, nameEn: true } }),
    client.fundingSource.findMany({ where: { organisationId }, select: { code: true } }),
    hiddenExerciseIds(client, reader),
  ]);
  const timeZone = org?.timeZone ?? null;
  const budget = mayReadBudget(reader);
  return {
    organisationId,
    timeZone,
    on: organisationDay(asOf, timeZone) ?? asOf,
    today: todayIn(asOf, timeZone),
    hidden,
    periods,
    budget,
    labels: {
      units: new Map(units.map((u) => [u.code, u.nameEn])),
      routes: new Map(routes.map((r) => [r.code, r.nameEn])),
      methods: new Map(methods.map((m) => [m.code, m.nameEn])),
    },
    choices: {
      years: yearsIn(periods),
      defaultYear: defaultYear(periods),
      units: departmentUnits(units).map((u) => u.code),
      routes: routes.map((r) => r.code),
      methods: methods.map((m) => m.code),
      sources: sources.map((s) => s.code),
      budget,
    },
  };
}

type SetYear = Extract<FinancialYear, { state: "SET" }>;
const setYear = (fy: FinancialYear): SetYear | null => (fy.state === "SET" ? fy : null);
const filtersOf = (q: InsightsQuery): Filters => ({ unit: q.unit, route: q.route, method: q.method });
const sumOf = (rows: readonly { amount: Sen }[]): Sen => addSen(0n, ...rows.map((r) => r.amount));

// ------------------------------------------------------------------ shared reads

/// The year's awards, narrow: one read feeds Awarded in FY, by month, by method and the top suppliers.
async function awardsInYear(client: Tx, ctx: InsightsContext, f: Filters, fy: SetYear) {
  const rows = await client.award.findMany({
    where: insightsWhere.awardsIssued(ctx.organisationId, f, fy, ctx.timeZone, ctx.hidden),
    select: { issuedAt: true, awardedValue: true, awardeeName: true, vendorId: true, vendor: { select: { registeredName: true } }, exercise: { select: { sourcingMethodCode: true } } },
  });
  return rows.map((r) => ({
    // The where bounds `issuedAt` to the year, so it is set; read in the organisation's zone, as the bounds are.
    day: dayIn(r.issuedAt!, ctx.timeZone),
    amount: senFromDecimal(r.awardedValue),
    method: r.exercise.sourcingMethodCode,
    vendorId: r.vendorId,
    name: r.vendor?.registeredName ?? r.awardeeName,
  }));
}

async function paymentsInYear(client: Tx, ctx: InsightsContext, f: Filters, fy: SetYear) {
  // Phase 0.3 item 12: a payment counts on its day as last corrected. Read those whose recorded or corrected day is in the year; keep those whose latest is.
  const { paidOn, ...rest } = insightsWhere.payments(ctx.organisationId, f, fy, ctx.hidden);
  const rows = await client.financePayment.findMany({ where: { ...rest, OR: [{ paidOn }, { corrections: { some: { paidOn: paidOn as Prisma.DateTimeFilter<"PaymentCorrection"> } } }] }, select: { paidOn: true, batchNo: true, amount: true, ...CORRECTIONS } });
  return rows.map((r) => asCorrected(r)).map((r) => ({ day: storedDay(r.paidOn), amount: senFromDecimal(r.amount) })).filter((r) => inYear(fy, r.day));
}

/// The matters the worklist (`loadWorklist`) can name a route by; a route on anything else (a contract matter, today) is not on /approvals,
/// so it is not counted here either. Keep in step with `loadWorklist`'s matter labels.
const WORKLIST_MATTERS: Prisma.ApprovalInstanceWhereInput[] = [
  { variationId: { not: null } },
  { certificateId: { not: null } },
  { exerciseId: { not: null } },
  { requisitionId: { not: null } },
  { supplierApplicationId: { not: null } },
  { portalApplicationId: { not: null } },
  { standingRequestId: { not: null } },
  { specialPermissionId: { not: null } },
];

const caseCount = (client: Tx, ctx: InsightsContext, stage: CaseStage, f: Filters) => client.award.count({ where: insightsWhere.cases(ctx.organisationId, stage, f, ctx.hidden) });

/// The budget ledger under the Department filter (the owning unit). Read only behind `mayReadBudget`.
async function ledger(client: Tx, ctx: InsightsContext, unit: string | null): Promise<{ codes: BudgetCode[]; movements: Movement[]; threshold: number | null }> {
  const [codes, settings] = await Promise.all([
    client.budgetCode.findMany({ where: insightsWhere.budgetCodes(ctx.organisationId, unit), orderBy: { code: "asc" }, include: { movements: true } }),
    client.budgetSettings.findUnique({ where: { organisationId: ctx.organisationId }, select: { warningThresholdPercent: true } }),
  ]);
  return {
    codes,
    movements: codes.flatMap((c) => c.movements.map((m) => ({ ...m, kind: m.kind as Movement["kind"], amount: m.amount.toString() }))),
    threshold: settings?.warningThresholdPercent ?? null,
  };
}

// ------------------------------------------------------------------ Overview (§5.1)

export interface OverviewFigures {
  tab: "overview";
  fy: FinancialYear;
  /// Null: not drawn, the reader fails `mayReadBudget`.
  budgetUsed: { utilisation: number | null; used: Sen; allocated: Sen } | null;
  raised: number | null;
  openTenders: number;
  awarded: { count: number; amount: Sen } | null;
  paid: Sen | null;
  /// All departments: the Department filter does not apply.
  approvals: { count: number; oldestDays: number | null };
  pipeline: { stage: PipelineStage; count: number }[];
  months: { month: MonthKey; awarded: Sen; paid: Sen }[] | null;
}

export async function overviewFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<OverviewFigures> {
  const f = filtersOf(q);
  const fy = financialYear(ctx.periods, q.year);
  const set = setYear(fy);
  const org = ctx.organisationId;
  const [budget, raised, reqRows, exRows, cases, awards, payments, routes] = await Promise.all([
    ctx.budget ? ledger(client, ctx, q.unit) : null,
    set ? client.requisition.count({ where: insightsWhere.requisitionsRaised(org, f, set) }) : null,
    client.requisition.groupBy({ by: ["status"], where: insightsWhere.requisitionPipeline(org, f), _count: { _all: true } }),
    client.sourcingExercise.groupBy({ by: ["status"], where: insightsWhere.sourcingPipeline(org, f, ctx.hidden), _count: { _all: true } }),
    Promise.all(CASE_PIPELINE.map((s) => caseCount(client, ctx, s, f))),
    set ? awardsInYear(client, ctx, f, set) : null,
    set ? paymentsInYear(client, ctx, f, set) : null,
    // The open routes as /approvals reads them; only the step fields its waiting rule reads, never the routed value.
    client.approvalInstance.findMany({
      where: { organisationId: org, status: "PENDING", ...approvalRouteNotHidden(ctx.hidden), OR: WORKLIST_MATTERS },
      select: { openedAt: true, steps: { select: { id: true, sequence: true, roleCode: true, roleLabel: true, actingRoleCode: true, actingRoleLabel: true, act: true, committeeCode: true, decision: true, decidedOn: true, escalation: true, escalationReason: true } } },
    }),
  ]);
  const waiting = routes.flatMap((r) => openStepOf(r, ctx.today) ?? []);
  const totals = budget && totalsAcross(budget.codes, budget.movements, ctx.on);
  const pipeline = pipelineBars({
    requisitions: reqRows.map((r) => ({ status: r.status as RequisitionStatus, count: r._count._all })),
    exercises: exRows.map((r) => ({ status: r.status as ExerciseStatus, count: r._count._all })),
    cases: Object.fromEntries(CASE_PIPELINE.map((s, i) => [s, cases[i]])) as Record<CasePipelineStage, number>,
  });
  const awardedByMonth = set && awards ? byMonth(awards, set) : null;
  const paidByMonth = set && payments ? byMonth(payments, set) : null;
  return {
    tab: "overview",
    fy,
    budgetUsed: totals && { utilisation: totals.utilisation, used: addSen(totals.committed, totals.actualSpend), allocated: totals.allocated },
    raised,
    openTenders: pipeline.filter((b) => b.stage === "PREPARING" || b.stage === "IN_MARKET" || b.stage === "EVALUATING").reduce((n, b) => n + b.count, 0),
    awarded: awards && { count: awards.length, amount: sumOf(awards) },
    paid: payments && sumOf(payments),
    approvals: { count: waiting.length, oldestDays: oldestWaitingDays(waiting.map((w) => w.waitingDays)) },
    pipeline,
    months: awardedByMonth && paidByMonth ? awardedByMonth.map((m, i) => ({ month: m.month, awarded: m.amount, paid: paidByMonth[i].amount })) : null,
  };
}

// ------------------------------------------------------------------ Budget (§5.2)

export interface BudgetFigures {
  tab: "budget";
  fy: FinancialYear;
  /// `totalsAcross` over the codes as at the organisation's today, as the Budget page's Availability tab adds them up.
  totals: Figures;
  threshold: number | null;
  used: ThresholdState;
  /// Null where no threshold is set: "Threshold not set", never 0.
  codesAtOrOver: number | null;
  /// `utilisationByUnit`, labelled, largest allocation first.
  byUnit: (UnitUtilisation & { label: string })[];
  /// `spendByPeriod` over the year's periods; null while the year is NOT_SET.
  through: PeriodSpend[] | null;
  /// The most used codes, highest first; a code with no allocation is not ranked.
  top: { code: string; label: string; utilisation: number; state: ThresholdState }[];
}

/// Null for a reader who fails `mayReadBudget` (DB-3): the ledger is not read.
export async function budgetFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<BudgetFigures | null> {
  if (!ctx.budget) return null;
  const fy = financialYear(ctx.periods, q.year);
  const { codes, movements, threshold } = await ledger(client, ctx, q.unit);
  const totals = totalsAcross(codes, movements, ctx.on);
  const each = codes.map((c) => ({ c, f: figuresFor(movements, c.id, ctx.on) }));
  const ranked = each.filter((x) => x.f.utilisation != null).sort((a, b) => b.f.utilisation! - a.f.utilisation! || a.c.code.localeCompare(b.c.code));
  return {
    tab: "budget",
    fy,
    totals,
    threshold,
    used: thresholdState(totals.utilisation, threshold),
    codesAtOrOver: threshold == null ? null : each.filter((x) => thresholdState(x.f.utilisation, threshold) === "AT_OR_OVER").length,
    byUnit: utilisationByUnit(codes, movements, ctx.on)
      .map((u) => ({ ...u, label: u.unitCode ? (ctx.labels.units.get(u.unitCode) ?? DEPARTMENT.unlisted) : DEPARTMENT.none }))
      .sort((a, b) => (b.allocated > a.allocated ? 1 : b.allocated < a.allocated ? -1 : 0) || a.label.localeCompare(b.label)),
    through: fy.state === "SET" ? spendByPeriod(fy.periods, codes, movements) : null,
    top: ranked.slice(0, CODES_TOP).map(({ c, f }) => ({ code: c.code, label: `${c.code} · ${c.descriptionEn}`, utilisation: f.utilisation!, state: thresholdState(f.utilisation, threshold) })),
  };
}

// ------------------------------------------------------------------ Requisitions (§5.3)

export interface RequisitionFigures {
  tab: "requisitions";
  fy: FinancialYear;
  raised: number | null;
  approved: number | null;
  waiting: number;
  overBudget: number;
  /// Calendar days from raised to approved, over the routes approved in the year. `days` null where none was.
  toApproval: { days: number | null; across: number } | null;
  months: { month: MonthKey; raised: number; approved: number }[] | null;
  byDepartment: Group[] | null;
  byRoute: Group[] | null;
}

export async function requisitionFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<RequisitionFigures> {
  const f = filtersOf(q);
  const fy = financialYear(ctx.periods, q.year);
  const set = setYear(fy);
  const org = ctx.organisationId;
  const raisedWhere = set && insightsWhere.requisitionsRaised(org, f, set);
  const [byUnit, byRoute, approved, waiting, overBudget, raisedDays, closed] = await Promise.all([
    raisedWhere ? client.requisition.groupBy({ by: ["requestingUnitCode"], where: raisedWhere, _count: { _all: true } }) : null,
    raisedWhere ? client.requisition.groupBy({ by: ["fundingRouteCode"], where: raisedWhere, _count: { _all: true } }) : null,
    set ? client.requisition.count({ where: insightsWhere.requisitionsApproved(org, f, set) }) : null,
    client.requisition.count({ where: insightsWhere.requisitionsNow(org, f, "PENDING_APPROVAL") }),
    client.requisition.count({ where: insightsWhere.requisitionsNow(org, f, "OVER_BUDGET") }),
    raisedWhere ? client.requisition.findMany({ where: raisedWhere, select: { raisedOn: true } }) : null,
    set ? client.approvalInstance.findMany({ where: insightsWhere.approvalsClosed(org, f, set, ctx.timeZone), select: { closedAt: true, requisition: { select: { raisedOn: true } } } }) : null,
  ]);
  const routes = (closed ?? []).flatMap((r) => (r.closedAt ? [{ closedAt: r.closedAt, raisedOn: r.requisition?.raisedOn ?? null }] : []));
  const days = routes.flatMap((r) => (r.raisedOn ? [daysToApproval(r.raisedOn, r.closedAt, ctx.timeZone)] : []));
  const raisedMonths = set && raisedDays ? byMonth(raisedDays.map((r) => ({ day: storedDay(r.raisedOn) })), set) : null;
  const approvedMonths = set ? byMonth(routes.map((r) => ({ day: dayIn(r.closedAt, ctx.timeZone) })), set) : null;
  const departments = byUnit && groups(byUnit.map((r) => ({ key: r.requestingUnitCode, count: r._count._all })), ctx.labels.units, DEPARTMENT);
  return {
    tab: "requisitions",
    fy,
    raised: departments && departments.reduce((n, g) => n + g.count, 0),
    approved,
    waiting,
    overBudget,
    toApproval: set ? { days: median(days), across: days.length } : null,
    months: raisedMonths && approvedMonths ? raisedMonths.map((m, i) => ({ month: m.month, raised: m.count, approved: approvedMonths[i].count })) : null,
    byDepartment: departments,
    byRoute: byRoute && groups(byRoute.map((r) => ({ key: r.fundingRouteCode, count: r._count._all })), ctx.labels.routes, ROUTE),
  };
}

// ------------------------------------------------------------------ Tenders & quotations (§5.4)

export interface TenderFigures {
  tab: "tenders";
  fy: FinancialYear;
  open: { total: number } & Record<ExercisePhase, number>;
  /// Open now, by method, each split by phase; largest first.
  openByMethod: (Group & { phases: Record<ExercisePhase, number> })[];
  awarded: { count: number; amount: Sen } | null;
  awardedByMonth: MonthFigure[] | null;
  awardedByMethod: Group[] | null;
}

const noPhases = (): Record<ExercisePhase, number> => ({ PREPARING: 0, IN_MARKET: 0, EVALUATING: 0 });

export async function tenderFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<TenderFigures> {
  const f = filtersOf(q);
  const fy = financialYear(ctx.periods, q.year);
  const set = setYear(fy);
  const [openRows, awards] = await Promise.all([
    client.sourcingExercise.groupBy({ by: ["sourcingMethodCode", "status"], where: insightsWhere.sourcingPipeline(ctx.organisationId, f, ctx.hidden), _count: { _all: true } }),
    set ? awardsInYear(client, ctx, f, set) : null,
  ]);
  const open = { total: 0, ...noPhases() };
  const phasesBy = new Map<string | null, Record<ExercisePhase, number>>();
  for (const r of openRows) {
    const status = r.status as ExerciseStatus;
    // The pipeline filter leaves cancelled out; every other status has a phase.
    if (status === "CANCELLED") continue;
    const phase = EXERCISE_PHASE[status];
    const key = r.sourcingMethodCode || null;
    const p = phasesBy.get(key) ?? noPhases();
    p[phase] += r._count._all;
    phasesBy.set(key, p);
    open[phase] += r._count._all;
    open.total += r._count._all;
  }
  const byMethod = groups([...phasesBy].map(([key, p]) => ({ key, count: p.PREPARING + p.IN_MARKET + p.EVALUATING })), ctx.labels.methods, METHOD);
  return {
    tab: "tenders",
    fy,
    open,
    openByMethod: byMethod.map((g) => ({ ...g, phases: phasesBy.get(g.key)! })),
    awarded: awards && { count: awards.length, amount: sumOf(awards) },
    awardedByMonth: set && awards ? byMonth(awards, set) : null,
    awardedByMethod: awards && groups(awards.map((a) => ({ key: a.method, count: 1, amount: a.amount })), ctx.labels.methods, METHOD),
  };
}

// ------------------------------------------------------------------ Projects & payments (§5.5)

export interface ProjectFigures {
  tab: "projects";
  fy: FinancialYear;
  /// Every case stage, in order: the `/projects` stage views' counts.
  stages: { stage: CaseStage; count: number }[];
  live: number;
  onSite: number;
  /// The original contract sums of the on-site cases; variations are not added.
  onSiteValue: Sen;
  paid: Sen | null;
  paidByMonth: MonthFigure[] | null;
  /// `oldestDays` is null where no zone is set or nothing waits.
  awaitingPayment: { count: number; oldestDays: number | null };
  variationsOpen: { count: number; amount: Sen };
  /// Awarded in the year, by supplier: the register's name where linked (`vendorId`), else the awardee's as written.
  topSuppliers: { vendorId: string | null; label: string; count: number; amount: Sen }[] | null;
}

export async function projectFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<ProjectFigures> {
  const f = filtersOf(q);
  const fy = financialYear(ctx.periods, q.year);
  const set = setYear(fy);
  const org = ctx.organisationId;
  const [stageCounts, onSiteSum, payments, awaiting, variations, awards] = await Promise.all([
    Promise.all(CASE_STAGES.map((s) => caseCount(client, ctx, s, f))),
    client.contract.aggregate({ where: { award: insightsWhere.cases(org, "ON_SITE", f, ctx.hidden) }, _sum: { contractSum: true } }),
    set ? paymentsInYear(client, ctx, f, set) : null,
    client.certificate.aggregate({ where: insightsWhere.awaitingPayment(org, f, ctx.hidden), _count: { _all: true }, _min: { issuedAt: true } }),
    client.variation.aggregate({ where: insightsWhere.variationsOpen(org, f, ctx.hidden), _count: { _all: true }, _sum: { estimate: true } }),
    set ? awardsInYear(client, ctx, f, set) : null,
  ]);
  const stages = CASE_STAGES.map((stage, i) => ({ stage, count: stageCounts[i] }));
  const count = (s: CaseStage) => stages.find((x) => x.stage === s)!.count;
  const oldest = awaiting._min.issuedAt;
  const suppliers = new Map<string, { vendorId: string | null; label: string; count: number; amount: Sen }>();
  for (const a of awards ?? []) {
    const key = a.vendorId ?? `name:${a.name}`;
    const s = suppliers.get(key) ?? { vendorId: a.vendorId, label: a.name, count: 0, amount: 0n };
    s.count += 1;
    s.amount = addSen(s.amount, a.amount);
    suppliers.set(key, s);
  }
  return {
    tab: "projects",
    fy,
    stages,
    live: CASE_PIPELINE.reduce((n, s) => n + count(s), 0),
    onSite: count("ON_SITE"),
    onSiteValue: senFromDecimal(onSiteSum._sum.contractSum),
    paid: payments && sumOf(payments),
    paidByMonth: set && payments ? byMonth(payments, set) : null,
    awaitingPayment: { count: awaiting._count._all, oldestDays: oldest && ctx.today ? Math.max(0, daysFrom(dayIn(oldest, ctx.timeZone), ctx.today)) : null },
    variationsOpen: { count: variations._count._all, amount: senFromDecimal(variations._sum.estimate) },
    topSuppliers: awards && [...suppliers.values()].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0) || a.label.localeCompare(b.label)).slice(0, SUPPLIER_TOP),
  };
}

// ------------------------------------------------------------------ one tab

export type TabFigures = OverviewFigures | BudgetFigures | RequisitionFigures | TenderFigures | ProjectFigures | ProceedsFigures;
export type { ProceedsFigures };

/// The selected tab's figures; only its queries run. A Budget tab asked for by a reader who fails the predicate falls back to Overview
/// (`parseInsightsQuery` already does; this holds it again).
export async function loadInsightsTab(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<TabFigures> {
  switch (q.tab) {
    case "budget":
      return (await budgetFigures(client, ctx, q)) ?? overviewFigures(client, ctx, { ...q, tab: "overview" });
    case "proceeds":
      // DB-3, as the Budget tab: never computed for a reader who fails the predicate.
      return ctx.budget ? proceedsFigures(client, ctx, q) : overviewFigures(client, ctx, { ...q, tab: "overview" });
    case "requisitions":
      return requisitionFigures(client, ctx, q);
    case "tenders":
      return tenderFigures(client, ctx, q);
    case "projects":
      return projectFigures(client, ctx, q);
    default:
      return overviewFigures(client, ctx, q);
  }
}
