"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayToDate } from "@/lib/dates";
import { ladFaultWords } from "@/lib/lad/labels";
import { waiverRatio, waiverRecordFaults } from "@/lib/lad/waiver";
import { actCtx, type ActCtx, ActRefusal, afterAct, asMatterRecorder, lockMatter, NO_ZONE_STATE, recordedFor, tableRefusal, thrownState } from "@/lib/matter/act";
import { matterFactsOf } from "@/lib/matter/load";
import { matterApproved, sendFaults } from "@/lib/matter/matter";
import { matterSeriesSet, sendMatterRoute } from "@/lib/matter/route-write";
import { closeMatter, matterLabel, openMatter } from "@/lib/matter/write";
import type { Finding } from "@/lib/method/types";
import { formatMoney, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import type { OrgScope } from "@/lib/org-scope";
import { baselineOn, loadPayment, readWaiverBasis, waivedOnDecision, waiverBasisJson, waiverBasisOf } from "@/lib/payment/load";
import { timeRefusal } from "@/lib/time/labels";
import { FormReader } from "@/lib/validate";
import { beginAct } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";

/**
 * Waivers of liquidated damages (6.13 Part B run 1b design note §6.9: FR-LAD-008, 009; OD-B7; plan closeout-plan.md §4.1). Every act runs in
 * `inContract` (the contract's chain locked, the LAD_WAIVER row of the act × status table asked, CANCELLED first, an unset time zone refused), locks
 * the matter and then the waiver (`lockMatter`), reads the payment rows on the locked transaction, runs the pure rule again, writes, and audits before
 * and after in the same transaction. The LAD amount is read on the day and frozen with its basis at the send; the route is resolved at the exact ratio
 * waived ÷ LAD amount. Applying it is the interim's raise (the switch OD-B7). A waiver whose basis moved is re-sent as a new waiver at the new amount.
 */

async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, family: ContractAct, fn: (c: ActCtx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      const refused = actStatusFault(family, l.contract.status as ContractStatus);
      if (refused) return tableRefusal(refused);
      const c = actCtx(tx, l, now, actor);
      return c ? fn(c) : NO_ZONE_STATE;
    });
  } catch (e) {
    return thrownState(e);
  }
  return afterAct(id, result);
}

const idOf = (data: FormData) => String(data.get("id") ?? "");
const words = (fs: readonly Finding[]) => fs.map((f) => ladFaultWords(f)?.en ?? timeRefusal("", [f])).join(" ");
const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new ActRefusal({ ok: false, message: `${lead} ${words(fs)}`.trim() });
};
const audit = (c: ActCtx, entity: string, id: string, label: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId: id, entityLabel: label, reason }, action, changes);

/// The waiver's LAD amount and basis on the day, from the payment rows read on the locked transaction.
async function basisOn(c: ActCtx, decisionId: string, exceptWaiverId: string | null = null) {
  const baseline = baselineOn(c.l, c.today);
  if (!baseline) refuse("Not recorded:", [{ code: "NO_LAD_AMOUNT", level: "block", data: { day: c.today } }]);
  const p = await loadPayment(c.l.contract.id, c.tx);
  const b = waiverBasisOf(p, baseline!, decisionId, c.today);
  if (!b) throw new ActRefusal({ ok: false, message: "That decision is not on this contract." });
  // Review M4: what the decision's other waivers already take off its LAD amount.
  return { ...b, alreadyWaived: waivedOnDecision(p, decisionId, exceptWaiverId) };
}

/// Record a waiver on a live decision charging damages, with its own matter (FR-LAD-009).
export async function recordLadWaiver(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const decisionId = r.text("decisionId", "Decision", { required: true });
  const waived = r.money("waived", "Amount waived", { required: true });
  const letterRef = r.text("waiverLetterRef", "Waiver letter reference", { max: 120 });
  const reason = r.text("reason", "Why it is waived", { max: 4000 });
  if (r.failed || !waived) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LadWaiver.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LAD_WAIVER", async (c) => {
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const b = await basisOn(c, decisionId);
    const fs = waiverRecordFaults({ decision: { charging: b.charging, label: b.label }, waived: parseSen(waived), ladAmount: b.amount, reason, asOf: c.today, today: c.today, alreadyWaived: b.alreadyWaived });
    if (fs.length) refuse("Not recorded:", fs);
    const matterId = await openMatter(c.tx, toAuditActor(actor), c.l, "LAD_WAIVER", asMatterRecorder(act), who.person.name, c.now);
    const row = await c.tx.ladWaiver.create({ data: { organisationId: c.l.org.id, matterId, decisionId, ladAmount: senToDecimalString(b.amount), waived, asOf: dayToDate(c.today), basis: waiverBasisJson(b) as Prisma.InputJsonValue, waiverLetterRef: letterRef.trim(), reason: reason.trim(), personId: who.person.id, recordedAt: c.now } });
    await audit(c, "LadWaiver", row.id, `${c.label} · waiver of damages`, "CREATE", diffFields(null, { onDecision: b.label, ladAmount: formatMoney(b.amount), amountWaived: formatMoney(parseSen(waived)), asOf: c.today, waiverLetter: letterRef.trim() || null, why: reason.trim(), recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// The waiver of a matter, locked (the matter first, then the waiver).
async function lockWaiver(c: ActCtx, waiverId: string) {
  const pre = await c.tx.ladWaiver.findFirst({ where: { id: waiverId, organisationId: c.l.org.id, decision: { contractId: c.l.contract.id } }, select: { matterId: true } });
  if (!pre) throw new ActRefusal({ ok: false, message: "That waiver is not on this contract." });
  const { m } = await lockMatter(c, pre.matterId);
  if (!m.ladWaiver) throw new ActRefusal({ ok: false, message: "That waiver is not on this contract." });
  return { m, w: m.ladWaiver };
}

/// Send it for approval: the LAD amount read again on the day and frozen with its basis; routed at the exact ratio waived ÷ LAD amount.
export async function sendLadWaiver(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const waiverId = r.text("waiverId", "Waiver", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LAD_WAIVER", async (c) => {
    const { m, w } = await lockWaiver(c, waiverId);
    const sender = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const b = await basisOn(c, w.decisionId, w.id);
    const waived = senFromDecimal(w.waived);
    const fs = [...waiverRecordFaults({ decision: { charging: b.charging, label: b.label }, waived, ladAmount: b.amount, reason: w.reason, asOf: c.today, today: c.today, alreadyWaived: b.alreadyWaived }), ...sendFaults(matterFactsOf(m, await matterSeriesSet(c.tx, c.l.org.id)), { value: null, ratio: waiverRatio(waived, b.amount), cond: null })];
    if (fs.length) refuse("Not sent for approval:", fs);
    const before = senFromDecimal(w.ladAmount);
    await c.tx.ladWaiver.update({ where: { id: w.id, organisationId: c.l.org.id }, data: { ladAmount: senToDecimalString(b.amount), asOf: dayToDate(c.today), basis: waiverBasisJson(b) as Prisma.InputJsonValue } });
    await audit(c, "LadWaiver", w.id, `${matterLabel(c.l, m)}`, "UPDATE", diffFields({ ladAmount: formatMoney(before) }, { ladAmount: formatMoney(b.amount), frozenAsOf: c.today }));
    const baseline = baselineOn(c.l, c.today)!;
    await sendMatterRoute(c, m, { value: null, ratio: waiverRatio(waived, b.amount), cond: null, contractValue: baseline.values.contractSum, submittedBy: sender.person, act, what: "Waiver of liquidated damages" });
    return { ok: true };
  });
}

/// An approved waiver whose basis moved (LAD_BASIS_MOVED at its application): its matter closed, and a new waiver of the same amount recorded at
/// the LAD amount now, to be sent again, so the share waived picks the approver again.
export async function resendLadWaiver(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const waiverId = r.text("waiverId", "Waiver", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LadWaiver.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LAD_WAIVER", async (c) => {
    const { m, w } = await lockWaiver(c, waiverId);
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    if (!matterApproved(matterFactsOf(m)) || w.appliedOnCertificateId) throw new ActRefusal({ ok: false, message: "Only an approved waiver not yet applied is sent again." });
    const b = await basisOn(c, w.decisionId, w.id);
    const frozen = readWaiverBasis(w.basis);
    if (frozen && frozen.amount === b.amount) throw new ActRefusal({ ok: false, message: "Its LAD amount has not moved: it is applied as approved." });
    const fs = waiverRecordFaults({ decision: { charging: b.charging, label: b.label }, waived: senFromDecimal(w.waived), ladAmount: b.amount, reason: w.reason, asOf: c.today, today: c.today, alreadyWaived: b.alreadyWaived });
    if (fs.length) refuse("Not sent again:", fs);
    await closeMatter(c.tx, toAuditActor(actor), c.l, m, "Re-sent at the new LAD amount", c.now);
    const matterId = await openMatter(c.tx, toAuditActor(actor), c.l, "LAD_WAIVER", asMatterRecorder(act), who.person.name, c.now);
    const row = await c.tx.ladWaiver.create({ data: { organisationId: c.l.org.id, matterId, decisionId: w.decisionId, ladAmount: senToDecimalString(b.amount), waived: w.waived, asOf: dayToDate(c.today), basis: waiverBasisJson(b) as Prisma.InputJsonValue, waiverLetterRef: w.waiverLetterRef, reason: w.reason, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "LadWaiver", row.id, `${c.label} · waiver of damages`, "CREATE", diffFields(null, { onDecision: b.label, ladAmount: formatMoney(b.amount), amountWaived: formatMoney(senFromDecimal(w.waived)), replaces: m.reference ?? "an earlier waiver", recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true, message: "Recorded again at the new LAD amount. Send it for approval." };
  });
}
