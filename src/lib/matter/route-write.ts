/**
 * A contract matter's approval routes, written (6.13 Part B run 1b; ADR 0029; generalised from the variation's
 * route-write.ts, which is unchanged).
 *
 * Server-only: each helper runs inside a matter act's transaction, on rows the act locked in the one order (Requisition
 * → Exercise → Award → Contract → ContractMatter → the matter's record), re-runs the rule on those rows, writes, and
 * audits before/after in the same transaction under the contract's label. A refusal throws `MatterRefusal`.
 *
 * - Sending: the reference from the `contract_matter` series at the first send (no series: refused, naming it); the route
 *   resolved on the matrix in force today under the requisition's funding route, with the absence rule and the sender's
 *   own office, on the kind's domain with its value, exact ratio or condition (time/route.ts); opened as a CONTRACT matter
 *   naming the matter (`contractMatterId`); the matter's routed value, ratio and condition written (SULIT, BD-613-73).
 * - A person's step: 6.1's holder, delegation, order, date and self-approval checks (whoever sent it may not decide it).
 * - A committee's step: only by citing the committee's decision on a matter tabled from this matter, for this step's
 *   committee and act, decided on or after the route opened, cited once. Carried discharges it; not carried refuses
 *   the route, and the committee's outcome says where it goes; deferred leaves it waiting.
 * - The last step approves the route and writes the approval of record (the route hook, write.ts).
 * - A refusal goes where the route's snapshot says, else waits for the officer's choice: back to whoever sent it (it may
 *   be sent again), back to an earlier step (a successor route), or the matter ends (closed with the reason).
 */

import type { Prisma } from "@/generated/prisma/client";
import { closeRejected, loadDestinations, openSuccessor, recordChoice, snapshotOf } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { absentOffices } from "@/lib/authority/absence";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { committeeCitationWrite, personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { choiceFault, rejectionOutcome, rejectionSnapshot, type RejectionKind } from "@/lib/authority/rejection";
import { CHOICE_FAULT_TEXT } from "@/lib/authority/rejection-labels";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { receivedOnFault } from "@/lib/award/routing";
import { certificateDeciderText } from "@/lib/certificate/route-words";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { ACT_LABEL } from "@/lib/labels";
import type { Finding } from "@/lib/method/types";
import { compareAmounts, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import type { ExactRatio } from "@/lib/percent-band";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { committeeStepFrom } from "@/lib/requisition/committee-step";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { methodKeyOf } from "@/lib/supervision/load";
import { resolveMatterRoute } from "@/lib/time/route";
import { timeRefusal } from "@/lib/time/labels";
import { matrixToday } from "@/lib/variation/route-write";

import { decisionRecordOf, type MatterRow } from "./load";
import type { ContractMatterKind } from "./matter";
import { closeMatter, markSent, matterLabel, writeApprovalOfRecord } from "./write";
import { linkedVia, type CiteVia } from "@/lib/committee/cite-via";
import type { AuditActor } from "@/lib/auth/types";

/// A refusal: rolls the transaction back. `errors` names a field where the refusal is about one.
export class MatterRefusal extends Error {
  constructor(
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "MatterRefusal";
  }
}

export interface MatterCtx {
  tx: Tx;
  /// Who acted, for the audit rows the act writes.
  actor: AuditActor;
  l: LoadedContract;
  now: Date;
  today: string;
}

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new MatterRefusal(timeRefusal(lead, fs));
};
const routeLabel = (c: MatterCtx, m: Pick<MatterRow, "kind" | "reference">) => `${matterLabel(c.l, m)} · approval route`;

/// Whether the organisation has the contract_matter numbering series.
export async function matterSeriesSet(tx: Tx, organisationId: string): Promise<boolean> {
  return (await tx.numberingSeries.count({ where: { organisationId, key: "contract_matter" } })) > 0;
}

async function unitPathOf(c: MatterCtx, day: string) {
  const [roster, delegations, units] = await Promise.all([loadRoster(ORGANISATION_CODE, c.tx), loadDelegations(ORGANISATION_CODE, c.tx), c.tx.orgUnit.findMany({ where: { organisationId: c.l.org.id } })]);
  const unitPath = pathTo(units as unknown as OrgUnit[], c.l.req.sectionUnitCode || c.l.req.requestingUnitCode, dayToDate(day)).reverse().map((u) => u.code);
  return { roster, delegations, unitPath };
}

export interface SendInput {
  value: Sen | null;
  ratio: ExactRatio | null;
  cond: string | null;
  /// The contract value the matrix reads the regime and contract-value bands at.
  contractValue: Sen;
  submittedBy: { id: string; name: string };
  /// The kind's own check of the resolved chain (loss and expense: the claims committee, OD-B20): blocks refuse, the
  /// rest are written on the route's warnings.
  chainCheck?: (committeeCodes: string[], committeeName: (code: string) => string) => Finding[];
  /// What the route is in words, for the trail.
  what: string;
}

/// Resolve and open the matter's route (the act has judged its own rule and `sendFaults` on the locked rows).
export async function sendMatterRoute(c: MatterCtx, m: MatterRow, i: SendInput): Promise<{ id: string; reference: string }> {
  const m0 = await matrixToday(c);
  if (!m0) return refuse("Not sent for approval:", [{ code: "NO_MATRIX", level: "block", data: { day: c.today } }]);
  const { roster, delegations, unitPath } = await unitPathOf(c, c.today);
  const holdersOf = (code: string) => holdersFor(code, unitPath, roster, delegations, c.today);
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const offices = Object.keys(m0.issue.matrix.roles).filter((k) => !m0.issue.matrix.roles[k].isCommittee);
  const kind = m.kind as ContractMatterKind;
  const r = resolveMatterRoute(m0.ctx, { kind, value: i.value, ratio: i.ratio, cond: i.cond, contractValue: i.contractValue, method: await methodKeyOf(c.l, c.tx), contractTypeCode: c.l.ex.contractTypeCode, absentRoleCodes: absentOffices(offices, holdersOf, available) }, m0.issue.label, (code) => holdersOf(code).holderIds.includes(i.submittedBy.id));
  if (!r.ok) return refuse("Not sent for approval:", r.faults);
  const src = r.source === "OVERRIDE" && m0.ctx.override ? { matrix: m0.ctx.override.matrix, override: { id: m0.ctx.override.id, label: m0.ctx.override.label } } : { matrix: m0.issue.matrix, override: null };
  const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? m0.issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const checks = i.chainCheck ? i.chainCheck(r.resolution.chain.filter((s) => s.committeeCode).map((s) => s.committeeCode!), roleLabel) : [];
  const blocks = checks.filter((x) => x.level === "block");
  if (blocks.length) refuse("Not sent for approval:", blocks);
  // The first send's reference (BD-613-73: from the contract_matter series; none set refuses, naming it).
  let reference = m.reference;
  if (!reference) {
    try {
      reference = await issueReference(c.tx, c.l.org.id, "contract_matter", dayToDate(c.today));
    } catch (e) {
      if (e instanceof NumberingError) return refuse("Not sent for approval:", [{ code: "MATTER_SERIES_NOT_SET", level: "block" }]);
      throw e;
    }
  }
  const rule = r.resolution.rule!;
  const on = dayToDate(c.today);
  const warnings = [...r.warnings, ...r.notes.map((n) => ({ code: "D2_NOTE", level: "info" as const, messageEn: n.en, messageMs: n.ms })), ...checks.map((x) => ({ code: x.code, level: "warn" as const, messageEn: timeRefusal("", [x]), messageMs: timeRefusal("", [x]) }))];
  const inst = await c.tx.approvalInstance.create({
    data: {
      organisationId: c.l.org.id,
      matterKind: "CONTRACT",
      contractMatterId: m.id,
      submittedByPersonId: i.submittedBy.id,
      domain: r.domain,
      cond: i.cond,
      value: i.value == null ? null : senToDecimalString(i.value),
      authorityMatrixId: m0.issue.id,
      matrixLabel: m0.issue.label,
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
      warnings: warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: on,
      ...rejectionSnapshot(await loadDestinations(c.tx, c.l.org.id), r.domain, on, c.now),
      ...routeCoreFields(r.resolution.core, c.now),
      steps: {
        create: r.resolution.chain.map((s, n) => ({ sequence: n + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })),
      },
    },
  });
  await markSent(c.tx, c.actor, c.l, m, { reference, value: i.value, ratio: i.ratio, cond: i.cond });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: inst.id, entityLabel: routeLabel(c, { kind: m.kind, reference }), reason: "" }, "CREATE",
    diffFields(null, {
      approval: i.what,
      matrix: m0.issue.label,
      rule: rule.labelEn,
      route: r.resolution.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "),
      fundingOverrideApplied: src.override != null,
      sentBy: i.submittedBy.name,
      recordedOnBehalf: "not signed",
    }));
  return { id: inst.id, reference: reference! };
}

export interface DecideInput {
  stepId: string;
  decision: "DONE" | "REJECTED";
  personId: string;
  decidedOn: string;
  receivedOn: string | null;
  reason: string;
}

const openRoute = (m: MatterRow) => {
  const r = m.routes.find((x) => x.status === "PENDING");
  if (!r) throw new MatterRefusal("Not decided: no approval route is waiting for a decision on this matter.");
  return r;
};

/// A named Person's decision on a person step of the matter's open route.
export async function decideMatterStep(c: MatterCtx, m: MatterRow, i: DecideInput) {
  const inst = openRoute(m);
  const step = inst.steps.find((s) => s.id === i.stepId);
  if (!step) throw new MatterRefusal("Not decided: that step is not on the open route.");
  if (i.decision === "REJECTED" && !i.reason.trim()) throw new MatterRefusal("Not decided.", { reason: "Say why it is refused." });
  if (i.decidedOn > c.today) throw new MatterRefusal("Not decided.", { decidedOn: "The day decided cannot be after today." });
  const office = actingOffice(step);
  const h = office ? await unitPathOf(c, i.decidedOn) : null;
  const holders = office && h ? holdersFor(office, h.unitPath, h.roster, h.delegations, i.decidedOn) : { scope: null, holderIds: [], delegates: [] };
  const person = h?.roster.people.find((p) => p.id === i.personId) ?? (await c.tx.person.findFirst({ where: { id: i.personId, organisationId: c.l.org.id }, select: { id: true, isActive: true, name: true } }));
  const check = deciderFaults(step, {
    today: c.today,
    holders,
    declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
    person: person ? { id: person.id, isActive: person.isActive } : null,
    // FR-APR-006: whoever sent the matter for approval does not decide it.
    requesterId: inst.submittedByPersonId ?? "",
    endorserIds: [],
    otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
    earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
    decidedOn: i.decidedOn,
    openedOn: storedDay(inst.openedAt),
    value: inst.value == null ? 0n : senFromDecimal(inst.value),
  });
  if (check.faults.length) {
    if (check.faults[0] === "COMMITTEE_STEP") throw new MatterRefusal("Not decided: a committee's step is discharged only by citing its decision on the matter tabled from this matter.");
    const texts = check.faults.map((x) => certificateDeciderText(x, person?.name ?? null)).join(" ");
    throw new MatterRefusal(`Not decided: ${texts}`, ["TIME_ZONE_UNSET", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? undefined : { personId: texts });
  }
  const rf = receivedOnFault(i.receivedOn, i.decidedOn, c.today, storedDay(inst.openedAt));
  if (rf) throw new MatterRefusal("Not decided.", { receivedOn: ({ RECEIVED_AFTER_DECISION: "The day received cannot be after the decision.", RECEIVED_IN_FUTURE: "The day received cannot be after today.", RECEIVED_BEFORE_ROUTE: "The day received cannot be before the matter was sent for approval." } as const)[rf] });
  const after = personDecisionWrite({ decision: i.decision, person: { id: person!.id, name: person!.name }, decidedOn: dayToDate(i.decidedOn), receivedOn: i.receivedOn ? dayToDate(i.receivedOn) : null, delegationId: check.delegationId, reason: i.reason.trim(), recordedAt: c.now });
  const done = await c.tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new MatterRefusal("The step changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalStep", entityId: step.id, entityLabel: `${matterLabel(c.l, m)} · ${step.roleLabel}`, reason: i.reason.trim() }, "UPDATE",
    diffFields({ decision: step.decision, receivedOn: null }, { decision: i.decision, decidedBy: person!.name, decidedOn: i.decidedOn, receivedOn: i.receivedOn, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }));
  await afterStep(c, m, inst, step.id, i.decision, i.reason.trim(), null);
}

/// A committee's step, from its decision on a matter tabled from this matter (ADR 0029 §3).
export async function citeMatterDecision(c: MatterCtx, m: MatterRow, stepId: string, decisionId: string, via: CiteVia = "BY_HAND") {
  const inst = openRoute(m);
  const step = inst.steps.find((s) => s.id === stepId);
  if (!step || !step.committeeCode) return refuse("Not cited:", [{ code: "NOT_COMMITTEE_STEP", level: "block" }]);
  if (step.decision !== "PENDING") throw new MatterRefusal("Not cited: this step is already decided.");
  if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) throw new MatterRefusal("Not cited: steps are decided in order, and the step before this one is not done.");
  const matter = m.decisions.find((d) => d.id === decisionId);
  const field = (msg: string) => new MatterRefusal("Not cited.", { committeeDecisionId: msg });
  if (!matter) throw field("That committee matter was not tabled from this matter.");
  if (matter.matterKind !== "CONTRACT" || matter.domain !== inst.domain) throw field("That committee matter was tabled for another approval.");
  if (matter.meeting.committee.code !== step.committeeCode) throw field("That committee matter was before another committee.");
  if (matter.act !== step.act) throw field("That committee matter was tabled for a different act from the one this step asks.");
  if (matter.amount != null && inst.value != null && compareAmounts(matter.amount.toString(), inst.value.toString()) !== 0) throw field("That committee matter was tabled at a different amount from the value this route approves.");
  if (matter.withdrawnAt) throw field("That committee matter was withdrawn from the agenda.");
  if ((await c.tx.approvalStep.count({ where: { committeeDecisionId: matter.id } })) > 0) throw field("That decision already discharges another step: one decision discharges one step.");
  if (matter.decisionDate && storedDay(matter.decisionDate) < storedDay(inst.openedAt)) throw field("The committee decided that matter before this route was opened.");
  const record = decisionRecordOf(matter);
  const s = committeeStepFrom(record);
  if (s.decision === "PENDING") throw field(record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet.");
  const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: c.now });
  const done = await c.tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new MatterRefusal("The step changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalStep", entityId: step.id, entityLabel: `${matterLabel(c.l, m)} · ${step.roleLabel}`, reason: "" }, "UPDATE",
    diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: matter.meeting.status === "MINUTED" ? "yes" : "no", ...linkedVia(via) }));
  const reason = s.decision === "REJECTED" ? `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}${record?.note ? `: ${record.note}` : ""}` : "";
  await afterStep(c, m, inst, step.id, s.decision === "DONE" ? "DONE" : "REJECTED", reason, record?.notApproved ?? null);
}

/// What a refusal may do to a matter: it may go back (to whoever sent it, or an earlier step), or the matter ends.
const MATTER_REFUSAL_KINDS: readonly RejectionKind[] = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];

/// Close the route when its last step is done (the approval of record written); send a refusal where it goes.
async function afterStep(c: MatterCtx, m: MatterRow, inst: MatterRow["routes"][number], stepId: string, decision: "DONE" | "REJECTED", reason: string, committee: { kind: "LOOP" | "TERMINAL" } | null) {
  if (decision === "REJECTED") {
    const step = inst.steps.find((s) => s.id === stepId)!;
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee, steps: inst.steps, rejectingSeq: step.sequence, supports: MATTER_REFUSAL_KINDS });
    await closeRejected(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, m) }, inst, outcome, reason, undefined, c.now);
    if ("apply" in outcome) await sendRefused(c, m, inst, outcome.apply, outcome.returnToSeq ?? null, reason);
    return;
  }
  if (!inst.steps.every((s) => s.id === stepId || s.decision === "DONE")) return;
  const moved = await c.tx.approvalInstance.updateMany({ where: { id: inst.id, status: "PENDING" }, data: { status: "APPROVED", closedAt: c.now } });
  if (moved.count !== 1) throw new MatterRefusal("The route changed while this was being saved. Reload and try again.");
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "ApprovalInstance", entityId: inst.id, entityLabel: routeLabel(c, m), reason: "" }, "UPDATE", diffFields({ status: "PENDING" }, { status: "APPROVED" }));
  // The route hook: the approval of record (ADR 0029 §4), its one writer.
  await writeApprovalOfRecord(c.tx, c.actor, c.l, m, inst.id);
}

async function sendRefused(c: MatterCtx, m: MatterRow, inst: MatterRow["routes"][number], kind: RejectionKind, returnToSeq: number | null, reason: string) {
  if (kind === "RETURN_TO_STEP") {
    await openSuccessor(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, m) }, inst.id, returnToSeq!, dayToDate(c.today));
    return;
  }
  if (kind === "TERMINATE") await closeMatter(c.tx, c.actor, c.l, m, `Its approval route was refused and the matter ends: ${reason}`, c.now);
}

/// Where a refused route goes, chosen by the officer where its refusal decided nothing (FR-APR-016, CO-5).
export async function chooseMatterRejection(c: MatterCtx, m: MatterRow, i: { kind: RejectionKind | null; returnToSeq: number | null; personId: string | null; reason: string }) {
  const inst = [...m.routes].reverse().find((x) => x.status === "REJECTED" && x.rejectionApplied == null) ?? null;
  const rejecting = inst?.steps.find((s) => s.decision === "REJECTED") ?? null;
  const fault = choiceFault({ status: inst?.status ?? "", applied: (inst?.rejectionApplied as RejectionKind | null) ?? null, offered: (inst?.rejectionChoices as RejectionKind[] | undefined) ?? [], steps: inst?.steps ?? [], rejectingSeq: rejecting?.sequence ?? null }, i);
  if (fault) {
    const f = ({ NOT_OFFERED: "kind", STEP_REQUIRED: "returnToSeq", STEP_NOT_EARLIER: "returnToSeq", PERSON_REQUIRED: "personId", REASON_REQUIRED: "reason" } as Record<string, string>)[fault];
    throw new MatterRefusal(f ? "Not recorded." : `Not recorded: ${CHOICE_FAULT_TEXT[fault]}`, f ? { [f]: CHOICE_FAULT_TEXT[fault] } : undefined);
  }
  const person = await c.tx.person.findFirst({ where: { id: i.personId!, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new MatterRefusal("Not recorded.", { personId: "Choose someone on record and active." });
  await recordChoice(c.tx, c.actor, { organisationId: c.l.org.id, routeLabel: routeLabel(c, m) }, inst!.id, i.kind!, person.id, person.name, i.reason.trim());
  await sendRefused(c, m, inst!, i.kind!, i.kind === "RETURN_TO_STEP" ? i.returnToSeq : null, i.reason.trim());
}

export type { Tx };
