/**
 * Writing a rejection's destination (FR-APR-016, ADR 0009). The rules are pure, in
 * `authority/rejection.ts`; this stores what they decided, inside the caller's
 * transaction, with its audit rows. The caller holds the matter's lock and moves the
 * matter itself, through its own state machine.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { successorSteps, type DestinationRow, type RejectionKind, type RejectionOutcome, type RouteSnapshot } from "@/lib/authority/rejection";
import { REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import type { AuditActor } from "@/lib/auth/types";

export async function loadDestinations(tx: Tx, organisationId: string): Promise<DestinationRow[]> {
  const rows = await tx.rejectionDestination.findMany({ where: { organisationId } });
  return rows.map((r) => ({ ...r, kind: r.kind as RejectionKind, provenance: r.provenance as DestinationRow["provenance"] }));
}

/// The route's snapshot as `rejectionOutcome` reads it.
export function snapshotOf(inst: { rejectionSnapshotAt: Date | null; rejectionKind: string | null; rejectionReturnToRoleCode: string | null }): RouteSnapshot {
  return { snapshotAt: inst.rejectionSnapshotAt, kind: (inst.rejectionKind as RejectionKind | null) ?? null, returnToRoleCode: inst.rejectionReturnToRoleCode };
}

interface Who {
  organisationId: string;
  /// How the route reads in the trail: "<reference> · approval route".
  routeLabel: string;
}

/**
 * Close a route as rejected and record what the rejection decided: the destination
 * applied and on whose say, or what the officer is offered to choose from. `decidedBy`
 * names the say where it is neither a configured destination nor a committee's outcome
 * (6.4: the procedure returns the documents for amendment, Q-3).
 */
/// `at`: the act's server stamp, read once at its entry (6.13 Part A step 3: a certificate's route passes it; the
/// earlier callers keep reading the clock here, as they did).
export async function closeRejected(tx: Tx, actor: AuditActor, who: Who, inst: { id: string; status: string }, outcome: RejectionOutcome, reason: string, decidedBy?: string, at: Date = new Date()) {
  const data: Prisma.ApprovalInstanceUpdateInput =
    "apply" in outcome
      ? { status: "REJECTED", closedAt: at, rejectionApplied: outcome.apply, rejectionSource: outcome.source, rejectionReason: reason }
      : { status: "REJECTED", closedAt: at, rejectionChoices: outcome.choose, rejectionChoiceWhy: outcome.why, rejectionReason: reason };
  const moved = await tx.approvalInstance.updateMany({ where: { id: inst.id, status: "PENDING" }, data: data as Prisma.ApprovalInstanceUpdateManyMutationInput });
  if (moved.count !== 1) throw new Error("The route changed while the rejection was being recorded.");
  await writeAudit(tx, { actor, organisationId: who.organisationId, entity: "ApprovalInstance", entityId: inst.id, entityLabel: who.routeLabel, reason }, "UPDATE",
    diffFields(
      { status: inst.status },
      "apply" in outcome
        ? { status: "REJECTED", goesTo: REJECTION_KIND_LABEL[outcome.apply], decidedBy: decidedBy ?? (outcome.source === "COMMITTEE_OUTCOME" ? "the committee's outcome" : "the configured destination") }
        : { status: "REJECTED", goesTo: "awaiting the officer's choice" },
    ));
}

/// Record the officer's choice on a rejected route (ruling CO-5): theirs, never policy.
export async function recordChoice(tx: Tx, actor: AuditActor, who: Who, instId: string, kind: RejectionKind, personId: string, personName: string, reason: string) {
  const moved = await tx.approvalInstance.updateMany({
    where: { id: instId, status: "REJECTED", rejectionApplied: null },
    data: { rejectionApplied: kind, rejectionSource: "OFFICER_CHOICE", rejectionChosenByPersonId: personId },
  });
  if (moved.count !== 1) throw new Error("The route changed while the choice was being recorded.");
  await writeAudit(tx, { actor, organisationId: who.organisationId, entity: "ApprovalInstance", entityId: instId, entityLabel: who.routeLabel, reason }, "UPDATE",
    diffFields({ goesTo: null }, { goesTo: REJECTION_KIND_LABEL[kind], chosenBy: personName, recordedOnBehalf: "not signed", source: "officer's choice" }));
}

/**
 * Open the successor route from an earlier step (ADR 0009): the rejected route's rule,
 * matrix, checks and rejection snapshot are kept as they were judged — it is the same
 * approval continued, not a new resolution — steps before the target carried, the
 * rest pending. Returns the new route's id.
 */
export async function openSuccessor(tx: Tx, actor: AuditActor, who: Who, rejectedId: string, returnToSeq: number, openedAt: Date): Promise<string> {
  const r = await tx.approvalInstance.findUniqueOrThrow({ where: { id: rejectedId }, include: { steps: true } });
  const next = await tx.approvalInstance.create({
    data: {
      organisationId: r.organisationId,
      matterKind: r.matterKind,
      requisitionId: r.requisitionId,
      exerciseId: r.exerciseId,
      awardId: r.awardId,
      // 6.13 Part A step 3 (614-C4): a certificate's route continues on its certificate, sent by the same person.
      certificateId: r.certificateId,
      // 6.13 Part A step 4 (614-C4): a variation's route continues on its variation.
      variationId: r.variationId,
      submittedByPersonId: r.submittedByPersonId,
      domain: r.domain,
      cond: r.cond,
      value: r.value,
      authorityMatrixId: r.authorityMatrixId,
      matrixLabel: r.matrixLabel,
      ruleKey: r.ruleKey,
      ruleLabel: r.ruleLabel,
      ruleClause: r.ruleClause,
      boundaryValue: r.boundaryValue,
      boundaryInclusive: r.boundaryInclusive,
      ruleFollowsBoundarySwitch: r.ruleFollowsBoundarySwitch,
      boundaryOperator: r.boundaryOperator,
      fundingRouteCode: r.fundingRouteCode,
      fundingOverrideApplied: r.fundingOverrideApplied,
      overrideMatrixId: r.overrideMatrixId,
      overrideMatrixLabel: r.overrideMatrixLabel,
      budgetCheckId: r.budgetCheckId,
      budgetVerdict: r.budgetVerdict,
      availabilityCheck: r.availabilityCheck,
      overBudgetInvoked: r.overBudgetInvoked,
      splitCheckId: r.splitCheckId,
      splitState: r.splitState,
      checkedAgainstMatrix: r.checkedAgainstMatrix,
      warnings: r.warnings as Prisma.InputJsonValue,
      // The destination as it stood when the approval first opened (ruling CO-4).
      rejectionSnapshotAt: r.rejectionSnapshotAt,
      rejectionDestinationId: r.rejectionDestinationId,
      rejectionKind: r.rejectionKind,
      rejectionReturnToRoleCode: r.rejectionReturnToRoleCode,
      rejectionProvenance: r.rejectionProvenance,
      // The core routing as the approval first opened under it (FR-APR-004, C4).
      coreSnapshotAt: r.coreSnapshotAt,
      coreChainFlag: r.coreChainFlag,
      coreChainReason: r.coreChainReason,
      coreRoutingSnapshot: (r.coreRoutingSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      supersedesInstanceId: r.id,
      status: "PENDING",
      openedAt,
      steps: {
        create: successorSteps(
          r.steps.map((s) => ({ ...s, act: s.act as string, decision: s.decision as string })),
          returnToSeq,
        ).map((s) => ({ ...s, act: s.act as Prisma.ApprovalStepCreateWithoutInstanceInput["act"], decision: s.decision as Prisma.ApprovalStepCreateWithoutInstanceInput["decision"], chainOrigin: s.chainOrigin as Prisma.ApprovalStepCreateWithoutInstanceInput["chainOrigin"] })),
      },
    },
  });
  const target = r.steps.find((s) => s.sequence === returnToSeq);
  await writeAudit(tx, { actor, organisationId: who.organisationId, entity: "ApprovalInstance", entityId: next.id, entityLabel: who.routeLabel }, "CREATE",
    diffFields(null, {
      continues: "the rejected route",
      returnsTo: target?.roleLabel ?? "an earlier step",
      carried: r.steps.filter((s) => s.sequence < returnToSeq).map((s) => s.roleLabel).join(", ") || null,
      pending: r.steps.filter((s) => s.sequence >= returnToSeq).map((s) => s.roleLabel).join(" → "),
    }));
  return next.id;
}
