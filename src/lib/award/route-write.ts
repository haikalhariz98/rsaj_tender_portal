/**
 * An appointment route's step and where a refusal sends the award (6.3 BD-3, FR-APR-016), and the citation of a
 * committee's decision on its committee step, lifted unchanged from the award actions (founder, 2026-10-05) so a
 * sitting recording the matter's outcome can discharge the step by the same function, in its own transaction. Every
 * function here runs inside a transaction whose caller holds the requisition's, the exercise's and the award's locks.
 * Its status mover is still the one writer of an award's status from a variable (accepted-writer.test.ts).
 */

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { closeRejected, openSuccessor, snapshotOf } from "@/lib/approvals/rejection-store";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { committeeCitationWrite } from "@/lib/authority/decided-step";
import { rejectionOutcome, type RejectionKind } from "@/lib/authority/rejection";
import { exerciseCitationFault } from "@/lib/award/citation";
import { exerciseMatters, latestRoute, matterRecord, type LoadedAward } from "@/lib/award/repo";
import { awardTransition } from "@/lib/award/status";
import type { AwardStatus } from "@/lib/award/types";
import { bidFindingText } from "@/lib/bids/labels";
import { bidGate } from "@/lib/bids/repo";
import { linkedVia, type CiteVia } from "@/lib/committee/cite-via";
import { dayToDate, storedDay } from "@/lib/dates";
import { bundleFaults, tabledVersionFault } from "@/lib/evaluation/bundle";
import { loadEvaluationGate } from "@/lib/evaluation/gate-read";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { committeeStepFrom } from "@/lib/requisition/committee-step";

export const CHANGED: FormState = { ok: false, message: "The award changed while this was being saved. Reload and try again." };
export const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration, Organisation first. Today's date decides this act, and it is not assumed to be UTC." };

/// A refusal found after a write in the same transaction: thrown, so the whole act rolls back.
export class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

export async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

export const labelOf = (a: { reference: string; awardeeName: string }) => `${a.reference} · ${a.awardeeName}`;
export const routeLabel = (a: { reference: string }) => `${a.reference} · appointment route`;

/// Move the award from the status read under the lock, or roll the transaction back.
export async function mustMove(tx: Tx, l: LoadedAward, to: AwardStatus, extra: Prisma.AwardUpdateManyMutationInput = {}) {
  const moved = await tx.award.updateMany({ where: { id: l.award.id, status: l.award.status }, data: { status: to, ...extra } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
}

/// Where a refused appointment can go: back to Draft to be reworked, back to an earlier
/// step on a successor route, or the award ends (Cancelled, under BD-17's rules).
export const AWARD_SUPPORTS: readonly RejectionKind[] = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];

/**
 * Close the route when its last step is done. When a step refuses, the destination
 * snapshotted at open — or, on a committee step, the committee's own not-carried
 * outcome — says where the award goes (FR-APR-016); where nothing applies the award
 * waits, still pending approval, for the officer's choice (ruling CO-5).
 */
export async function afterStep(tx: Tx, l: LoadedAward, instId: string, decision: "DONE" | "REJECTED", stepId: string, reason: string, committee: { kind: "LOOP" | "TERMINAL" } | null = null) {
  const inst = l.award.approvalInstances.find((i) => i.id === instId)!;
  if (decision === "REJECTED") {
    const step = inst.steps.find((s) => s.id === stepId)!;
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee, steps: inst.steps, rejectingSeq: step.sequence, supports: AWARD_SUPPORTS });
    await closeRejected(tx, { organisationId: l.org.id, routeLabel: routeLabel(l.award) }, inst, outcome, reason);
    if ("apply" in outcome) await sendAwardRejected(tx, l, inst.id, outcome.apply, outcome.returnToSeq ?? null, reason);
    return;
  }
  if (!inst.steps.every((s) => s.id === stepId || s.decision === "DONE")) return;
  await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "APPROVED", closedAt: new Date() } });
  await audit(tx, l.org.id, "ApprovalInstance", inst.id, routeLabel(l.award), "UPDATE", diffFields({ status: inst.status }, { status: "APPROVED" }), reason);
  await mustMove(tx, l, "APPROVED");
  await audit(tx, l.org.id, "Award", l.award.id, labelOf(l.award), "UPDATE", diffFields({ status: l.award.status }, { status: "APPROVED" }));
}

/// Send a refused appointment where its rejection says.
export async function sendAwardRejected(tx: Tx, l: LoadedAward, instId: string, kind: RejectionKind, returnToSeq: number | null, reason: string) {
  const a = l.award;
  if (kind === "RETURN_TO_ORIGINATOR") {
    await mustMove(tx, l, "DRAFT");
    await audit(tx, l.org.id, "Award", a.id, labelOf(a), "UPDATE", diffFields({ status: a.status }, { status: "DRAFT" }), `The appointment was refused: ${reason}`);
  } else if (kind === "TERMINATE") {
    const t = awardTransition(a.status as AwardStatus, "CANCELLED", { today: l.org.today, reason });
    if (t) throw new Refusal({ ok: false, message: "The award cannot be cancelled from where it stands." });
    await mustMove(tx, l, "CANCELLED", { cancelReason: `The appointment was refused: ${reason}` });
    await audit(tx, l.org.id, "Award", a.id, labelOf(a), "UPDATE", diffFields({ status: a.status }, { status: "CANCELLED" }), `The appointment was refused and the award ends: ${reason}`);
  } else {
    // The award stays pending approval; the route continues from the earlier step.
    await openSuccessor(tx, { organisationId: l.org.id, routeLabel: routeLabel(a) }, instId, returnToSeq!, dayToDate(l.org.today!));
  }
}

/**
 * Discharge a committee step from the committee's decision (6.3 BD-3): only a matter
 * tabled against this award's exercise, before the step's committee, for its act and
 * value, and only what `decisionRecord()` says of it. Carried discharges it; not
 * carried refuses the route and returns the award to Draft; deferred leaves it waiting.
 *
 * The one citation of an appointment route's committee step: its "Cite committee decision" act runs it, and so does
 * a sitting recording the matter's outcome (founder, 2026-10-05; `via` then says so in the step's History). The caller
 * holds the requisition's, the exercise's and the award's locks.
 */
export async function citeAppointmentStep(tx: Tx, l: LoadedAward, stepId: string, decisionId: string, via: CiteVia = "BY_HAND"): Promise<FormState> {
  const inst = latestRoute(l.award);
  if (l.award.status !== "PENDING_APPROVAL" || !inst || inst.status !== "PENDING") return { ok: false, message: "No approval is open on this award." };
  if (!l.org.today) return NO_ZONE;
  const step = inst.steps.find((s) => s.id === stepId);
  if (!step || !step.committeeCode) return { ok: false, message: "That is not a committee step on the open route." };
  if (step.decision !== "PENDING") return { ok: false, message: "This step is already decided." };
  if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) return { ok: false, message: "Steps are decided in order: the step before this one is not done." };
  const matter = (await exerciseMatters(l.ex.id, tx)).find((m) => m.id === decisionId);
  if (!matter) return { ok: false, errors: { committeeDecisionId: "That matter was not tabled against this exercise." } };
  const cited = await tx.approvalStep.findMany({ where: { committeeDecisionId: matter.id }, select: { id: true } });
  const { record, minuted } = matterRecord(matter);
  const fault = exerciseCitationFault(
    { id: matter.id, exerciseId: matter.exerciseId, matterKind: matter.matterKind, domain: matter.domain, act: matter.act, amount: matter.amount?.toString() ?? null, committeeCode: matter.meeting.committee.code, decidedOn: matter.decisionDate ? storedDay(matter.decisionDate) : null },
    step,
    { exerciseId: l.ex.id, value: l.award.awardedValue.toString(), routeOpenedOn: storedDay(inst.openedAt) },
    cited.length ? [matter.id] : [],
  );
  const TEXT = {
    NOT_THIS_EXERCISE: "That matter was not tabled against this exercise.",
    NOT_AN_APPOINTMENT_MATTER: "That matter is not an appointment tabled as an exercise matter.",
    OTHER_COMMITTEE: "That matter was before another committee.",
    OTHER_ACT: "That matter was tabled for a different act from the one this step asks.",
    OTHER_AMOUNT: "That matter was tabled at a different amount from the awarded value.",
    ALREADY_CITED: "That decision already discharges another step: one decision discharges one step.",
    DECIDED_BEFORE_ROUTE: "The committee decided that matter before this award went for approval.",
  } as const;
  if (fault) return { ok: false, errors: { committeeDecisionId: TEXT[fault] } };
  // 6.6 (OD-6, flagged): no appointment decision is cited while a late envelope waits for the committee's decision on admission.
  const bids = await bidGate(l.ex.id, tx);
  if (bids.lateFault) return { ok: false, errors: { committeeDecisionId: bidFindingText(bids.lateFault) } };
  // 6.8 (E-8, flagged): nor while the evaluation's bundle does not stand (its report issued and standing, the Kertas Cadangan checked and recommended).
  // One read (6.8 re-review 1): the version judged is the one whose bundle was checked.
  const gate = await loadEvaluationGate(l.ex.id, tx);
  const bundle = bundleFaults(gate.bundle);
  if (bundle.length) return { ok: false, errors: { committeeDecisionId: bundle.map(evaluationFindingText).join(" ") } };
  // 6.8 fix M-3: and only a decision on the version in force, the one the matter was tabled on.
  const tabledOn = tabledVersionFault({ applies: gate.bundle.applies, tabledOn: matter.evaluationVersion ?? null, inForce: gate.version });
  if (tabledOn) return { ok: false, errors: { committeeDecisionId: evaluationFindingText(tabledOn) } };
  const s = committeeStepFrom(record);
  if (s.decision === "PENDING") return { ok: false, errors: { committeeDecisionId: record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet." } };
  const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: new Date() });
  const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.award.reference} · ${step.roleLabel}`, "UPDATE",
    diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: minuted ? "yes" : "no", ...linkedVia(via) }));
  await afterStep(tx, l, inst.id, s.decision === "DONE" ? "DONE" : "REJECTED", step.id, s.decision === "REJECTED" ? `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}` : "", record?.notApproved ?? null);
  return { ok: true };
}
