/**
 * A new evaluation version (FR-CTE-009, E-7, E-8), written in the transaction of the act that opens
 * it: a committee's decision not carried on the appointment with a LOOP outcome whose key is the
 * evaluation's (6.10 `recordOutcome`), or the finalising of a supplementary opening once a version
 * exists (6.7 `finaliseOpening`). The version in force is superseded — its report, if issued, stands as
 * it was, never edited — and the next one opens on the same pinned model and frozen rules, with the
 * bids carried to evaluation now (`evaluationSet`). Unchanged bidders' records are carried, each score
 * labelled so; a loop back to clarification or negotiation also carries the stages' submissions and
 * results (re-entry at the meetings), a recall or a new bid does not (every stage is submitted again).
 * The exercise, if Evaluated, is Under evaluation again. Meetings, communications, the recommendation,
 * the report and the Kertas Cadangan stay with the version they belong to. Each write is audited.
 *
 * Locks: the caller holds the evaluations' rows (`lockEvaluationRows`), after the openings' (6.7's
 * finalise), or after requisition → exercise → window → openings → sitting (6.10's outcome; 6.8 fix
 * M-2, `lock.ts`). The clock is the act's one read, passed in as `now` (fix R-9).
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { moveExercise } from "@/lib/method/move";
import type { ExerciseStatus } from "@/lib/method/types";
import { evaluationSet } from "@/lib/opening/carry";

import { EVALUATION_ENTITY, startFields } from "./audit-view";
import { ceilingExclusion, type CeilingSnapshot } from "./ceiling";
import { carryPlan, loopTarget, type LoopStageKey } from "./loop";
import { evaluationLabel } from "./lock";
import { inForce, loadEvaluations } from "./repo";
import { senFromDecimal, formatMoney } from "@/lib/money";

export type NewVersionCause = { trigger: "LOOP"; decisionId: string; key: LoopStageKey; personId: null } | { trigger: "SUPPLEMENTARY_OPENING"; openingId: string; personId: string };

/// The reason a bid is excluded above the ceiling, in words (the boundary is the matrix's, never a bid's price).
export function exclusionReason(j: ReturnType<typeof ceilingExclusion>): string {
  if (!("excluded" in j) || !j.excluded) return "";
  return `Its price is above the exercise's quotation ceiling of ${formatMoney(j.boundary)} (${j.operator === "GT" ? "a price at the ceiling itself is a quotation" : "a price at the ceiling itself is a tender"}).`;
}

/**
 * Supersede the version in force and open the next. Returns the new version's number, or null where
 * there is nothing to supersede (no version in force). `today` is the organisation's day.
 */
export async function openNewVersion(
  tx: Tx,
  x: { organisationId: string; exercise: { id: string; reference: string; title: string; status: ExerciseStatus }; ceiling: CeilingSnapshot; today: string | null; timeZone: string | null; now: Date },
  cause: NewVersionCause,
): Promise<number | null> {
  const evaluations = await loadEvaluations(x.exercise.id, tx);
  const prev = inForce(evaluations);
  if (!prev) return null;
  const openings = await tx.opening.findMany({ where: { exerciseId: x.exercise.id }, select: { kind: true, finalisedAt: true, bids: { select: { id: true, verdict: true, priceAsRead: true } } } });
  const set = evaluationSet(openings.map((o) => ({ kind: o.kind, finalised: o.finalisedAt != null, bids: o.bids.map((b) => ({ ...b, openedBidId: b.id })) })));
  const plan = carryPlan(prev.bidders.map((b) => ({ id: b.id, openedBidId: b.openedBidId, row: b })), set);
  const target = cause.trigger === "LOOP" ? loopTarget(cause.key) : null;
  const carryStages = target?.reEntry === "MEETINGS" && plan.fresh.length === 0;
  const version = Math.max(...evaluations.map((e) => e.version)) + 1;

  await tx.evaluation.update({ where: { id: prev.id }, data: { state: "SUPERSEDED", supersededAt: x.now } });
  const prevLabel = evaluationLabel({ version: prev.version, exercise: { reference: x.exercise.reference } });
  await writeAudit(tx, { organisationId: x.organisationId, entity: EVALUATION_ENTITY.evaluation, entityId: prev.id, entityLabel: prevLabel, reason: "" }, "UPDATE", diffFields({ state: prev.state === "ISSUED" ? "Report issued" : "In progress" }, { state: "Superseded", supersededBy: `Version ${version}` }));

  const next = await tx.evaluation.create({
    data: {
      organisationId: x.organisationId,
      exerciseId: x.exercise.id,
      version,
      state: "OPEN",
      trigger: cause.trigger,
      startedAt: x.now,
      startedByPersonId: cause.personId,
      policySnapshot: prev.policySnapshot as Prisma.InputJsonValue,
      loopDecisionId: cause.trigger === "LOOP" ? cause.decisionId : null,
      loopStageKey: cause.trigger === "LOOP" ? cause.key : null,
      supplementaryOpeningId: cause.trigger === "SUPPLEMENTARY_OPENING" ? cause.openingId : null,
    },
  });
  const label = evaluationLabel({ version, exercise: { reference: x.exercise.reference } });
  const by = cause.personId ? ((await tx.person.findUnique({ where: { id: cause.personId }, select: { name: true } }))?.name ?? null) : null;
  for (const m of prev.team) {
    await tx.evaluationTeamMember.create({ data: { organisationId: x.organisationId, evaluationId: next.id, personId: m.personId, side: m.side, orgUnitCodeSnapshot: m.orgUnitCodeSnapshot, appointedOn: m.appointedOn, recordedAt: x.now } });
  }
  const idMap = new Map<string, string>();
  let excluded = 0;
  for (const c of plan.carried) {
    const b = c.from.row;
    const row = await tx.evaluationBidder.create({
      data: {
        organisationId: x.organisationId,
        evaluationId: next.id,
        openedBidId: b.openedBidId,
        excludedReason: b.excludedReason,
        ceilingSnapshot: (b.ceilingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        correctedPrice: b.correctedPrice,
        correctionReason: b.correctionReason,
        correctedAt: b.correctedAt,
        correctedByPersonId: b.correctedByPersonId,
        shortlisted: carryStages ? b.shortlisted : null,
        shortlistedAt: carryStages ? b.shortlistedAt : null,
        shortlistedByPersonId: carryStages ? b.shortlistedByPersonId : null,
        factorOptionCode: b.factorOptionCode,
        balanceMonth1: b.balanceMonth1,
        balanceMonth2: b.balanceMonth2,
        balanceMonth3: b.balanceMonth3,
        cprPercent: b.cprPercent,
        inputsRecordedAt: b.inputsRecordedAt,
        inputsRecordedByPersonId: b.inputsRecordedByPersonId,
        carriedFromId: b.id,
      },
    });
    if (b.excludedReason) excluded++;
    idMap.set(b.id, row.id);
    for (const s of b.scores.filter((s) => !s.supersededBy)) {
      await tx.evaluationScore.create({ data: { organisationId: x.organisationId, bidderId: row.id, stageCode: s.stageCode, criterionCode: s.criterionCode, marks: s.marks, passed: s.passed, note: s.note, scoredByPersonId: s.scoredByPersonId, recordedAt: s.recordedAt, carriedFromScoreId: s.id } });
    }
    for (const a of b.aspects.filter((a) => !a.supersededBy)) {
      await tx.aspectAssessment.create({ data: { organisationId: x.organisationId, bidderId: row.id, aspectCode: a.aspectCode, verdict: a.verdict, narrative: a.narrative, assessedByPersonId: a.assessedByPersonId, recordedAt: a.recordedAt } });
    }
  }
  for (const openedBidId of plan.fresh) {
    const bid = set.find((b) => b.openedBidId === openedBidId)!;
    const j = ceilingExclusion(senFromDecimal(bid.priceAsRead), x.ceiling);
    const reason = exclusionReason(j);
    if (reason) excluded++;
    await tx.evaluationBidder.create({ data: { organisationId: x.organisationId, evaluationId: next.id, openedBidId, excludedReason: reason, ceilingSnapshot: { regime: x.ceiling.regime, boundary: x.ceiling.boundary != null ? x.ceiling.boundary.toString() : null, operator: x.ceiling.operator } } });
  }
  if (carryStages) {
    for (const s of prev.submissions) await tx.stageSubmission.create({ data: { organisationId: x.organisationId, evaluationId: next.id, stageCode: s.stageCode, side: s.side, submittedByPersonId: s.submittedByPersonId, submittedAt: s.submittedAt } });
    for (const r of prev.results.filter((r) => idMap.has(r.bidderId))) {
      await tx.stageResult.create({ data: { organisationId: x.organisationId, evaluationId: next.id, bidderId: idMap.get(r.bidderId)!, stageCode: r.stageCode, percent: r.percent, shown: r.shown, passed: r.passed, bandLabel: r.bandLabel, outOfRunning: r.outOfRunning, detail: (r.detail ?? undefined) as Prisma.InputJsonValue | undefined } });
    }
  }
  const { scoresShownAt: _unchanged, ...started } = startFields({ version, trigger: cause.trigger, model: "As pinned at publication", at: x.now, by, bidders: set.length, excluded, decimals: null }, x.timeZone);
  void _unchanged;
  await writeAudit(tx, { organisationId: x.organisationId, entity: EVALUATION_ENTITY.evaluation, entityId: next.id, entityLabel: label, reason: "" }, "CREATE", diffFields(null, {
    ...started,
    carried: `${plan.carried.length} ${plan.carried.length === 1 ? "bid's record" : "bids' records"} carried, each score labelled`,
    newBids: plan.fresh.length || null,
    stagesCarried: carryStages ? "yes: re-entry at the meetings" : "no: every stage is submitted again",
  }));
  if (x.exercise.status === "EVALUATED") {
    await moveExercise(tx, { id: x.exercise.id, status: "EVALUATED" }, "UNDER_EVALUATION", { today: x.today, via: "EVALUATION_REOPENED" });
    await writeAudit(tx, { organisationId: x.organisationId, entity: "SourcingExercise", entityId: x.exercise.id, entityLabel: `${x.exercise.reference} · ${x.exercise.title}`, reason: "" }, "UPDATE", diffFields({ status: "EVALUATED" }, { status: "UNDER_EVALUATION" }));
  }
  return version;
}

/**
 * E-10: the exercise cancelled through its window-change route closes the evaluation version in force
 * as cancelled, in the same transaction; its records are kept (an issued report stays as issued). The
 * caller holds the evaluations' rows (after the openings'). Returns the version closed, or null.
 */
export async function closeOnCancellation(tx: Tx, x: { organisationId: string; exercise: { id: string; reference: string }; now: Date; reason: string }): Promise<number | null> {
  const current = await tx.evaluation.findFirst({ where: { exerciseId: x.exercise.id, state: { in: ["OPEN", "ISSUED"] } }, select: { id: true, version: true, state: true } });
  if (!current) return null;
  const moved = await tx.evaluation.updateMany({ where: { id: current.id, state: current.state }, data: { state: "CANCELLED", cancelledAt: x.now } });
  if (moved.count !== 1) throw new Error("The evaluation changed while the exercise was being cancelled.");
  const label = evaluationLabel({ version: current.version, exercise: { reference: x.exercise.reference } });
  await writeAudit(tx, { organisationId: x.organisationId, entity: EVALUATION_ENTITY.evaluation, entityId: current.id, entityLabel: label, reason: x.reason }, "UPDATE", diffFields({ state: current.state === "ISSUED" ? "Report issued" : "In progress" }, { state: "Closed: exercise cancelled" }));
  return current.version;
}
