/**
 * What the dashboard's three pipeline cards count (Award and Contract Requirements v2, GN-03; ruling AC-12). Pure.
 *
 * Each item in the pipeline is counted in exactly one card:
 * - **Requisitions:** raised and not yet with sourcing: ENDORSED through APPROVED, plus those back with the requester
 *   (RETURNED, RECALLED). A draft has not been raised. SOURCING and PARTIALLY_FULFILLED are counted under Sourcing only, and
 *   the ended statuses not at all.
 * - **Sourcing:** exercises not CANCELLED that have no live award; once an award stands on one, the case is the Contracts
 *   card's. Hidden exercises are left out by the caller (`exerciseNotHidden`).
 * - **Contracts:** cases Awarding, Signing or On site, by the same `caseStage` as the case list (AC-17), under
 *   `caseVisibilityWhere` (AC-18), joined by `casePipelineWhere`. Completed and Closed are left out.
 *
 * The counts themselves are database count and groupBy queries (G4); the filters and the splits are here. The hint's wording
 * is the screen's (G5).
 */

import type { Prisma } from "@/generated/prisma/client";

import { LIVE_STATUSES, isLiveAward } from "@/lib/award/status";
import type { AwardStatus } from "@/lib/award/types";
import { CASE_STAGE_WHERE, type CaseStage, type CaseStanding } from "@/lib/contract/case-stage";
import { caseVisibilityWhere } from "@/lib/contract/case-visibility";
import type { ExerciseStatus } from "@/lib/method/types";
import type { RequisitionStatus } from "@/lib/requisition/types";

// ------------------------------------------------------------------ requisitions

/// The requisition statuses the Requisitions card counts (AC-12).
export const REQUISITION_PIPELINE: readonly RequisitionStatus[] = [
  "ENDORSED",
  "REGISTERED",
  "BUDGET_CHECKED",
  "OVER_BUDGET",
  "PENDING_APPROVAL",
  "APPROVED",
  "RETURNED",
  "RECALLED",
];

/// Approved, waiting for sourcing to begin.
const APPROVED_WAITING: readonly RequisitionStatus[] = ["APPROVED"];
/// Back with the requester to amend or resubmit.
const BACK_WITH_REQUESTER: readonly RequisitionStatus[] = ["RETURNED", "RECALLED"];

export interface RequisitionPipelineSplit {
  total: number;
  approvedWaiting: number;
  backWithRequester: number;
}

/// The card's figure and its hint's two parts, from a count per status (a groupBy's rows). Statuses outside the pipeline are
/// ignored, so the whole organisation's breakdown may be passed.
export function requisitionPipelineSplit(byStatus: readonly { status: RequisitionStatus; count: number }[]): RequisitionPipelineSplit {
  const out: RequisitionPipelineSplit = { total: 0, approvedWaiting: 0, backWithRequester: 0 };
  for (const { status, count } of byStatus) {
    if (!REQUISITION_PIPELINE.includes(status)) continue;
    out.total += count;
    if (APPROVED_WAITING.includes(status)) out.approvedWaiting += count;
    if (BACK_WITH_REQUESTER.includes(status)) out.backWithRequester += count;
  }
  return out;
}

// ------------------------------------------------------------------ sourcing

/// Whether an exercise is on the Sourcing card: not cancelled, and no live award stands on it (`isLiveAward`).
export function sourcingInPipeline(status: ExerciseStatus, awardStatuses: readonly AwardStatus[]): boolean {
  return status !== "CANCELLED" && !awardStatuses.some(isLiveAward);
}

/// The same, as a filter on the exercise table. The caller adds `exerciseNotHidden` and the organisation. `status` is required,
/// so its `not` is plain `<>`.
export const SOURCING_PIPELINE_WHERE: Prisma.SourcingExerciseWhereInput = {
  status: { not: "CANCELLED" },
  awards: { none: { status: { in: [...LIVE_STATUSES] } } },
};

// ------------------------------------------------------------------ contracts

/// The case stages the Contracts card counts, in the order its hint gives them (AC-12).
export type CasePipelineStage = Extract<CaseStage, "AWARDING" | "SIGNING" | "ON_SITE">;
export const CASE_PIPELINE: readonly CasePipelineStage[] = ["AWARDING", "SIGNING", "ON_SITE"];

/// Whether a case is on the Contracts card.
export const caseInPipeline = (s: CaseStanding): boolean => s.kind === "LIVE" && (CASE_PIPELINE as readonly CaseStage[]).includes(s.stage);

/// The Contracts card's stage filters on the Award table, one per counted stage, without the reader's visibility. Count with
/// `casePipelineWhere`, which adds it; never spread one of these beside `caseVisibilityWhere`, because both carry a top-level
/// OR or AND and the second would overwrite the first.
export const CASE_PIPELINE_WHERE: Readonly<Record<CasePipelineStage, Prisma.AwardWhereInput>> = {
  AWARDING: CASE_STAGE_WHERE.AWARDING,
  SIGNING: CASE_STAGE_WHERE.SIGNING,
  ON_SITE: CASE_STAGE_WHERE.ON_SITE,
};

/// One stage of the Contracts card as the reader may count it: the stage's filter AND the case visibility rule (AC-18), so a
/// restricted case before issue is never counted. `hidden` is `hiddenExerciseIds`' answer. The caller adds the organisation
/// as a plain key beside this, which is safe: this carries only `AND`.
export function casePipelineWhere(stage: CasePipelineStage, hidden: readonly string[]): Prisma.AwardWhereInput {
  return { AND: [caseVisibilityWhere(hidden), CASE_PIPELINE_WHERE[stage]] };
}
