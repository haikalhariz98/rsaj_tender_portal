/**
 * The Dashboard's filters on each table (design note 0007 §5, §9). Pure: they build `where` objects, the store runs them.
 *
 * They compose the existing rules, never restate them: Home's pipeline filters (`REQUISITION_PIPELINE`,
 * `SOURCING_PIPELINE_WHERE`, `casePipelineWhere`), the hidden-exercise guard (`exerciseNotHidden`, FR-MTD-007) and the case
 * visibility rule (`caseVisibilityWhere`, AC-18). With no filter set, each pipeline filter is exactly Home's, so the counts
 * match by construction (`where.test.ts`).
 *
 * The organisation is on every filter. `caseVisibilityWhere` and the stage filters carry a top-level OR or AND, so they are
 * joined with `AND: [...]`, never spread. The department is the requesting unit (DB-10), followed down the case. Year bounds:
 * a day column is compared with stored days, an instant with the organisation's midnights.
 */

import type { Prisma } from "@/generated/prisma/client";

import type { AwardStatus } from "@/lib/award/types";
import { exerciseNotHidden } from "@/lib/auth/sulit-store";
import { CASE_STAGE_WHERE, type CaseStage } from "@/lib/contract/case-stage";
import { caseVisibilityWhere } from "@/lib/contract/case-visibility";
import type { CertificateKind } from "@/lib/certificate/types";
import { CASE_PIPELINE, REQUISITION_PIPELINE, SOURCING_PIPELINE_WHERE, casePipelineWhere, type CasePipelineStage } from "@/lib/dashboard/pipeline";
import { dayToDate, instantAt } from "@/lib/dates";
import { PAID_FIGURE } from "@/lib/payment/finance";
import { EXERCISE_PHASE, type ExercisePhase } from "@/lib/method/phase";
import type { ExerciseStatus } from "@/lib/method/types";
import type { RequisitionStatus } from "@/lib/requisition/types";

export interface Filters {
  unit: string | null;
  route?: string | null;
  method?: string | null;
}
type Year = { from: string; to: string };

/// An award counts as awarded once issued, and stays so when accepted (§5.1).
export const AWARDED_STATUSES: readonly AwardStatus[] = ["ISSUED", "ACCEPTED"];
/// The certificate kinds the supplier workspace treats as payable (§5.5): those finance records a paid figure for.
export const PAYABLE_KINDS = Object.keys(PAID_FIGURE) as CertificateKind[];

/// A day column's bounds: stored days, midnight UTC.
const dayBounds = (fy: Year) => ({ gte: dayToDate(fy.from), lt: dayToDate(fy.to) });

/// The instant an organisation day starts. No zone set: UTC, which the header says (§4). A zone that skips midnight on that day
/// (summer time starting at 00:00) starts it at 01:00.
const dayStart = (day: string, timeZone: string | null): Date => (timeZone ? (instantAt(day, "00:00", timeZone) ?? instantAt(day, "01:00", timeZone) ?? dayToDate(day)) : dayToDate(day));
const instantBounds = (fy: Year, timeZone: string | null) => ({ gte: dayStart(fy.from, timeZone), lt: dayStart(fy.to, timeZone) });

const requisitionFilters = (f: Filters): Prisma.RequisitionWhereInput => ({
  ...(f.unit ? { requestingUnitCode: f.unit } : {}),
  ...(f.route ? { fundingRouteCode: f.route } : {}),
});
const exerciseFilters = (f: Filters): Prisma.SourcingExerciseWhereInput => ({
  ...(f.unit ? { requisition: { requestingUnitCode: f.unit } } : {}),
  ...(f.method ? { sourcingMethodCode: f.method } : {}),
});
/// A case's department and method are its exercise's.
const awardFilters = (f: Filters): Prisma.AwardWhereInput => {
  const ex = exerciseFilters(f);
  return Object.keys(ex).length ? { exercise: ex } : {};
};
/// The visible case under a filter, for a table that hangs off a contract.
const visibleCase = (f: Filters, hidden: readonly string[]): Prisma.AwardWhereInput => ({ AND: [caseVisibilityWhere(hidden), awardFilters(f)] });

const approvedRequisitionRoute = { matterKind: "REQUISITION", status: "APPROVED" } as const;

/// The department, route and method filters on each table, for the lists' own drill-down facets (I-6): one definition, so a tile and its list agree.
export const facetWhere = { requisition: requisitionFilters, exercise: exerciseFilters, award: awardFilters };

/// A requisition whose route was approved, whenever.
export const requisitionApprovedAny = { approvalInstances: { some: approvedRequisitionRoute } } satisfies Prisma.RequisitionWhereInput;

/// The open-sourcing pipeline (Home's Sourcing card), narrowed to one phase where given; the statuses are those `EXERCISE_PHASE` puts in it.
export const sourcingPhaseWhere = (phase: ExercisePhase | null): Prisma.SourcingExerciseWhereInput => ({
  AND: [SOURCING_PIPELINE_WHERE, phase ? { status: { in: (Object.keys(EXERCISE_PHASE) as ExerciseStatus[]).filter((s) => s !== "CANCELLED" && EXERCISE_PHASE[s] === phase) } } : {}],
});

export const insightsWhere = {
  /// Raised in the year: not a draft, `raisedOn` (a day) in the year.
  requisitionsRaised: (organisationId: string, f: Filters, fy: Year): Prisma.RequisitionWhereInput => ({
    organisationId,
    status: { not: "DRAFT" },
    raisedOn: dayBounds(fy),
    ...requisitionFilters(f),
  }),

  /// Of those raised in the year, the ones whose requisition route was approved.
  requisitionsApproved: (organisationId: string, f: Filters, fy: Year): Prisma.RequisitionWhereInput => ({
    ...insightsWhere.requisitionsRaised(organisationId, f, fy),
    approvalInstances: { some: approvedRequisitionRoute },
  }),

  /// Requisitions in one status now (a snapshot: no year).
  requisitionsNow: (organisationId: string, f: Filters, status: RequisitionStatus): Prisma.RequisitionWhereInput => ({ organisationId, status, ...requisitionFilters(f) }),

  /// Home's Requisitions card.
  requisitionPipeline: (organisationId: string, f: Filters): Prisma.RequisitionWhereInput => ({ organisationId, status: { in: [...REQUISITION_PIPELINE] }, ...requisitionFilters(f) }),

  /// Approved requisition routes closed in the year (`closedAt`, an instant), for the median days to approval.
  approvalsClosed: (organisationId: string, f: Filters, fy: Year, timeZone: string | null): Prisma.ApprovalInstanceWhereInput => {
    const req = requisitionFilters(f);
    return { organisationId, ...approvedRequisitionRoute, closedAt: instantBounds(fy, timeZone), ...(Object.keys(req).length ? { requisition: req } : {}) };
  },

  /// Home's Sourcing card: open exercises the reader may see.
  sourcingPipeline: (organisationId: string, f: Filters, hidden: readonly string[]): Prisma.SourcingExerciseWhereInput => ({
    organisationId,
    ...exerciseNotHidden(hidden),
    ...SOURCING_PIPELINE_WHERE,
    ...exerciseFilters(f),
  }),

  /// Cases in one stage the reader may see. A pipeline stage is Home's Contracts card's own filter.
  cases: (organisationId: string, stage: CaseStage, f: Filters, hidden: readonly string[]): Prisma.AwardWhereInput => {
    const base = (CASE_PIPELINE as readonly CaseStage[]).includes(stage) ? casePipelineWhere(stage as CasePipelineStage, hidden) : { AND: [caseVisibilityWhere(hidden), CASE_STAGE_WHERE[stage]] };
    const more = awardFilters(f);
    return Object.keys(more).length ? { organisationId, AND: [base, more] } : { organisationId, ...base };
  },

  /// Awards issued in the year (`issuedAt`, an instant) and still issued or accepted, on a visible case.
  awardsIssued: (organisationId: string, f: Filters, fy: Year, timeZone: string | null, hidden: readonly string[]): Prisma.AwardWhereInput => ({
    organisationId,
    status: { in: [...AWARDED_STATUSES] },
    issuedAt: instantBounds(fy, timeZone),
    ...visibleCase(f, hidden),
  }),

  /// Payments made in the year (`paidOn`, a day), on a visible case.
  payments: (organisationId: string, f: Filters, fy: Year, hidden: readonly string[]): Prisma.FinancePaymentWhereInput => ({
    organisationId,
    paidOn: dayBounds(fy),
    certificate: { contract: { award: visibleCase(f, hidden) } },
  }),

  /// Payable certificates issued and not yet paid (a snapshot).
  awaitingPayment: (organisationId: string, f: Filters, hidden: readonly string[]): Prisma.CertificateWhereInput => ({
    organisationId,
    status: "ISSUED",
    kind: { in: PAYABLE_KINDS },
    financePayment: { is: null },
    contract: { award: visibleCase(f, hidden) },
  }),

  /// Variations submitted or supported, not yet decided (a snapshot).
  variationsOpen: (organisationId: string, f: Filters, hidden: readonly string[]): Prisma.VariationWhereInput => ({
    organisationId,
    status: { in: ["SUBMITTED", "SUPPORTED"] },
    contract: { award: visibleCase(f, hidden) },
  }),

  /// Budget codes under the Department filter: the owning unit, from the same unit list as the requisitions' (`departmentUnits`).
  budgetCodes: (organisationId: string, unit: string | null): Prisma.BudgetCodeWhereInput => ({ organisationId, ...(unit ? { owningUnitCode: unit } : {}) }),

  /// Movements carry no organisation; they are scoped through their code.
  budgetMovements: (organisationId: string, unit: string | null): Prisma.BudgetMovementWhereInput => ({ budgetCode: insightsWhere.budgetCodes(organisationId, unit) }),
};
