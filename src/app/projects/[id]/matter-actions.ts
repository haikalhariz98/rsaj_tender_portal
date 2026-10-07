"use server";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { REJECTION_KINDS } from "@/lib/authority/rejection";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { sittingPermits } from "@/lib/committee/meeting";
import { lockSittingIn } from "@/lib/committee/sittings";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { db } from "@/lib/db";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { actCtx, type ActCtx, ActRefusal, afterAct, fieldError, lockMatter, NO_ZONE_STATE, tableRefusal, thrownState } from "@/lib/matter/act";
import { openRouteOf, tablingFactsOf } from "@/lib/matter/load";
import { MATTER_FAMILY, type ContractMatterKind } from "@/lib/matter/matter";
import { chooseMatterRejection, citeMatterDecision, decideMatterStep } from "@/lib/matter/route-write";
import { tablingOf } from "@/lib/matter/tabling";
import { matterLabel, MATTER_KIND_WORDS } from "@/lib/matter/write";
import { loadRoster } from "@/lib/people/load";
import { timeRefusal } from "@/lib/time/labels";
import type { Finding } from "@/lib/time/types";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor, staffForAct } from "@/app/_auth/actor";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * A contract matter's route (6.13 Part B run 1b; ADR 0029; design note §6.5): table its committee step from the matter,
 * cite the committee's decision, decide a person's step, choose where a refusal goes. One set of acts for every kind;
 * each reads its kind's family of the act × status table (`MATTER_FAMILY`), under the contract's lock, then locks the
 * matter and its record, then (tabling) the sitting. The kind is read before the lock only to pick the family, and read
 * again under it.
 */

/// The contract's lock, the act × status table's row for the act's family (CANCELLED first), the organisation's day, then
/// the act (BD-613-130: the gate is asked here, in this file, as in every contract action file).
async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, family: ContractAct, fn: (c: ActCtx) => Promise<FormState>, alsoRevalidate: readonly string[] = []): Promise<FormState> {
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
  return afterAct(id, result, alsoRevalidate);
}

const idOf = (data: FormData) => String(data.get("id") ?? "");
const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new ActRefusal({ ok: false, message: timeRefusal(lead, fs) });
};
const dayField = (r: FormReader, name: string, label: string, required = false) => {
  const d = r.date(name, label, { required });
  return d ? storedDay(d) : null;
};

/// The matter's family, from its kind as read before the lock (read again under it by run).
async function familyOf(scope: OrgScope, matterId: string) {
  const m = await db.contractMatter.findUnique({ where: { id: matterId, organisationId: scope.organisationId }, select: { kind: true } });
  return m ? MATTER_FAMILY[m.kind as ContractMatterKind] : null;
}

/// The act on a matter: its family read before the lock (only to choose the row), then inContract.
async function run(scope: OrgScope, by: AuditActor, data: FormData, matterId: string, now: Date, fn: (c: ActCtx) => Promise<FormState>, paths: readonly string[] = []): Promise<FormState> {
  const family = await familyOf(scope, matterId);
  if (!family) return { ok: false, message: "That matter no longer exists." };
  return inContract(scope, by, idOf(data), now, family, async (c) => {
    // The row asked was chosen from the kind read before the lock: read it again under the lock (a matter's kind never
    // changes, so this refuses only a matter that vanished or a forged id).
    const again = await c.tx.contractMatter.findFirst({ where: { id: matterId, contractId: c.l.contract.id, organisationId: scope.organisationId }, select: { kind: true } });
    if (!again || MATTER_FAMILY[again.kind as ContractMatterKind] !== family) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };
    return fn(c);
  }, paths);
}

/// Table the matter's open route's committee step at a sitting (ADR 0029 §3: tabled from the matter, never at a sitting).
export async function tableContractMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const matterId = r.text("matterId", "Matter", { required: true });
  const meetingId = r.text("meetingId", "Sitting", { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return run(actor, toAuditActor(actor), data, matterId, now, async (c) => {
    const { m } = await lockMatter(c, matterId);
    const roster = await loadRoster(actor.organisationCode, c.tx);
    const s = await lockSittingIn(c.tx, actor, meetingId, roster);
    if (!s) fieldError("meetingId", "That sitting no longer exists.");
    if (m.closedAt) refuse("Not tabled:", [{ code: "MATTER_CLOSED", level: "block", data: { reason: m.closeReason } }]);
    if (!sittingPermits(s!.meeting.status, "TABLE")) refuse("Not tabled:", [{ code: "SITTING_FROZEN", level: "block" }]);
    const open = openRouteOf(m);
    const step = open?.steps.find((st) => st.decision === "PENDING" && st.committeeCode === s!.meeting.committee.code) ?? null;
    if (!open || !step) refuse("Not tabled:", [{ code: open ? "OTHER_COMMITTEE" : "NOT_COMMITTEE_STEP", level: "block" }]);
    const tabledFrom = tablingOf({ kind: "CONTRACT", id: m.id, reference: m.reference }, tablingFactsOf(m));
    const tf = tabledFrom.tableFaults(open!.domain, step!.committeeCode!);
    if (tf.length) refuse("Not tabled:", tf);
    const code = s!.meeting.committee.secretariatRoleCode;
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(s!.roster, code, s!.today).map((h) => h.id), tablingDay: s!.today });
    if (!tabling.ok) return tabling.fault === "NOT_TABLED" || tabling.fault === "NOT_SECRETARIAT_HOLDER" ? { ok: false, errors: { tabledByPersonId: TABLING_FAULT_MESSAGE[tabling.fault] } } : { ok: false, message: `Nothing was saved: ${TABLING_FAULT_MESSAGE[tabling.fault]}` };
    const sequence = s!.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    const subject = `${MATTER_KIND_WORDS[m.kind as ContractMatterKind].en[0].toUpperCase()}${MATTER_KIND_WORDS[m.kind as ContractMatterKind].en.slice(1)} ${m.reference ?? "(not yet numbered)"} on contract ${c.l.contract.number}`;
    const row = await c.tx.committeeDecision.create({ data: { meetingId: s!.meeting.id, subject, domain: open!.domain, ...tabledFrom.keys, amount: open!.value?.toString() ?? null, act: step!.act, tabledByPersonId, tabledAt: dayToDate(s!.today!), sequence } });
    await writeAudit(c.tx, { actor: toAuditActor(actor), organisationId: c.l.org.id, entity: "CommitteeDecision", entityId: row.id, entityLabel: `${matterLabel(c.l, m)} · tabled for its approval`, reason: "" }, "CREATE", diffFields(null, { matter: subject, sitting: s!.meeting.reference, committee: s!.meeting.committee.nameEn, tabledBy: tabledByPersonId ? (s!.names[tabledByPersonId] ?? null) : null, tabledOn: formatDate(s!.today!), recordedOnBehalf: "yes" }));
    return { ok: true, message: `Tabled at ${s!.meeting.reference}. It is decided there, at the sitting; cite its decision here once it is decided.` };
  }, ["/committees", `/committees/${meetingId}`]);
}

/// Discharge a committee's step from its decision on a matter tabled from this matter.
export async function citeContractMatterDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const matterId = r.text("matterId", "Matter", { required: true });
  const stepId = r.text("stepId", "Step", { required: true });
  const decisionId = r.text("committeeDecisionId", "The committee's decision", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return run(actor, toAuditActor(actor), data, matterId, now, async (c) => {
    const { m } = await lockMatter(c, matterId);
    await citeMatterDecision(c, m, stepId, decisionId);
    return { ok: true };
  });
}

/// A named Person's decision on a person step of the matter's open route.
export async function decideContractMatterStep(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const matterId = r.text("matterId", "Matter", { required: true });
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const decidedOn = dayField(r, "decidedOn", "Decided on", true);
  const receivedOn = dayField(r, "receivedOn", "Received on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !decision || !decidedOn) return { ok: false, errors: r.errors };
  return run(actor, toAuditActor(actor), data, matterId, now, async (c) => {
    const { m } = await lockMatter(c, matterId);
    await decideMatterStep(c, m, { stepId, decision, personId, decidedOn, receivedOn, reason });
    return { ok: true };
  });
}

/// Where a refused route goes, chosen by the officer where nothing was configured (FR-APR-016, CO-5).
export async function chooseContractMatterRejection(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const matterId = r.text("matterId", "Matter", { required: true });
  const kind = r.choice("kind", "Where it goes", REJECTION_KINDS);
  const seq = r.int("returnToSeq", "Step", { min: 1 });
  const personId = r.optionalText("personId");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return run(actor, toAuditActor(actor), data, matterId, now, async (c) => {
    const { m } = await lockMatter(c, matterId);
    await chooseMatterRejection(c, m, { kind: kind ?? null, returnToSeq: seq, personId, reason });
    return { ok: true };
  });
}
