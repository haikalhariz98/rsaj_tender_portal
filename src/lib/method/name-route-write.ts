/**
 * A name route's refusal and its committee step's citation (6.5, OD-12; FR-APR-016), lifted unchanged from the
 * sourcing actions (founder, 2026-10-05) so a sitting recording the matter's outcome can discharge the step by the same
 * function, in its own transaction. Every function here runs inside a transaction whose caller holds the requisition's
 * and the exercise's locks (`withLockedRequisitionForSourcing`).
 */

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { closeRejected, openSuccessor, snapshotOf } from "@/lib/approvals/rejection-store";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { committeeCitationWrite } from "@/lib/authority/decided-step";
import { rejectionOutcome, type RejectionKind } from "@/lib/authority/rejection";
import { exerciseMatters, matterRecord } from "@/lib/award/repo";
import { exerciseCancelBlockedBy } from "@/lib/award/status";
import { linkedVia, type CiteVia } from "@/lib/committee/cite-via";
import { dayToDate, storedDay } from "@/lib/dates";
import { exerciseRouteMatter, exerciseRoutesOf, nameRoutesOf, WITHDRAWN_ON_CANCEL } from "@/lib/method/approval";
import { transitionFault } from "@/lib/method/exercise";
import { findingText } from "@/lib/method/labels";
import type { ExerciseOrg, ExerciseRow } from "@/lib/method/repo";
import type { Finding } from "@/lib/method/types";
import { committeeStepFrom } from "@/lib/requisition/committee-step";
import { voidLivePacks } from "@/lib/tender-docs/store";
import { windowFindingText } from "@/lib/window/labels";
import { nameCitationFault } from "@/lib/window/name-citation";
import type { AuditActor } from "@/lib/auth/types";

export const CHANGED: FormState = { ok: false, message: "The exercise changed while this was being saved. Reload and try again." };

/// A refusal found after a write in the same transaction: thrown, so the whole act rolls back.
export class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

export async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

export const labelOf = (x: { reference: string; title: string }) => `${x.reference} · ${x.title}`;
export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:") => ({ ok: false, message: `${lead} ${fs.map(findingText).join(" ")}` }) as FormState;
export const nameLabel = (ex: { reference: string }) => `${ex.reference} · name approval`;

/// Where a refused name can go: back to whoever asked (it may be asked again), back to
/// an earlier step, or the exercise ends — but not while an award stands on it.
export async function nameSupports(tx: Tx, exerciseId: string): Promise<RejectionKind[]> {
  const live = exerciseCancelBlockedBy(await tx.award.findMany({ where: { exerciseId }, select: { reference: true, status: true } }));
  return live ? ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"] : ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];
}

/// Send a refused name where its rejection says.
export async function sendNameRejected(tx: Tx, actor: AuditActor, l: { org: ExerciseOrg; ex: ExerciseRow }, instId: string, kind: RejectionKind, returnToSeq: number | null, reason: string) {
  const ex = l.ex;
  if (kind === "RETURN_TO_STEP") {
    await openSuccessor(tx, actor, { organisationId: l.org.id, routeLabel: nameLabel(ex) }, instId, returnToSeq!, dayToDate(l.org.today!));
  } else if (kind === "TERMINATE") {
    const t = transitionFault(ex.status, "CANCELLED", { today: l.org.today, reason });
    if (t.length > 0) throw new Refusal(refuse(t, "The exercise cannot end:"));
    const moved = await tx.sourcingExercise.updateMany({ where: { id: ex.id, status: ex.status }, data: { status: "CANCELLED", cancelReason: `Name refused: ${reason}` } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, actor, l.org.id, "SourcingExercise", ex.id, labelOf(ex), "UPDATE", diffFields({ status: ex.status }, { status: "CANCELLED" }), `The name was refused and the exercise ends: ${reason}`);
    // 6.4: the exercise's live pack ends with it, and any other route of its own still open is withdrawn (X-5).
    await voidLivePacks(tx, actor, l, `The name was refused and the exercise ends: ${reason}`);
    for (const inst of exerciseRoutesOf(ex.approvalInstances).filter((i) => i.status === "PENDING" && i.id !== instId)) {
      const warning = { code: WITHDRAWN_ON_CANCEL, level: "info", messageEn: `Withdrawn: the exercise ended when its name was refused — ${reason}` };
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue } });
      await audit(tx, actor, l.org.id, "ApprovalInstance", inst.id, `${ex.reference} · ${exerciseRouteMatter(inst.domain).auditNoun}`, "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), `The exercise ended: ${reason}`);
    }
  }
  // Back to whoever asked: the name may be asked again, and nothing else moves.
}

/**
 * Discharge a committee step of the name's route from the committee's decision (6.5, OD-12,
 * lifting 6.3 BD-7): only a matter tabled as an exercise matter against this exercise on the
 * approval of the name, before the step's committee, for its act, decided no earlier than the
 * route opened, and not already cited (`nameCitationFault`); and only what `decisionRecord()`
 * says of it. Carried discharges it; not carried refuses the route, sent where the committee's
 * outcome says; deferred or undecided leaves it waiting.
 *
 * The one citation of a name route's committee step: its "Cite committee decision" act runs it, and so does a
 * sitting recording the matter's outcome (founder, 2026-10-05; `via` then says so in the step's History). The
 * caller holds the requisition's and the exercise's locks.
 */
export async function citeNameStep(tx: Tx, actor: AuditActor, l: { org: ExerciseOrg; ex: ExerciseRow }, stepId: string, decisionId: string, via: CiteVia = "BY_HAND"): Promise<FormState> {
  const ex = l.ex;
  if (!l.org.today) return { ok: false, message: findingText({ code: "TIME_ZONE_UNSET", level: "block" }) };
  const inst = nameRoutesOf(ex.approvalInstances).find((i) => i.status === "PENDING");
  if (!inst || ex.status === "CANCELLED") return { ok: false, message: "No name approval is open on this exercise." };
  const step = inst.steps.find((s) => s.id === stepId);
  if (!step || !step.committeeCode) return { ok: false, message: "That is not a committee step on the open route." };
  if (step.decision !== "PENDING") return { ok: false, message: "This step is already decided." };
  if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) return { ok: false, message: "Steps are decided in order: the step before this one is not done." };
  const matter = (await exerciseMatters(ex.id, tx)).find((m) => m.id === decisionId);
  if (!matter) return { ok: false, errors: { committeeDecisionId: windowFindingText({ code: "NOT_THIS_EXERCISE", level: "block" }) } };
  const cited = await tx.approvalStep.findMany({ where: { committeeDecisionId: matter.id }, select: { id: true } });
  const fault = nameCitationFault(
    { id: matter.id, exerciseId: matter.exerciseId, matterKind: matter.matterKind, domain: matter.domain, act: matter.act, committeeCode: matter.meeting.committee.code, decidedOn: matter.decisionDate ? storedDay(matter.decisionDate) : null },
    step,
    ex.id,
    storedDay(inst.openedAt),
    cited.length ? [matter.id] : [],
  );
  if (fault) return { ok: false, errors: { committeeDecisionId: windowFindingText({ code: fault, level: "block" }) } };
  const { record, minuted } = matterRecord(matter);
  const s = committeeStepFrom(record);
  if (s.decision === "PENDING") return { ok: false, errors: { committeeDecisionId: record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet." } };
  const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: new Date() });
  const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, actor, l.org.id, "ApprovalStep", step.id, `${ex.reference} · ${step.roleLabel}`, "UPDATE",
    diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: minuted ? "yes" : "no", ...linkedVia(via) }));
  if (s.decision === "REJECTED") {
    const reason = `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}`;
    const supports = await nameSupports(tx, ex.id);
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee: record?.notApproved ?? null, steps: inst.steps, rejectingSeq: step.sequence, supports });
    await closeRejected(tx, actor, { organisationId: l.org.id, routeLabel: nameLabel(ex) }, inst, outcome, reason);
    if ("apply" in outcome) await sendNameRejected(tx, actor, l, inst.id, outcome.apply, outcome.returnToSeq ?? null, reason);
    return { ok: true };
  }
  if (inst.steps.every((x) => x.id === step.id || x.decision === "DONE")) {
    await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "APPROVED", closedAt: new Date() } });
    await audit(tx, actor, l.org.id, "ApprovalInstance", inst.id, nameLabel(ex), "UPDATE", diffFields({ status: inst.status }, { status: "APPROVED" }));
  }
  return { ok: true };
}
