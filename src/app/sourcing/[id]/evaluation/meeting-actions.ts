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
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { windowChangeRejectionSnapshot } from "@/lib/window/edit";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, CHANGED, exerciseIdOf, Refusal } from "../window/shared";
import { evLabel, GONE_BIDDER, inEvaluation, notes, refuse, stampNow } from "./shared";

/**
 * Meetings and the negotiation's route (FR-EVL-015, 016; OQ-08 interim; OD-10 A). A clarification is
 * held with any bidder (fix R-6), as often as needed, never as an entitlement; a negotiation only
 * on an APPROVED route on the engine's `negotiation` domain, resolved from the customer's matrix rows
 * (none shipped: refused naming the Approval matrix). Each is recorded as held, then closed on its
 * minutes and the tenderer's written confirmation (attached to the meeting); a negotiation round with
 * the price before and after. Closed, a meeting is frozen. No meeting once the recommendation is formed.
 */

const NO_ISSUE: FormState = { ok: false, message: "No approval matrix is in force, so nobody can be shown as approving a negotiation. Issue one under Configuration › Approval matrix." };

/// Record that a clarification or negotiation meeting was held with a bidder.
export async function openMeeting(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const bidderId = r.text("bidderId", "Tenderer", { required: true });
  const kind = r.choice("kind", "Meeting", ["CLARIFICATION", "NEGOTIATION"] as const, { required: true });
  const heldOn = r.date("heldOn", "Held on", { required: true });
  const place = r.text("place", "Where", { max: 300 });
  const personId = r.optionalText("personId");
  if (r.failed || !kind || !heldOn) return { ok: false, errors: r.errors };
  return inEvaluation(exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
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
    await audit(tx, l.org.id, EVALUATION_ENTITY.meeting, row.id, evLabel(l, e!.version, `${kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${b.listingNo}, round ${round}`), "CREATE", diffFields(null, meetingFields({ kind, round, heldOn: storedDay(heldOn), place, by: person!.name })));
    return { ok: true, message: "Recorded as held. Attach the tenderer's written confirmation to it, then close it with its minutes." };
  });
}

/**
 * Close a meeting on its minutes and a live confirmation from the tenderer; a negotiation round with
 * the price before and after. Closed, it is frozen (FR-EVL-015, 016).
 */
export async function closeMeeting(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const meetingId = r.text("meetingId", "Meeting", { required: true });
  const minutes = r.text("minutes", "Minutes", { max: 20000 });
  const before = r.money("priceBefore", "Price before the round");
  const after = r.money("priceAfter", "Price after the round");
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inEvaluation(exerciseIdOf(data), async (tx, l, c) => {
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
    await audit(tx, l.org.id, EVALUATION_ENTITY.meeting, m.id, evLabel(l, e!.version, `${m.kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${listing}, round ${m.round}`), "UPDATE",
      diffFields({ closed: null }, closeFields({ minutes, priceBefore: m.kind === "NEGOTIATION" ? priceBefore : null, priceAfter: m.kind === "NEGOTIATION" ? priceAfter : null, by: person!.name, at: now }, l.org.timeZone)));
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
  const now = stampNow();
  const r = new FormReader(data);
  const bidderId = r.text("bidderId", "Tenderer", { required: true });
  const reason = r.text("reason", "Why a negotiation is needed", { max: 4000 });
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inEvaluation(exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, l.ex, tx);
    if (!issue || !ctx) return NO_ISSUE;
    const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode) ?? null;
    if (!method) return { ok: false, message: "The exercise's method is no longer configured, so nobody can be shown as approving a negotiation." };
    const value = parseSen(l.ex.estimatedValue.toString());
    const roster = await loadRoster(ORGANISATION_CODE, tx);
    const delegations = await loadDelegations(ORGANISATION_CODE, tx);
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
        // A refusal returns nothing: the negotiation is not held, and may be asked for again.
        ...windowChangeRejectionSnapshot(now),
        ...routeCoreFields(res!.core, now),
        steps: { create: res!.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    const n = await tx.negotiationRequest.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId, reason, approvalInstanceId: instance.id, requestedByPersonId: person!.id, requestedAt: now } });
    const label = evLabel(l, e!.version, `Negotiation with bid No. ${b.listingNo}`);
    await audit(tx, l.org.id, "ApprovalInstance", instance.id, `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`, "CREATE",
      diffFields(null, { matter: `Negotiation with bid No. ${b.listingNo}`, matrix: issue.label, rule: rule.labelEn, route: res!.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: "not held; may be asked again" }));
    await audit(tx, l.org.id, EVALUATION_ENTITY.negotiation, n.id, label, "CREATE", diffFields(null, { negotiationWith: `Bid No. ${b.listingNo}`, why: reason, askedBy: `${person!.name} (recorded on their behalf, not signed)` }), reason);
    return { ok: true, message: "Asked for. The negotiation is held once its approval is recorded." };
  });
}

/**
 * A named Person's decision on a step of a negotiation's route: recorded on their behalf, not signed;
 * the holder, delegation, self-approval and date checks are 6.1's (`deciderFaults`).
 */
export async function recordNegotiationDecision(_prev: FormState, data: FormData): Promise<FormState> {
  // 6.8 fix R-9: the clock is read once, at the act's entry, truncated to the second (6.6 CR-3).
  const now = stampNow();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };
  return inEvaluation(exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const n = e!.negotiations.find((x) => x.approvalInstance.status === "PENDING" && x.approvalInstance.steps.some((s) => s.id === stepId));
    if (!n) return { ok: false, message: "That step is not on a negotiation with approval in this evaluation." };
    const full = n.approvalInstance;
    const step = full.steps.find((s) => s.id === stepId)!;
    const roster = await loadRoster(ORGANISATION_CODE, tx);
    const delegations = await loadDelegations(ORGANISATION_CODE, tx);
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, on).reverse().map((u) => u.code);
    const decidedOn = storedDay(on);
    const check = deciderFaults(step, {
      today: l.org.today,
      holders: actingOffice(step) ? holdersFor(actingOffice(step)!, unitPath, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
      person,
      requesterId: l.req.requestingPersonId,
      endorserIds: [],
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
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.ex.reference} · ${step.roleLabel}`, "UPDATE", diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);
    const routeLabel = `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`;
    if (decision === "REJECTED") {
      await closeRejected(tx, { organisationId: l.org.id, routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, reason, NEGOTIATION_REFUSED_DECIDED_BY);
      return { ok: true, message: "Refused: the negotiation is not held. It may be asked for again." };
    }
    if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { ok: true };
    await tx.approvalInstance.update({ where: { id: full.id }, data: { status: "APPROVED", closedAt: now } });
    await audit(tx, l.org.id, "ApprovalInstance", full.id, routeLabel, "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), reason);
    return { ok: true, message: "Approved: the negotiation may be held. Record each round on Meetings and letters." };
  });
}
