/**
 * The requisition's approval route as written (FR-REQ-012, FR-APR-016): moving the
 * requisition, the gate before the final approval, approving, determining the committee
 * gates, a rejection and where it goes, and the citation of a committee's decision on a
 * step. Lifted unchanged from the requisition actions (founder, 2026-10-05) so a sitting's
 * outcome can discharge a committee step by the same function, in its own transaction:
 * every function here runs inside a transaction whose caller holds the requisition's lock.
 */

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { closeRejected, openSuccessor, snapshotOf } from "@/lib/approvals/rejection-store";
import { committeeCitationWrite } from "@/lib/authority/decided-step";
import { rejectionOutcome, type RejectionKind, type RejectionOutcome } from "@/lib/authority/rejection";
import { postingRefusal } from "@/lib/budget/periods";
import { linkedVia, type CiteVia } from "@/lib/committee/cite-via";
import { dayToDate, storedDay } from "@/lib/dates";
import { portalLedger } from "@/lib/integration/budget-check";
import { parseSen, senToDecimalString } from "@/lib/money";
import { approvalBudgetOutcome, approvalCommitment, approvalRechecks, type BudgetSnapshot } from "@/lib/requisition/budget";
import { committeeCitationFault, committeeStepFrom, type CitationFault } from "@/lib/requisition/committee-step";
import { gatesFor, type GatesFinding } from "@/lib/requisition/gate";
import { DECIDER_FAULT_TEXT, RETURNED_AT_APPROVAL, returnedAtApproval } from "@/lib/requisition/labels";
import { moveRequisition } from "@/lib/requisition/move";
import { loadControls, loadGateRules, recordOf, type LoadedRequisition } from "@/lib/requisition/repo";
import type { TransitionContext } from "@/lib/requisition/status";
import type { RequisitionStatus } from "@/lib/requisition/types";

type Act = "P" | "JP" | "R" | "JR" | "MR" | "MJR" | "A" | "MA";

export const NO_ZONE: FormState = {
  ok: false,
  message: "Set the organisation's time zone under Configuration, Organisation first. Today's date decides this act, and it is not assumed to be UTC.",
};

export const CHANGED: FormState = { ok: false, message: "The requisition changed while this was being saved. Reload and try again." };

export async function audit(
  tx: Tx,
  orgId: string,
  entity: string,
  entityId: string,
  entityLabel: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  changes: FieldChange[],
  reason = "",
) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

export const labelOf = (r: { reference: string; title: string }) => `${r.reference} · ${r.title}`;

/**
 * Move a requisition from the status read under the lock (ruling C1): the state
 * machine is asked inside the move, so no caller can write a status it refuses. A
 * refusal or a lost race throws, rolling back everything written before it. The
 * loaded row follows the move, so a second move in the same act starts from it.
 */
export async function mustMove(tx: Tx, l: LoadedRequisition, to: RequisitionStatus, ctx: TransitionContext, extra: Prisma.RequisitionUpdateManyMutationInput = {}) {
  await moveRequisition(tx, l.req, to, ctx, extra);
  l.req.status = to;
}

/// Write one check snapshot. Returns its row.
export async function writeCheck(tx: Tx, l: LoadedRequisition, s: BudgetSnapshot & { budgetCodeCode: string | null }, asAt: Date) {
  const dec = (v: bigint | null) => (v == null ? null : senToDecimalString(v));
  const row = await tx.requisitionBudgetCheck.create({
    data: {
      requisitionId: l.req.id,
      asAt,
      source: s.source,
      budgetCodeId: l.req.budgetCodeId,
      budgetCodeCode: s.budgetCodeCode,
      requestedAmount: senToDecimalString(s.requested),
      actualBudget: dec(s.actualBudget),
      balanceAsAt: dec(s.balanceAsAt),
      approvedAccount: dec(s.approvedAccount),
      approvedAccountProvenance: s.approvedAccountProvenance,
      projectedBalance: dec(s.projectedBalance),
      verdict: s.verdict,
      outcome: s.warnings.join(" "),
    },
  });
  await audit(tx, l.org.id, "RequisitionBudgetCheck", row.id, `${l.req.reference} · budget check`, "CREATE",
    diffFields(null, { source: s.source, asAt, budgetCode: s.budgetCodeCode, verdict: s.verdict, balanceAsAt: dec(s.balanceAsAt), requestedAmount: senToDecimalString(s.requested) }));
  return row;
}

/// The cost centre's unit, for the owner warning.
export async function costCentreUnit(tx: Tx, l: LoadedRequisition, on: Date) {
  const cc = await tx.costCentre.findFirst({
    where: { organisationId: l.org.id, code: l.req.costCentreCode, effectiveFrom: { lte: on }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: on } }] },
    select: { orgUnitCode: true },
  });
  return cc?.orgUnitCode ?? null;
}

export const openInstance = (l: LoadedRequisition) => l.req.approvalInstances.find((i) => i.status === "PENDING") ?? null;

/**
 * Whether the final decision may approve, and what approval will write. Run on the
 * locked data BEFORE the final step is recorded.
 *
 * - A commitment is written only where the budget settings commit on approval and the
 *   funding route commits the organisation's budget (ruling BD-13).
 * - Where it will be written, the ledger is re-checked under the budget code's lock
 *   (ruling Q2). No longer fitting, the approval is refused and the requisition goes
 *   back for a fresh check: the check is stored, the route is closed, and it becomes
 *   Over budget, to be resubmitted on the over-budget route. A requisition already on
 *   the over-budget route is exempt. These writes are kept: "return" is an outcome.
 */
export type Gate =
  | { kind: "refuse"; state: FormState }
  | { kind: "return"; state: FormState }
  | { kind: "ok"; commit: ReturnType<typeof approvalCommitment>; routeCommits: boolean | null; commitOnApproval: boolean | null };

export async function approvalGate(tx: Tx, l: LoadedRequisition, instanceId: string): Promise<Gate> {
  const req = l.req;
  const today = dayToDate(l.org.today!);
  const inst = req.approvalInstances.find((i) => i.id === instanceId)!;
  // Founder, 2026-10-05: no splitting check, so a flag on a route opened before never refuses.
  const controls = await loadControls(l.org.id, tx);
  const route = req.fundingRouteCode
    ? await tx.fundingRoute.findFirst({ where: { organisationId: l.org.id, code: req.fundingRouteCode }, select: { approvalCommitsBudget: true } })
    : null;
  const routeCommits = route?.approvalCommitsBudget ?? null;
  const commit = approvalCommitment(controls.commitOnApproval, routeCommits);
  if (commit !== "WRITE") return { kind: "ok", commit, routeCommits, commitOnApproval: controls.commitOnApproval };

  if (!req.budgetCodeId) return { kind: "refuse", state: { ok: false, message: "Approval commits the budget, and this requisition names no budget code." } };
  const periods = await tx.budgetPeriod.findMany({ where: { organisationId: l.org.id } });
  const closed = postingRefusal(periods, today);
  if (closed) {
    return {
      kind: "refuse",
      state: { ok: false, message: `Approval commits the budget today, and the budget period ${closed.nameEn} ${closed.year} is closed. Reopen the period, or approve once the next one is open.` },
    };
  }
  // Re-checked only on the portal ledger: a check typed from the finance system cannot
  // be re-run under a lock here (round 3, item g).
  if (!approvalRechecks(controls.budgetCheckSource)) return { kind: "ok", commit, routeCommits, commitOnApproval: controls.commitOnApproval };
  // Under the code's lock (taken by the provider), so a commitment landing at the same
  // moment is either counted here or waits.
  const fresh = await portalLedger.check(tx, {
    budgetCodeId: req.budgetCodeId,
    accountCode: req.accountCode,
    costCentreUnitCode: await costCentreUnit(tx, l, today),
    requested: parseSen(req.estimatedValue.toString()),
    on: today,
  });
  const outcome = approvalBudgetOutcome(fresh.verdict, inst.cond);
  // Neither is "over budget": refused, and nothing is written — no check, no status.
  if (outcome === "NO_BUDGET") {
    return {
      kind: "refuse",
      state: { ok: false, message: "Not approved: re-checked at approval, the budget code has no budget allocated to check against. Nothing was recorded. Allocate a budget to the code, then record the decision again." },
    };
  }
  if (outcome === "AMBIGUOUS") {
    return {
      kind: "refuse",
      state: { ok: false, message: "Not approved: re-checked at approval, the requisition's account is not the budget code's, so which budget line it draws on is unclear. Nothing was recorded." },
    };
  }
  if (outcome === "RETURN") {
    await writeCheck(tx, l, fresh, today);
    const returned = {
      code: RETURNED_AT_APPROVAL,
      level: "err",
      messageEn: "Returned at approval: re-checked under the budget code's lock, the budget no longer covered it. A fresh check was recorded; it goes back on the over-budget route.",
      messageMs: "Dikembalikan semasa kelulusan: bajet tidak lagi mencukupi. Semakan baharu direkodkan; ia dihantar semula melalui laluan melebihi bajet.",
    };
    await tx.approvalInstance.update({
      where: { id: inst.id },
      data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), returned] as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${req.reference} · approval route`, "UPDATE",
      // The marker lets the trail read the route as returned at approval, not recalled.
      diffFields({ status: inst.status, returnedAtApproval: null }, { status: "RECALLED", returnedAtApproval: true }), "Returned at approval: the budget no longer covers it.");
    const from = req.status;
    await mustMove(tx, l, "OVER_BUDGET", { today: l.org.today });
    await audit(tx, l.org.id, "Requisition", req.id, labelOf(req), "UPDATE", diffFields({ status: from }, { status: "OVER_BUDGET" }),
      "Returned at approval: the budget no longer covers it.");
    return {
      kind: "return",
      state: {
        ok: false,
        message:
          "Not approved: re-checked at approval, the budget code no longer covers this requisition — another commitment has used the balance since it was submitted. The fresh check is recorded and the requisition is back to Over budget; submit it again on the over-budget route.",
      },
    };
  }
  return { kind: "ok", commit, routeCommits, commitOnApproval: controls.commitOnApproval };
}

/// Close an approved route: the commitment where the gate says so, and the status.
export async function approve(tx: Tx, l: LoadedRequisition, instanceId: string, gate: Extract<Gate, { kind: "ok" }>) {
  const req = l.req;
  const today = dayToDate(l.org.today!);
  let commitmentMovementId: string | null = null;
  if (gate.commit === "WRITE") {
    const movement = await tx.budgetMovement.create({
      data: { budgetCodeId: req.budgetCodeId!, kind: "COMMITMENT", reference: req.reference, description: req.title, amount: req.estimatedValue, occurredOn: today },
    });
    commitmentMovementId = movement.id;
    await audit(tx, l.org.id, "BudgetMovement", movement.id, `${req.budgetCode?.code ?? "Budget code"} · commitment for ${req.reference}`, "CREATE",
      diffFields(null, { kind: "COMMITMENT", budgetCode: req.budgetCode?.code, reference: req.reference, committedEstimate: req.estimatedValue.toString(), occurredOn: today }));
  }
  await tx.approvalInstance.update({
    where: { id: instanceId },
    data: { status: "APPROVED", closedAt: new Date(), commitOnApproval: gate.commitOnApproval, routeCommitsBudget: gate.routeCommits },
  });
  await audit(tx, l.org.id, "ApprovalInstance", instanceId, `${req.reference} · approval route`, "UPDATE",
    diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: gate.commit === "WRITE" ? "written" : "not written" }));
  const from = req.status;
  await mustMove(tx, l, "APPROVED", { today: l.org.today }, { commitmentMovementId });
  await audit(tx, l.org.id, "Requisition", req.id, labelOf(req), "UPDATE",
    diffFields({ status: from }, { status: "APPROVED" }));
  // The committee gates are determined as the route closes approved (FR-REQ-012, CO-1).
  await determineGates(tx, l, parseSen(req.estimatedValue.toString()));
}

// ------------------------------------------------------------- committee gate

/**
 * Determine an approved requisition's committee gates (FR-REQ-012, ADR 0010) from its
 * funding route's setting and the gate rules in force, and store what each rule read.
 * Unset, or a gate required with no rule in force, writes nothing: the requisition
 * stays undetermined and opening an exercise is refused, naming the setting (C2).
 */
export async function determineGates(tx: Tx, l: LoadedRequisition, approved: bigint): Promise<GatesFinding> {
  const req = l.req;
  const on = l.org.today ? dayToDate(l.org.today) : new Date();
  const route = req.fundingRouteCode
    ? await tx.fundingRoute.findFirst({ where: { organisationId: l.org.id, code: req.fundingRouteCode }, select: { code: true, committeeGateRequired: true, committeeGateProvenance: true } })
    : null;
  const found = gatesFor(route, await loadGateRules(l.org.id, tx), approved, on);
  if (found.state === "NOT_SET" || found.state === "RULE_MISSING") return found;
  const after = { gatesDeterminedOn: on, gateRequired: route!.committeeGateRequired, gateRequiredProvenance: route!.committeeGateProvenance };
  await tx.requisition.update({ where: { id: req.id }, data: after });
  await audit(tx, l.org.id, "Requisition", req.id, labelOf(req), "UPDATE",
    diffFields({ gatesDeterminedOn: null, gateRequired: null }, { gatesDeterminedOn: on, gateRequired: route!.committeeGateRequired, gates: found.state === "RULES" ? found.rules.length : 0 }));
  if (found.state === "RULES") {
    const committees = await tx.committee.findMany({ where: { organisationId: l.org.id, code: { in: found.rules.map((r) => r.committeeCode) } }, select: { code: true, nameEn: true } });
    for (const rule of found.rules) {
      const committeeLabel = committees.find((c) => c.code === rule.committeeCode)?.nameEn ?? "A committee no longer configured";
      const row = await tx.requisitionGate.create({
        data: {
          requisitionId: req.id,
          gateRuleId: rule.id,
          committeeCode: rule.committeeCode,
          committeeLabel,
          subjectEn: rule.subjectEn,
          act: rule.act as Act,
          aboveValue: rule.aboveValue,
          ruleProvenance: rule.provenance,
          determinedOn: on,
        },
      });
      await audit(tx, l.org.id, "RequisitionGate", row.id, `${req.reference} · gate: ${committeeLabel}`, "CREATE",
        diffFields(null, { committee: committeeLabel, subject: rule.subjectEn, act: rule.act, aboveValue: rule.aboveValue, provenance: rule.provenance, determinedOn: on }));
    }
  }
  return found;
}

/**
 * Discharge a committee step from the committee's decision (FR-REQ-012): only a
 * matter tabled against this requisition, before the step's committee, and only what
 * `decisionRecord()` says of it. The one citation of a requisition's committee step: its
 * "Cite committee decision" act runs it, and so does a sitting recording the matter's
 * outcome (founder, 2026-10-05; `via` then says so in the step's History). The caller holds
 * the requisition's lock. `returned`: the route went back at approval, its writes kept.
 */
export async function citeCommitteeStep(tx: Tx, l: LoadedRequisition, stepId: string, decisionId: string, via: CiteVia = "BY_HAND"): Promise<FormState & { returned?: true }> {
  const inst = openInstance(l);
  if (l.req.status !== "PENDING_APPROVAL" || !inst) return { ok: false, message: "No approval is open on this requisition." };
  if (!l.org.today) return NO_ZONE;
  const step = inst.steps.find((s) => s.id === stepId);
  if (!step || !step.committeeCode) return { ok: false, message: "That is not a committee step on the open route." };
  if (step.decision !== "PENDING") return { ok: false, message: "This step is already decided." };
  if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) {
    return { ok: false, message: DECIDER_FAULT_TEXT.OUT_OF_ORDER };
  }
  const matter = l.req.committeeDecisions.find((d) => d.id === decisionId);
  if (!matter) return { ok: false, errors: { committeeDecisionId: "That matter was not tabled against this requisition." } };
  // One decision discharges one step: any step anywhere already citing it counts.
  const cited = await tx.approvalStep.findMany({
    where: { committeeDecisionId: matter.id },
    select: { id: true, instance: { select: { status: true, warnings: true } } },
  });
  const fault = committeeCitationFault(
    { ...matter, amount: matter.amount?.toString() ?? null, committeeCode: matter.meeting.committee.code },
    step,
    { id: l.req.id, estimatedValue: l.req.estimatedValue.toString() },
    cited.length > 0 ? [matter.id] : [],
    // Ruling R2: cited on a route returned at approval, it stays with that route.
    cited.some((c) => c.instance.status === "RECALLED" && returnedAtApproval(c.instance.warnings)) ? [matter.id] : [],
  );
  if (fault) return { ok: false, errors: { committeeDecisionId: CITATION_TEXT[fault] } };
  const record = recordOf(matter);
  const s = committeeStepFrom(record);
  if (s.decision === "PENDING") return { ok: false, errors: { committeeDecisionId: record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet." } };
  if (s.decidedOn && storedDay(s.decidedOn) < storedDay(inst.openedAt)) {
    return { ok: false, errors: { committeeDecisionId: "The committee decided that matter before this route was opened." } };
  }
  const final = s.decision === "DONE" && inst.steps.every((x) => x.id === step.id || x.decision === "DONE");
  const gate = final ? await approvalGate(tx, l, inst.id) : null;
  if (gate?.kind === "refuse") return gate.state;
  if (gate?.kind === "return") return { ...gate.state, returned: true };
  const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: new Date() });
  const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) return CHANGED;
  await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.req.reference} · ${step.roleLabel}`, "UPDATE",
    diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, ...linkedVia(via) }));

  if (s.decision === "REJECTED") {
    // Every rejection lands on Rejected first (ruling C1). The committee's own
    // not-carried outcome, as snapshotted with its decision, then governs where it
    // goes (ruling CO-3): a loop back to the originator, a terminal outcome ends it.
    const why = `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}`;
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee: record?.notApproved ?? null, steps: inst.steps, rejectingSeq: step.sequence, supports: REQUISITION_SUPPORTS });
    await rejectAndApply(tx, l, inst, outcome, why);
    return { ok: true };
  }
  if (gate?.kind === "ok") await approve(tx, l, inst.id, gate);
  return { ok: true };
}

// ------------------------------------------------------------ rejection (FR-APR-016)

/// Where a rejected requisition can go: back to its originator (Draft), back to an
/// earlier step on a successor route, or closed.
export const REQUISITION_SUPPORTS: readonly RejectionKind[] = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];
export const routeLabelOf = (l: LoadedRequisition) => `${l.req.reference} · approval route`;
export type OpenRoute = NonNullable<ReturnType<typeof openInstance>>;

/// Close the route as rejected, move the requisition to Rejected, and send it where the
/// outcome says — or leave it there for the officer's choice.
export async function rejectAndApply(tx: Tx, l: LoadedRequisition, inst: OpenRoute, outcome: RejectionOutcome, reason: string) {
  await closeRejected(tx, { organisationId: l.org.id, routeLabel: routeLabelOf(l) }, inst, outcome, reason);
  const from = l.req.status;
  await mustMove(tx, l, "REJECTED", { today: l.org.today, reason });
  await audit(tx, l.org.id, "Requisition", l.req.id, labelOf(l.req), "UPDATE", diffFields({ status: from }, { status: "REJECTED" }), reason);
  if ("apply" in outcome) await sendRejected(tx, l, inst.id, outcome.apply, outcome.returnToSeq ?? null, reason);
}

/// Move a rejected requisition to its destination, through the state machine.
export async function sendRejected(tx: Tx, l: LoadedRequisition, instId: string, kind: RejectionKind, returnToSeq: number | null, reason: string) {
  const today = l.org.today;
  if (kind === "RETURN_TO_ORIGINATOR") {
    await mustMove(tx, l, "DRAFT", { today });
    await audit(tx, l.org.id, "Requisition", l.req.id, labelOf(l.req), "UPDATE", diffFields({ status: "REJECTED" }, { status: "DRAFT" }), `Returned to whoever raised it: ${reason}`);
  } else if (kind === "TERMINATE") {
    await mustMove(tx, l, "CLOSED", { today, reason }, { closedReason: reason });
    await audit(tx, l.org.id, "Requisition", l.req.id, labelOf(l.req), "UPDATE", diffFields({ status: "REJECTED", closedReason: "" }, { status: "CLOSED", closedReason: reason }), reason);
  } else {
    // C3: the successor opens under the requisition's lock; while it is open nothing on
    // the requisition can be edited (its status is Pending approval again).
    await openSuccessor(tx, { organisationId: l.org.id, routeLabel: routeLabelOf(l) }, instId, returnToSeq!, dayToDate(today!));
    await mustMove(tx, l, "PENDING_APPROVAL", { today, successor: true });
    await audit(tx, l.org.id, "Requisition", l.req.id, labelOf(l.req), "UPDATE", diffFields({ status: "REJECTED" }, { status: "PENDING_APPROVAL" }), `Returned to an earlier step: ${reason}`);
  }
}

const CITATION_TEXT: Record<CitationFault, string> = {
  NOT_THIS_REQUISITION: "That matter was not tabled against this requisition.",
  NOT_A_REQUISITION_MATTER: "That matter was not tabled as a requisition matter.",
  OTHER_COMMITTEE: "That matter was decided by a different committee from the one this step names.",
  OTHER_ACT: "The committee was asked for a different act from the one this step needs.",
  OTHER_AMOUNT: "The matter was tabled for a different amount from this requisition's value.",
  CITED_ON_RETURNED_ROUTE: "That decision was cited on a route returned at approval for budget. It stays with that route and cannot discharge this one: table the matter again.",
  ALREADY_CITED: "That decision already discharges another step. One decision discharges one step.",
};
