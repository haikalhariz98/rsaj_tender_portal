/**
 * A certificate's approval route, written (6.13 Part A step 3: carry 614-C4, ADR 0022, 0023, FR-APR-007, 016).
 *
 * The module that raised a certificate resolves its route on the approval matrix (its own domain and figure) and
 * opens it here; the route's steps are then decided on the certificate's page, under the same lock order as every
 * certificate act: Requisition → Exercise → Award → Contract → Certificate, then the step. Server-only: each helper
 * runs inside the caller's transaction on rows the caller locked through `withLockedCertificate`, re-runs the
 * rule on those rows, writes, and audits before/after in the same transaction under the certificate's label (so
 * the contract's History shows it). A refusal throws `CertificateRefusal`, so nothing is half-written.
 *
 * The signed-in officer is named on every audit row, and who sent it and who decides a step are attributed in the same transaction (Phase 2b): the officer's own, or, from paper, recorded for someone and not signed;
 * the person who sent it may not decide it (FR-APR-006's self-approval rule, applied to the sender). A step a
 * committee discharges is never on a certificate's route (the route is refused before it opens). Where a refusal
 * sends the certificate is the route's snapshot, else the officer's choice (CO-5): back to whoever raised it (a new
 * route may be opened), back to an earlier step (a successor route, ADR 0009), or the certificate ends (void).
 */

import type { Prisma } from "@/generated/prisma/client";
import { closeRejected, loadDestinations, openSuccessor, recordChoice, snapshotOf } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import type { ActWriter } from "@/lib/auth/act-writer";
import { writeAudit } from "@/lib/audit/record";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { choiceFault, rejectionOutcome, rejectionSnapshot, type RejectionKind } from "@/lib/authority/rejection";
import { CHOICE_FAULT_TEXT, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import type { Matrix, Resolution, ResolutionWarning } from "@/lib/authority/types";
import { receivedOnFault } from "@/lib/award/routing";
import { dayToDate, storedDay } from "@/lib/dates";
import { ACT_LABEL } from "@/lib/labels";
import { senToDecimalString, type Sen } from "@/lib/money";
import { ceilingValue } from "@/lib/approvals/routed-value";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";

import { certificateLabel, loadCertificate } from "./repo";
import { certificateDeciderText } from "./route-words";
import { CertificateRefusal, voidCertificate, type CertCtx } from "./write";
import { routeRequesterId } from "@/lib/approvals/requester";
import { inOrder } from "@/lib/series";

/// Where a certificate's refused route may go (FR-APR-016): every kind the engine knows.
export const CERTIFICATE_SUPPORTS: readonly RejectionKind[] = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];

const routeLabel = (c: CertCtx) => `${certificateLabel(c.l, c.l.cert)} · approval route`;
const stepLabel = (c: CertCtx, roleLabel: string) => `${certificateLabel(c.l, c.l.cert)} · ${roleLabel}`;

/// The certificate's routes, oldest first; the latest is the one in force.
export const latestCertificateRoute = <T extends { openedAt: Date; createdAt: Date }>(routes: readonly T[]): T | null =>
  [...routes].sort((a, b) => (a.openedAt.getTime() === b.openedAt.getTime() ? a.createdAt.getTime() - b.createdAt.getTime() : a.openedAt.getTime() - b.openedAt.getTime())).at(-1) ?? null;

export interface OpenRouteInput {
  domain: string;
  value: Sen;
  issue: { id: string; label: string; matrix: Matrix };
  /// The matrix the rule came from (the issue's, or a funder's that superseded it).
  source: { matrix: Matrix; override: { id: string; label: string } | null };
  resolution: Resolution;
  warnings: readonly ResolutionWarning[];
  submittedBy: { id: string; name: string };
  /// How the sender sent it (attributed in this transaction).
  act: ActWriter;
  /// What the figure is, in words, for the trail ("the payment recommended").
  figure: string;
}

/// Open the certificate's approval route (614-C4): pending, with every rule it was judged under.
export async function openCertificateRoute(c: CertCtx, o: OpenRouteInput): Promise<string> {
  const rule = o.resolution.rule!;
  const roleLabel = (code: string) => o.source.matrix.roles[code]?.nameEn ?? o.issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const on = dayToDate(c.today);
  const instance = await c.tx.approvalInstance.create({
    data: {
      organisationId: c.l.org.id,
      matterKind: "CERTIFICATE",
      certificateId: c.l.cert.id,
      submittedByPersonId: o.submittedBy.id,
      domain: o.domain,
      value: senToDecimalString(o.value),
      authorityMatrixId: o.issue.id,
      matrixLabel: o.issue.label,
      ruleKey: rule.ruleKey,
      ruleLabel: rule.labelEn,
      ruleClause: rule.clause,
      boundaryValue: String(o.source.matrix.policy.boundaryValue),
      boundaryInclusive: o.source.matrix.policy.boundaryInclusive,
      ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
      boundaryOperator: boundaryOperatorFor(rule, o.source.matrix.policy),
      fundingRouteCode: c.l.req.fundingRouteCode,
      fundingOverrideApplied: o.source.override != null,
      overrideMatrixId: o.source.override?.id ?? null,
      overrideMatrixLabel: o.source.override?.label ?? null,
      checkedAgainstMatrix: true,
      warnings: o.warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: on,
      // Where a refusal would send it, as configured now (FR-APR-016, ruling CO-4): none is configurable for a
      // certificate's domain yet, so the snapshot records "not set" and a refusal asks the officer (CO-5).
      ...rejectionSnapshot(await loadDestinations(c.tx, c.l.org.id), o.domain, on, c.now),
      ...routeCoreFields(o.resolution.core, c.now),
      steps: {
        create: o.resolution.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })),
      },
    },
  });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: instance.id, entityLabel: routeLabel(c), reason: "" }, "CREATE",
    diffFields(null, {
      matrix: o.issue.label,
      rule: rule.labelEn,
      routedOn: `${o.figure}, ${senToDecimalString(o.value)}`,
      route: o.resolution.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "),
      fundingOverrideApplied: o.source.override != null,
      sentBy: o.submittedBy.name,
    }));
  await o.act.write(c.tx, instance.id);
  return instance.id;
}

/// The office's holders for the certificate's contract (its requisition's unit) on a day, as the engine reads them.
async function holdersOn(c: CertCtx, roleCode: string, day: string) {
  const [roster, delegations, units] = await inOrder(() => loadRoster(c.l.org.code, c.tx), () => loadDelegations(c.l.org.code, c.tx), () => c.tx.orgUnit.findMany({ where: { organisationId: c.l.org.id } }));
  const unitPath = pathTo(units as unknown as OrgUnit[], c.l.req.sectionUnitCode || c.l.req.requestingUnitCode, dayToDate(day)).reverse().map((u) => u.code);
  return { holders: holdersFor(roleCode, unitPath, roster, delegations, day), roster };
}

export interface DecideInput {
  stepId: string;
  decision: "DONE" | "REJECTED";
  /// How the step was decided (attributed in this transaction); `act.subjectPersonId` is the holder it is attributed to.
  act: ActWriter;
  decidedOn: string;
  receivedOn: string | null;
  reason: string;
}

/**
 * A named Person's decision on a step of the certificate's open route (614-C4): 6.1's holder, delegation, order,
 * date and self-approval checks (the person who sent it may not decide it). The last step approves the route; a
 * refusal sends the certificate where the route says, or awaits the officer's choice.
 */
export async function decideCertificateStep(c: CertCtx, i: DecideInput) {
  const cert = c.l.cert;
  if (cert.status !== "DRAFT" && cert.status !== "IN_ROUTING") throw new CertificateRefusal("Not decided: the certificate is past its approval (being signed, issued or void).");
  const inst = latestCertificateRoute(cert.approvalInstances);
  if (!inst || inst.status !== "PENDING") throw new CertificateRefusal("Not decided: no approval route is waiting for a decision on this certificate.");
  const step = inst.steps.find((s) => s.id === i.stepId);
  if (!step) throw new CertificateRefusal("Not decided: that step is not on the open route.");
  if (i.decision === "REJECTED" && !i.reason.trim()) throw new CertificateRefusal("Not decided.", { reason: "Say why it is refused." });
  const office = actingOffice(step);
  const { holders, roster } = office ? await holdersOn(c, office, i.decidedOn) : { holders: { scope: null, holderIds: [], delegates: [] }, roster: null };
  const person = roster?.people.find((p) => p.id === i.act.subjectPersonId) ?? (await c.tx.person.findFirst({ where: { id: i.act.subjectPersonId, organisationId: c.l.org.id }, select: { id: true, isActive: true, name: true } }));
  const check = deciderFaults(step, {
    today: c.today,
    holders,
    declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
    person: person ? { id: person.id, isActive: person.isActive } : null,
    // FR-APR-006: whoever sent the certificate for approval does not decide it.
    requesterId: routeRequesterId("CERTIFICATE", { routeSenderId: inst.submittedByPersonId }) ?? "",
    recorderId: i.act.recorderId,
    endorserIds: [],
    // Who keyed the requisition, an endorsement or another step for someone else: the same checks run on them (Phase 2b review).
    earlier: await earlierRecordersOf(c.tx, c.l.org.id, { otherStepIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.id) }),
    otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
    earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
    decidedOn: i.decidedOn,
    openedOn: storedDay(inst.openedAt),
    // The same figure the worklist and the sweep judge a delegate's ceiling against: never a missing value read as 0.
    value: ceilingValue(inst, false),
  });
  if (check.faults.length) {
    if (check.faults[0] === "COMMITTEE_STEP") throw new CertificateRefusal("Not decided. Cite the committee's decision.");
    const texts = check.faults.map((x) => certificateDeciderText(x, person?.name ?? null)).join(" ");
    throw new CertificateRefusal(`Not decided: ${texts}`, ["TIME_ZONE_UNSET", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? undefined : { personId: texts });
  }
  const rf = receivedOnFault(i.receivedOn, i.decidedOn, c.today, storedDay(inst.openedAt));
  if (rf) throw new CertificateRefusal("Not decided.", { receivedOn: ({ RECEIVED_AFTER_DECISION: "The day received cannot be after the decision.", RECEIVED_IN_FUTURE: "The day received cannot be after today.", RECEIVED_BEFORE_ROUTE: "The day received cannot be before the certificate was sent for approval." } as const)[rf] });
  const after = personDecisionWrite({ decision: i.decision, person: { id: person!.id, name: person!.name }, decidedOn: dayToDate(i.decidedOn), receivedOn: i.receivedOn ? dayToDate(i.receivedOn) : null, delegationId: check.delegationId, reason: i.reason.trim(), recordedAt: c.now });
  const done = await c.tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new CertificateRefusal("The step changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalStep", entityId: step.id, entityLabel: stepLabel(c, step.roleLabel), reason: i.reason.trim() }, "UPDATE",
    diffFields({ decision: step.decision, receivedOn: null }, { decision: i.decision, decidedBy: person!.name, decidedOn: i.decidedOn, receivedOn: i.receivedOn, recordedOnBehalf: i.act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }));
  await i.act.write(c.tx, step.id, { document: { entity: "Certificate", id: cert.id }, roleCode: step.actingRoleCode ?? step.roleCode });

  if (i.decision === "REJECTED") {
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee: null, steps: inst.steps, rejectingSeq: step.sequence, supports: CERTIFICATE_SUPPORTS });
    await closeRejected(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c) }, inst, outcome, i.reason.trim(), undefined, c.now);
    if ("apply" in outcome) await sendRefused(c, inst.id, outcome.apply, outcome.returnToSeq ?? null, i.reason.trim());
    return;
  }
  if (!inst.steps.every((s) => s.id === step.id || s.decision === "DONE")) return;
  const moved = await c.tx.approvalInstance.updateMany({ where: { id: inst.id, status: "PENDING" }, data: { status: "APPROVED", closedAt: c.now } });
  if (moved.count !== 1) throw new CertificateRefusal("The route changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: inst.id, entityLabel: routeLabel(c), reason: "" }, "UPDATE", diffFields({ status: "PENDING" }, { status: "APPROVED" }));
}

/// Send a refused certificate where its refusal says: back to whoever raised it (nothing moves: a new route may be
/// opened), back to an earlier step (a successor route), or it ends (void, with the refusal as its reason).
async function sendRefused(c: CertCtx, instId: string, kind: RejectionKind, returnToSeq: number | null, reason: string) {
  if (kind === "RETURN_TO_STEP") {
    await openSuccessor(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c) }, instId, returnToSeq!, dayToDate(c.today));
    return;
  }
  if (kind === "TERMINATE") {
    // Re-read under the same locks: the route just closed, so nothing waits on it.
    const l = await loadCertificate(c.l.org.id, c.l.cert.id, c.tx);
    if (!l) throw new CertificateRefusal("The certificate changed while this was being saved. Reload and try again.");
    await voidCertificate({ ...c, l }, `Its approval route was refused and the certificate ends: ${reason}`);
  }
}

/// Where a refused route goes, chosen by the officer where its refusal decided nothing (FR-APR-016, CO-5).
export async function chooseCertificateRejection(c: CertCtx, i: { kind: RejectionKind | null; returnToSeq: number | null; personId: string | null; reason: string; act: ActWriter }) {
  const inst = latestCertificateRoute(c.l.cert.approvalInstances);
  const rejecting = inst?.steps.find((s) => s.decision === "REJECTED") ?? null;
  const fault = choiceFault(
    { status: inst?.status ?? "", applied: (inst?.rejectionApplied as RejectionKind | null) ?? null, offered: (inst?.rejectionChoices as RejectionKind[] | undefined) ?? [], steps: inst?.steps ?? [], rejectingSeq: rejecting?.sequence ?? null },
    i,
  );
  if (fault) {
    const field = ({ NOT_OFFERED: "kind", STEP_REQUIRED: "returnToSeq", STEP_NOT_EARLIER: "returnToSeq", PERSON_REQUIRED: "personId", REASON_REQUIRED: "reason" } as Record<string, string>)[fault];
    throw new CertificateRefusal(field ? "Not recorded." : `Not recorded: ${CHOICE_FAULT_TEXT[fault]}`, field ? { [field]: CHOICE_FAULT_TEXT[fault] } : undefined);
  }
  const person = await c.tx.person.findFirst({ where: { id: i.personId!, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new CertificateRefusal("Not recorded.", { personId: "Choose someone on record and active." });
  await recordChoice(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c) }, inst!.id, i.kind!, person.id, person.name, i.reason.trim(), i.act);
  await sendRefused(c, inst!.id, i.kind!, i.kind === "RETURN_TO_STEP" ? i.returnToSeq : null, i.reason.trim());
}

/// The words for where a refused certificate goes (screens and the trail).
export const refusalKindText = (k: RejectionKind) => REJECTION_KIND_LABEL[k];
