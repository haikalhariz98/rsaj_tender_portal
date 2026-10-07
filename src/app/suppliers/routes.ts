/**
 * Opening and deciding the register's engine routes (6.15 OD-2 A, a2 OD-8 A, FR-ADV-017): a supplier
 * matter is routed on no value, so only an unbounded rule matches it; no rule, a committee step or a
 * requester who would approve their own matter refuses, naming the Approval matrix (`supplierRoute`).
 * Offices are held organisation-wide (`supplierHolders`); a delegation with a value ceiling cannot be
 * judged on a matter with no value. A refused step closes the route as the matrix's rejection says
 * (returned to the officer, ASSUMED as the registration's). Called inside a locked transaction only.
 */

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { loadIssue } from "@/lib/authority/load";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { dayToDate, storedDay } from "@/lib/dates";
import { ACT_LABEL } from "@/lib/labels";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { ableToAct, deciderFaults } from "@/lib/requisition/holders";
import { SUPPLIER_DECIDER_TEXT } from "@/lib/suppliers/labels";
import type { SupplierOrg } from "@/lib/suppliers/repo";
import { supplierHolders, supplierRoute } from "@/lib/suppliers/route";

import type { ActWriter } from "@/lib/auth/act-writer";
import { audit, CHANGED, Refusal } from "./shared";
import type { AuditActor } from "@/lib/auth/types";

export const NO_MATRIX = "No approval matrix is in force, so nobody can be shown as deciding it. Issue one under Configuration › Approval matrix.";

type Owner = { standingRequestId: string } | { specialPermissionId: string };

/**
 * Open a route on `domain` under `cond` for a matter, with `requester` as the one asking (never an
 * approver of it). Returns the route, or the refusal in words. The caller's transaction holds the locks.
 */
export async function openSupplierRoute(
  tx: Tx,
  actor: AuditActor,
  org: SupplierOrg,
  o: { domain: string; cond: string | null; owner: Owner; requester: { id: string; name: string }; what: { en: string; ms: string }; routeLabel: string; matter: string; ifRefused: string; now: Date },
): Promise<{ ok: true; id: string } | { ok: false; state: FormState }> {
  const today = org.today!;
  const issue = await loadIssue(org.code, dayToDate(today), undefined, null, tx);
  if (!issue) return { ok: false, state: { ok: false, message: NO_MATRIX } };
  const roster = await loadRoster(org.code, tx);
  const delegations = await loadDelegations(org.code, tx);
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const res = supplierRoute(issue.matrix, o.domain, o.cond, {
    id: o.requester.id,
    holds: (code) => supplierHolders(code, roster, delegations, today).holderIds.includes(o.requester.id),
    ableToAct: (code) => ableToAct(supplierHolders(code, roster, delegations, today), o.requester.id, 0n, available),
  }, o.what);
  if (res.refusal) return { ok: false, state: { ok: false, message: `Nothing was saved: ${res.refusal.en}` } };
  const rule = issue.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
  const roleLabel = (code: string) => issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const instance = await tx.approvalInstance.create({
    data: {
      organisationId: org.id,
      matterKind: "SUPPLIER",
      ...o.owner,
      domain: o.domain,
      cond: o.cond,
      // OD-2 A: routed on no value. Never an invented 0.
      value: null,
      authorityMatrixId: issue.id,
      matrixLabel: issue.label,
      ruleKey: rule.ruleKey,
      ruleLabel: rule.labelEn,
      ruleClause: rule.clause,
      boundaryValue: String(issue.matrix.policy.boundaryValue),
      boundaryInclusive: issue.matrix.policy.boundaryInclusive,
      ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
      boundaryOperator: boundaryOperatorFor(rule, issue.matrix.policy),
      checkedAgainstMatrix: true,
      warnings: res.warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: dayToDate(today),
      // A refusal returns the matter to the officer (ASSUMED, as a registration's).
      rejectionSnapshotAt: o.now,
      rejectionDestinationId: null,
      rejectionKind: "RETURN_TO_ORIGINATOR",
      rejectionReturnToRoleCode: null,
      rejectionProvenance: "ASSUMED",
      ...routeCoreFields(res.core, o.now),
      steps: { create: res.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
    },
  });
  await audit(tx, actor, org.id, "ApprovalInstance", instance.id, o.routeLabel, "CREATE",
    diffFields(null, { matter: o.matter, matrix: issue.label, rule: rule.labelEn, routedOn: "No value (supplier matters are not routed on a value)", route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: o.ifRefused, askedBy: o.requester.name }));
  return { ok: true, id: instance.id };
}

type RouteWithSteps = Prisma.ApprovalInstanceGetPayload<{ include: { steps: true } }>;

/**
 * A named Person's decision on one step of a register route: 6.1's holder, delegation, self-approval and
 * date checks, recorded on their behalf. Returns whether the route is now approved (every step done),
 * refused (closed as its rejection says) or still pending; or a refusal in words. A changed row throws.
 */
export async function decideSupplierStep(
  tx: Tx,
  actor: AuditActor,
  org: SupplierOrg,
  full: RouteWithSteps,
  stepId: string,
  d: { decision: "DONE" | "REJECTED"; /// How the step was decided (attributed here); `act.subjectPersonId` is the holder it is attributed to.
    act: ActWriter; document: { entity: string; id: string }; decidedOn: Date; reason: string; requesterId: string; routeLabel: string; refusedGoesTo: string; now: Date },
): Promise<{ outcome: "APPROVED" | "REJECTED" | "PENDING"; person: { id: string; name: string } } | { refused: FormState }> {
  const step = full.steps.find((s) => s.id === stepId);
  if (!step || full.status !== "PENDING") return { refused: { ok: false, message: "That step is not on a route awaiting a decision." } };
  const roster = await loadRoster(org.code, tx);
  const delegations = await loadDelegations(org.code, tx);
  const person = await tx.person.findFirst({ where: { id: d.act.subjectPersonId, organisationId: org.id }, select: { id: true, name: true, isActive: true } });
  const decidedOn = storedDay(d.decidedOn);
  const office = actingOffice(step);
  const check = deciderFaults(step, {
    today: org.today,
    holders: office ? supplierHolders(office, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
    declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
    person,
    requesterId: d.requesterId,
    recorderId: d.act.recorderId,
    endorserIds: [],
    otherDeciderIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
    earlierDone: full.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
    decidedOn,
    openedOn: storedDay(full.openedAt),
    value: 0n,
  });
  if (check.faults.length > 0) {
    const texts = check.faults.map((f) => SUPPLIER_DECIDER_TEXT[f].en.replace(/^That person/, person?.name ?? "That person"));
    return { refused: ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } } };
  }
  const after = personDecisionWrite({ decision: d.decision, person: { id: person!.id, name: person!.name }, decidedOn: d.decidedOn, delegationId: check.delegationId, reason: d.reason, recordedAt: d.now });
  const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, actor, org.id, "ApprovalStep", step.id, `${d.routeLabel} · ${step.roleLabel}`, "UPDATE", diffFields({ decision: step.decision }, { decision: d.decision, decidedBy: person!.name, decidedOn: d.decidedOn, recordedOnBehalf: d.act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }), d.reason);
  await d.act.write(tx, step.id, { document: d.document, roleCode: step.actingRoleCode ?? step.roleCode });
  if (d.decision === "REJECTED") {
    await closeRejected(tx, actor, { organisationId: org.id, routeLabel: d.routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, d.reason, d.refusedGoesTo);
    return { outcome: "REJECTED", person: person! };
  }
  if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { outcome: "PENDING", person: person! };
  const moved = await tx.approvalInstance.updateMany({ where: { id: full.id, status: "PENDING" }, data: { status: "APPROVED", closedAt: d.now } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, actor, org.id, "ApprovalInstance", full.id, d.routeLabel, "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), d.reason);
  return { outcome: "APPROVED", person: person! };
}

/// The day a route was approved: its last step's decision day. Null while it is not approved.
export function approvedOnOf(route: { status: string; steps: { decidedOn: Date | null }[] } | null | undefined): string | null {
  if (!route || route.status !== "APPROVED") return null;
  const days = route.steps.map((s) => s.decidedOn).filter((x): x is Date => x != null).map((x) => storedDay(x)).sort();
  return days.at(-1) ?? null;
}
