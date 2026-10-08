"use server";

import { actStatusFault, actStatusText, type ContractAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { AdjustmentNetMissing } from "@/lib/adjustment/ppjhk";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import type { ComputedSnapshot } from "@/lib/certificate/snapshot";
import { CertificateRefusal, openCertificate } from "@/lib/certificate/write";
import { raiseFormFault } from "@/lib/certificate/form-needs";
import { KIND_WORDS } from "@/lib/certificate/labels";
import type { CertificateKind } from "@/lib/certificate/types";
import { contractLabel, withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { decisionFaults, postFaults, warningFaults, type PackAnswer } from "@/lib/lad/non-completion";
import { decisionBasisFaults, replacementFaultsOnScope, scopeKey } from "@/lib/lad/basis";
import { parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { applicationFaults, pendingAdvanceFaults } from "@/lib/payment/advance";
import { assembleInterim, heldOnLatest } from "@/lib/payment/assemble";
import { ANSWER_WORDS, DEDUCTION_WORDS, OUTCOME_WORDS, PACK_WORDS, paymentFaultText, paymentRefusal, RELEASE_WORDS, SCOPE_WORDS, TRIGGER_WORDS } from "@/lib/payment/labels";
import { assembleInputOf, baselineOn, claimFactsOf, inProgress, inProgressSequenceOf, issuedInterims, kindSettingOf, liveDecisionsOf, loadPayment, nextInterimSequence, pendingAdvancesOf, releaseStateOf, loadPaymentConfig, preExecutionFacts, type PaymentConfig } from "@/lib/payment/load";
import { afterCutOff } from "@/lib/payment/materials";
import { ladRoundingFaults } from "@/lib/payment/interim";
import { OPENING_GROUPS, openingClosed, openingFaults, openingReconciles, type OpeningGroup, type OpeningProvenance } from "@/lib/payment/opening";
import { firstReleaseShare, releaseOf } from "@/lib/payment/retention";
import { ADVANCE_PARTIES, CONTRACTOR_ANSWERS, KEYED_DEDUCTION_KINDS, NON_COMPLETION_OUTCOMES, NON_COMPLETION_SCOPES, PACK_ITEMS, RETENTION_RELEASES, VALUATION_TRIGGERS, type Finding, type PackItem } from "@/lib/payment/types";
import { calendarFaults, jointFaults, openFaults } from "@/lib/payment/valuation";
import { capacityFor, capacityText, type ActNeed, type ActWho, type Capacity } from "@/lib/supervision/authority";
import { delegationFactsOf, loadSupervision, recorderFaultToday, soOfficeOn } from "@/lib/supervision/load";
import { supervisionRefusal } from "@/lib/supervision/labels";
import { formatDate } from "@/lib/format";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Interim payment and the damages chain on a contract (6.13 Part A step 3, 4c: FR-PAY-001–019, 021; FR-LAD-001–008).
 *
 * Every act is reachable by a direct POST, so each reads the server's clock once on entry (truncated to the
 * second), then locks the requisition, the exercise, the award and the contract in the canonical order
 * (`withLockedContract`), then any domain row it changes (a valuation, a warning letter, a decision), re-reads the
 * contract's payment records on the locked transaction, re-runs the pure rule, writes, and audits in the same
 * transaction. A refusal throws, so nothing is half-written. The certificates it raises are opened through the
 * certificate core (Contract → Certificate). The signed-in officer is named on every audit row; each act records the Person the officer names,
 * "recorded on behalf of, not signed", and judges whether that Person may be recorded for it on the day. A
 * cancelled contract refuses every act. The organisation's day is the act's day; with no time zone, nothing is
 * recorded (never UTC's day).
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const CHANGED: FormState = { ok: false, message: "The contract changed while this was being saved. Reload and try again." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: it is kept as it was." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

interface Ctx {
  tx: Tx;
  actor: AuditActor;
  l: LoadedContract;
  /// The server's instant, read once on entry, to the second.
  now: Date;
  /// The organisation's day of that instant.
  today: string;
  label: string;
}

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, act: ContractAct, fn: (c: Ctx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      // ADR 0031 (run 1a): the one act × status table, CANCELLED first (its words as before), under the contract's lock.
      const refused = actStatusFault(act, l.contract.status as ContractStatus);
      if (refused) return refused.code === "CONTRACT_CANCELLED" ? CANCELLED : { ok: false, message: actStatusText(refused) };
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      return fn({ tx, actor, l, now, today, label: contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } }) });
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message };
    if (e instanceof AdjustmentNetMissing) return { ok: false, message: e.message };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
  }
  return result ?? GONE;
}

async function audit(c: Ctx, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId, entityLabel: `${c.label} · ${suffix}`, reason }, action, changes);
}

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new Refusal({ ok: false, message: paymentRefusal(lead, fs) });
};
const idOf = (data: FormData) => String(data.get("id") ?? "");
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const linesOf = (raw: string) => raw.split("\n").map((x) => x.trim()).filter(Boolean);
const money = (v: Sen) => senToDecimalString(v);
const tri = (v: string | null) => (v === "yes" ? true : v === "no" ? false : null);
const yesNo = (v: boolean | null) => (v == null ? "not answered" : v ? "yes" : "no");

/// A signed amount as typed ("-0.20", "1,234.50"): the rounding on the damages line is the one signed figure keyed.
function signedMoney(r: FormReader, name: string, label: string): string | null {
  const raw = String(r.optionalText(name) ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    r.reject(name, `${label} must be an amount, to at most two decimal places.`);
    return null;
  }
  return senToDecimalString(parseSen(raw));
}

const paymentOf = (c: Ctx) => loadPayment(c.l.contract.id, c.tx);
const configOf = (c: Ctx) => loadPaymentConfig(c.l.org.id, c.tx);

/// The Person the officer names, and the capacity they may be recorded in for the act on the day; refused otherwise.
async function recordedFor(c: Ctx, who: ActWho, need: ActNeed, on: string): Promise<{ person: { id: string; name: string }; capacity: Capacity; soLabel: string; soRoleCode: string }> {
  const person = who.subjectPersonId ? await c.tx.person.findFirst({ where: { id: who.subjectPersonId, organisationId: c.l.org.id }, select: { id: true, name: true, isActive: true } }) : null;
  if (!person || !person.isActive) throw new Refusal({ ok: false, errors: { personId: "Choose someone on record and active." } });
  const s = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, s, on, c.tx);
  const r = capacityFor(person.id, need, so?.office ?? null, delegationFactsOf(s), on);
  if (!r.capacity) throw new Refusal({ ok: false, message: supervisionRefusal("Not recorded:", r.faults) });
  // FR-SUP-004 (Phase 3d): the officer who records it is judged too, whoever it is recorded for.
  const recorder = await recorderFaultToday(c.l, s, who.recorderId, need, on, so?.office ?? null, c.today, c.tx);
  if (recorder) throw new Refusal({ ok: false, message: supervisionRefusal("Not recorded:", [recorder]) });
  return { person, capacity: r.capacity, soLabel: so!.office.roleLabel, soRoleCode: so!.assignment.roleCode };
}

/// Lock and read a valuation of this contract, open for its lines.
async function openValuationOf(c: Ctx, valuationId: string) {
  await c.tx.$queryRaw`SELECT id FROM "InterimValuation" WHERE id = ${valuationId} FOR UPDATE`;
  const p = await paymentOf(c);
  const v = p.interimValuations.find((x) => x.id === valuationId);
  if (!v) throw new Refusal({ ok: false, message: "That valuation is not on this contract." });
  if (v.status !== "OPEN") refuse("Not recorded:", [{ code: "VALUATION_NOT_OPEN", level: "block" }]);
  return { p, v, label: `interim valuation of ${storedDay(v.valuationDate)}` };
}

// ------------------------------------------------------------------ the valuation calendar (FR-PAY-003)

/// The day of the month agreed with the contractor as the site valuation day. A change says why.
export async function recordValuationCalendar(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const dayOfMonth = r.int("dayOfMonth", "Day of the month", { required: true, min: 1 });
  const agreedOn = r.date("agreedOn", "Agreed on", { required: true });
  const agreedWith = r.text("agreedWith", "Agreed with (for the contractor)", { required: true, max: 240 });
  const note = r.text("note", "Note", { max: 2000 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || dayOfMonth == null || !agreedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PaymentCalendar.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const p = await paymentOf(c);
    const before = p.paymentCalendar;
    const fs = calendarFaults({ dayOfMonth, agreedOn: storedDay(agreedOn), agreedWith, today: c.today, existing: !!before, reason });
    if (fs.length) refuse("Not recorded:", fs);
    const who = await recordedFor(c, act, { principalOrSo: true }, storedDay(agreedOn));
    const v = { dayOfMonth, agreedOn, agreedWith: agreedWith.trim(), personId: who.person.id, note: note.trim(), recordedAt: c.now };
    const row = await c.tx.paymentCalendar.upsert({ where: { contractId: c.l.contract.id }, update: v, create: { organisationId: c.l.org.id, contractId: c.l.contract.id, ...v } });
    const words = (x: { dayOfMonth: number; agreedOn: Date; agreedWith: string }) => ({ valuationDay: `day ${x.dayOfMonth} of each month (the last day of a shorter month)`, agreedOn: storedDay(x.agreedOn), agreedWith: x.agreedWith });
    await audit(c, "PaymentCalendar", row.id, "valuation calendar", before ? "UPDATE" : "CREATE", diffFields(before ? words(before) : null, { ...words(v), recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, partiesNotified: "computed, not sent (notifications send nothing yet)" }), reason.trim());
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ a valuation (FR-PAY-004–011)

/// Open a valuation: on the agreed day, or on a contractor's claim. One at a time.
export async function openInterimValuation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const trigger = r.choice("trigger", "What started it", VALUATION_TRIGGERS, { required: true });
  const claimOn = r.date("claimReceivedOn", "Claim received on");
  const valuationDate = r.date("valuationDate", "Valuation day", { required: true });
  if (r.failed || !trigger || !valuationDate) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "InterimValuation.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const p = await paymentOf(c);
    const lastIssued = p.interimValuations.filter((v) => v.certificate?.status === "ISSUED").map((v) => storedDay(v.valuationDate)).sort().at(-1) ?? null;
    const fs = openFaults({ trigger, triggerDate: claimOn ? storedDay(claimOn) : null, valuationDate: storedDay(valuationDate), today: c.today, calendarDay: p.paymentCalendar?.dayOfMonth ?? null, inProgress: !!inProgress(p), lastIssuedOn: lastIssued, baselineInForce: !!baselineOn(c.l, c.today) });
    // Residual MUST 3: an advance applied for and not yet issued or void holds its schedule open.
    fs.push(...pendingAdvanceFaults(pendingAdvancesOf(p)));
    if (fs.length) refuse("Not opened:", fs);
    const who = await recordedFor(c, act, { act: "VALUATION" }, storedDay(valuationDate));
    const row = await c.tx.interimValuation.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, trigger, triggerDate: trigger === "CLAIM" ? claimOn : null, valuationDate, personId: who.person.id, participants: [], recordedAt: c.now, recordedOn: dayToDate(c.today) } });
    await audit(c, "InterimValuation", row.id, `interim valuation of ${storedDay(valuationDate)}`, "CREATE", diffFields(null, { startedBy: TRIGGER_WORDS[trigger].en, claimReceivedOn: trigger === "CLAIM" ? day(claimOn) : null, valuationDay: storedDay(valuationDate), forInterimCertificate: nextInterimSequence(p), recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// The main contractor's work executed, valued to date.
export async function recordMainWorks(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const value = r.money("mainWorks", "Work executed to date", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || value == null) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { v, label } = await openValuationOf(c, valuationId);
    const after = senToDecimalString(parseSen(value));
    await c.tx.interimValuation.update({ where: { id: v.id, organisationId: actor.organisationId }, data: { mainWorks: after, mainWorksNote: note.trim() } });
    await audit(c, "InterimValuation", v.id, label, "UPDATE", diffFields({ mainContractorWorks: v.mainWorks == null ? null : money(senFromDecimal(v.mainWorks)) }, { mainContractorWorks: after }), note.trim());
    return { ok: true };
  });
}

/// The joint valuation: who valued it, how, and the contractor's agreement or dissent (FR-PAY-006).
export async function recordJointValuation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const jointOn = r.date("jointOn", "Valued jointly on", { required: true });
  const participants = linesOf(String(data.get("participants") ?? ""));
  const method = r.text("valuationMethod", "How it was valued", { max: 4000 });
  const answer = r.choice("contractorAnswer", "The contractor's answer", CONTRACTOR_ANSWERS);
  const dissent = r.text("dissent", "What the contractor disputes", { max: 4000 });
  if (r.failed || !jointOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { v, label } = await openValuationOf(c, valuationId);
    const fs = jointFaults({ participants, method, answer, dissent, on: storedDay(jointOn), valuationDate: storedDay(v.valuationDate), today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    await c.tx.interimValuation.update({ where: { id: v.id, organisationId: actor.organisationId }, data: { jointOn, participants, method: method.trim(), contractorAnswer: answer!, dissent: answer === "DISSENT" ? dissent.trim() : "" } });
    await audit(c, "InterimValuation", v.id, label, "UPDATE", diffFields({ valuedJointlyOn: day(v.jointOn), participants: v.participants.join("; ") || null, valuationMethod: v.method || null, contractorsAnswer: v.contractorAnswer ? ANSWER_WORDS[v.contractorAnswer].en : null }, { valuedJointlyOn: storedDay(jointOn), participants: participants.join("; "), valuationMethod: method.trim(), contractorsAnswer: ANSWER_WORDS[answer!].en, disputes: answer === "DISSENT" ? dissent.trim() : null }));
    return { ok: true };
  });
}

/// A line of the contractor's materials-on-site list, with the three answers (FR-PAY-005, 007).
export async function addMaterialLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const description = r.text("description", "Material or goods", { required: true, max: 500 });
  const quantity = r.text("quantity", "Quantity", { required: true, max: 120 });
  const location = r.text("location", "Where it is stored on site", { required: true, max: 240 });
  const value = r.money("value", "Value", { required: true });
  const protectedOnSite = tri(r.choice("protectedOnSite", "Adequately protected", ["yes", "no"] as const));
  const notTooEarly = tri(r.choice("notTooEarly", "Not delivered too early", ["yes", "no"] as const));
  const formsPartOfWorks = tri(r.choice("formsPartOfWorks", "Forms part of the completed works", ["yes", "no"] as const));
  const temporary = r.bool("temporary");
  const submittedOn = r.date("submittedOn", "On the list submitted on", { required: true });
  if (r.failed || value == null || !submittedOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { v, label } = await openValuationOf(c, valuationId);
    if (storedDay(submittedOn) > c.today) refuse("Not recorded:", [{ code: "FUTURE_DATE", level: "block", data: { day: storedDay(submittedOn) } }]);
    if (afterCutOff(storedDay(submittedOn), storedDay(v.valuationDate))) refuse("Not recorded:", [{ code: "LINE_AFTER_CUT_OFF", level: "block", data: { day: storedDay(v.valuationDate) } }]);
    const row = await c.tx.materialLine.create({ data: { organisationId: c.l.org.id, valuationId: v.id, description: description.trim(), quantity: quantity.trim(), location: location.trim(), value: senToDecimalString(parseSen(value)), protectedOnSite, notTooEarly, formsPartOfWorks, temporary, submittedOn, recordedAt: c.now } });
    await audit(c, "MaterialLine", row.id, `${label} · ${description.trim()}`, "CREATE", diffFields(null, { material: description.trim(), quantity: quantity.trim(), storedAt: location.trim(), materialValue: senToDecimalString(parseSen(value)), adequatelyProtected: yesNo(protectedOnSite), notDeliveredTooEarly: yesNo(notTooEarly), formsPartOfTheWorks: yesNo(formsPartOfWorks), temporaryWorks: temporary ? "yes" : "no", submittedOn: storedDay(submittedOn) }));
    return { ok: true };
  });
}

/// Take a material line off a valuation still being valued, with the reason.
export async function removeMaterialLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const lineId = r.text("lineId", "Line", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { v, label } = await openValuationOf(c, valuationId);
    const line = v.materialLines.find((m) => m.id === lineId);
    if (!line) return { ok: false, message: "That line is not on this valuation." };
    await c.tx.materialLine.delete({ where: { id: line.id, organisationId: actor.organisationId } });
    await audit(c, "MaterialLine", line.id, `${label} · ${line.description}`, "DELETE", diffFields({ material: line.description, materialValue: money(senFromDecimal(line.value)) }, { material: null, materialValue: null }), reason.trim());
    return { ok: true };
  });
}

/// A nominated party's or an assignee's totals on the valuation (B1: totals only, FR-PAY-010).
export async function recordPartyLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const partyId = r.text("partyId", "Party", { required: true });
  const value = r.money("value", "Value to date");
  const due = r.money("due", "Due on this certificate", { required: true });
  const submittedOn = r.date("submittedOn", "Its valuation or claim submitted on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || due == null || !submittedOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { p, v, label } = await openValuationOf(c, valuationId);
    const party = p.contractParties.find((x) => x.id === partyId && !x.retiredOn);
    if (!party) refuse("Not recorded:", [{ code: "PARTY_NOT_ON_CONTRACT", level: "block" }]);
    if (party!.kind !== "ASSIGNEE" && value == null) refuse("Not recorded:", [{ code: "PARTY_VALUE_REQUIRED", level: "block" }]);
    if (party!.kind === "ASSIGNEE" && value != null) refuse("Not recorded:", [{ code: "PARTY_VALUE_NOT_EXPECTED", level: "block" }]);
    if (storedDay(submittedOn) > c.today) refuse("Not recorded:", [{ code: "FUTURE_DATE", level: "block", data: { day: storedDay(submittedOn) } }]);
    if (afterCutOff(storedDay(submittedOn), storedDay(v.valuationDate))) refuse("Not recorded:", [{ code: "LINE_AFTER_CUT_OFF", level: "block", data: { day: storedDay(v.valuationDate) } }]);
    const before = v.partyLines.find((x) => x.partyId === party!.id) ?? null;
    const after = { value: value == null ? null : senToDecimalString(parseSen(value)), due: senToDecimalString(parseSen(due)), submittedOn, note: note.trim(), recordedAt: c.now };
    const row = await c.tx.partyLine.upsert({ where: { valuationId_partyId: { valuationId: v.id, partyId: party!.id } }, update: after, create: { organisationId: c.l.org.id, valuationId: v.id, partyId: party!.id, ...after } });
    const words = (x: { value: unknown; due: unknown; submittedOn: Date }) => ({ partyValueToDate: x.value == null ? null : money(parseSen(String(x.value))), dueThisCertificate: money(parseSen(String(x.due))), submittedOn: storedDay(x.submittedOn) });
    await audit(c, "PartyLine", row.id, `${label} · ${party!.name}`, before ? "UPDATE" : "CREATE", diffFields(before ? words(before) : null, words(after)), note.trim());
    return { ok: true };
  });
}

/// A deduction keyed on the valuation (FR-PAY-011): premiums and social security, wages, non-compliance, up to three
/// others, the damages line's signed rounding.
export async function addValuationDeduction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const deduction = r.choice("deduction", "Deduction", KEYED_DEDUCTION_KINDS, { required: true });
  const label = r.text("label", "What it is", { max: 240 });
  const amount = deduction === "LAD_ROUNDING" ? signedMoney(r, "amount", "Amount") : r.money("amount", "Amount", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (deduction === "OTHER" && !label.trim()) r.reject("label", "Say what the other permitted deduction is.");
  if (deduction === "LAD_ROUNDING" && amount != null && parseSen(amount) !== 0n && !note.trim()) r.reject("note", "Say why the damages line is rounded.");
  if (r.failed || !deduction || amount == null) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const v0 = await openValuationOf(c, valuationId);
    const fs: Finding[] = [];
    if (deduction === "OTHER" && v0.v.deductions.filter((d) => d.kind === "OTHER").length >= 3) fs.push({ code: "TOO_MANY_OTHER_DEDUCTIONS", level: "block", data: { max: 3 } });
    // BD-613-47: the rounding keyed so far plus this one stays a rounding to the ringgit.
    if (deduction === "LAD_ROUNDING") {
      const total = v0.v.deductions.filter((d) => d.kind === "LAD_ROUNDING").reduce((a, d) => a + senFromDecimal(d.amount), parseSen(amount));
      fs.push(...ladRoundingFaults(0n, total).filter((f) => f.code === "LAD_ROUNDING_OUT_OF_RANGE"));
    }
    if (fs.length) refuse("Not recorded:", fs);
    const value = senToDecimalString(parseSen(amount));
    const row = await c.tx.valuationDeduction.create({ data: { organisationId: c.l.org.id, valuationId: v0.v.id, kind: deduction, label: label.trim(), amount: value, note: note.trim(), recordedAt: c.now } });
    await audit(c, "ValuationDeduction", row.id, `${v0.label} · ${DEDUCTION_WORDS[deduction].en}`, "CREATE", diffFields(null, { deductionFor: deduction === "OTHER" ? label.trim() : DEDUCTION_WORDS[deduction].en, deductionAmount: value }), note.trim());
    return { ok: true };
  });
}

/// Take a keyed deduction off a valuation still being valued, with the reason.
export async function removeValuationDeduction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const deductionId = r.text("deductionId", "Deduction", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { v, label } = await openValuationOf(c, valuationId);
    const d = v.deductions.find((x) => x.id === deductionId);
    if (!d) return { ok: false, message: "That deduction is not on this valuation." };
    await c.tx.valuationDeduction.delete({ where: { id: d.id, organisationId: actor.organisationId } });
    await audit(c, "ValuationDeduction", d.id, `${label} · ${DEDUCTION_WORDS[d.kind].en}`, "DELETE", diffFields({ deductionFor: d.kind === "OTHER" ? d.label : DEDUCTION_WORDS[d.kind].en, deductionAmount: money(senFromDecimal(d.amount)) }, { deductionFor: null, deductionAmount: null }), reason.trim());
    return { ok: true };
  });
}

/// The kind's form, or the refusal naming the setting.
function formFor(cfg: PaymentConfig, kind: string, sheetRequired = false) {
  const s = kindSettingOf(cfg, kind);
  // Intake 1 (BD-613-96): the raise's one form rule (TEMPLATE_NOT_SET, naming the need and where it is chosen).
  const noForm = raiseFormFault(s?.templateId ? { id: s.templateId } : null, KIND_WORDS[kind as CertificateKind]);
  if (noForm) refuse("Not raised:", [noForm]);
  if (sheetRequired && !s?.routingTypeId) refuse("Not raised:", [{ code: "ROUTING_SHEET_NOT_SET", level: "block", data: { kind } }]);
  return { templateId: s!.templateId!, routingTypeId: s!.routingTypeId ?? null };
}

/**
 * Raise the interim payment certificate from the valuation (FR-PAY-012): the same assembly the Payments tab shows,
 * judged on the locked rows; the certificate opened through the core on the baseline in force today, its figures
 * frozen with everything they rest on; the employer's premiums deducted are tied to it.
 */
export async function raiseInterimCertificate(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", async (c) => {
    const { p, v, label } = await openValuationOf(c, valuationId);
    const cfg = await configOf(c);
    const form = formFor(cfg, "INTERIM_PAYMENT");
    const input = assembleInputOf(c.l, p, cfg, v, c.today, await preExecutionFacts(c.l, c.tx));
    if (!input) return refuse("Not raised:", [{ code: "NO_BASELINE", level: "block" }]);
    const a = assembleInterim(input);
    if (a.faults.length || !a.result.snapshot || !a.judgedUnder) return refuse("Not raised:", a.faults);
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "INTERIM_PAYMENT", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed: a.result.snapshot }, c.now, c.today);
    const moved = await c.tx.interimValuation.updateMany({ where: { id: v.id, status: "OPEN" }, data: { status: "RAISED", certificateId: certId, judgedUnder: a.judgedUnder as unknown as Prisma.InputJsonValue } });
    if (moved.count !== 1) return CHANGED;
    if (a.judgedUnder.pendingDeductionIds.length) await c.tx.pendingDeduction.updateMany({ where: { id: { in: a.judgedUnder.pendingDeductionIds }, contractId: c.l.contract.id }, data: { valuationId: v.id } });
    const f = a.result.figures!;
    await audit(c, "InterimValuation", v.id, label, "UPDATE", diffFields({ valuationStage: "being valued" }, { valuationStage: "certificate raised", asInterimCertificate: a.sequence, grossValueToDate: money(f.gross), carriedForward: money(f.carryForward), totalDeductions: money(f.deductions), paymentRecommended: money(f.recommended), baselineVersion: `version ${input.baseline.version}`, materialsAllowance: a.judgedUnder.materialsPct.state === "SET" ? `${a.judgedUnder.materialsPct.pct}%` : null, liquidatedDamages: a.judgedUnder.lad.state === "CHARGED" ? `${a.judgedUnder.lad.days} days, ${a.judgedUnder.lad.amount}` : a.judgedUnder.lad.state === "EXCUSED" ? "none: excusable or pending" : null, beforeSigning: a.warnings.length ? "it may not issue before the contract is signed" : null }));
    return { ok: true };
  });
}

/// Hold a valuation below its minimum to the next cycle (FR-PAY-013, B4's exit), with the reason.
export async function holdValuation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", (c) => closeValuation(c, valuationId, "HELD", reason));
}

/// Withdraw a valuation still being valued, with the reason (its lines are kept with it).
export async function withdrawValuation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const valuationId = r.text("valuationId", "Valuation", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VALUATION", (c) => closeValuation(c, valuationId, "WITHDRAWN", reason));
}

async function closeValuation(c: Ctx, valuationId: string, to: "HELD" | "WITHDRAWN", reason: string): Promise<FormState> {
  const { p, v, label } = await openValuationOf(c, valuationId);
  if (to === "HELD") {
    // The same assembly the screen shows: only a valuation below its minimum is held.
    const input = assembleInputOf(c.l, p, await configOf(c), v, c.today, await preExecutionFacts(c.l, c.tx));
    const a = input ? assembleInterim(input) : null;
    if (!a || a.minimum.state !== "BELOW") refuse("Not held:", [{ code: "NOT_BELOW_MINIMUM", level: "block" }]);
  }
  const moved = await c.tx.interimValuation.updateMany({ where: { id: v.id, status: "OPEN" }, data: { status: to, closeReason: reason.trim(), closedAt: c.now } });
  if (moved.count !== 1) return CHANGED;
  await audit(c, "InterimValuation", v.id, label, "UPDATE", diffFields({ valuationStage: "being valued" }, { valuationStage: to === "HELD" ? "held to the next cycle" : "withdrawn" }), reason.trim());
  return { ok: true };
}

// ------------------------------------------------------------------ retention release (FR-PAY-021)

/// Release retention: the first share on the as-built drawings, or the balance on the Certificate of Making Good Defects.
export async function releaseRetention(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const release = r.choice("release", "Which release", RETENTION_RELEASES, { required: true });
  const releasedOn = r.date("releasedOn", "Released on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !release || !releasedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "RetentionRelease.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "RETENTION_RELEASE", async (c) => {
    if (storedDay(releasedOn) > c.today) refuse("Not released:", [{ code: "FUTURE_DATE", level: "block", data: { day: storedDay(releasedOn) } }]);
    const p = await paymentOf(c);
    const held = heldOnLatest(issuedInterims(p));
    if (!held) refuse("Not released:", [{ code: "NO_ISSUED_INTERIM", level: "block" }]);
    const rs = releaseStateOf(p);
    const policy = (await configOf(c)).policy;
    const pct = firstReleaseShare(policy?.firstReleasePct);
    const handover = p.siteRecordsHandovers.at(-1) ?? null;
    const rel = releaseOf({ kind: release, held: held!.held, already: rs.already, firstReleasePct: pct, asBuiltHandedOver: !!handover, makingGoodIssued: false, firstReleased: rs.firstReleased });
    if (rel.faults.length) refuse("Not released:", rel.faults);
    const who = await recordedFor(c, act, { principalOrSo: true }, storedDay(releasedOn));
    const a = rel.amounts!;
    const row = await c.tx.retentionRelease.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, kind: release, main: money(a.MAIN), nsc: money(a.NSC), ns: money(a.NS), heldMain: money(held!.held.MAIN), heldNsc: money(held!.held.NSC), heldNs: money(held!.held.NS), pct: release === "RELEASED_FIRST" ? pct : null, pctProvenance: release === "RELEASED_FIRST" ? (policy?.firstReleaseProvenance ?? null) : null, basisCertificateId: held!.certificateId, handoverId: release === "RELEASED_FIRST" ? handover!.id : null, releasedOn, personId: who.person.id, note: note.trim(), recordedAt: c.now } });
    await audit(c, "RetentionRelease", row.id, RELEASE_WORDS[release].en.toLowerCase(), "CREATE", diffFields(null, { release: RELEASE_WORDS[release].en, releasedMainContractor: money(a.MAIN), releasedNominatedSubcontractors: money(a.NSC), releasedNominatedSuppliers: money(a.NS), heldOnTheLatestCertificate: money(held!.held.MAIN + held!.held.NSC + held!.held.NS), share: pct ? `${pct}%` : null, paidThrough: "the next interim certificate", releasedOn: storedDay(releasedOn), recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }), note.trim());
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the opening position (BD-613-41 as amended)

/**
 * A contract's opening position, entered once before the first valuation the system raises (or corrected, with a
 * reason, until one is raised): the last interim certificate it covers and the figures to date, each stated on a
 * certificate (its reference) or assumed (the reason). The payment module reads it as the latest issued interim.
 */
export async function recordOpeningPosition(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const lastCertificateNumber = r.text("lastCertificateNumber", "The last interim certificate's number", { max: 120 });
  const lastSequence = r.int("lastSequence", "Which interim certificate it was", { min: 1 });
  const m = (name: string, label: string) => {
    const v = r.money(name, label, { required: true });
    return v == null ? null : parseSen(v);
  };
  const grossToDate = m("grossToDate", "Gross certified to date");
  const previouslyCertified = m("previouslyCertified", "Previously certified to date");
  const tiers = (prefix: string, label: string) => {
    const [a, b, c] = [m(`${prefix}Main`, `${label}: main contractor`), m(`${prefix}Nsc`, `${label}: nominated sub-contractors`), m(`${prefix}Ns`, `${label}: nominated suppliers`)];
    return a == null || b == null || c == null ? null : { MAIN: a, NSC: b, NS: c };
  };
  const retention = tiers("retention", "Retention held");
  const released = tiers("released", "Retention released");
  const advanceRecouped = readSchedule(r, String(data.get("advanceRecouped") ?? ""), "advanceRecouped");
  const chargedUntil = r.date("damagesChargedUntil", "Damages charged until");
  const provenance = Object.fromEntries(OPENING_GROUPS.map((g) => [g, { provenance: r.choice(`${g}Provenance`, "Where it came from", ["STATED", "ASSUMED"] as const), note: r.text(`${g}Note`, "Its source or reason", { max: 500 }) }])) as Record<OpeningGroup, { provenance: OpeningProvenance | null; note: string }>;
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "OpeningPosition.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "OPENING_POSITION", async (c) => {
    const p = await paymentOf(c);
    if (p.openingPosition) await c.tx.$queryRaw`SELECT id FROM "OpeningPosition" WHERE id = ${p.openingPosition.id} FOR UPDATE`;
    const input = { lastCertificateNumber, lastSequence, grossToDate, previouslyCertified, retention, released, advanceRecouped, damagesChargedUntil: chargedUntil ? storedDay(chargedUntil) : null, provenance };
    const fs = openingFaults(input, { valuationRaised: openingClosed(p.interimValuations.map((v) => ({ certificateStatus: v.certificate?.status ?? null }))), existing: !!p.openingPosition, reason, foreignSequences: p.certificates.map((x) => x.sequence ?? 0) });
    if (fs.length) refuse("Not recorded:", fs);
    const who = await recordedFor(c, act, { principalOrSo: true }, c.today);
    const prov = (g: OpeningGroup) => ({ [`${g}Provenance`]: provenance[g].provenance!, [`${g}Note`]: provenance[g].note.trim() });
    const v = {
      lastCertificateNumber: lastCertificateNumber.trim(),
      lastSequence: lastSequence!,
      grossToDate: money(grossToDate!),
      previouslyCertified: money(previouslyCertified!),
      retentionMain: money(retention!.MAIN), retentionNsc: money(retention!.NSC), retentionNs: money(retention!.NS),
      releasedMain: money(released!.MAIN), releasedNsc: money(released!.NSC), releasedNs: money(released!.NS),
      advanceRecouped: advanceRecouped.map((x) => ({ sequence: x.sequence, amount: money(x.amount) })) as unknown as Prisma.InputJsonValue,
      damagesChargedUntil: chargedUntil,
      ...prov("gross"), ...prov("previous"), ...prov("retention"), ...prov("released"), ...prov("advance"), ...prov("damages"),
      personId: who.person.id,
      recordedAt: c.now,
      recordedOn: dayToDate(c.today),
    } as Omit<Prisma.OpeningPositionUncheckedCreateInput, "organisationId" | "contractId">;
    const before = p.openingPosition;
    const row = await c.tx.openingPosition.upsert({ where: { contractId: c.l.contract.id }, update: v, create: { organisationId: c.l.org.id, contractId: c.l.contract.id, ...v } });
    // The trail in words: each figure with where it came from ("Stated on …" / "Assumed: …"), never a code.
    const src = (pv: string | null | undefined, note: string | null | undefined) => (pv ? `${pv === "STATED" ? "Stated on" : "Assumed:"} ${note ?? ""}` : null);
    const words = (x: typeof before | (typeof v & { advanceRecouped: unknown })) =>
      x
        ? {
            lastCertificateCovered: `${x.lastCertificateNumber} (interim certificate ${x.lastSequence})`,
            grossCertifiedToDate: String(x.grossToDate),
            grossSource: src(x.grossProvenance as string, x.grossNote as string),
            previouslyCertifiedToDate: String(x.previouslyCertified),
            previouslyCertifiedSource: src(x.previousProvenance as string, x.previousNote as string),
            retentionHeld: `${String(x.retentionMain)} / ${String(x.retentionNsc)} / ${String(x.retentionNs)}`,
            retentionSource: src(x.retentionProvenance as string, x.retentionNote as string),
            retentionReleased: `${String(x.releasedMain)} / ${String(x.releasedNsc)} / ${String(x.releasedNs)}`,
            releasedSource: src(x.releasedProvenance as string, x.releasedNote as string),
            advanceRecoupedBySchedule: ((x.advanceRecouped as { sequence: number; amount: string }[]) ?? []).map((a) => `interim certificate ${a.sequence}: ${a.amount}`).join("; ") || "none",
            advanceSource: src(x.advanceProvenance as string, x.advanceNote as string),
            damagesChargedUntil: x.damagesChargedUntil ? storedDay(x.damagesChargedUntil as Date) : "none charged",
            damagesSource: src(x.damagesProvenance as string, x.damagesNote as string),
          }
        : null;
    // Residual SHOULD 1: whether it reconciles is said, not refused, and kept with it.
    const rec = openingReconciles({ grossToDate: grossToDate!, previouslyCertified: previouslyCertified!, retention: retention!, released: released! });
    await audit(c, "OpeningPosition", row.id, "opening position", before ? "UPDATE" : "CREATE", diffFields(words(before), { ...words(v as never)!, reconciles: rec.length ? paymentFaultText(rec[0]) : "yes: previously certified is the gross less the retention held net", recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }), reason.trim());
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the advance payment (FR-PAY-001, 002; B2)

/// Schedule rows as "certificate number | amount" lines.
function readSchedule(r: FormReader, raw: string, field = "schedule"): { sequence: number; amount: Sen }[] {
  const out: { sequence: number; amount: Sen }[] = [];
  for (const [n, line] of linesOf(raw).entries()) {
    const [s, a] = line.split("|").map((x) => x.trim());
    if (!s || !/^\d{1,3}$/.test(s) || !a || !/^\d+(\.\d{1,2})?$/.test(a.replace(/,/g, ""))) {
      r.reject(field, `Line ${n + 1}: write it as "certificate number | amount".`);
      continue;
    }
    out.push({ sequence: Number.parseInt(s, 10), amount: parseSen(a) });
  }
  return out;
}

/// Apply for an advance payment (a mechanism only, B2): its amount, guarantee and recoupment schedule; its certificate opened.
export async function applyAdvancePayment(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const party = r.choice("advanceFor", "For", ADVANCE_PARTIES, { required: true });
  const partyId = r.optionalText("partyId");
  const amount = r.money("amount", "Amount", { required: true });
  const securityId = r.text("securityId", "Advance Payment Guarantee", { required: true });
  const schedule = readSchedule(r, String(data.get("schedule") ?? ""));
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !party || amount == null) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "AdvancePayment.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "ADVANCE_PAYMENT", async (c) => {
    const p = await paymentOf(c);
    const security = c.l.contract.securities.find((s) => s.id === securityId) ?? null;
    const nsc = party === "NSC" ? (p.contractParties.find((x) => x.id === partyId && x.kind === "NOMINATED_SUBCONTRACTOR" && !x.retiredOn) ?? null) : null;
    const fs = applicationFaults({
      party,
      partyKnown: !!nsc,
      amount: parseSen(amount),
      guarantee: security ? { kind: security.kind, status: security.status, effectiveFrom: storedDay(security.effectiveFrom), expiresOn: day(security.expiresOn), value: senFromDecimal(security.value) } : null,
      schedule,
      // Residual MUST 2: the highest interim sequence issued (an opening position at 7 covers 1..7).
      issuedInterims: nextInterimSequence(p) - 1,
      liveForParty: p.advancePayments.some((a) => a.party === party && (party === "MAIN" || a.partyId === partyId) && a.certificate.status !== "VOID"),
      inProgressSequence: inProgressSequenceOf(p),
      today: c.today,
    });
    if (fs.some((f) => f.level === "block")) refuse("Not applied for:", fs.filter((f) => f.level === "block"));
    const cfg = await configOf(c);
    const form = formFor(cfg, "ADVANCE_PAYMENT");
    const who = await recordedFor(c, act, { principalOrSo: true }, c.today);
    const amountText = senToDecimalString(parseSen(amount));
    const computed: ComputedSnapshot = {
      version: 1,
      computedOn: c.today,
      rule: { en: "Advance payment: the amount applied for, recouped by the schedule entered", ms: "Bayaran pendahuluan: amaun dipohon, dipulihkan mengikut jadual" },
      lines: [
        { key: "advanceAmount", labelEn: "Advance payment", labelMs: "Bayaran pendahuluan", type: "MONEY", value: amountText, overridable: false },
        { key: "guarantee", labelEn: "Advance Payment Guarantee", labelMs: "Jaminan Bayaran Pendahuluan", type: "TEXT", value: `${security!.instrumentRef || "lodged"}, ${money(senFromDecimal(security!.value))}`, overridable: false },
        { key: "recoupment", labelEn: "Recouped on", labelMs: "Dipulihkan pada", type: "TEXT", value: schedule.map((x) => `interim certificate ${x.sequence}: ${money(x.amount)}`).join("; "), overridable: false },
      ],
      totals: [],
      routingRatio: null,
    };
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "ADVANCE_PAYMENT", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.advancePayment.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, party, partyId: nsc?.id ?? null, amount: amountText, securityId: security!.id, certificateId: certId, appliedOn: dayToDate(c.today), personId: who.person.id, note: note.trim(), judgedUnder: { warnings: fs.filter((f) => f.level === "warn").map((f) => f.code), noDocumentedRule: true } as Prisma.InputJsonValue, recordedAt: c.now } });
    for (const s of schedule) await c.tx.advanceRecoupmentRow.create({ data: { organisationId: c.l.org.id, advanceId: row.id, sequence: s.sequence, amount: money(s.amount) } });
    await audit(c, "AdvancePayment", row.id, "advance payment", "CREATE", diffFields(null, { advanceFor: party === "MAIN" ? "the main contractor" : nsc!.name, advanceAmount: amountText, guarantee: security!.instrumentRef || "lodged", recoupedOn: schedule.map((x) => `interim certificate ${x.sequence}: ${money(x.amount)}`).join("; "), eligibilityAndPercentage: "not checked: no documented advance payment procedure (B2)", recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }), note.trim());
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the damages chain (FR-LAD-001–008)

/// Raise the warning letter of the intention to impose damages (FR-LAD-003).
export async function raiseLadWarning(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const eotClause = r.text("eotClause", "Extension-of-time clause", { required: true, max: 240 });
  const ladClause = r.text("ladClause", "Damages clause", { required: true, max: 240 });
  const extended = r.date("extendedCompletion", "Extended date for completion", { required: true });
  if (r.failed || !extended) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LadWarning.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DAMAGES", async (c) => {
    const p = await paymentOf(c);
    const cfg = await configOf(c);
    const b = baselineOn(c.l, c.today);
    const liveWarning = p.ladWarnings.some((wr) => wr.certificate.status !== "VOID" && !p.nonCompletions.some((d) => d.warningId === wr.id));
    const setting = kindSettingOf(cfg, "LAD_WARNING");
    const fs = warningFaults({ dateForCompletion: b?.values.dateForCompletion ?? null, rate: b?.values.ladDaily ?? null, eotClause, ladClause, extendedCompletion: storedDay(extended), liveWarning, formSet: !!setting?.templateId });
    if (fs.length) refuse("Not raised:", fs);
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const clock = cfg.clocks.find((k) => k.clock === "LAD_WARNING_RESPONSE") ?? null;
    const rate = b!.values.ladDaily!;
    const computed: ComputedSnapshot = {
      version: 1,
      computedOn: c.today,
      rule: { en: "Warning of the intention to impose liquidated damages, the rate from the baseline", ms: "Amaran niat mengenakan ganti rugi tertentu, kadar daripada garis dasar" },
      lines: [
        { key: "ladRate", labelEn: "Liquidated damages: rate a day (from the baseline)", labelMs: "Ganti rugi tertentu: kadar sehari", type: "MONEY", value: money(rate), overridable: false },
        { key: "dateForCompletion", labelEn: "Date for completion", labelMs: "Tarikh siap", type: "DATE", value: b!.values.dateForCompletion, overridable: false },
        { key: "extendedCompletion", labelEn: "Extended date for completion", labelMs: "Tarikh siap dilanjutkan", type: "DATE", value: storedDay(extended), overridable: false },
        { key: "eotClause", labelEn: "Extension-of-time clause", labelMs: "Klausa lanjutan masa", type: "TEXT", value: eotClause.trim(), overridable: false },
        { key: "ladClause", labelEn: "Damages clause", labelMs: "Klausa ganti rugi", type: "TEXT", value: ladClause.trim(), overridable: false },
      ],
      totals: [],
      routingRatio: null,
    };
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "LAD_WARNING", templateId: setting!.templateId!, routingTypeId: setting!.routingTypeId ?? null, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.ladWarning.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, certificateId: certId, eotClause: eotClause.trim(), ladClause: ladClause.trim(), extendedCompletion: extended, rate: money(rate), responseClock: clock ? ({ length: clock.length, unit: clock.unit, provenance: clock.provenance } as Prisma.InputJsonValue) : undefined, personId: who.person.id, recordedAt: c.now, recordedOn: dayToDate(c.today) } });
    await audit(c, "LadWarning", row.id, "warning of liquidated damages", "CREATE", diffFields(null, { extendedCompletion: storedDay(extended), damagesRateADay: money(rate), extensionClause: eotClause.trim(), damagesClause: ladClause.trim(), responseWindow: clock ? `${clock.length} ${clock.unit === "DAYS" ? "calendar days" : clock.unit === "WEEKS" ? "weeks" : "months"} from posting (assumed)` : "not set (advisory)", recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// Its registered post: the consignment reference and the day posted (the response window runs from it).
export async function recordWarningPost(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const warningId = r.text("warningId", "Warning letter", { required: true });
  const ref = r.text("consignmentRef", "Consignment reference", { required: true, max: 120 });
  const postedOn = r.date("postedOn", "Posted on", { required: true });
  if (r.failed || !postedOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DAMAGES", async (c) => {
    await c.tx.$queryRaw`SELECT id FROM "LadWarning" WHERE id = ${warningId} FOR UPDATE`;
    const p = await paymentOf(c);
    const wr = p.ladWarnings.find((x) => x.id === warningId);
    if (!wr) return { ok: false, message: "That warning letter is not on this contract." };
    const issuedOn = (wr.certificate.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? null;
    const fs = postFaults({ letterIssued: wr.certificate.status === "ISSUED", already: !!wr.postedOn, ref, postedOn: storedDay(postedOn), issuedOn, today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.ladWarning.updateMany({ where: { id: wr.id, postedOn: null }, data: { consignmentRef: ref.trim(), postedOn, postedAt: c.now } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "LadWarning", wr.id, "warning of liquidated damages", "UPDATE", diffFields({ registeredPost: null }, { registeredPost: ref.trim(), postedOn: storedDay(postedOn) }));
    return { ok: true };
  });
}

/// The four pack items as posted: each written, or marked not required (its text then the reason).
function readPack(data: FormData): PackAnswer[] {
  return PACK_ITEMS.map((item: PackItem) => ({ item, text: String(data.get(`pack_${item}`) ?? "").trim().slice(0, 4000), notRequired: data.get(`pack_${item}_notRequired`) != null }));
}

/**
 * The non-completion decision (FR-LAD-001, 004, 005, 008; OD-A1 A): damages apply (the Certificate of
 * Non-Completion raised, with the accrual window, ASSUMED), or the delay is excusable or its entitlement pending.
 * The S.O.'s own decision.
 *
 * 6.13 Part B run 1b (613A-C2 (a)(1) as approved, BD-613-89; FR-LAD-001, 011; flagged against accepted Part A,
 * stricter): every new decision reads the EOT record (basis EOT_RECORD). Damages are refused while an EOT claim on the
 * scope is open or entitled and not yet certified (EOT_DETERMINATION_OUTSTANDING); an excusable or pending delay names
 * the claim it waits on and takes its scope. One live decision per scope: a further one replaces its own scope's.
 * Locks: the contract (inContract), the named claim's matter and the claim, then the scope's live decision.
 */
export async function recordNonCompletion(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const outcome = r.choice("decisionOutcome", "Decision", NON_COMPLETION_OUTCOMES, { required: true });
  const reason = r.text("decisionReason", "Reasons", { required: true, max: 4000 });
  const scope = r.choice("scope", "Covers", NON_COMPLETION_SCOPES);
  const sectionRef = r.optionalText("sectionRef");
  const eotClause = r.text("eotClause", "Extension-of-time clause", { max: 240 });
  const ladClause = r.text("ladClause", "Damages clause", { max: 240 });
  const insuranceExpiry = r.date("insuranceExpiry", "Insurance expires on");
  const expectedCompletion = r.date("expectedCompletion", "Expected completion");
  const windowFrom = r.date("windowFrom", "Damages run from");
  const windowUntil = r.date("windowUntil", "Completed on");
  const replacesId = r.optionalText("replacesId");
  const replaceReason = r.text("replaceReason", "Why the decision in force is replaced", { max: 2000 });
  const eotClaimId = r.optionalText("eotClaimId");
  const pack = readPack(data);
  if (r.failed || !outcome) return { ok: false, errors: r.errors };
  // The decision is the S.O.'s: signed with their password, or recorded from their paper by someone else (Phase 2b). It is dated today by the server.
  const begun = await beginAct(actor, data, "NonCompletion.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DAMAGES", async (c) => {
    // The named claim's matter, then the claim (ContractMatter the first domain row), before the decision rows.
    const named = eotClaimId ? await c.tx.eotClaim.findFirst({ where: { id: eotClaimId, contractId: c.l.contract.id, organisationId: actor.organisationId }, select: { id: true, matterId: true, scope: true, sectionRef: true } }) : null;
    if (named) {
      await c.tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${named.matterId} FOR UPDATE`;
      await c.tx.$queryRaw`SELECT id FROM "EotClaim" WHERE id = ${named.id} FOR UPDATE`;
    }
    const p = await paymentOf(c);
    const cfg = await configOf(c);
    const b = baselineOn(c.l, c.today);
    // 613A-C2 (a)(1): an excusable or pending delay takes the scope of the claim it waits on.
    const lad0 = outcome === "LAD_APPLIES";
    const decScope = (lad0 ? scope : (named?.scope ?? null)) as "WHOLE" | "SECTION" | null;
    const decRef = lad0 ? (scope === "SECTION" ? sectionRef : null) : (named?.sectionRef ?? null);
    const basisFs = decisionBasisFaults({ outcome, scope: decScope ?? "WHOLE", sectionRef: decRef, claims: claimFactsOf(p), eotClaimId: lad0 ? null : eotClaimId });
    if (basisFs.length) refuse("Not recorded:", basisFs);
    // FR-LAD-011: one live decision per scope; a further one replaces its own scope's, with its reason.
    const live = liveDecisionsOf(p).get(scopeKey(decScope, decRef)) ?? null;
    const prog = inProgress(p);
    const rf = replacementFaultsOnScope(liveDecisionsOf(p), decScope ?? "WHOLE", decRef, { replacesId, reason: replaceReason, valuationInProgress: live && prog ? `interim valuation of ${formatDate(storedDay(prog.valuationDate))}` : null });
    if (rf.length) refuse("Not recorded:", rf);
    if (live) await c.tx.$queryRaw`SELECT id FROM "NonCompletion" WHERE id = ${live.id} FOR UPDATE`;
    const warning = [...p.ladWarnings].reverse().find((x) => x.certificate.status !== "VOID") ?? null;
    const section = scope === "SECTION" ? (b?.values.sections.find((x) => x.ref === sectionRef) ?? null) : null;
    const lad = outcome === "LAD_APPLIES";
    const fs = decisionFaults({
      outcome,
      reason,
      dateForCompletion: b?.values.dateForCompletion ?? null,
      today: c.today,
      scope: lad ? scope : null,
      section: scope === "SECTION" ? (section ? { known: true, rate: section.ladDaily } : null) : null,
      wholeRate: b?.values.ladDaily ?? null,
      warning: warning ? { issued: warning.certificate.status === "ISSUED", posted: !!warning.postedOn } : null,
      eotClause,
      ladClause,
      insuranceExpiry: day(insuranceExpiry),
      expectedCompletion: day(expectedCompletion),
      windowFrom: day(windowFrom),
      windowUntil: day(windowUntil),
      pack,
      formSet: !lad || !!kindSettingOf(cfg, "NON_COMPLETION")?.templateId,
    });
    if (fs.length) refuse("Not recorded:", fs);
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const rate = lad ? (scope === "SECTION" ? section!.ladDaily! : b!.values.ladDaily!) : null;
    let certId: string | null = null;
    if (lad) {
      const form = formFor(cfg, "NON_COMPLETION", true);
      const computed: ComputedSnapshot = {
        version: 1,
        computedOn: c.today,
        rule: { en: "Certificate of Non-Completion: the particulars as in the contract, the rate from the baseline", ms: "Perakuan Kerja Tidak Siap: butiran seperti dalam kontrak, kadar daripada garis dasar" },
        lines: [
          { key: "scope", labelEn: "Covers", labelMs: "Meliputi", type: "TEXT", value: scope === "SECTION" ? `${SCOPE_WORDS.SECTION.en}: ${section!.description || section!.ref}` : SCOPE_WORDS.WHOLE.en, overridable: false },
          { key: "dateForCompletion", labelEn: "The date the works ought to have been completed", labelMs: "Tarikh kerja sepatutnya disiapkan", type: "DATE", value: b!.values.dateForCompletion, overridable: false },
          { key: "ladRate", labelEn: "Liquidated damages: rate a day (from the baseline)", labelMs: "Ganti rugi tertentu: kadar sehari", type: "MONEY", value: money(rate!), overridable: false },
          { key: "eotClause", labelEn: "Extension-of-time clause", labelMs: "Klausa lanjutan masa", type: "TEXT", value: eotClause.trim(), overridable: false },
          { key: "ladClause", labelEn: "Damages clause", labelMs: "Klausa ganti rugi", type: "TEXT", value: ladClause.trim(), overridable: false },
          { key: "insuranceExpiry", labelEn: "The insurance policies expire on", labelMs: "Polisi insurans tamat pada", type: "DATE", value: day(insuranceExpiry), overridable: false },
          { key: "expectedCompletion", labelEn: "Expected completion (cover extended to it)", labelMs: "Jangkaan siap (perlindungan dilanjutkan)", type: "DATE", value: day(expectedCompletion), overridable: false },
          { key: "windowFrom", labelEn: "Damages run from (assumed: the day after the date for completion)", labelMs: "Ganti rugi dikenakan dari", type: "DATE", value: day(windowFrom), overridable: false },
        ],
        totals: [],
        routingRatio: null,
      };
      certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "NON_COMPLETION", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed }, c.now, c.today);
    }
    const row = await c.tx.nonCompletion.create({
      data: { organisationId: c.l.org.id, contractId: c.l.contract.id, outcome, reason: reason.trim(), scope: decScope, sectionRef: decScope === "SECTION" ? decRef : null, basis: "EOT_RECORD", eotClaimId: lad ? null : (named?.id ?? null), certificateId: certId, warningId: lad ? warning!.id : null, eotClause: eotClause.trim(), ladClause: ladClause.trim(), dateForCompletion: dayToDate(b!.values.dateForCompletion!), rate: rate == null ? null : money(rate), insuranceExpiry: lad ? insuranceExpiry : null, expectedCompletion: lad ? expectedCompletion : null, windowFrom: lad ? windowFrom : null, windowUntil: lad ? windowUntil : null, pack: (lad ? pack : []) as unknown as Prisma.InputJsonValue, decidedOn: dayToDate(c.today), personId: who.person.id, recordedAt: c.now, replacesId: live ? live.id : null, replaceReason: live ? replaceReason.trim() : "" },
    });
    await audit(c, "NonCompletion", row.id, "non-completion decision", "CREATE", diffFields(null, {
      nonCompletionDecision: OUTCOME_WORDS[outcome].en,
      reasons: reason.trim(),
      covers: lad ? (scope === "SECTION" ? `${SCOPE_WORDS.SECTION.en}: ${section!.description || section!.ref}` : SCOPE_WORDS.WHOLE.en) : null,
      dateForCompletion: b!.values.dateForCompletion,
      damagesRateADay: rate == null ? null : money(rate),
      insuranceExpires: lad ? day(insuranceExpiry) : null,
      expectedCompletion: lad ? day(expectedCompletion) : null,
      damagesRunFrom: lad ? day(windowFrom) : null,
      completedOn: lad ? day(windowUntil) : null,
      accrualWindow: lad ? "entered with the decision (assumed reading: from the day after the date for completion to completion)" : null,
      submissionPack: lad ? pack.map((x) => `${PACK_WORDS[x.item].en}: ${x.notRequired ? `not required (${x.text})` : "written"}`).join("; ") : null,
      decidedBy: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`,
      entitlementOnRecord: lad ? "no extension-of-time claim on this scope is open or entitled and uncertified" : `waits on the extension-of-time claim ${p.eotClaims.find((x) => x.id === named?.id)?.matter.reference ?? "(not yet numbered)"}`,
      replacesTheDecisionOf: live ? `${storedDay(live.decidedOn)} (${OUTCOME_WORDS[live.outcome].en})` : null,
    }), live ? replaceReason.trim() : "");
    await act.write(c.tx, row.id, { document: { entity: "NonCompletion", id: row.id }, roleCode: who.soRoleCode });
    if (live) await audit(c, "NonCompletion", live.id, "non-completion decision", "UPDATE", diffFields({ inForce: "yes" }, { inForce: "no", replacedOn: c.today, replacedBy: OUTCOME_WORDS[outcome].en }), replaceReason.trim());
    return { ok: true };
  });
}

/// Close the damages window at completion (the first day not charged), with the reason; once.
export async function closeLadWindow(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const decisionId = r.text("decisionId", "Decision", { required: true });
  const until = r.date("windowUntil", "Completed on", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !until) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DAMAGES", async (c) => {
    await c.tx.$queryRaw`SELECT id FROM "NonCompletion" WHERE id = ${decisionId} FOR UPDATE`;
    const p = await paymentOf(c);
    const d = p.nonCompletions.find((x) => x.id === decisionId) ?? null;
    if (!d) return { ok: false, message: "That decision is not on this contract." };
    const fs: Finding[] = [];
    if (d.outcome !== "LAD_APPLIES" || !d.windowFrom) fs.push({ code: "WINDOW_NOT_OPEN", level: "block" });
    else if (d.windowUntil) fs.push({ code: "WINDOW_ALREADY_CLOSED", level: "block" });
    else if (storedDay(until) <= storedDay(d.windowFrom)) fs.push({ code: "WINDOW_ENDS_BEFORE_START", level: "block" });
    if (storedDay(until) > c.today) fs.push({ code: "FUTURE_DATE", level: "block", data: { day: storedDay(until) } });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.nonCompletion.updateMany({ where: { id: d.id, windowUntil: null }, data: { windowUntil: until, windowClosedAt: c.now } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "NonCompletion", d.id, "non-completion decision", "UPDATE", diffFields({ completedOn: null }, { completedOn: storedDay(until) }), reason.trim());
    return { ok: true };
  });
}
