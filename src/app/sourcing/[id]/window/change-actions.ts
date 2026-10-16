"use server";

import { shredExerciseReleases } from "@/lib/opening/unseal-store";
import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { exerciseCancelBlockedBy } from "@/lib/award/status";
import { dayToDate, instantAt, storedDay } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { ACT_LABEL } from "@/lib/labels";
import { WITHDRAWN_ON_CANCEL, exerciseRouteMatter, exerciseRoutesOf, requesterHolding, windowChangeRoutesOf } from "@/lib/method/approval";
import { moveExercise } from "@/lib/method/move";
import { evaluationContext } from "@/lib/method/repo";
import { WINDOW_CHANGE_DOMAIN } from "@/lib/method/types";
import { parseSen, senToDecimalString } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { voidLivePacks } from "@/lib/tender-docs/store";
import { deliveryFaults } from "@/lib/window/addendum";
import { changeFields, deliveryFields, ENTITY } from "@/lib/window/audit-view";
import { lockOpeningRows } from "@/lib/opening/lock";
import { mainOpeningAdjourned, openingInProgress } from "@/lib/opening/gate-read";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { closeOnCancellation } from "@/lib/evaluation/versions";
import { appliedChangeFaults, cancelFaults, closingChangeFaults, noticeRecipients, windowChangeRouteForRequester, type WindowChangeCond } from "@/lib/window/change";
import { CHANGE_REFUSED_DECIDED_BY, windowChangeRejectionSnapshot } from "@/lib/window/edit";
import { CHANGE_ROUTE_TEXT, windowFindingText } from "@/lib/window/labels";
import type { WindowData } from "@/lib/window/repo";
import { CLOSING_CHANGE_KINDS, DELIVERY_METHODS, type ClosingChangeKind, type DeliveryMethod, type Finding } from "@/lib/window/types";
import { FormReader } from "@/lib/validate";

import { audit, CHANGED, exerciseIdOf, inWindow, label, NO_WINDOW, NO_ZONE, refuse, Refusal, type LockedWindow } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct, type PreparedAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import { routeRequesterId, routeSenderBarredId } from "@/lib/approvals/requester";

/**
 * Changing the window after approval for tendering (plan §4.7; FR-ADV-015, 016; OD-5 A): a
 * closing correction (before publication) or extension (after), and cancelling a published
 * exercise, each asked for on the engine's route on the domain `window_change`, resolved from the
 * customer's matrix rows (none shipped, no approver named here). The step that completes the route
 * applies the change in the decision's own transaction, after re-running its rule under the
 * window's lock: if the rule now refuses (the closing passed while it waited), the step stands,
 * and the change is refused and says why, on the route and on the change. The closing is written
 * here only, by `applyClosingChange` (X-2: its second writer). A refusal on the route means the
 * change is not made; it may be asked for again.
 */

const NO_ISSUE: FormState = { ok: false, message: "No approval matrix is in force, so nobody can be shown as approving a change. Issue one under Configuration, Approval matrix." };

/// The change's route, resolved now with the requester in mind, and opened with its steps (audited).
async function openChangeRoute(tx: Tx, actor: AuditActor, l: LockedWindow, cond: WindowChangeCond, what: string, act: PreparedAct): Promise<{ id: string } | FormState> {
  const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, l.ex, tx);
  if (!issue || !ctx) return NO_ISSUE;
  const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode) ?? null;
  if (!method) return { ok: false, message: "The exercise's method is no longer configured, so nobody can be shown as approving a change." };
  const value = parseSen(l.ex.estimatedValue.toString());
  const [roster, delegations] = [await loadRoster(l.org.code, tx), await loadDelegations(l.org.code, tx)];
  const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
  const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(l.org.today!)).reverse().map((u) => u.code);
  const holders = (code: string) => holdersFor(code, unitPath, roster, delegations, l.org.today!);
  const res = windowChangeRouteForRequester(ctx.funder, method, Number(senToDecimalString(value)), cond, requesterHolding(holders, l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
  if (res.changeState !== "RESOLVED") return { ok: false, message: `Not asked: ${CHANGE_ROUTE_TEXT[res.changeState]}` };
  if (res.refusal) return { ok: false, message: `Not asked: ${res.refusal}` };
  const errors = res.warnings.filter((w) => w.level === "err");
  if (errors.length) return { ok: false, message: `Not asked: ${errors.map((w) => w.messageEn).join(" ")}` };
  const src = res.source === "OVERRIDE" && ctx.funder.override ? ctx.funder.override : { id: issue.id, label: issue.label, matrix: issue.matrix };
  const rule = src.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
  const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const now = new Date();
  const instance = await tx.approvalInstance.create({
    data: {
      organisationId: l.org.id,
      matterKind: "EXERCISE",
      exerciseId: l.ex.id,
      domain: WINDOW_CHANGE_DOMAIN,
      cond,
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
      fundingOverrideApplied: res.source === "OVERRIDE",
      overrideMatrixId: res.overrideIssue?.id ?? null,
      overrideMatrixLabel: res.overrideIssue?.label ?? null,
      checkedAgainstMatrix: true,
      warnings: res.warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: dayToDate(l.org.today!),
      // The sender (decisions log, 2026-10-09, ruling on 1860): barred from deciding the route. Always the signed-in officer's own act.
      submittedByPersonId: act.subjectPersonId,
      ...windowChangeRejectionSnapshot(now),
      ...routeCoreFields(res.core, now),
      steps: {
        create: res.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })),
      },
    },
  });
  await audit(tx, actor, l.org.id, "ApprovalInstance", instance.id, label(l, exerciseRouteMatter(WINDOW_CHANGE_DOMAIN).auditNoun), "CREATE",
    diffFields(null, { matter: what, matrix: issue.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: res.source === "OVERRIDE", ifRefused: "not made; may be asked again" }));
  await act.write(tx, instance.id);
  return { id: instance.id };
}

/// The rules a closing change is judged by, read from the window under the lock.
function changeRules(l: LockedWindow, d: WindowData) {
  const w = d.window!;
  return { advertisementDay: w.advertisementDay ? storedDay(w.advertisementDay) : null, closingTimeReason: w.closingTimeReason, timeZone: l.org.timeZone, policy: d.policy, calendar: d.calendar, today: l.org.today };
}

// ------------------------------------------------------------------ asking for a change

/**
 * Ask for a closing correction (before publication) or extension (after), with the new closing
 * day and time and, where it moves, the new last day of sale. Every date rule is re-run on the new
 * dates (an extension from the original advertisement day): a change that would break one is not
 * asked for. The original and the revised are both kept (append-only).
 */
export async function requestClosingChange(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const kind = r.choice("kind", "Change", CLOSING_CHANGE_KINDS, { required: true }) as ClosingChangeKind | null;
  const day = r.date("closingDay", "New closing day", { required: true });
  const time = r.text("closingTime", "New closing time", { required: true, max: 5 });
  const purchaseClose = r.date("purchaseCloseDay", "New last day of sale");
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !kind || !day) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    const toClosingAt = instantAt(storedDay(day), time, l.org.timeZone);
    const toPurchaseCloseDay = purchaseClose ? storedDay(purchaseClose) : w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null;
    const fs = closingChangeFaults({
      kind,
      status: l.ex.status,
      now: new Date(),
      currentClosingAt: l.ex.closingAt,
      toClosingAt,
      currentPurchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null,
      toPurchaseCloseDay,
      reason,
      changePending: windowChangeRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"),
      rules: changeRules(l, d),
    });
    if (fs.some((f) => f.level === "block")) return refuse(fs, "Not asked:");
    const what = `${kind === "EXTENSION" ? "Extension" : "Correction"} of the closing to ${formatOrgDateTime(toClosingAt!, l.org.timeZone)}`;
    const route = await openChangeRoute(tx, toAuditActor(actor), l, kind, what, act);
    if (!("id" in route)) return route;
    const row = {
      kind,
      fromClosingAt: l.ex.closingAt!,
      toClosingAt: toClosingAt!,
      fromPurchaseCloseDay: w.purchaseCloseDay,
      toPurchaseCloseDay: toPurchaseCloseDay ? dayToDate(toPurchaseCloseDay) : null,
      reason,
    };
    const change = await tx.closingChange.create({
      data: { organisationId: l.org.id, windowId: w.id, ...row, approvalInstanceId: route.id, requestedOn: dayToDate(l.org.today), faultsSnapshot: fs.map((f) => ({ level: f.level, text: windowFindingText(f) })) as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.change, change.id, label(l, `Closing ${kind === "EXTENSION" ? "extension" : "correction"}`), "CREATE", diffFields(null, changeFields(row, l.org.timeZone)), reason);
    return { ok: true, message: "Asked for. It is applied when its approval is recorded." };
  });
}

/**
 * Ask to cancel a published exercise (FR-ADV-016), with the reason and whether the fees are
 * refunded (unanswered refuses). Refused while an award stands. It is terminal once approved; a
 * replacement is a new exercise linked to this one.
 */
export async function requestCancellation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const reason = r.text("reason", "Reason", { max: 2000 });
  const refund = r.choice("feeRefund", "Fees refunded", ["yes", "no"] as const);
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    if (!w) return NO_WINDOW;
    const live = exerciseCancelBlockedBy(await tx.award.findMany({ where: { exerciseId }, select: { reference: true, status: true } }));
    // 6.7 (C-9): an opening in progress is cancelled only once adjourned; read under the openings' lock.
    await lockOpeningRows(tx, l.ex.id);
    const fs = cancelFaults({ status: l.ex.status, reason, feeRefund: refund == null ? null : refund === "yes", changePending: windowChangeRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"), awardStands: live?.reference ?? null, today: l.org.today, openingAdjourned: await mainOpeningAdjourned(l.ex.id, tx), openingInProgress: await openingInProgress(l.ex.id, tx) });
    if (fs.length) {
      const field = fs.length === 1 && fs[0].code === "REASON_REQUIRED" ? "reason" : fs.length === 1 && fs[0].code === "REFUND_NOT_ANSWERED" ? "feeRefund" : null;
      return field ? { ok: false, errors: { [field]: windowFindingText(fs[0]) } } : refuse(fs, "Not asked:");
    }
    const route = await openChangeRoute(tx, toAuditActor(actor), l, "CANCELLATION", "Cancellation of the published exercise", act);
    if (!("id" in route)) return route;
    const c = await tx.windowCancellation.create({ data: { organisationId: l.org.id, windowId: w.id, reason, feeRefund: refund === "yes", approvalInstanceId: route.id, requestedOn: dayToDate(l.org.today!) } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.cancellation, c.id, label(l, "Cancellation"), "CREATE", diffFields(null, { reason, feesRefunded: refund === "yes" ? "Yes" : "No" }), reason);
    return { ok: true, message: "Asked for. The exercise is cancelled when its approval is recorded." };
  });
}

// ------------------------------------------------------------------ deciding and applying

/// The parties told of an applied change or of the cancellation: the register (FR-ADV-012).
async function writeNotices(tx: Tx, actor: AuditActor, l: LockedWindow, d: WindowData, parent: { closingChangeId: string } | { cancellationId: string }, what: string) {
  const w = d.window!;
  const ids = noticeRecipients(w.sales, w.letters.map((x) => ({ partyId: x.partyId })));
  for (const partyId of ids) {
    const p = d.parties.find((x) => x.id === partyId)!;
    const n = await tx.windowNotice.create({ data: { organisationId: l.org.id, ...parent, partyId } });
    await audit(tx, actor, l.org.id, ENTITY.notice, n.id, label(l, `${what} · ${p.name}`), "CREATE", diffFields(null, { recipient: p.name, notice: what }));
  }
  return ids.length;
}

/**
 * Apply an approved closing change, in the decision's transaction, after re-running its rule on
 * the locked rows. The exercise's closing is written here and only here after approval for
 * tendering (X-2: the second writer); the window's last day of sale with it.
 */
async function applyClosingChange(tx: Tx, actor: AuditActor, l: LockedWindow, d: WindowData, change: NonNullable<WindowData["window"]>["closingChanges"][number], instId: string): Promise<string> {
  const now = new Date();
  const fs: Finding[] = appliedChangeFaults(
    {
      kind: change.kind,
      status: l.ex.status,
      now,
      currentClosingAt: l.ex.closingAt,
      toClosingAt: change.toClosingAt,
      currentPurchaseCloseDay: d.window!.purchaseCloseDay ? storedDay(d.window!.purchaseCloseDay) : null,
      toPurchaseCloseDay: change.toPurchaseCloseDay ? storedDay(change.toPurchaseCloseDay) : null,
      reason: change.reason,
      // The rules' today is the organisation's day now, at approval.
      rules: changeRules(l, d),
    },
  );
  if (fs.length) {
    const why = fs.map(windowFindingText).join(" ");
    await tx.closingChange.update({ where: { id: change.id, organisationId: l.org.id }, data: { refusedAt: now, refusedReason: why } });
    await audit(tx, actor, l.org.id, ENTITY.change, change.id, label(l, `Closing ${change.kind === "EXTENSION" ? "extension" : "correction"}`), "UPDATE", diffFields({ outcome: null }, { outcome: "Approved, but not applied" }), why);
    const inst = windowChangeRoutesOf(l.ex.approvalInstances).find((i) => i.id === instId)!;
    const warning = { code: "CHANGE_NOT_APPLIED", level: "warn", messageEn: `Approved, but not applied: ${why}` };
    await tx.approvalInstance.update({ where: { id: instId, organisationId: l.org.id }, data: { warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue } });
    return `Approved, but the change was not applied: ${why}`;
  }
  const moved = await tx.sourcingExercise.updateMany({ where: { id: l.ex.id, status: l.ex.status }, data: { closingAt: change.toClosingAt } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  if (change.toPurchaseCloseDay) await tx.exerciseWindow.update({ where: { id: d.window!.id, organisationId: l.org.id }, data: { purchaseCloseDay: change.toPurchaseCloseDay } });
  await tx.closingChange.update({ where: { id: change.id, organisationId: l.org.id }, data: { appliedAt: now } });
  await audit(tx, actor, l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE",
    diffFields({ closing: formatOrgDateTime(change.fromClosingAt, l.org.timeZone), lastDayOfSale: change.fromPurchaseCloseDay ? formatDate(storedDay(change.fromPurchaseCloseDay)) : null }, { closing: formatOrgDateTime(change.toClosingAt, l.org.timeZone), lastDayOfSale: change.toPurchaseCloseDay ? formatDate(storedDay(change.toPurchaseCloseDay)) : null }), change.reason);
  await audit(tx, actor, l.org.id, ENTITY.change, change.id, label(l, `Closing ${change.kind === "EXTENSION" ? "extension" : "correction"}`), "UPDATE", diffFields({ outcome: null }, { outcome: "Applied" }));
  // A correction is before publication: nobody holds the documents yet.
  const told = change.kind === "EXTENSION" ? await writeNotices(tx, actor, l, d, { closingChangeId: change.id }, "Closing extended") : 0;
  return `Approved and applied: the closing is now ${formatOrgDateTime(change.toClosingAt, l.org.timeZone)}.${told ? ` Record how each of the ${told} purchaser${told === 1 ? "" : "s"} was told.` : ""}`;
}

/// Apply an approved cancellation: the exercise ends (terminal), its other routes are withdrawn, and everyone holding the documents is told.
async function applyCancellation(tx: Tx, actor: AuditActor, l: LockedWindow, d: WindowData, c: NonNullable<WindowData["window"]>["cancellations"][number], instId: string): Promise<string> {
  const now = new Date();
  const live = exerciseCancelBlockedBy(await tx.award.findMany({ where: { exerciseId: l.ex.id }, select: { reference: true, status: true } }));
  await lockOpeningRows(tx, l.ex.id);
  const fs = cancelFaults({ status: l.ex.status, reason: c.reason, feeRefund: c.feeRefund, changePending: false, awardStands: live?.reference ?? null, today: l.org.today, openingAdjourned: await mainOpeningAdjourned(l.ex.id, tx), openingInProgress: await openingInProgress(l.ex.id, tx) });
  if (fs.length) {
    const why = fs.map(windowFindingText).join(" ");
    await tx.windowCancellation.update({ where: { id: c.id, organisationId: l.org.id }, data: { refusedAt: now, refusedReason: why } });
    await audit(tx, actor, l.org.id, ENTITY.cancellation, c.id, label(l, "Cancellation"), "UPDATE", diffFields({ outcome: null }, { outcome: "Approved, but not applied" }), why);
    return `Approved, but the exercise was not cancelled: ${why}`;
  }
  await moveExercise(tx, l.ex, "CANCELLED", { today: l.org.today, via: "WINDOW_CANCELLATION", reason: c.reason }, { cancelReason: c.reason });
  // Stage C security audit: an officer's forwarded shares are not kept for an exercise that has ended.
  await shredExerciseReleases(tx, { organisationId: l.org.id, exerciseId: l.ex.id, now });
  await audit(tx, actor, l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "CANCELLED" }), c.reason);
  // 6.8 (E-10, flagged): the evaluation in force is closed as cancelled, its records kept; locked after the openings.
  await lockEvaluationRows(tx, l.ex.id);
  await closeOnCancellation(tx, actor, { organisationId: l.org.id, exercise: { id: l.ex.id, reference: l.ex.reference }, now, reason: c.reason });
  await tx.windowCancellation.update({ where: { id: c.id, organisationId: l.org.id }, data: { appliedAt: now } });
  await audit(tx, actor, l.org.id, ENTITY.cancellation, c.id, label(l, "Cancellation"), "UPDATE", diffFields({ outcome: null }, { outcome: "Applied", feesRefunded: c.feeRefund ? "Yes" : "No" }));
  await voidLivePacks(tx, actor, l, c.reason);
  for (const inst of exerciseRoutesOf(l.ex.approvalInstances).filter((i) => i.status === "PENDING" && i.id !== instId)) {
    const warning = { code: WITHDRAWN_ON_CANCEL, level: "info", messageEn: `Withdrawn: the exercise was cancelled — ${c.reason}` };
    await tx.approvalInstance.update({ where: { id: inst.id, organisationId: l.org.id }, data: { status: "RECALLED", closedAt: now, warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue } });
    await audit(tx, actor, l.org.id, "ApprovalInstance", inst.id, label(l, exerciseRouteMatter(inst.domain).auditNoun), "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), `The exercise was cancelled: ${c.reason}`);
  }
  const told = await writeNotices(tx, actor, l, d, { cancellationId: c.id }, "Exercise cancelled");
  return `Approved: the exercise is cancelled.${told ? ` Record how each of the ${told} holder${told === 1 ? "" : "s"} of the documents was told.` : ""}`;
}

/**
 * Record a decision on a step of a window change's route: the holder's own, signed with the password, or recorded for the
 * holder from paper and not signed (Phase 2b); the holder, delegation, self-approval and date checks are 6.1's (`deciderFaults`).
 * The step that completes the route applies the change here; a refusal means it is not made.
 */
export async function recordWindowChangeDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const stepId = String(data.get("stepId") ?? "");
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  r.date("decidedOn", "Decided on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  // The decision is the signed-in holder's own, signed with the password, or recorded for the holder from paper and not signed (Phase 2b, F1).
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const on = dayToDate(act.day!);
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    const full = windowChangeRoutesOf(l.ex.approvalInstances).find((i) => i.status === "PENDING") ?? null;
    if (!w || !full) return { ok: false, message: "No change to the window is with approval on this exercise." };
    const change = w.closingChanges.find((c) => c.approvalInstanceId === full.id) ?? null;
    const cancellation = w.cancellations.find((c) => c.approvalInstanceId === full.id) ?? null;
    if (!change && !cancellation) return { ok: false, message: "That route decides nothing on this window." };
    const step = full.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "That step is not on the open route." };
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
      // Nobody decides a step of a matter on a requisition they raised.
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
      value: parseSen(l.ex.estimatedValue.toString()),
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((f) => deciderFaultText(f, person?.name ?? null));
      return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
    }
    const after = personDecisionWrite({ decision, person: { id: person!.id, name: person!.name }, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: new Date() });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalStep", step.id, `${l.ex.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }), reason);
    await act.write(tx, step.id, { document: { entity: "SourcingExercise", id: exerciseId }, roleCode: step.actingRoleCode ?? step.roleCode });
    const routeLabel = label(l, exerciseRouteMatter(WINDOW_CHANGE_DOMAIN).auditNoun);
    const now = new Date();
    if (decision === "REJECTED") {
      await closeRejected(tx, toAuditActor(actor), { organisationId: l.org.id, routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, reason, CHANGE_REFUSED_DECIDED_BY);
      if (change) {
        await tx.closingChange.update({ where: { id: change.id, organisationId: actor.organisationId }, data: { refusedAt: now, refusedReason: reason } });
        await audit(tx, toAuditActor(actor), l.org.id, ENTITY.change, change.id, label(l, `Closing ${change.kind === "EXTENSION" ? "extension" : "correction"}`), "UPDATE", diffFields({ outcome: null }, { outcome: "Refused" }), reason);
      } else {
        await tx.windowCancellation.update({ where: { id: cancellation!.id, organisationId: actor.organisationId }, data: { refusedAt: now, refusedReason: reason } });
        await audit(tx, toAuditActor(actor), l.org.id, ENTITY.cancellation, cancellation!.id, label(l, "Cancellation"), "UPDATE", diffFields({ outcome: null }, { outcome: "Refused" }), reason);
      }
      return { ok: true, message: "Refused: the change is not made. It may be asked for again." };
    }
    if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { ok: true };
    await tx.approvalInstance.update({ where: { id: full.id, organisationId: actor.organisationId }, data: { status: "APPROVED", closedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", full.id, routeLabel, "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), reason);
    const message = change ? await applyClosingChange(tx, toAuditActor(actor), l, d, change, full.id) : await applyCancellation(tx, toAuditActor(actor), l, d, cancellation!, full.id);
    return { ok: true, message };
  });
}

/// How a purchaser was told of an applied change or of the cancellation: recorded, never sent.
export async function recordNoticeDelivery(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const noticeId = String(data.get("noticeId") ?? "");
  const r = new FormReader(data);
  const method = r.choice("method", "Sent by", DELIVERY_METHODS) as DeliveryMethod | null;
  const consignmentRef = r.text("consignmentRef", "Consignment", { max: 120 });
  const sent = r.date("despatchedOn", "Sent on");
  const ack = r.date("acknowledgedOn", "Acknowledged on");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    const n = [...(w?.closingChanges ?? []).flatMap((c) => c.notices), ...(w?.cancellations ?? []).flatMap((c) => c.notices)].find((x) => x.id === noticeId);
    if (!n) return { ok: false, message: "That notice is not on this exercise." };
    const fs = deliveryFaults({ method, despatchedOn: sent ? storedDay(sent) : null, acknowledgedOn: ack ? storedDay(ack) : null }, l.org.today);
    if (fs.length) return refuse(fs, "Not recorded:");
    const after = { method, consignmentRef, despatchedOn: sent, acknowledgedOn: ack };
    await tx.windowNotice.update({ where: { id: n.id, organisationId: actor.organisationId }, data: after });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.notice, n.id, label(l, `Notice · ${n.party.name}`), "UPDATE", diffFields(deliveryFields(n), deliveryFields(after)));
    return { ok: true };
  });
}
