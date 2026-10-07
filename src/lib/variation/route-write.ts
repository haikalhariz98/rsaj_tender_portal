/**
 * A variation's approval routes, written (6.13 Part A step 4: FR-VAR-008, 010, 013; FR-PAD-004; 614-C4; ADR 0024).
 *
 * Server-only: each helper runs inside a variation act's transaction, on rows the act locked in the one order
 * (Requisition → Exercise → Award → Contract → the variation), re-runs the rule on those rows, writes, and audits
 * before/after in the same transaction under the contract's label (so the contract's History shows it). A refusal
 * throws `VariationRefusal`, so nothing is half-written.
 *
 * - Sending: the route is resolved on the approval matrix in force today under the requisition's funding route, with
 *   the absence rule and the sender's own office (self-approval), on the event's domain, the frozen reading's exact
 *   ratio and its base as the contract value. It is opened as a VARIATION matter naming the variation, and the reading
 *   is frozen with it (never read live again).
 * - A person's step: 6.1's holder, delegation, order, date and self-approval checks (whoever sent it may not decide it).
 * - A committee's step (the Variation Orders Committee's mandatory recommendation, a Tender Board's approval): only by
 *   citing the committee's decision on a matter tabled from this variation, for this step's committee, act and value,
 *   decided on or after the route opened, and cited once. Carried discharges it; not carried refuses the route, and
 *   the committee's own outcome says where the variation goes (FR-VAR-013: a loop returns it to be tabled again with
 *   the reason; a terminal outcome ends it); deferred leaves it waiting.
 * - The last step approves the route; a prior approval then opens the application (VO-660) as a certificate from the
 *   figures the route was sent on, frozen then (BD-613-52).
 * - A refusal goes where the route's snapshot says, else waits for the officer's choice (CO-5): back to whoever sent it
 *   (it may be sent again), back to an earlier step (a successor route, ADR 0009), or the variation ends (closed).
 * The signed-in officer is named on every audit row; who sends and who decides are named Persons, recorded on their behalf, not signed.
 */

import type { Prisma } from "@/generated/prisma/client";
import { closeRejected, loadDestinations, openSuccessor, recordChoice, snapshotOf } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { absentOffices } from "@/lib/authority/absence";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { committeeCitationWrite, personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { choiceFault, rejectionSnapshot, type RejectionKind } from "@/lib/authority/rejection";
import { CHOICE_FAULT_TEXT, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import type { Matrix } from "@/lib/authority/types";
import { receivedOnFault } from "@/lib/award/routing";
import { openCertificate } from "@/lib/certificate/write";
import { readComputedSnapshot } from "@/lib/certificate/snapshot";
import { certificateDeciderText } from "@/lib/certificate/route-words";
import { committeeStepFrom } from "@/lib/requisition/committee-step";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { ACT_LABEL } from "@/lib/labels";
import { compareAmounts, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { methodKeyOf } from "@/lib/supervision/load";

import { EVENT_WORDS, variationRefusal } from "./labels";
import { lastStepFormFault, refusalKinds, variationRefusalOutcome } from "./application";
import { factsOf, matterRecordOf, type VariationRow } from "./load";
import { ratioOf, type Reading } from "./percent";
import { edgesOf, regimeOf, resolveVariationRoute, routeDomainOf, routePercentLabel } from "./route";
import type { Finding, VariationEvent } from "./types";
import { linkedVia, type CiteVia } from "@/lib/committee/cite-via";

/// A refusal: rolls the transaction back. `errors` names a field where the refusal is about one.
export class VariationRefusal extends Error {
  constructor(
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "VariationRefusal";
  }
}

export interface VariationCtx {
  tx: Tx;
  /// Who acted, for the audit rows the act writes.
  actor: AuditActor;
  l: LoadedContract;
  /// The server's instant, read once at the act's entry, to the second.
  now: Date;
  /// The organisation's day of that instant.
  today: string;
}


const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new VariationRefusal(variationRefusal(lead, fs));
};

/// How the trail names the variation: under its contract's label, so the contract's History shows it.
export const variationLabel = (l: LoadedContract, v: { reference: string | null }) => `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · variation ${v.reference ?? "(not yet numbered)"}`;
const routeLabel = (c: VariationCtx, v: VariationRow) => `${variationLabel(c.l, v)} · approval route`;

/// The matrix in force today and the funder's context, as every route of the contract reads them.
export async function matrixToday(c: VariationCtx) {
  const on = dayToDate(c.today);
  const issue = await loadIssue(c.l.org.code, on, undefined, null, c.tx);
  if (!issue) return null;
  const supersedes = c.l.req.fundingSupersedesAuthority === true;
  const override = supersedes && c.l.req.fundingRouteCode ? await loadOverrideMatrix(c.l.org.code, c.l.req.fundingRouteCode, on, c.tx) : null;
  return { issue, ctx: { dal: issue.matrix, override, supersedes } };
}

/// The office's holders for the contract (its requisition's unit) on a day, as the engine reads them.
async function holdersOn(c: VariationCtx, roleCode: string, day: string) {
  const [roster, delegations, units] = await Promise.all([loadRoster(c.l.org.code, c.tx), loadDelegations(c.l.org.code, c.tx), c.tx.orgUnit.findMany({ where: { organisationId: c.l.org.id } })]);
  const unitPath = pathTo(units as unknown as OrgUnit[], c.l.req.sectionUnitCode || c.l.req.requestingUnitCode, dayToDate(day)).reverse().map((u) => u.code);
  return { holders: holdersFor(roleCode, unitPath, roster, delegations, day), roster, delegations, unitPath };
}

export interface SendInput {
  event: VariationEvent;
  value: Sen;
  reading: Reading;
  submittedBy: { id: string; name: string };
}

/// Resolve and open the route (the act has judged `sendFaults` and the reading on the locked rows).
/// Returns the route, its frozen label, and the domain and rows it was resolved on (the override's under a funding
/// override), so what is frozen beside it (the application's percentages) reads the same source (residual S2).
export async function sendVariationRoute(c: VariationCtx, v: VariationRow, i: SendInput): Promise<{ id: string; label: { en: string; ms: string }; domain: string; rules: Matrix["rules"] }> {
  const m = await matrixToday(c);
  if (!m) return refuse("Not sent for approval:", [{ code: "NO_MATRIX", level: "block", data: { day: c.today } }]);
  const contractValue = BigInt(i.reading.den);
  const domain = routeDomainOf(i.event, regimeOf(m.issue.matrix, contractValue));
  const [roster, delegations, units] = await Promise.all([loadRoster(c.l.org.code, c.tx), loadDelegations(c.l.org.code, c.tx), c.tx.orgUnit.findMany({ where: { organisationId: c.l.org.id } })]);
  const unitPath = pathTo(units as unknown as OrgUnit[], c.l.req.sectionUnitCode || c.l.req.requestingUnitCode, dayToDate(c.today)).reverse().map((u) => u.code);
  const holdersOf = (code: string) => holdersFor(code, unitPath, roster, delegations, c.today);
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const offices = Object.keys(m.issue.matrix.roles).filter((k) => !m.issue.matrix.roles[k].isCommittee);
  const r = resolveVariationRoute(m.ctx, { domain, value: i.value, contractValue, ratio: ratioOf(i.reading), method: await methodKeyOf(c.l, c.tx), contractTypeCode: c.l.ex.contractTypeCode, absentRoleCodes: absentOffices(offices, holdersOf, available) }, m.issue.label, (code) => holdersOf(code).holderIds.includes(i.submittedBy.id));
  if (!r.ok) return refuse("Not sent for approval:", r.faults);
  const src = r.source === "OVERRIDE" && m.ctx.override ? { matrix: m.ctx.override.matrix, override: { id: m.ctx.override.id, label: m.ctx.override.label } } : { matrix: m.issue.matrix, override: null };
  const rule = r.resolution.rule!;
  const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? m.issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const on = dayToDate(c.today);
  const inst = await c.tx.approvalInstance.create({
    data: {
      organisationId: c.l.org.id,
      matterKind: "VARIATION",
      variationId: v.id,
      submittedByPersonId: i.submittedBy.id,
      domain,
      value: senToDecimalString(i.value),
      authorityMatrixId: m.issue.id,
      matrixLabel: m.issue.label,
      ruleKey: rule.ruleKey,
      ruleLabel: rule.labelEn,
      ruleClause: rule.clause,
      boundaryValue: String(src.matrix.policy.boundaryValue),
      boundaryInclusive: src.matrix.policy.boundaryInclusive,
      ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
      boundaryOperator: boundaryOperatorFor(rule, src.matrix.policy),
      fundingRouteCode: c.l.req.fundingRouteCode,
      fundingOverrideApplied: src.override != null,
      overrideMatrixId: src.override?.id ?? null,
      overrideMatrixLabel: src.override?.label ?? null,
      checkedAgainstMatrix: true,
      warnings: r.warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: on,
      // Where a refusal would send it, as configured now for the domain (FR-APR-016, CO-4); unset: the officer's choice.
      ...rejectionSnapshot(await loadDestinations(c.tx, c.l.org.id), domain, on, c.now),
      ...routeCoreFields(r.resolution.core, c.now),
      steps: {
        create: r.resolution.chain.map((s, n) => ({ sequence: n + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })),
      },
    },
  });
  // The percentage's label against the edges of the domain this route is resolved on, frozen with its reading.
  const label = routePercentLabel(src.matrix.rules, domain, ratioOf(i.reading));
  const reading: Reading = { ...i.reading, domain, label, edges: edgesOf(src.matrix.rules, domain) };
  const appr = await c.tx.variationApproval.create({ data: { organisationId: c.l.org.id, variationId: v.id, event: i.event, approvalInstanceId: inst.id, value: senToDecimalString(i.value), reading: reading as unknown as Prisma.InputJsonValue, sentByPersonId: i.submittedBy.id, sentOn: on, sentAt: c.now } });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: inst.id, entityLabel: routeLabel(c, v), reason: "" }, "CREATE",
    diffFields(null, {
      approval: EVENT_WORDS[i.event].en,
      matrix: m.issue.label,
      rule: rule.labelEn,
      routedOn: senToDecimalString(i.value),
      readAs: label.en,
      readOver: senToDecimalString(contractValue),
      route: r.resolution.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "),
      fundingOverrideApplied: src.override != null,
      sentBy: i.submittedBy.name,
      recordedOnBehalf: "not signed",
    }));
  void appr;
  return { id: inst.id, label, domain, rules: src.matrix.rules };
}

export interface DecideInput {
  stepId: string;
  decision: "DONE" | "REJECTED";
  personId: string;
  decidedOn: string;
  receivedOn: string | null;
  reason: string;
}

const openRoute = (v: VariationRow) => {
  const a = v.approvals.find((x) => x.approvalInstance.status === "PENDING");
  if (!a) throw new VariationRefusal("Not decided: no approval route is waiting for a decision on this variation.");
  return a;
};

/// A named Person's decision on a person step of the variation's open route.
export async function decideVariationStep(c: VariationCtx, v: VariationRow, i: DecideInput) {
  const a = openRoute(v);
  const inst = a.approvalInstance;
  const step = inst.steps.find((s) => s.id === i.stepId);
  if (!step) throw new VariationRefusal("Not decided: that step is not on the open route.");
  if (i.decision === "REJECTED" && !i.reason.trim()) throw new VariationRefusal("Not decided.", { reason: "Say why it is refused." });
  if (i.decidedOn > c.today) throw new VariationRefusal("Not decided.", { decidedOn: "The day decided cannot be after today." });
  const office = actingOffice(step);
  const h = office ? await holdersOn(c, office, i.decidedOn) : null;
  const person = h?.roster.people.find((p) => p.id === i.personId) ?? (await c.tx.person.findFirst({ where: { id: i.personId, organisationId: c.l.org.id }, select: { id: true, isActive: true, name: true } }));
  const check = deciderFaults(step, {
    today: c.today,
    holders: h?.holders ?? { scope: null, holderIds: [], delegates: [] },
    declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
    person: person ? { id: person.id, isActive: person.isActive } : null,
    // FR-APR-006: whoever sent the variation for approval does not decide it.
    requesterId: inst.submittedByPersonId ?? "",
    endorserIds: [],
    otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
    earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
    decidedOn: i.decidedOn,
    openedOn: storedDay(inst.openedAt),
    value: inst.value == null ? 0n : senFromDecimal(inst.value),
  });
  if (check.faults.length) {
    if (check.faults[0] === "COMMITTEE_STEP") throw new VariationRefusal("Not decided: a committee's step is discharged only by citing its decision on the matter tabled from this variation.");
    const texts = check.faults.map((x) => certificateDeciderText(x, person?.name ?? null)).join(" ");
    throw new VariationRefusal(`Not decided: ${texts}`, ["TIME_ZONE_UNSET", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? undefined : { personId: texts });
  }
  const rf = receivedOnFault(i.receivedOn, i.decidedOn, c.today, storedDay(inst.openedAt));
  if (rf) throw new VariationRefusal("Not decided.", { receivedOn: ({ RECEIVED_AFTER_DECISION: "The day received cannot be after the decision.", RECEIVED_IN_FUTURE: "The day received cannot be after today.", RECEIVED_BEFORE_ROUTE: "The day received cannot be before the variation was sent for approval." } as const)[rf] });
  const after = personDecisionWrite({ decision: i.decision, person: { id: person!.id, name: person!.name }, decidedOn: dayToDate(i.decidedOn), receivedOn: i.receivedOn ? dayToDate(i.receivedOn) : null, delegationId: check.delegationId, reason: i.reason.trim(), recordedAt: c.now });
  const done = await c.tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new VariationRefusal("The step changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalStep", entityId: step.id, entityLabel: `${variationLabel(c.l, v)} · ${step.roleLabel}`, reason: i.reason.trim() }, "UPDATE",
    diffFields({ decision: step.decision, receivedOn: null }, { decision: i.decision, decidedBy: person!.name, decidedOn: i.decidedOn, receivedOn: i.receivedOn, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }));
  await afterStep(c, v, a, step.id, i.decision, i.reason.trim(), null);
}

/**
 * A committee's step, from its decision on a matter tabled from this variation (FR-VAR-010, 013). Only a VARIATION
 * matter naming this variation, before the step's committee, for its act, at the route's value (or no amount),
 * decided on or after the route opened, and cited by no other step.
 */
export async function citeVariationDecision(c: VariationCtx, v: VariationRow, stepId: string, decisionId: string, via: CiteVia = "BY_HAND") {
  const a = openRoute(v);
  const inst = a.approvalInstance;
  const step = inst.steps.find((s) => s.id === stepId);
  if (!step || !step.committeeCode) return refuse("Not cited:", [{ code: "NOT_COMMITTEE_STEP", level: "block" }]);
  if (step.decision !== "PENDING") throw new VariationRefusal("Not cited: this step is already decided.");
  if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) throw new VariationRefusal("Not cited: steps are decided in order, and the step before this one is not done.");
  const matter = v.matters.find((m) => m.id === decisionId);
  const field = (msg: string) => new VariationRefusal("Not cited.", { committeeDecisionId: msg });
  if (!matter) throw field("That matter was not tabled from this variation.");
  if (matter.matterKind !== "VARIATION" || matter.domain !== inst.domain) throw field("That matter was tabled for another approval of this variation.");
  if (matter.meeting.committee.code !== step.committeeCode) throw field("That matter was before another committee.");
  if (matter.act !== step.act) throw field("That matter was tabled for a different act from the one this step asks.");
  if (matter.amount != null && inst.value != null && compareAmounts(matter.amount.toString(), inst.value.toString()) !== 0) throw field("That matter was tabled at a different amount from the value this route approves.");
  if (matter.withdrawnAt) throw field("That matter was withdrawn from the agenda.");
  if ((await c.tx.approvalStep.count({ where: { committeeDecisionId: matter.id } })) > 0) throw field("That decision already discharges another step: one decision discharges one step.");
  if (matter.decisionDate && storedDay(matter.decisionDate) < storedDay(inst.openedAt)) throw field("The committee decided that matter before this route was opened.");
  const record = matterRecordOf(matter);
  const s = committeeStepFrom(record);
  if (s.decision === "PENDING") throw field(record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet.");
  const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: c.now });
  const done = await c.tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new VariationRefusal("The step changed while this was being saved. Reload and try again.");
  const minuted = matter.meeting.status === "MINUTED";
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalStep", entityId: step.id, entityLabel: `${variationLabel(c.l, v)} · ${step.roleLabel}`, reason: "" }, "UPDATE",
    diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: minuted ? "yes" : "no", ...linkedVia(via) }));
  const reason = s.decision === "REJECTED" ? `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}${record?.note ? `: ${record.note}` : ""}` : "";
  await afterStep(c, v, a, step.id, s.decision === "DONE" ? "DONE" : "REJECTED", reason, record?.notApproved ?? null);
}

/// Close the route when its last step is done (a prior approval then opens the application); send a refusal where it goes.
async function afterStep(c: VariationCtx, v: VariationRow, a: VariationRow["approvals"][number], stepId: string, decision: "DONE" | "REJECTED", reason: string, committee: { kind: "LOOP" | "TERMINAL" } | null) {
  const inst = a.approvalInstance;
  if (decision === "REJECTED") {
    const step = inst.steps.find((s) => s.id === stepId)!;
    // MUST 1: a refused increase, agreed-rate or re-measurement route on a variation that stands approved ends the
    // route only. Residual S1: the committee's outcome goes in as decided; a terminal one there is not supported, so
    // the officer chooses among the returns, never recorded as the committee's.
    const outcome = variationRefusalOutcome({ v: factsOf(v), event: a.event as VariationEvent, snapshot: snapshotOf(inst), committee, steps: inst.steps, rejectingSeq: step.sequence });
    await closeRejected(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, v) }, inst, outcome, reason, undefined, c.now);
    if ("apply" in outcome) await sendRefused(c, v, a, outcome.apply, outcome.returnToSeq ?? null, reason);
    return;
  }
  if (!inst.steps.every((s) => s.id === stepId || s.decision === "DONE")) return;
  // BD-613-110: the last step of a prior approval opens the application on the form configured now; none chosen refuses
  // the step (the send asked the same, but the form may have been cleared since), in English and Malay, naming where.
  const form = a.event === "PRIOR" ? await applicationFormNow(c) : null;
  const noForm = lastStepFormFault(a.event as VariationEvent, form);
  if (noForm) refuse("Not approved:", [noForm]);
  const moved = await c.tx.approvalInstance.updateMany({ where: { id: inst.id, status: "PENDING" }, data: { status: "APPROVED", closedAt: c.now } });
  if (moved.count !== 1) throw new VariationRefusal("The route changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: inst.id, entityLabel: routeLabel(c, v), reason: "" }, "UPDATE", diffFields({ status: "PENDING" }, { status: "APPROVED" }));
  if (a.event === "PRIOR") await openApplication(c, v, form!);
}

/// BD-613-110: the form configured for the application now (null: none chosen), as the send and the last step read it.
export async function applicationFormNow(c: Pick<VariationCtx, "tx" | "l">): Promise<string | null> {
  const kind = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind: "VARIATION_APPLICATION" } }, select: { templateId: true } });
  return kind?.templateId ?? null;
}

/// BD-613-52: the application (VO-660) is opened when its prior approval is approved, from the figures the route was
/// sent on (frozen then), on the form configured for it. BD-613-110: the last step has refused already where none is
/// chosen, and openCertificate refuses a missing form too, so it is never opened without one.
async function openApplication(c: VariationCtx, v: VariationRow, templateId: string) {
  const snap = readComputedSnapshot(v.applicationReading);
  if (!snap) throw new VariationRefusal("The application's figures were not frozen when it was sent. Reload and try again.");
  const certId = await openCertificate(c.tx, c.actor, c.l, { kind: "VARIATION_APPLICATION", templateId, routingTypeId: null, sectionId: null, computed: snap }, c.now, c.today);
  const moved = await c.tx.variation.updateMany({ where: { id: v.id, applicationCertificateId: null }, data: { applicationCertificateId: certId } });
  if (moved.count !== 1) throw new VariationRefusal("The variation changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "Variation", entityId: v.id, entityLabel: variationLabel(c.l, v), reason: "" }, "UPDATE", diffFields({ application: null }, { application: "opened from the figures it was approved on" }));
}

/// Send a refused route where its refusal says: back to whoever sent it (nothing moves; it may be sent again), back to
/// an earlier step (a successor route, with its reading), or the variation ends (closed).
async function sendRefused(c: VariationCtx, v: VariationRow, a: VariationRow["approvals"][number], kind: RejectionKind, returnToSeq: number | null, reason: string) {
  if (kind === "RETURN_TO_STEP") {
    const next = await openSuccessor(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, v) }, a.approvalInstance.id, returnToSeq!, dayToDate(c.today));
    await c.tx.variationApproval.create({ data: { organisationId: c.l.org.id, variationId: v.id, event: a.event, approvalInstanceId: next, value: a.value, reading: a.reading as Prisma.InputJsonValue, sentByPersonId: a.sentByPersonId, sentOn: dayToDate(c.today), sentAt: c.now } });
    return;
  }
  if (kind === "TERMINATE") {
    if (!refusalKinds(factsOf(v), a.event as VariationEvent).includes("TERMINATE")) throw new VariationRefusal("Not recorded: the variation stands approved, so a refused route for its increase, agreed rates or re-measurement ends that route only: send it back instead.");
    const moved = await c.tx.variation.updateMany({ where: { id: v.id, status: { not: "CLOSED" } }, data: { status: "CLOSED", closedOn: dayToDate(c.today), closedReason: `Its approval route was refused and the variation ends: ${reason}` } });
    if (moved.count !== 1) throw new VariationRefusal("The variation changed while this was being saved. Reload and try again.");
    await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "Variation", entityId: v.id, entityLabel: variationLabel(c.l, v), reason }, "UPDATE", diffFields({ stage: "open" }, { stage: "closed", closedOn: c.today }));
  }
}

/// Where a refused route goes, chosen by the officer where its refusal decided nothing (FR-APR-016, CO-5).
export async function chooseVariationRejection(c: VariationCtx, v: VariationRow, i: { kind: RejectionKind | null; returnToSeq: number | null; personId: string | null; reason: string }) {
  const a = [...v.approvals].reverse().find((x) => x.approvalInstance.status === "REJECTED" && x.approvalInstance.rejectionApplied == null) ?? null;
  const inst = a?.approvalInstance ?? null;
  const rejecting = inst?.steps.find((s) => s.decision === "REJECTED") ?? null;
  const fault = choiceFault({ status: inst?.status ?? "", applied: (inst?.rejectionApplied as RejectionKind | null) ?? null, offered: (inst?.rejectionChoices as RejectionKind[] | undefined) ?? [], steps: inst?.steps ?? [], rejectingSeq: rejecting?.sequence ?? null }, i);
  if (fault) {
    const f = ({ NOT_OFFERED: "kind", STEP_REQUIRED: "returnToSeq", STEP_NOT_EARLIER: "returnToSeq", PERSON_REQUIRED: "personId", REASON_REQUIRED: "reason" } as Record<string, string>)[fault];
    throw new VariationRefusal(f ? "Not recorded." : `Not recorded: ${CHOICE_FAULT_TEXT[fault]}`, f ? { [f]: CHOICE_FAULT_TEXT[fault] } : undefined);
  }
  const person = await c.tx.person.findFirst({ where: { id: i.personId!, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new VariationRefusal("Not recorded.", { personId: "Choose someone on record and active." });
  await recordChoice(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, v) }, inst!.id, i.kind!, person.id, person.name, i.reason.trim());
  await sendRefused(c, v, a!, i.kind!, i.kind === "RETURN_TO_STEP" ? i.returnToSeq : null, i.reason.trim());
}

/// The words for where a refused route goes.
export const refusalKindText = (k: RejectionKind) => REJECTION_KIND_LABEL[k];

/// Holders of an office for the contract on a day (the decide drawer offers them; the act judges them).
export async function officeHoldersOn(c: VariationCtx, roleCode: string, day: string) {
  return (await holdersOn(c, roleCode, day)).holders;
}

export type { Tx };
