"use server";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { closeFields, EVALUATION_ENTITY, meetingFields } from "@/lib/evaluation/audit-view";
import { closeMeetingFaults, meetingEligible, negotiationRequestFaults, openMeetingFaults } from "@/lib/evaluation/meetings";
import { NEGOTIATION_REFUSED_DECIDED_BY, negotiationRouteForRequester } from "@/lib/evaluation/route";
import { ceilingOf } from "@/lib/evaluation/repo";
import { finalRunning } from "@/lib/evaluation/stages";
import { openActFaults } from "@/lib/evaluation/state";
import { NEGOTIATION_DOMAIN, type Finding } from "@/lib/evaluation/types";
import { ACT_LABEL } from "@/lib/labels";
import { exerciseRouteMatter, requesterHolding } from "@/lib/method/approval";
import { evaluationContext } from "@/lib/method/repo";
import { parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { windowChangeRejectionSnapshot } from "@/lib/window/edit";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, CHANGED, exerciseIdOf, Refusal } from "../window/shared";
import { evLabel, GONE_BIDDER, inEvaluation, notes, refuse, stampNow, bidderIdFrom } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import { routeRequesterId, routeSenderBarredId } from "@/lib/approvals/requester";

/**
 * Meetings and the negotiation's route (FR-EVL-015, 016; OQ-08 interim; OD-10 A). A clarification is
 * held with any bidder (fix R-6), as often as needed, never as an entitlement; a negotiation only
 * on an APPROVED route on the engine's `negotiation` domain, resolved from the customer's matrix rows
 * (none shipped: refused naming the Approval matrix). Each is recorded as held, then closed on its
 * minutes and the tenderer's written confirmation (attached to the meeting); a negotiation round with
 * the price before and after. Closed, a meeting is frozen. No meeting once the recommendation is formed.
 */

const NO_ISSUE: FormState = { ok: false, message: "No approval matrix in force. Issue one under Configuration › Approval matrix." };

/// Record that a clarification or negotiation meeting was held with a bidder.
export async function openMeeting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Tenderer", { required: true });
  const kind = r.choice("kind", "Meeting", ["CLARIFICATION", "NEGOTIATION"] as const, { required: true });
  const heldOn = r.date("heldOn", "Held on", { required: true });
  const place = r.text("place", "Where", { max: 300 });
  if (r.failed || !kind || !heldOn) return { ok: false, errors: r.errors };
  // The meeting is opened by the signed-in officer (Phase 2b).
  const begun = await beginAct(actor, data, "EvaluationMeeting.openedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const request = e!.negotiations.filter((n) => n.bidderId === bidderId).at(-1) ?? null;
    const fs: Finding[] = openMeetingFaults({
      kind,
      // R-6 (OD-10 A): a clarification with any bidder; a negotiation only with a bid in the running.
      bidderEligible: meetingEligible(kind, !b.excludedReason && finalRunning(f).some((x) => x.id === b.id)),
      route: request ? { status: request.approvalInstance.status } : null,
      openAlready: e!.meetings.some((m) => m.bidderId === bidderId && m.kind === kind && !m.closedAt),
      heldOn: storedDay(heldOn),
      // R-4: the day the evaluation started, on the organisation's clock (an instant, never its UTC day).
      startedOn: dayOf(e!.startedAt, l.org.timeZone),
      today: l.org.today,
      place,
      personActive: !!person,
    });
    if (e!.recommendation) fs.push({ code: "RECOMMENDATION_FORMED", level: "block" });
    if (fs.some((x) => x.level === "block")) return refuse(fs);
    const round = e!.meetings.filter((m) => m.bidderId === bidderId && m.kind === kind).length + 1;
    const row = await tx.evaluationMeeting.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId, kind, round, heldOn, place, approvalInstanceId: kind === "NEGOTIATION" ? request!.approvalInstanceId : null, openedByPersonId: person!.id, openedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.meeting, row.id, evLabel(l, e!.version, `${kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${b.listingNo}, round ${round}`), "CREATE", diffFields(null, meetingFields({ kind, round, heldOn: storedDay(heldOn), place, by: person!.name })));
    await act.write(tx, row.id);
    return { ok: true, message: "Recorded. Attach the confirmation, then close it." };
  });
}

/**
 * Close a meeting on its minutes and a live confirmation from the tenderer; a negotiation round with
 * the price before and after. Closed, it is frozen (FR-EVL-015, 016).
 */
export async function closeMeeting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const meetingId = r.text("meetingId", "Meeting", { required: true });
  const minutes = r.text("minutes", "Minutes", { max: 20000 });
  const before = r.money("priceBefore", "Price before the round");
  const after = r.money("priceAfter", "Price after the round");
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "EvaluationMeeting.closedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const m = e!.meetings.find((x) => x.id === meetingId);
    if (!m) return { ok: false, message: "That meeting is not in the evaluation in force." };
    const person = await activePerson(tx, l.org.id, personId);
    const priceBefore = before ? parseSen(before) : null;
    const priceAfter = after ? parseSen(after) : null;
    const fs = closeMeetingFaults({ kind: m.kind, closed: m.closedAt != null, minutes, liveConfirmations: m.attachments.filter((a) => a.purpose === "TENDERER_CONFIRMATION" && isLive(a)).length, priceBefore, priceAfter, personActive: !!person, ceiling: ceilingOf(l.ex) });
    if (fs.some((x) => x.level === "block")) return refuse(fs, "Not closed:");
    const done = await tx.evaluationMeeting.updateMany({ where: { id: m.id, closedAt: null }, data: { minutes, priceBefore: m.kind === "NEGOTIATION" ? before : null, priceAfter: m.kind === "NEGOTIATION" ? after : null, closedAt: now, closedByPersonId: person!.id } });
    if (done.count !== 1) throw new Refusal(CHANGED);
    const listing = c.facts!.bidders.find((b) => b.id === m.bidderId)!.listingNo;
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.meeting, m.id, evLabel(l, e!.version, `${m.kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${listing}, round ${m.round}`), "UPDATE",
      diffFields({ closed: null }, closeFields({ minutes, priceBefore: m.kind === "NEGOTIATION" ? priceBefore : null, priceAfter: m.kind === "NEGOTIATION" ? priceAfter : null, by: person!.name, at: now }, l.org.timeZone)));
    await act.write(tx, m.id);
    const said = notes(fs);
    return { ok: true, message: `Closed.${said ? ` ${said}` : ""}` };
  });
}

// ------------------------------------------------------------------ the negotiation's route

/**
 * Ask for a negotiation with one bidder (FR-EVL-016): the engine's route on the domain `negotiation`,
 * resolved now with the requester in mind, opened with its steps and audited. No rule, no method key or
 * a committee step: refused, naming the Approval matrix.
 */
export async function requestNegotiation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Tenderer", { required: true });
  const reason = r.text("reason", "Why a negotiation is needed", { max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "NegotiationRequest.requestedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, l.ex, tx);
    if (!issue || !ctx) return NO_ISSUE;
    const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode) ?? null;
    if (!method) return { ok: false, message: "Method no longer configured. No approver can be shown." };
    const value = parseSen(l.ex.estimatedValue.toString());
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const unitPath = l.org.today ? pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(l.org.today)).reverse().map((u) => u.code) : [];
    const holders = (code: string) => holdersFor(code, unitPath, roster, delegations, l.org.today!);
    const res = l.org.today ? negotiationRouteForRequester(ctx.funder, method, Number(senToDecimalString(value)), requesterHolding(holders, l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable))) : null;
    const fs: Finding[] = negotiationRequestFaults({
      bidderInRunning: !b.excludedReason && finalRunning(f).some((x) => x.id === b.id),
      reason,
      pending: e!.negotiations.some((n) => n.bidderId === bidderId && n.approvalInstance.status === "PENDING"),
      routeState: res?.routeState ?? "NO_RULE",
      personActive: !!person,
      today: l.org.today,
    });
    if (e!.recommendation) fs.push({ code: "RECOMMENDATION_FORMED", level: "block" });
    if (fs.length) return refuse(fs, "Not asked:");
    if (res!.refusal) return { ok: false, message: `Not asked: ${res!.refusal}` };
    const errors = res!.warnings.filter((w) => w.level === "err");
    if (errors.length) return { ok: false, message: `Not asked: ${errors.map((w) => w.messageEn).join(" ")}` };
    const src = res!.source === "OVERRIDE" && ctx.funder.override ? ctx.funder.override : { id: issue.id, label: issue.label, matrix: issue.matrix };
    const rule = src.matrix.rules.find((x) => x.ruleKey === res!.ruleKey)!;
    const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "EXERCISE",
        exerciseId: l.ex.id,
        domain: NEGOTIATION_DOMAIN,
        value: l.ex.estimatedValue,
        authorityMatrixId: issue.id,
        matrixLabel: issue.label,
        ruleKey: rule.ruleKey,
        ruleLabel: rule.labelEn,
        ruleClause: rule.clause,
        boundaryValue: String(src.matrix.policy.boundaryValue),
        boundaryInclusive: src.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
        boundaryOperator: boundaryOperatorFor(rule, src.matrix.policy),
        fundingRouteCode: l.req.fundingRouteCode,
        fundingOverrideApplied: res!.source === "OVERRIDE",
        overrideMatrixId: res!.overrideIssue?.id ?? null,
        overrideMatrixLabel: res!.overrideIssue?.label ?? null,
        checkedAgainstMatrix: true,
        warnings: res!.warnings as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        openedAt: dayToDate(l.org.today!),
        // The sender (decisions log, 2026-10-09, ruling on 1860): barred from deciding the route. The negotiation's own slot is never recorded from paper, so this is always the signed-in officer.
        submittedByPersonId: person!.id,
        // A refusal returns nothing: the negotiation is not held, and may be asked for again.
        ...windowChangeRejectionSnapshot(now),
        ...routeCoreFields(res!.core, now),
        steps: { create: res!.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    const n = await tx.negotiationRequest.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId, reason, approvalInstanceId: instance.id, requestedByPersonId: person!.id, requestedAt: now } });
    const label = evLabel(l, e!.version, `Negotiation with bid No. ${b.listingNo}`);
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", instance.id, `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`, "CREATE",
      diffFields(null, { matter: `Negotiation with bid No. ${b.listingNo}`, matrix: issue.label, rule: rule.labelEn, route: res!.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: "not held; may be asked again" }));
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.negotiation, n.id, label, "CREATE", diffFields(null, { negotiationWith: `Bid No. ${b.listingNo}`, why: reason, askedBy: person!.name }), reason);
    await act.write(tx, n.id);
    await act.writeAlso(tx, "ApprovalInstance.submittedBy", instance.id);
    return { ok: true, message: "Asked for. Awaiting approval." };
  });
}

/**
 * A decision on a step of a negotiation's route: the holder's own, signed with the password, or recorded for the holder from paper and not signed
 * (Phase 2b); the holder, delegation, self-approval and date checks are 6.1's (`deciderFaults`), on whom it is attributed to, and the separation of
 * duties on the person recording it as well.
 */
export async function recordNegotiationDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  // 6.8 fix R-9: the clock is read once, at the act's entry, truncated to the second (6.6 CR-3).
  const now = stampNow();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  r.date("decidedOn", "Decided on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const on = dayToDate(act.day!);
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const n = e!.negotiations.find((x) => x.approvalInstance.status === "PENDING" && x.approvalInstance.steps.some((s) => s.id === stepId));
    if (!n) return { ok: false, message: "That step is not on a negotiation with approval in this evaluation." };
    const full = n.approvalInstance;
    const step = full.steps.find((s) => s.id === stepId)!;
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, on).reverse().map((u) => u.code);
    const decidedOn = storedDay(on);
    const check = deciderFaults(step, {
      today: l.org.today,
      holders: actingOffice(step) ? holdersFor(actingOffice(step)!, unitPath, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
      person,
      requesterId: routeRequesterId("NAME_APPROVAL", { requisitionRaiserId: l.req.requestingPersonId }) ?? "",
      // The sender of the route is barred as well (ruling of 2026-10-08 on log line 1789). Where the route records none, nobody is barred on that account.
      senderId: routeSenderBarredId("NAME_APPROVAL", { routeSenderId: full.submittedByPersonId }),
      recorderId: act.recorderId,
      endorserIds: [],
      // Who keyed the requisition, an endorsement or another step for someone else: the same checks run on them (Phase 2b review).
      earlier: await earlierRecordersOf(tx, l.org.id, { requisitionId: l.req.id, otherStepIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.id) }),
      otherDeciderIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
      earlierDone: full.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
      decidedOn,
      openedOn: storedDay(full.openedAt),
      value: senFromDecimal(l.ex.estimatedValue),
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((f) => deciderFaultText(f, person?.name ?? null));
      return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
    }
    const after = personDecisionWrite({ decision, person: { id: person!.id, name: person!.name }, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: now });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalStep", step.id, `${l.ex.reference} · ${step.roleLabel}`, "UPDATE", diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }), reason);
    await act.write(tx, step.id, { document: { entity: "SourcingExercise", id: l.ex.id }, roleCode: step.actingRoleCode ?? step.roleCode });
    const routeLabel = `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`;
    if (decision === "REJECTED") {
      await closeRejected(tx, toAuditActor(actor), { organisationId: l.org.id, routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, reason, NEGOTIATION_REFUSED_DECIDED_BY);
      return { ok: true, message: "Refused. It may be asked for again." };
    }
    if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { ok: true };
    await tx.approvalInstance.update({ where: { id: full.id, organisationId: actor.organisationId }, data: { status: "APPROVED", closedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", full.id, routeLabel, "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), reason);
    return { ok: true, message: "Approved. Record each round on Meetings and letters." };
  });
}
