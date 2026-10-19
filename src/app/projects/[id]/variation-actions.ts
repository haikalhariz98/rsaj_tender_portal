"use server";

import { tablingOf } from "@/lib/matter/tabling";
import { actStatusFault, actStatusText, type ContractAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { AdjustmentNetMissing, adjustmentFaults, adjustmentSnapshot, type AdjustmentLineIn } from "@/lib/adjustment/ppjhk";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { REJECTION_KINDS, rejectionSnapshot, type RejectionKind } from "@/lib/authority/rejection";
import { loadDestinations } from "@/lib/approvals/rejection-store";
import { toSecond } from "@/lib/bids/lateness";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { sittingPermits } from "@/lib/committee/meeting";
import { lockSittingIn } from "@/lib/committee/sittings";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { CertificateRefusal, openCertificate } from "@/lib/certificate/write";
import { raiseFormFault } from "@/lib/certificate/form-needs";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { contractLabel, withLockedContract } from "@/lib/contract/repo";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { decimalText, formatDate } from "@/lib/format";
import { formatMoney, parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";
import { baselineOn } from "@/lib/payment/load";
import { loadRoster } from "@/lib/people/load";
import { percentLabel, percentLabelText, variationReading, type Reading } from "@/lib/variation/percent";
import { capacityFor, capacityText, type ActNeed, type ActWho, type Capacity } from "@/lib/supervision/authority";
import { delegationFactsOf, loadSupervision, recorderFaultToday, soOfficeOn } from "@/lib/supervision/load";
import { supervisionRefusal } from "@/lib/supervision/labels";
import type { DelegateKind } from "@/lib/supervision/types";
import { approvedValue, closeFaults, commenceFaults, cumulativeApproved, fieldFaults, pendingValueRoutes, routeValue, scheduleFormOf, sendFaults, soDecisionFaults, soOriginationFaults, submitFaults, type ApplicationFields, type RepCapacity } from "@/lib/variation/application";
import { dueOn, instructionFaults, oralLoopFaults, type ClockRule } from "@/lib/variation/instruction";
import { BASE_WORDS, BASIS_WORDS, DIRECTION_WORDS, EVENT_WORDS, EXEMPTION_WORDS, lowerFirst, ORIGIN_WORDS, RATE_SOURCE_WORDS, SCHEDULE_FORM_WORDS, SO_DECISION_WORDS, TRIGGER_WORDS, variationRefusal } from "@/lib/variation/labels";
import { adjustmentInProgress, CONSENT_DOMAIN, loadVariationPeople, consentOf, factsOf, issuedAdjustments, liveInstructionRow, liveOrderRow, loadAdjustments, loadVariations, matterFactsOf, orderNetOf, ordersAdjusted, standingMeasurements, type VariationRow } from "@/lib/variation/load";
import { dayworkFaults, measuredAmount, measurementFaults, parseQuantity, parseSignedPercent, removeMeasurementFaults } from "@/lib/variation/measure";
import { applicationFigures, orderFaults, orderFigures } from "@/lib/variation/order";
import { applicationPercents, orderBands } from "@/lib/variation/route";
import { applicationFormNow, chooseVariationRejection, citeVariationDecision, decideVariationStep, matrixToday, sendVariationRoute, VariationRefusal, variationLabel, type VariationCtx } from "@/lib/variation/route-write";
import { ADJUSTMENT_DIRECTIONS, ADJUSTMENT_TRIGGERS, RATE_SOURCES, SO_DECISIONS, VARIATION_EVENTS, VARIATION_EXEMPTIONS, VARIATION_ORIGINS, type AdjustmentTrigger, type Finding, type VariationEvent, type VariationExemption } from "@/lib/variation/types";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct, type PreparedAct } from "@/app/_auth/act";
import type { StaffActor } from "@/lib/auth/types";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Variations and the adjustment of the contract sum on a contract (6.13 Part A step 4, 4d: FR-VAR-001–024,
 * FR-PAD-001–007).
 *
 * Every act is reachable by a direct POST, so each reads the server's clock once on entry (truncated to the second),
 * then locks the requisition, the exercise, the award and the contract in the canonical order (`withLockedContract`),
 * then the variation it changes, then (tabling only) the sitting, re-reads the records on the locked transaction,
 * re-runs the pure rule, writes, and audits in the same transaction. A refusal throws, so nothing is half-written. The
 * certificates it raises (the instruction, the order, the adjustment; the application when its approval is approved)
 * are opened through the certificate core (Contract → Certificate); they are signed, voided and sent on the core's own
 * page. The signed-in officer is named on every audit row and every act is attributed in its own transaction (`beginAct`, Phase 2b): the officer's own, or,
 * from a paper record, recorded for a named person and not signed. Each act judges whether the person it is attributed to may do it on the day. A cancelled contract refuses every act. The
 * organisation's day is the act's day; with no time zone, nothing is recorded (never UTC's day).
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const CHANGED: FormState = { ok: false, message: "The variation changed while this was being saved. Reload and try again." };
const NO_ZONE: FormState = { ok: false, message: "Time zone not set. Set it under Configuration › Organisation." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: it is kept as it was." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

interface Ctx extends VariationCtx {
  label: string;
}

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, act: ContractAct, fn: (c: Ctx) => Promise<FormState>, alsoRevalidate: readonly string[] = []): Promise<FormState> {
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
    if (e instanceof VariationRefusal || e instanceof CertificateRefusal) return { ok: false, message: e.message, ...(e.errors ? { errors: e.errors } : {}) };
    if (e instanceof AdjustmentNetMissing) return { ok: false, message: e.message };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath("/approvals");
    revalidatePath("/", "layout"); // GN-04 / AC-13
    for (const p of alsoRevalidate) revalidatePath(p);
  }
  return result ?? GONE;
}

async function audit(c: Ctx, entity: string, entityId: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId, entityLabel: label, reason }, action, changes);
}

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new Refusal({ ok: false, message: variationRefusal(lead, fs) });
};
const fieldError = (field: string, message: string): never => {
  throw new Refusal({ ok: false, errors: { [field]: message } });
};
const idOf = (data: FormData) => String(data.get("id") ?? "");
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const money = (v: Sen) => senToDecimalString(v);
const tri = (v: string | null) => (v === "yes" ? true : v === "no" ? false : null);
const yesNo = (v: boolean | null) => (v == null ? "not answered" : v ? "yes" : "no");
const vLabel = (c: Ctx, v: { reference: string | null }) => variationLabel(c.l, v);

/// A signed amount as typed ("-5,000.00"): a variation's estimate (a reduction is below nothing).
function signedMoney(r: FormReader, name: string, label: string, required = false): Sen | null {
  const raw = String(r.optionalText(name) ?? "").replace(/,/g, "").trim();
  if (!raw) {
    if (required) r.reject(name, `${label} is required.`);
    return null;
  }
  if (!/^-?\d{1,16}(\.\d{1,2})?$/.test(raw)) {
    r.reject(name, `${label} must be an amount, to at most two decimal places (a reduction with a minus).`);
    return null;
  }
  return parseSen(raw);
}

/// A day a field names, or null; refused where it is after today.
const dayField = (r: FormReader, name: string, label: string, required = false) => {
  const d = r.date(name, label, { required });
  return d ? storedDay(d) : null;
};

/// The Person named, active and of the organisation.
async function personNamed(c: Ctx, personId: string | null, field = "personId"): Promise<{ id: string; name: string }> {
  const p = personId ? await c.tx.person.findFirst({ where: { id: personId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } }) : null;
  if (!p) fieldError(field, "Choose someone on record and active.");
  return p!;
}

/// The Person named, and the capacity they may be recorded in for the act on the day (the S.O., or a representative
/// whose delegation in force covers it); refused otherwise.
async function recordedFor(c: Ctx, who: ActWho, need: ActNeed, on: string, field = "personId"): Promise<{ person: { id: string; name: string }; capacity: Capacity; soLabel: string; soRoleCode: string }> {
  const person = await personNamed(c, who.subjectPersonId, field);
  const s = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, s, on, c.tx);
  const r = capacityFor(person.id, need, so?.office ?? null, delegationFactsOf(s), on);
  if (!r.capacity) throw new Refusal({ ok: false, message: supervisionRefusal("Not recorded:", r.faults) });
  // FR-SUP-004 (Phase 3d): the officer who records it is judged too, whoever it is recorded for.
  const recorder = await recorderFaultToday(c.l, s, who.recorderId, need, on, so?.office ?? null, c.today, c.tx);
  if (recorder) throw new Refusal({ ok: false, message: supervisionRefusal("Not recorded:", [recorder]) });
  return { person, capacity: r.capacity, soLabel: so!.office.roleLabel, soRoleCode: so!.assignment.roleCode };
}

/// A representative's capacity for the rules (FR-VAR-001, 002), or null where the Person is not one on the day.
async function repCapacityOf(c: Ctx, personId: string | null, on: string | null): Promise<RepCapacity | null> {
  if (!personId || !on) return null;
  const s = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, s, on, c.tx);
  const r = capacityFor(personId, { act: "VARIATION_APPLICATION" }, so?.office ?? null, delegationFactsOf(s), on);
  if (!r.capacity) return null;
  return r.capacity.as === "SO" ? { as: "SO" } : { as: "DELEGATE", kind: r.capacity.kind as DelegateKind };
}

/// Lock the variation (a domain row, after the contract) and read the contract's variations on the locked transaction.
async function lockVariation(c: Ctx, variationId: string): Promise<{ all: VariationRow[]; v: VariationRow }> {
  await c.tx.$queryRaw`SELECT id FROM "Variation" WHERE id = ${variationId} FOR UPDATE`;
  const all = await loadVariations(c.l.contract.id, c.tx);
  const v = all.find((x) => x.id === variationId);
  if (!v) throw new Refusal({ ok: false, message: "That variation is not on this contract." });
  return { all, v };
}

const policyOf = (c: Ctx) => c.tx.postAwardPolicy.findUnique({ where: { organisationId: c.l.org.id } });
const clockOf = async (c: Ctx, clock: "ORAL_CONFIRM" | "ORAL_OBJECTION" | "DAYWORK_SUBSTANTIATION"): Promise<ClockRule | null> => {
  const x = await c.tx.contractClockRule.findUnique({ where: { organisationId_clock: { organisationId: c.l.org.id, clock } }, select: { length: true, unit: true } });
  return x ? { length: x.length, unit: x.unit as ClockRule["unit"] } : null;
};
/// The form a kind prints on: refused where it is not set (the setting named).
async function formOf(c: Ctx, kind: "SO_INSTRUCTION" | "VARIATION" | "SUM_ADJUSTMENT") {
  const s = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind } }, select: { templateId: true, routingTypeId: true } });
  // Intake 1 (BD-613-96): the raise's one form rule (TEMPLATE_NOT_SET, naming the need and where it is chosen).
  const noForm = raiseFormFault(s?.templateId ? { id: s.templateId } : null, KIND_WORDS[kind]);
  if (noForm) refuse("Not raised:", [noForm]);
  return { templateId: s!.templateId!, routingTypeId: s!.routingTypeId ?? null };
}

// ------------------------------------------------------------------ the record (FR-VAR-001–004, 006, 009)

function readFields(r: FormReader) {
  const origin = r.choice("origin", "Who originated it", VARIATION_ORIGINS, { required: true });
  const exemption = r.choice("exemption", "Exempt from prior approval", VARIATION_EXEMPTIONS);
  const fields: ApplicationFields = {
    description: r.text("description", "Description", { required: true, max: 2000 }),
    reason: r.text("reason", "Reason it is done as a variation", { required: true, max: 2000 }),
    estimate: signedMoney(r, "estimate", "Estimated amount", true),
    exemption: (exemption ?? null) as VariationExemption | null,
    periodImplication: tri(r.optionalText("periodImplication")),
    agreedRateExists: tri(r.optionalText("agreedRateExists")),
    funderConsentRequired: tri(r.optionalText("funderConsentRequired")),
  };
  const more = {
    originatorPersonId: r.text("originatorPersonId", "Originated by", { required: true }),
    reviewedByPersonId: r.optionalText("reviewedByPersonId"),
    reviewedOn: dayField(r, "reviewedOn", "Reviewed on"),
    reviewNote: r.text("reviewNote", "Review note", { max: 2000 }),
    allocationConfirmed: tri(r.optionalText("allocationConfirmed")),
    allocationNote: r.text("allocationNote", "Allocation note", { max: 2000 }),
    principalPersonId: r.optionalText("principalPersonId"),
    principalOn: dayField(r, "principalOn", "Passed through on"),
  };
  return { origin, fields, more };
}

/// The answers' words in the trail, never codes.
const recordWords = (x: { origin: string; description: string; reason: string; estimate: Sen | string; exemption: string | null; periodImplication: boolean | null; agreedRateExists: boolean | null; funderConsentRequired: boolean | null; originatorName: string; reviewer: string | null; reviewedOn: string | null; allocationConfirmed: boolean | null; principal: string | null; principalOn: string | null }) => ({
  originatedBy: `${x.originatorName} (${lowerFirst(ORIGIN_WORDS[x.origin as keyof typeof ORIGIN_WORDS].en)})`,
  description: x.description,
  reason: x.reason,
  estimate: typeof x.estimate === "string" ? x.estimate : money(x.estimate),
  exemptFromPriorApproval: x.exemption ? EXEMPTION_WORDS[x.exemption as VariationExemption].en : "no",
  periodImplication: yesNo(x.periodImplication),
  agreedRateExists: yesNo(x.agreedRateExists),
  affectsFundersAssets: yesNo(x.funderConsentRequired),
  reviewedBy: x.reviewer,
  reviewedOn: x.reviewedOn,
  allocationConfirmed: x.allocationConfirmed == null ? null : yesNo(x.allocationConfirmed),
  passedThrough: x.principal,
  passedThroughOn: x.principalOn,
});

/// `recorder`: the signed-in officer, who is judged beside a representative they name (FR-SUP-004, Phase 3d); null for a loader run.
async function judgeRecord(c: Ctx, origin: "DEPARTMENT" | "SO_REPRESENTATIVE", fields: ApplicationFields, more: ReturnType<typeof readFields>["more"], recorder: string | null) {
  if (!EXECUTED_STATUSES.includes(c.l.contract.status)) refuse("Not recorded:", [{ code: "NOT_EXECUTED", level: "block" }]);
  // The record's own shape (the sign of the estimate against the exemption), as the table holds it.
  const sign = fieldFaults(fields).filter((f) => f.code !== "FIELD_REQUIRED");
  if (sign.length) fieldError("estimate", variationRefusal("", sign));
  for (const d of [more.reviewedOn, more.principalOn]) if (d && d > c.today) refuse("Not recorded:", [{ code: "FUTURE_DATE", level: "block", data: { day: d } }]);
  if (origin !== "DEPARTMENT" && (more.reviewedByPersonId || more.reviewedOn)) fieldError("reviewedByPersonId", "Only a variation the implementing department originates is reviewed before submission.");
  if (!!more.reviewedByPersonId !== !!more.reviewedOn) fieldError("reviewedOn", "A review names who reviewed it and on which day.");
  if (!!more.principalPersonId !== !!more.principalOn) fieldError("principalOn", "Passing it through a Principal Representative names who and on which day.");
  const originator = origin === "SO_REPRESENTATIVE" ? (await recordedFor(c, { subjectPersonId: more.originatorPersonId, recorderId: recorder !== more.originatorPersonId ? recorder : null }, { act: "VARIATION_APPLICATION" }, c.today, "originatorPersonId")).person : await personNamed(c, more.originatorPersonId, "originatorPersonId");
  const reviewer = more.reviewedByPersonId ? await personNamed(c, more.reviewedByPersonId, "reviewedByPersonId") : null;
  const principal = more.principalPersonId ? await personNamed(c, more.principalPersonId, "principalPersonId") : null;
  return { originator, reviewer, principal };
}

/// Who originated it, who reviewed it and who passed it on: each a person the form names. The signed-in person is the plain case; another is recorded for from
/// their paper (the memo, the review note, the Principal Representative's minute), with its reference or the reason.
async function beginOrigination(actor: StaffActor, data: FormData, more: ReturnType<typeof readFields>["more"], existing: { originatorPersonId: string; reviewedByPersonId: string | null; principalPersonId: string | null } | null = null): Promise<{ ok: true; acts: PreparedAct[] } | { ok: false; state: FormState }> {
  const acts: PreparedAct[] = [];
  // A person already recorded and left as they were is not recorded again: editing the wording of a draft is not a new act of the originator.
  if (existing?.originatorPersonId !== more.originatorPersonId) {
    const begun = await beginAct(actor, data, "Variation.originator", { personField: "originatorPersonId", namesSubject: true });
    if (!begun.ok) return begun;
    acts.push(begun.act);
  }
  if (more.reviewedByPersonId && existing?.reviewedByPersonId !== more.reviewedByPersonId) {
    const begun = await beginAct(actor, data, "Variation.reviewedBy", { personField: "reviewedByPersonId", namesSubject: true });
    if (!begun.ok) return begun;
    acts.push(begun.act);
  }
  if (more.principalPersonId && existing?.principalPersonId !== more.principalPersonId) {
    const begun = await beginAct(actor, data, "Variation.principal", { personField: "principalPersonId", namesSubject: true });
    if (!begun.ok) return begun;
    acts.push(begun.act);
  }
  return { ok: true, acts };
}

/// Record a variation as a draft (FR-VAR-001): its path, its originator, what it is and why, its estimate.
export async function recordVariation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const { origin, fields, more } = readFields(r);
  if (r.failed || !origin || fields.estimate == null) return { ok: false, errors: r.errors };
  const begun = await beginOrigination(actor, data, more);
  if (!begun.ok) return begun.state;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const who = await judgeRecord(c, origin, fields, more, actor.system ? null : actor.personId);
    const row = await c.tx.variation.create({
      data: {
        organisationId: c.l.org.id, contractId: c.l.contract.id, origin, originatorPersonId: who.originator.id, originatorName: who.originator.name,
        reviewedByPersonId: who.reviewer?.id ?? null, reviewedOn: more.reviewedOn ? dayToDate(more.reviewedOn) : null, reviewNote: more.reviewNote,
        allocationConfirmed: more.allocationConfirmed, allocationNote: more.allocationNote, principalPersonId: who.principal?.id ?? null, principalOn: more.principalOn ? dayToDate(more.principalOn) : null,
        description: fields.description, reason: fields.reason, estimate: money(fields.estimate!), exemption: fields.exemption, periodImplication: fields.periodImplication, agreedRateExists: fields.agreedRateExists, funderConsentRequired: fields.funderConsentRequired,
        recordedOn: dayToDate(c.today), recordedAt: c.now,
      },
    });
    await audit(c, "Variation", row.id, vLabel(c, row), "CREATE", diffFields(null, recordWords({ ...fields, estimate: fields.estimate!, origin, originatorName: who.originator.name, reviewer: who.reviewer?.name ?? null, reviewedOn: more.reviewedOn, allocationConfirmed: more.allocationConfirmed, principal: who.principal?.name ?? null, principalOn: more.principalOn })));
    for (const a of begun.acts) await a.write(c.tx, row.id);
    return { ok: true };
  });
}

/// Change a draft (before it is submitted), every answer audited before and after.
export async function editVariation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const { origin, fields, more } = readFields(r);
  if (r.failed || !origin || fields.estimate == null) return { ok: false, errors: r.errors };
  const was = await loadVariationPeople(actor.organisationId, variationId);
  const begun = await beginOrigination(actor, data, more, was);
  if (!begun.ok) return begun.state;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    if (v.status !== "DRAFT") refuse("Not changed:", [{ code: "NOT_DRAFT", level: "block", data: { status: v.status } }]);
    const who = await judgeRecord(c, origin, fields, more, actor.system ? null : actor.personId);
    const moved = await c.tx.variation.updateMany({
      where: { id: v.id, status: "DRAFT" },
      data: {
        origin, originatorPersonId: who.originator.id, originatorName: who.originator.name,
        reviewedByPersonId: who.reviewer?.id ?? null, reviewedOn: more.reviewedOn ? dayToDate(more.reviewedOn) : null, reviewNote: more.reviewNote,
        allocationConfirmed: more.allocationConfirmed, allocationNote: more.allocationNote, principalPersonId: who.principal?.id ?? null, principalOn: more.principalOn ? dayToDate(more.principalOn) : null,
        description: fields.description, reason: fields.reason, estimate: money(fields.estimate!), exemption: fields.exemption, periodImplication: fields.periodImplication, agreedRateExists: fields.agreedRateExists, funderConsentRequired: fields.funderConsentRequired,
      },
    });
    if (moved.count !== 1) return CHANGED;
    const before = recordWords({ origin: v.origin, description: v.description, reason: v.reason, estimate: v.estimate.toString(), exemption: v.exemption, periodImplication: v.periodImplication, agreedRateExists: v.agreedRateExists, funderConsentRequired: v.funderConsentRequired, originatorName: v.originatorName, reviewer: v.reviewedBy?.name ?? null, reviewedOn: day(v.reviewedOn), allocationConfirmed: v.allocationConfirmed, principal: v.principal?.name ?? null, principalOn: day(v.principalOn) });
    const after = recordWords({ ...fields, estimate: fields.estimate!, origin, originatorName: who.originator.name, reviewer: who.reviewer?.name ?? null, reviewedOn: more.reviewedOn, allocationConfirmed: more.allocationConfirmed, principal: who.principal?.name ?? null, principalOn: more.principalOn });
    await audit(c, "Variation", v.id, vLabel(c, v), "UPDATE", diffFields({ ...before, estimate: money(senFromDecimal(v.estimate)) }, after));
    for (const a of begun.acts) await a.write(c.tx, v.id);
    return { ok: true };
  });
}

/// The reading an approval of this variation is read on now (OD-A2), with what it rests on.
async function readingNow(c: Ctx, all: readonly VariationRow[], v: VariationRow, event: VariationEvent, value: Sen) {
  const policy = await policyOf(c);
  const baseline = baselineOn(c.l, c.today);
  if (!baseline) return refuse("Not done:", [{ code: "NO_BASELINE", level: "block" }]);
  const adjustments = issuedAdjustments(await loadAdjustments(c.l.contract.id, c.tx));
  const facts = all.map(factsOf);
  const self = facts.find((x) => x.id === v.id)!;
  const cumulative = cumulativeApproved(facts, v.id);
  const r = variationReading({ basis: (policy?.variationPctBasis ?? null) as "THIS_VARIATION" | "CUMULATIVE" | null, base: (policy?.variationBase ?? null) as "ORIGINAL" | "REVISED" | null, original: baseline.values.contractSum, adjustments: adjustments.map((a) => a.net), cumulativeApproved: cumulative, event, value, approvedSoFar: approvedValue(self) });
  return { r, policy, baseline, adjustments, cumulative, facts };
}

/**
 * Submit it (FR-VAR-003, 004): its fields and its origination complete, numbered from the `variation` series. A
 * variation exempt from prior approval goes straight on to its instruction; any other waits for the S.O.'s decision,
 * and its percentage's basis and base must be set (OD-A2: unset refuses submission, naming the setting).
 */
export async function submitVariation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { all, v } = await lockVariation(c, variationId);
    const fields: ApplicationFields = { description: v.description, reason: v.reason, estimate: senFromDecimal(v.estimate), exemption: v.exemption as VariationExemption | null, periodImplication: v.periodImplication, agreedRateExists: v.agreedRateExists, funderConsentRequired: v.funderConsentRequired };
    const origin = { origin: v.origin as "DEPARTMENT" | "SO_REPRESENTATIVE", originatorCapacity: v.origin === "SO_REPRESENTATIVE" ? await repCapacityOf(c, v.originatorPersonId, c.today) : null, reviewerCapacity: await repCapacityOf(c, v.reviewedByPersonId, day(v.reviewedOn)), reviewRecorded: !!v.reviewedByPersonId && !!v.reviewedOn, allocationConfirmed: v.allocationConfirmed, principalRecorded: !!(await principalCapable(c, v.principalPersonId, day(v.principalOn))) };
    const fs = submitFaults({ status: v.status as "DRAFT", fields, origin });
    if (fs.length) refuse("Not submitted:", fs);
    if (v.exemption == null) {
      const reading = (await readingNow(c, all, v, "PRIOR", senFromDecimal(v.estimate))).r;
      if (!reading.ok) refuse("Not submitted:", reading.faults);
    }
    let reference = v.reference;
    if (!reference) {
      try {
        reference = await issueReference(c.tx, c.l.org.id, "variation", dayToDate(c.today));
      } catch (e) {
        if (e instanceof NumberingError) return { ok: false, message: `Not submitted: ${e.fault === "SERIES_MISSING" ? "no numbering series for variations is configured: add the series “variation” under Configuration › Numbering." : "the numbering series for variations is not valid: correct it under Configuration › Numbering."}` };
        throw e;
      }
    }
    const to = v.exemption == null ? "SUBMITTED" : "SUPPORTED";
    // A resubmission after a return clears the earlier decision (kept in the trail).
    const moved = await c.tx.variation.updateMany({ where: { id: v.id, status: "DRAFT" }, data: { status: to, reference, submittedOn: dayToDate(c.today), submittedAt: c.now, soDecision: null, soDecisionCap: null, soDecidedByPersonId: null, soDecidedOn: null, soDecisionNote: "" } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "Variation", v.id, vLabel(c, { reference }), "UPDATE", diffFields({ stage: "draft", number: v.reference }, { stage: to === "SUBMITTED" ? "with the S.O. for a decision" : "exempt from prior approval: to the S.O.'s instruction", number: reference, submittedOn: c.today }));
    return { ok: true };
  });
}

/// FR-VAR-002: who it passed through is a Principal Representative in force (or the S.O.) on that day.
async function principalCapable(c: Ctx, personId: string | null, on: string | null) {
  if (!personId || !on) return null;
  const s = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, s, on, c.tx);
  return capacityFor(personId, { principalOrSo: true }, so?.office ?? null, delegationFactsOf(s), on).capacity;
}

/**
 * The S.O.'s decision on the application (FR-VAR-005): supported, with a cap no higher than the estimate where given;
 * or not supported, with the reason, sent where the configured destination for a variation says (back to its
 * originator, or the variation ends), or, where none is configured, where the officer chooses (CO-5).
 */
export async function decideVariation(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const decision = r.choice("soDecision", "The S.O.'s decision", SO_DECISIONS, { required: true });
  const capRaw = r.money("soDecisionCap", "Supported up to");
  const note = r.text("soDecisionNote", "Note", { max: 2000 });
  dayField(r, "decidedOn", "Decided on");
  const chosen = r.choice("whereTo", "Where it goes", ["RETURN_TO_ORIGINATOR", "TERMINATE"] as const);
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  // The S.O.'s decision is signed with their password, or recorded from their paper by someone else, and is dated by the server (Phase 2b).
  const begun = await beginAct(actor, data, "Variation.soDecidedBy", { personField: "personId", dateField: "decidedOn", document: { entity: "Variation", id: variationId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const decidedOn = act.day!;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const so = await recordedFor(c, act, { soOnly: true }, decidedOn);
    const cap = capRaw ? parseSen(capRaw) : null;
    // The product owner's ruling (decisions log, 2026-10-07): the S.O. does not decide a variation they originated or keyed, and neither does an officer recording it for them.
    // The hands on the origination are read inside the act's transaction, from the attribution of its `originator` slot (every occurrence).
    const originations = await c.tx.actAttribution.findMany({ where: { organisationId: c.l.org.id, entity: "Variation", entityId: v.id, slot: "originator" }, select: { subjectPersonId: true, recordedByPersonId: true } });
    const conflict = soOriginationFaults({
      decidedFor: so.person.id,
      enteredBy: actor.personId,
      origination: { originatorPersonIds: [v.originatorPersonId, ...originations.map((o) => o.subjectPersonId).filter((x): x is string => x != null)], keyedByPersonIds: originations.map((o) => o.recordedByPersonId) },
    });
    const fs = [...conflict, ...soDecisionFaults({ status: v.status as "SUBMITTED", exemption: v.exemption as VariationExemption | null, decision, cap, estimate: senFromDecimal(v.estimate), note, decidedOn, submittedOn: day(v.submittedOn), today: c.today })];
    if (fs.length) refuse("Not recorded:", fs);
    let to: "SUPPORTED" | "DRAFT" | "CLOSED" = "SUPPORTED";
    let goes: string | null = null;
    if (decision === "NOT_SUPPORTED") {
      const snap = rejectionSnapshot(await loadDestinations(c.tx, c.l.org.id), "vo", dayToDate(c.today), c.now);
      const configured = snap.rejectionKind === "RETURN_TO_ORIGINATOR" || snap.rejectionKind === "TERMINATE" ? (snap.rejectionKind as RejectionKind) : null;
      const kind = configured ?? chosen;
      if (!kind) fieldError("whereTo", "No destination is configured for a variation the S.O. does not support: say where it goes (back to its originator, or it ends).");
      to = kind === "TERMINATE" ? "CLOSED" : "DRAFT";
      goes = `${kind === "TERMINATE" ? "the variation ends" : "back to its originator"} (${configured ? "the configured destination" : `the officer's choice, for ${so.person.name}`})`;
    }
    const moved = await c.tx.variation.updateMany({
      where: { id: v.id, status: "SUBMITTED" },
      data: { soDecision: decision, soDecisionCap: cap == null ? null : money(cap), soDecidedByPersonId: so.person.id, soDecidedOn: dayToDate(decidedOn), soDecisionNote: note, status: to, ...(to === "CLOSED" ? { closedOn: dayToDate(c.today), closedReason: `Not supported by the S.O.: ${note}`, closedByPersonId: so.person.id } : {}) },
    });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "Variation", v.id, vLabel(c, v), "UPDATE", diffFields({ soAnswer: null, stage: "with the S.O. for a decision" }, { soAnswer: SO_DECISION_WORDS[decision].en, supportedUpTo: cap == null ? null : money(cap), decidedBy: `${so.person.name}, ${capacityText(so.capacity, so.soLabel)}`, decidedOn, stage: to === "SUPPORTED" ? "supported: to be sent for approval" : to === "DRAFT" ? "returned to its originator" : "closed", goesTo: goes, recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null }), note);
    await act.write(c.tx, v.id, { roleCode: so.soRoleCode });
    // The decision that ends the variation also closes it: the same person, the same way.
    if (to === "CLOSED") await act.writeAlso(c.tx, "Variation.closedBy", v.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the approvals (FR-VAR-008, 010, 011, 012, 013; FR-PAD-004)

/**
 * Send the variation for one of its approvals, on its own route: the reading (its percentage on the configured basis,
 * over the configured base, the contract value its band is read at) worked out now on the locked rows and frozen with
 * the route. Prior approval also freezes the application's figures, from which the application (VO-660) is opened when
 * it is approved. Both orders guarded: a cumulative reading waits for another variation's value route; a reading over
 * the revised sum waits for an adjustment in progress.
 */
export async function sendVariationForApproval(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const event = r.choice("event", "Which approval", VARIATION_EVENTS, { required: true });
  const keyed = r.money("value", "The amount at agreed rates");
  if (r.failed || !event) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { all, v } = await lockVariation(c, variationId);
    const sender = await personNamed(c, act.subjectPersonId);
    const order = liveOrderRow(v);
    const orderNet = order && order.certificate.status !== "ISSUED" ? orderNetOf(order) : null;
    const facts = factsOf(v);
    const policy = await policyOf(c);
    const others = pendingValueRoutes(all.map(factsOf), v.id);
    const blocking = policy?.variationPctBasis === "CUMULATIVE" && others.length ? (all.find((x) => x.id === others[0].variationId)?.reference ?? "another variation") : null;
    const adj = policy?.variationBase === "REVISED" ? adjustmentInProgress(await loadAdjustments(c.l.contract.id, c.tx)) : null;
    const value = routeValue(facts, event, keyed ? parseSen(keyed) : null, orderNet);
    const fs = sendFaults({ v: facts, event, value, cumulativeBlockedBy: blocking ? `Variation ${blocking}` : null, adjustmentInProgress: adj ? `The adjustment of the contract sum${adj.certificate.number ? ` ${adj.certificate.number}` : ""}` : null, orderNet, applicationTemplateId: await applicationFormNow(c) });
    if (fs.length) refuse("Not sent for approval:", fs);
    const now2 = await readingNow(c, all, v, event, value!);
    if (!now2.r.ok) return refuse("Not sent for approval:", now2.r.faults);
    const reading = now2.r.reading;
    // The route first: its matrix (the override's under a funding override), domain and label are resolved once there.
    const sent = await sendVariationRoute(c, v, { event, value: value!, reading, submittedBy: sender, act });
    if (event === "PRIOR") {
      // The application's figures, frozen now with the route (the application is opened from them on approval), its
      // percentages read on the rows the route was resolved on, the route's own label among them (residual S2).
      const { thisPct, cumPct } = applicationPercents({ rules: sent.rules, domain: sent.domain, value: value!, cumulativeApproved: now2.cumulative, den: BigInt(reading.den), cumulative: reading.cumulative, label: sent.label });
      const s = await loadSupervision(c.l.contract.id, c.tx);
      const progress = [...s.progressRecords].reverse().find((p) => storedDay(p.day) <= c.today) ?? null;
      const snap = applicationFigures({
        computedOn: c.today, reference: v.reference!, original: now2.baseline.values.contractSum, adjustedNet: now2.adjustments.reduce((a, x) => a + x.net, 0n),
        possessionDate: day(s.possession?.possessionOn ?? null), dateForCompletion: now2.baseline.values.dateForCompletion,
        extensions: { en: "None recorded on the contract", ms: "Tiada direkodkan pada kontrak" }, progress: progress ? { pct: progress.actualPct.toString(), on: storedDay(progress.day) } : null,
        description: v.description, reason: v.reason, estimate: senFromDecimal(v.estimate), routedValue: value!,
        soDecision: { en: `${SO_DECISION_WORDS[v.soDecision as "SUPPORTED"].en}${v.soDecisionCap ? `, up to ${formatMoney(senFromDecimal(v.soDecisionCap))}` : ""}`, ms: `${SO_DECISION_WORDS[v.soDecision as "SUPPORTED"].ms}${v.soDecisionCap ? `, sehingga ${formatMoney(senFromDecimal(v.soDecisionCap))}` : ""}` },
        thisPct, cumulative: now2.cumulative, cumulativePct: cumPct, periodImplication: v.periodImplication === true,
        basis: { en: `${BASIS_WORDS[reading.basis].en}, over ${BASE_WORDS[reading.base].en.toLowerCase()} (${policy?.variationProvenance === "STATED" ? "stated" : policy?.variationProvenance === "OBSERVED" ? "observed" : "assumed"})`, ms: `${BASIS_WORDS[reading.basis].ms}, atas ${BASE_WORDS[reading.base].ms.toLowerCase()}` },
      });
      const moved = await c.tx.variation.updateMany({ where: { id: v.id, status: "SUPPORTED" }, data: { applicationReading: snap as unknown as Prisma.InputJsonValue } });
      if (moved.count !== 1) return CHANGED;
    }
    await audit(c, "Variation", v.id, vLabel(c, v), "UPDATE", diffFields({ sentFor: null }, { sentFor: EVENT_WORDS[event].en, value: money(value!), readAs: sent.label.en, readOver: money(BigInt(reading.den)), basis: BASIS_WORDS[reading.basis].en, base: BASE_WORDS[reading.base].en, sentBy: sender.name }));
    return { ok: true };
  });
}

/// A named Person's decision on a person step of the variation's open route (6.1's checks).
export async function decideVariationApprovalStep(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  dayField(r, "decidedOn", "Decided on");
  const receivedOn = dayField(r, "receivedOn", "Received on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn", document: { entity: "Variation", id: variationId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const decidedOn = act.day!;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    await decideVariationStep(c, v, { stepId, decision, act, decidedOn, receivedOn, reason });
    return { ok: true };
  });
}

/// Discharge a committee's step from its decision on a matter tabled from this variation (FR-VAR-010, 013).
export async function citeVariationCommittee(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const stepId = r.text("stepId", "Step", { required: true });
  const decisionId = r.text("committeeDecisionId", "The committee's decision", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    await citeVariationDecision(c, v, stepId, decisionId);
    return { ok: true };
  });
}

/// Where a refused route goes, chosen by the officer where nothing was configured (FR-APR-016, CO-5).
export async function chooseVariationRefusal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const kind = r.choice("kind", "Where it goes", REJECTION_KINDS);
  const seq = r.int("returnToSeq", "Step", { min: 1 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.rejectionChosenBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    await chooseVariationRejection(c, v, { kind: kind ?? null, returnToSeq: seq, personId: act.subjectPersonId, reason, act });
    return { ok: true };
  });
}

/**
 * Table a matter from the variation at a sitting (FR-VAR-009, 010; FR-PAD-004): its open route's committee step (the
 * Variation Orders Committee's mandatory recommendation, a Tender Board's approval), or the funder's consent before
 * the configured committee. Locks the contract's chain, the variation, then the sitting. Only a holder of the
 * committee's Secretariat office on the tabling day tables it: the signed-in person, judged as the actor (FR-CTE-006, Phase 3d).
 */
export async function tableVariationMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const purpose = r.choice("purpose", "What is tabled", ["STEP", "CONSENT"] as const, { required: true });
  const meetingId = r.text("meetingId", "Sitting", { required: true });
  if (r.failed || !purpose) return { ok: false, errors: r.errors };
  // The tabler is the signed-in person: the holder of the committee's Secretariat office, judged below.
  const begun = await beginAct(actor, data, "CommitteeDecision.tabledBy", { personField: "tabledByPersonId" });
  if (!begun.ok) return begun.state;
  const act0 = begun.act;
  const tabledByPersonId = act0.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const roster = await loadRoster(actor.organisationCode, c.tx);
    const s = await lockSittingIn(c.tx, actor, meetingId, roster);
    if (!s) fieldError("meetingId", "That sitting no longer exists.");
    if (v.status !== "SUPPORTED") refuse("Not tabled:", [{ code: "NOT_SUPPORTED_YET", level: "block", data: { status: v.status } }]);
    if (!sittingPermits(s!.meeting.status, "TABLE")) refuse("Not tabled:", [{ code: "SITTING_FROZEN", level: "block" }]);
    // 6.13 Part B run 1a (ADR 0029 §3): the one tabling rule for a matter tabled from its record, with its typed keys.
    const tabledFrom = tablingOf({ kind: "VARIATION", id: v.id, reference: v.reference }, matterFactsOf(v));
    let domain: string;
    let act: "A" | "MR" | "R" | "P" | "JP" | "JR" | "MJR" | "MA";
    let amount: string | null;
    let subject: string;
    if (purpose === "STEP") {
      const open = v.approvals.find((a) => a.approvalInstance.status === "PENDING");
      const step = open?.approvalInstance.steps.find((st) => st.decision === "PENDING" && st.committeeCode === s!.meeting.committee.code) ?? null;
      if (!open || !step) refuse("Not tabled:", [{ code: open ? "OTHER_COMMITTEE" : "NOT_COMMITTEE_STEP", level: "block" }]);
      const inst = open!.approvalInstance;
      const tf = tabledFrom.tableFaults(inst.domain, step!.committeeCode!);
      if (tf.length) refuse("Not tabled:", tf);
      domain = inst.domain;
      act = step!.act as typeof act;
      amount = inst.value?.toString() ?? null;
      subject = `Variation ${v.reference}: ${v.description} (${EVENT_WORDS[open!.event as VariationEvent].en.toLowerCase()}, ${formatMoney(senFromDecimal(inst.value ?? 0))})`;
    } else {
      if (v.funderConsentRequired !== true) refuse("Not tabled:", [{ code: "CONSENT_NOT_REQUIRED", level: "block" }]);
      const policy = await policyOf(c);
      if (!policy?.funderConsentCommitteeId) refuse("Not tabled:", [{ code: "FUNDER_COMMITTEE_NOT_SET", level: "block" }]);
      if (s!.meeting.committeeId !== policy!.funderConsentCommitteeId) refuse("Not tabled:", [{ code: "OTHER_COMMITTEE", level: "block" }]);
      const st = consentOf(v).state;
      if (st === "PENDING" || st === "CARRIED") refuse("Not tabled:", [{ code: "CONSENT_ALREADY", level: "block" }]);
      domain = CONSENT_DOMAIN;
      act = "A";
      amount = null;
      subject = `Variation ${v.reference}: ${v.description} (the funder's consent)`;
    }
    const code = s!.meeting.committee.secretariatRoleCode;
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(s!.roster, code, s!.today).map((h) => h.id), tablingDay: s!.today });
    if (!tabling.ok) return tabling.fault === "NOT_TABLED" || tabling.fault === "NOT_SECRETARIAT_HOLDER" ? { ok: false, errors: { tabledByPersonId: TABLING_FAULT_MESSAGE[tabling.fault] } } : { ok: false, message: `Nothing was saved: ${TABLING_FAULT_MESSAGE[tabling.fault]}` };
    const sequence = s!.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    const row = await c.tx.committeeDecision.create({ data: { meetingId: s!.meeting.id, subject, domain, ...tabledFrom.keys, amount, act, tabledByPersonId, tabledAt: dayToDate(s!.today!), sequence } });
    await audit(c, "CommitteeDecision", row.id, `${vLabel(c, v)} · ${purpose === "STEP" ? "tabled for its approval" : "tabled for the funder's consent"}`, "CREATE", diffFields(null, { matter: subject, sitting: s!.meeting.reference, committee: s!.meeting.committee.nameEn, tabledBy: tabledByPersonId ? (s!.names[tabledByPersonId] ?? null) : null, tabledOn: formatDate(s!.today!) }));
    await act0.write(c.tx, row.id);
    return { ok: true, message: `Tabled at ${s!.meeting.reference}. It is decided there, at the sitting; cite its decision here once it is decided.` };
  }, ["/committees", `/committees/${meetingId}`]);
}

// ------------------------------------------------------------------ commencement and closing (FR-VAR-014)

/// Work commenced pending approval, on the support of the S.O. or a representative in force (FR-VAR-014).
export async function recordCommencement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const on = dayField(r, "commencedOn", "Commenced on", true);
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Variation.commencedSupport", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const person = await personNamed(c, act.subjectPersonId);
    const s = await loadSupervision(c.l.contract.id, c.tx);
    const so = await soOfficeOn(c.l, s, on, c.tx);
    const cap = capacityFor(person.id, { act: "INSTRUCTION" }, so?.office ?? null, delegationFactsOf(s), on);
    // FR-SUP-004 (Phase 3d): the officer who records the support is judged too, whoever it is recorded for.
    const recorderBad = await recorderFaultToday(c.l, s, act.recorderId, { act: "INSTRUCTION" }, on, so?.office ?? null, c.today, c.tx);
    if (recorderBad) refuse("Not recorded:", [recorderBad]);
    const fs = commenceFaults({ v: factsOf(v), on, today: c.today, soDecidedOn: day(v.soDecidedOn), supporterCapable: !!cap.capacity });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.variation.updateMany({ where: { id: v.id, status: "SUPPORTED", commencedOn: null }, data: { commencedOn: dayToDate(on), commencedSupportPersonId: person.id, commencedNote: note } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "Variation", v.id, vLabel(c, v), "UPDATE", diffFields({ commencedPendingApproval: null }, { commencedPendingApproval: on, supportedBy: `${person.name}, ${capacityText(cap.capacity!, so!.office.roleLabel)}`, exposure: money(senFromDecimal(v.estimate)), recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null }), note);
    await act.write(c.tx, v.id);
    return { ok: true };
  });
}

/// Close a variation not yet approved (withdrawn, or ended), with the reason.
export async function closeVariation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const reason = r.text("reason", "Why it is closed", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Variation.closedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const person = await personNamed(c, act.subjectPersonId);
    const fs = closeFaults({ v: factsOf(v), reason });
    if (fs.length) refuse("Not closed:", fs);
    const moved = await c.tx.variation.updateMany({ where: { id: v.id, status: { not: "CLOSED" } }, data: { status: "CLOSED", closedOn: dayToDate(c.today), closedReason: reason.trim(), closedByPersonId: person.id } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "Variation", v.id, vLabel(c, v), "UPDATE", diffFields({ stage: v.status === "DRAFT" ? "draft" : "open" }, { stage: "closed", closedOn: c.today, recordedFor: person.name }), reason.trim());
    await act.write(c.tx, v.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the instruction (FR-VAR-007, 009, 015, 016)

/**
 * Raise the S.O.'s instruction (FR-VAR-015): never before the variation's approval (or its exemption) and the funder's
 * consent where it needs one; its description the heading every item is measured under; its schedule form by the
 * configured rule (OD-A5). Opened as a certificate on its form; dated by the S.O.'s signature on the core's page. Where
 * it was first given orally, the confirmation clock is frozen from the oral day now (FR-VAR-016).
 */
export async function raiseInstruction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const description = r.text("instructionDescription", "The instruction's description", { required: true, max: 2000 });
  const oralIssuedOn = dayField(r, "oralIssuedOn", "Given orally on");
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "VariationInstruction.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const who = await recordedFor(c, act, { act: "INSTRUCTION" }, c.today);
    const policy = await policyOf(c);
    const form = scheduleFormOf(v.agreedRateExists, { withAgreedRate: policy?.scheduleFormAgreedRate ?? null, withoutAgreedRate: policy?.scheduleFormNoAgreedRate ?? null });
    const fs = instructionFaults({ v: factsOf(v), funderConsentRequired: v.funderConsentRequired, consent: consentOf(v).state, agreedRateExists: v.agreedRateExists, scheduleForm: form, description, oralIssuedOn, today: c.today });
    if (fs.length) refuse("Not raised:", fs);
    const kind = await formOf(c, "SO_INSTRUCTION");
    const prior = [...v.approvals].reverse().find((a) => a.event === "PRIOR" && a.approvalInstance.status === "APPROVED") ?? null;
    const text = (key: string, en: string, ms: string, value: string, valueMs?: string) => ({ key, labelEn: en, labelMs: ms, type: "TEXT" as const, value, ...(valueMs !== undefined ? { valueMs } : {}), overridable: false });
    const snap = {
      version: 1 as const,
      computedOn: c.today,
      rule: { en: "The S.O.'s instruction to carry out the variation", ms: "Arahan P.P. untuk melaksanakan perubahan kerja" },
      lines: [
        text("reference", "Variation number", "Nombor perubahan kerja", v.reference!),
        text("description", "Description (the heading every item is measured under)", "Keterangan (tajuk setiap butiran diukur)", description),
        text("scheduleForm", "Schedule form", "Borang jadual", SCHEDULE_FORM_WORDS[form!].en, SCHEDULE_FORM_WORDS[form!].ms),
        v.exemption ? text("approval", "Approval", "Kelulusan", `Exempt from prior approval: ${EXEMPTION_WORDS[v.exemption as VariationExemption].en.toLowerCase()}`, `Dikecualikan daripada kelulusan terdahulu: ${EXEMPTION_WORDS[v.exemption as VariationExemption].ms.toLowerCase()}`) : text("approval", "Approval", "Kelulusan", `Approved on ${prior ? formatDate(day(prior.approvalInstance.closedAt)) : "its route"} under ${prior?.approvalInstance.ruleLabel ?? "the matrix"}`, `Diluluskan di bawah ${prior?.approvalInstance.ruleLabel ?? "matriks"}`),
        ...(oralIssuedOn ? [{ key: "oralIssuedOn", labelEn: "First given orally on", labelMs: "Mula diberi secara lisan pada", type: "DATE" as const, value: oralIssuedOn, overridable: false }] : []),
      ],
      totals: [],
      routingRatio: null,
    };
    // It goes by no approval route (BY_ROUTING_TYPE with none), so never on a routing sheet.
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "SO_INSTRUCTION", templateId: kind.templateId, routingTypeId: null, sectionId: null, computed: snap }, c.now, c.today);
    const clock = await clockOf(c, "ORAL_CONFIRM");
    const row = await c.tx.variationInstruction.create({ data: { organisationId: c.l.org.id, variationId: v.id, certificateId: certId, description, scheduleForm: form!, oralIssuedOn: oralIssuedOn ? dayToDate(oralIssuedOn) : null, confirmDueOn: oralIssuedOn && clock ? dayToDate(dueOn(oralIssuedOn, clock)!) : null, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "VariationInstruction", row.id, `${vLabel(c, v)} · the S.O.'s instruction`, "CREATE", diffFields(null, { description, scheduleForm: SCHEDULE_FORM_WORDS[form!].en, givenOrallyOn: oralIssuedOn, confirmationDue: oralIssuedOn ? (clock ? dueOn(oralIssuedOn, clock) : "clock not set (advisory)") : null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// The oral loop (FR-VAR-016): the contractor's written confirmation and whether it matches; an objection where not.
export async function recordOralLoop(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const confirmedOn = dayField(r, "contractorConfirmedOn", "Confirmation received on");
  const matches = tri(r.optionalText("confirmationMatches"));
  const objectedOn = dayField(r, "objectedOn", "Objected on");
  const objectionNote = r.text("objectionNote", "The objection", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const ins = liveInstructionRow(v);
    if (!ins) return refuse("Not recorded:", [{ code: "INSTRUCTION_NOT_ISSUED", level: "block" }]);
    const fs = oralLoopFaults({ issuedOn: day(ins.certificate.certificateDate), oralIssuedOn: day(ins.oralIssuedOn), contractorConfirmedOn: confirmedOn, confirmationMatches: matches, objectedOn, objectionNote, today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    // The objection clock, frozen from the confirmation's receipt the first time it is recorded.
    const clock = confirmedOn && !ins.objectionDueOn ? await clockOf(c, "ORAL_OBJECTION") : null;
    const objectionDue = ins.objectionDueOn ? day(ins.objectionDueOn) : confirmedOn && clock ? dueOn(confirmedOn, clock) : null;
    await c.tx.variationInstruction.update({ where: { id: ins.id, organisationId: actor.organisationId }, data: { contractorConfirmedOn: confirmedOn ? dayToDate(confirmedOn) : null, confirmationMatches: matches, objectedOn: objectedOn ? dayToDate(objectedOn) : null, objectionNote, objectionDueOn: objectionDue ? dayToDate(objectionDue) : null } });
    await audit(c, "VariationInstruction", ins.id, `${vLabel(c, v)} · the S.O.'s instruction`, "UPDATE", diffFields({ confirmationReceivedOn: day(ins.contractorConfirmedOn), confirmationMatches: ins.confirmationMatches == null ? null : yesNo(ins.confirmationMatches), objectedOn: day(ins.objectedOn) }, { confirmationReceivedOn: confirmedOn, confirmationMatches: matches == null ? null : yesNo(matches), objectionDue, objectedOn }), objectionNote);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ measurement and daywork (FR-VAR-017, 018, 019)

/// Measure one item under the instruction (FR-VAR-017, 018): its amount worked out, rounded once.
export async function addMeasurement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const heading = String(data.get("heading") ?? "");
  const itemRef = r.text("itemRef", "Item reference", { required: true, max: 60 });
  const description = r.text("description", "Item", { required: true, max: 400 });
  const rateSource = r.choice("rateSource", "Where the rate comes from", RATE_SOURCES, { required: true });
  const bqItemRef = r.text("bqItemRef", "Contract item", { max: 60 });
  const qtyRaw = r.text("quantity", "Quantity", { required: true, max: 30 });
  const unit = r.text("unit", "Unit", { required: true, max: 30 });
  const rate = r.money("baseRate", "Rate", { required: true });
  const adjRaw = r.optionalText("adjustmentPct");
  const direction = r.choice("direction", "Addition or omission", ADJUSTMENT_DIRECTIONS, { required: true });
  const measuredOn = dayField(r, "measuredOn", "Measured on", true);
  const coveredUp = tri(r.optionalText("coveredUp"));
  const recordsNote = r.text("recordsNote", "Detailed records", { max: 2000 });
  let quantity: bigint | null = null;
  try {
    quantity = qtyRaw ? parseQuantity(qtyRaw.replace(/,/g, "")) : null;
  } catch {
    r.reject("quantity", "A quantity above nothing, to at most three places.");
  }
  let adj: bigint | null = null;
  try {
    adj = adjRaw?.trim() ? parseSignedPercent(adjRaw.replace(/%$/, "")) : null;
  } catch {
    r.reject("adjustmentPct", "A percentage, to at most four places (a reduction with a minus).");
  }
  if (r.failed || !rateSource || !direction || !measuredOn || !rate) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "VariationMeasurement.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const who = await recordedFor(c, act, { act: "VALUATION" }, measuredOn);
    const ins = liveInstructionRow(v);
    const fs = measurementFaults({
      instruction: { description: ins?.description ?? "", issued: ins?.certificate.status === "ISSUED" },
      orderLive: !!liveOrderRow(v), heading, itemRef, measuredRefs: ins ? standingMeasurements(v, ins.id).map((m) => m.itemRef) : [],
      rateSource, bqItemRef, agreedRateApproved: v.approvals.some((a) => a.event === "AGREED_RATE" && a.approvalInstance.status === "APPROVED"),
      quantity, baseRate: parseSen(rate), adjustmentTt: adj, coveredUp, recordsNote, measuredOn, today: c.today,
    });
    if (fs.length) refuse("Not recorded:", fs);
    const amount = measuredAmount(quantity!, parseSen(rate), adj);
    const qty = `${quantity! / 1000n}.${String(quantity! % 1000n).padStart(3, "0")}`;
    const adjText = adj == null ? null : `${adj < 0n ? "-" : ""}${(adj < 0n ? -adj : adj) / 10_000n}.${String((adj < 0n ? -adj : adj) % 10_000n).padStart(4, "0")}`;
    const row = await c.tx.variationMeasurement.create({ data: { organisationId: c.l.org.id, variationId: v.id, instructionId: ins!.id, heading, itemRef: itemRef.trim(), description, rateSource, bqItemRef: bqItemRef.trim(), quantity: qty, unit, baseRate: rate, adjustmentPct: adjText, amount: money(amount), direction, measuredOn: dayToDate(measuredOn), coveredUp: coveredUp!, recordsNote, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "VariationMeasurement", row.id, `${vLabel(c, v)} · item ${itemRef.trim()}`, "CREATE", diffFields(null, { item: `${itemRef.trim()}: ${description}`, rateFrom: `${RATE_SOURCE_WORDS[rateSource].en}${bqItemRef.trim() ? ` (${bqItemRef.trim()})` : ""}`, quantity: `${qty} ${unit}`, rate, adjustment: adjText ? `${adjText}%` : null, amount: money(amount), addsOrOmits: DIRECTION_WORDS[direction].en, measuredOn, coveredUp: yesNo(coveredUp), records: recordsNote || null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// Remove a measured item while no order is raised from the instruction, with the reason (kept, marked removed).
export async function removeMeasurement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const measurementId = r.text("measurementId", "Item", { required: true });
  const reason = r.text("removedReason", "Why it is removed", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const m = v.measurements.find((x) => x.id === measurementId);
    if (!m) return { ok: false, message: "That item is not on this variation." };
    const fs = removeMeasurementFaults({ orderLive: !!liveOrderRow(v), removed: !!m.removedAt, reason });
    if (fs.length) refuse("Not removed:", fs);
    const moved = await c.tx.variationMeasurement.updateMany({ where: { id: m.id, removedAt: null }, data: { removedAt: c.now, removedReason: reason.trim() } });
    if (moved.count !== 1) return CHANGED;
    await audit(c, "VariationMeasurement", m.id, `${vLabel(c, v)} · item ${m.itemRef}`, "UPDATE", diffFields({ standing: "yes" }, { standing: "no, removed" }), reason.trim());
    return { ok: true };
  });
}

/// A daywork record (FR-VAR-019): the day worked, its agreement with the contractor, its substantiation (its clock frozen now).
export async function recordDaywork(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const dayworkId = r.optionalText("dayworkId");
  const workedOn = dayField(r, "workedOn", "Worked on", true);
  const description = r.text("description", "Labour and plant", { required: true, max: 2000 });
  const agreedOn = dayField(r, "agreedOn", "Checked and agreed on");
  const agreedWith = r.text("agreedWith", "Agreed with, for the contractor", { max: 200 });
  const receivedOn = dayField(r, "substantiationReceivedOn", "Substantiation received on");
  if (r.failed || !workedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DayworkRecord.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { v } = await lockVariation(c, variationId);
    const who = await recordedFor(c, act, { act: "VALUATION" }, c.today);
    const fs = dayworkFaults({ workedOn, agreedOn, agreedWith, receivedOn, description, today: c.today, instructed: v.instructions.some((i) => i.certificate.status === "ISSUED") });
    if (fs.length) refuse("Not recorded:", fs);
    const existing = dayworkId ? v.dayworkRecords.find((d) => d.id === dayworkId) : null;
    if (dayworkId && !existing) return { ok: false, message: "That daywork record is not on this variation." };
    if (existing) {
      if (storedDay(existing.workedOn) !== workedOn) fieldError("workedOn", "The day worked is not changed: record another day as its own record.");
      await c.tx.dayworkRecord.update({ where: { id: existing.id, organisationId: actor.organisationId }, data: { description, agreedOn: agreedOn ? dayToDate(agreedOn) : null, agreedWith, substantiationReceivedOn: receivedOn ? dayToDate(receivedOn) : null } });
      await audit(c, "DayworkRecord", existing.id, `${vLabel(c, v)} · daywork of ${workedOn}`, "UPDATE", diffFields({ description: existing.description, agreedOn: day(existing.agreedOn), agreedWith: existing.agreedWith || null, substantiationReceivedOn: day(existing.substantiationReceivedOn) }, { description, agreedOn, agreedWith: agreedWith || null, substantiationReceivedOn: receivedOn }));
      return { ok: true };
    }
    const clock = await clockOf(c, "DAYWORK_SUBSTANTIATION");
    const due = dueOn(workedOn, clock);
    const row = await c.tx.dayworkRecord.create({ data: { organisationId: c.l.org.id, variationId: v.id, workedOn: dayToDate(workedOn), description, agreedOn: agreedOn ? dayToDate(agreedOn) : null, agreedWith, substantiationDueOn: due ? dayToDate(due) : null, substantiationReceivedOn: receivedOn ? dayToDate(receivedOn) : null, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "DayworkRecord", row.id, `${vLabel(c, v)} · daywork of ${workedOn}`, "CREATE", diffFields(null, { workedOn, labourAndPlant: description, agreedOn, agreedWith: agreedWith || null, substantiationDue: due ?? "clock not set (advisory)", substantiationReceivedOn: receivedOn, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the Variation Order Certificate (FR-VAR-020–024)

/**
 * Raise the Variation Order Certificate from the measured items (FR-VAR-020): its description the instruction's, word
 * for word; under the valuation clause chosen; its figures worked out and frozen with what it rests on. It is signed
 * on the core's page once its value is covered by the variation's approved routes (an increase, agreed rates or a
 * re-measurement each sent from here first where it needs one).
 */
export async function raiseVariationOrder(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const variationId = r.text("variationId", "Variation", { required: true });
  const description = String(data.get("orderDescription") ?? "");
  const clauseId = r.optionalText("valuationClauseId");
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "VariationCertificate.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "VARIATION", async (c) => {
    const { all, v } = await lockVariation(c, variationId);
    const who = await recordedFor(c, act, { act: "VALUATION" }, c.today);
    const ins = liveInstructionRow(v);
    const clause = clauseId ? await c.tx.clauseText.findFirst({ where: { id: clauseId, organisationId: c.l.org.id }, select: { id: true, titleEn: true } }) : null;
    const lines = ins ? standingMeasurements(v, ins.id) : [];
    const fs = orderFaults({ v: factsOf(v), instructionIssued: ins?.certificate.status === "ISSUED", orderLive: !!liveOrderRow(v), lines: lines.length, description, instructionDescription: ins?.description ?? "", clauseChosen: !!clause });
    if (fs.length) refuse("Not raised:", fs);
    const kind = await formOf(c, "VARIATION");
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) return refuse("Not raised:", [{ code: "NO_BASELINE", level: "block" }]);
    const facts = all.map(factsOf);
    const self = facts.find((x) => x.id === v.id)!;
    const cumulative = cumulativeApproved(facts, null);
    // Acceptance S-5: labelled on the bands of its own approved prior-approval route as frozen with it (a funding
    // override's included); exempt or unrouted, on the issued matrix's variation bands; the certificate says which.
    const m = await matrixToday(c);
    const prior = [...v.approvals].filter((a) => a.event === "PRIOR" && a.approvalInstance.status === "APPROVED").at(-1) ?? null;
    const bands = orderBands({
      prior: prior ? { edges: (prior.reading as Reading | null)?.edges, matrixLabel: prior.approvalInstance.matrixLabel, overrideLabel: prior.approvalInstance.fundingOverrideApplied ? prior.approvalInstance.overrideMatrixLabel : null } : null,
      exempt: v.exemption != null,
      issuedRules: m?.issue.matrix.rules ?? [],
      issuedLabel: m?.issue.label ?? null,
    });
    const edges = bands.edges;
    const policy = await policyOf(c);
    const adjustments = issuedAdjustments(await loadAdjustments(c.l.contract.id, c.tx));
    const den = policy?.variationBase === "REVISED" ? adjustments.reduce((a, x) => a + x.net, baseline.values.contractSum) : baseline.values.contractSum;
    const cumPct = den > 0n ? percentLabelText(percentLabel({ num: cumulative, den }, edges)) : { en: "Not read: the contract sum is nothing", ms: "Tidak dibaca" };
    const linesIn = lines.map((x) => ({ itemRef: x.itemRef, description: x.description, particulars: `${decimalText(x.quantity)} ${x.unit} at ${formatMoney(senFromDecimal(x.baseRate))}${x.adjustmentPct ? `, adjusted ${decimalText(x.adjustmentPct)}%` : ""}${x.rateSource === "AGREED_RATE" ? " (agreed rate)" : x.bqItemRef ? ` (${x.bqItemRef})` : ""}`, amount: senFromDecimal(x.amount), direction: x.direction as "ADDITION" | "OMISSION" }));
    const o = orderFigures({ computedOn: c.today, original: baseline.values.contractSum, reference: v.reference!, instruction: { number: ins!.certificate.number ?? "", date: day(ins!.certificate.certificateDate) }, description, clauseTitle: clause!.titleEn, exemption: v.exemption ? EXEMPTION_WORDS[v.exemption as VariationExemption] : null, lines: linesIn, approved: approvedValue(self), cumulative, cumulativePct: cumPct, cumulativeBands: bands.words });
    const agreedRateTotal = lines.filter((x) => x.rateSource === "AGREED_RATE").reduce((a, x) => a + (x.direction === "ADDITION" ? senFromDecimal(x.amount) : 0n), 0n);
    // Approved on the variation's own routes (its approval of record), so never on a routing sheet.
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "VARIATION", templateId: kind.templateId, routingTypeId: null, sectionId: null, computed: o.snapshot }, c.now, c.today);
    const judged = { version: 1, measurementIds: lines.map((x) => x.id), approved: approvedValue(self).toString(), cumulative: cumulative.toString(), net: o.totals.net.toString(), agreedRateTotal: agreedRateTotal.toString(), instructionId: ins!.id };
    const row = await c.tx.variationCertificate.create({ data: { organisationId: c.l.org.id, variationId: v.id, instructionId: ins!.id, certificateId: certId, description, direction: o.totals.direction, valuationClauseId: clause!.id, valuationClauseTitle: clause!.titleEn, judgedUnder: judged as Prisma.InputJsonValue, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "VariationCertificate", row.id, `${vLabel(c, v)} · Variation Order Certificate`, "CREATE", diffFields(null, { measuredAdditions: money(o.totals.additions), measuredOmissions: money(o.totals.omissions), netValue: money(o.totals.net), addsOrOmits: DIRECTION_WORDS[o.totals.direction].en, approvedValue: money(approvedValue(self)), valuedUnder: clause!.titleEn, items: lines.length, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the adjustment of the contract sum (FR-PAD-001–007)

const OTHER_LINES = 3;

/**
 * Raise the Certificate of Adjustment of Contract Sum (FR-PAD-001–003, 005): the issued Variation Order Certificates
 * chosen (1.1), and up to three other adjustments by their trigger with the basis of each calculation (1.2), each
 * trigger one the contract's type provides for; the revised sum from the original plus the issued adjustments before
 * it. One in progress at a time. It routes on the configured gap rule from its own page (FR-PAD-006).
 */
export async function raiseSumAdjustment(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  // The tokens field rides out as one newline-joined value (the shared Select).
  const orderIds = [...new Set(data.getAll("orderIds").flatMap((v) => String(v).split("\n")).map((v) => v.trim()).filter(Boolean))];
  const others: AdjustmentLineIn[] = [];
  for (let n = 1; n <= OTHER_LINES; n++) {
    const amountRaw = r.money(`other${n}Amount`, `Line ${n}: amount`);
    if (!amountRaw) continue;
    const trigger = r.choice(`other${n}Trigger`, `Line ${n}: trigger`, ADJUSTMENT_TRIGGERS.filter((t) => t !== "VARIATION") as AdjustmentTrigger[], { required: true });
    const direction = r.choice(`other${n}Direction`, `Line ${n}: addition or omission`, ADJUSTMENT_DIRECTIONS, { required: true });
    const reference = r.text(`other${n}Reference`, `Line ${n}: reference`, { required: true, max: 60 });
    const description = r.text(`other${n}Description`, `Line ${n}: description`, { required: true, max: 400 });
    const basis = r.text(`other${n}Basis`, `Line ${n}: basis of calculation`, { required: true, max: 4000 });
    if (trigger && direction) others.push({ section: "OTHER", trigger, reference, description, direction, amount: parseSen(amountRaw), basis, orderId: null });
  }
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "SumAdjustment.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "SUM_ADJUSTMENT", async (c) => {
    // The contract's lock serialises every act on its variations and certificates (each takes it first): the orders
    // chosen are read on the locked transaction.
    const who = await recordedFor(c, act, { act: "VALUATION" }, c.today);
    const all = await loadVariations(c.l.contract.id, c.tx);
    const rows = await loadAdjustments(c.l.contract.id, c.tx);
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) return refuse("Not raised:", [{ code: "NO_BASELINE", level: "block" }]);
    const type = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { sumAdjustmentTriggers: true } }) : null;
    const orders = all.flatMap((v) => v.orders.map((o) => ({ v, o })));
    const lines: AdjustmentLineIn[] = [
      ...orderIds.map((id) => {
        const x = orders.find((y) => y.o.id === id);
        const net = x ? orderNetOf(x.o) : 0n;
        return { section: "VARIATION" as const, trigger: "VARIATION" as const, reference: x?.v.reference ?? "?", description: x?.o.description ?? "", direction: (net < 0n ? "OMISSION" : "ADDITION") as "ADDITION" | "OMISSION", amount: net < 0n ? -net : net, basis: "", orderId: x ? id : `missing:${id}` };
      }),
      ...others,
    ];
    const issued = issuedAdjustments(rows);
    const inProg = adjustmentInProgress(rows);
    const fs = adjustmentFaults({ triggers: (type?.sumAdjustmentTriggers ?? []) as AdjustmentTrigger[], lines, ordersAdjusted: ordersAdjusted(rows), ordersIssued: orders.filter((x) => x.o.certificate.status === "ISSUED").map((x) => x.o.id), inProgress: inProg ? `The adjustment${inProg.certificate.number ? ` ${inProg.certificate.number}` : ""}` : null, original: baseline.values.contractSum, prior: issued.map((a) => a.net) });
    if (fs.length) refuse("Not raised:", fs);
    const kind = await formOf(c, "SUM_ADJUSTMENT");
    const { snapshot, figures } = adjustmentSnapshot(c.today, baseline.values.contractSum, issued.map((a) => a.net), lines);
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "SUM_ADJUSTMENT", templateId: kind.templateId, routingTypeId: kind.routingTypeId, sectionId: null, computed: snapshot }, c.now, c.today);
    const row = await c.tx.sumAdjustment.create({
      data: {
        organisationId: c.l.org.id, contractId: c.l.contract.id, certificateId: certId, personId: who.person.id, recordedAt: c.now,
        judgedUnder: { version: 1, priorRead: issued.map((a) => a.id), triggers: type?.sumAdjustmentTriggers ?? [] } as Prisma.InputJsonValue,
        lines: { create: lines.map((l, n) => ({ section: l.section, trigger: l.trigger, variationCertificateId: l.section === "VARIATION" ? l.orderId : null, reference: l.reference, description: l.description, direction: l.direction, amount: money(l.amount), basis: l.basis, sortOrder: n + 1 })) },
      },
    });
    await audit(c, "SumAdjustment", row.id, `${c.label} · adjustment of the contract sum`, "CREATE", diffFields(null, {
      variations: lines.filter((l) => l.section === "VARIATION").map((l) => `${l.reference} (${DIRECTION_WORDS[l.direction].en.toLowerCase()} ${money(l.amount)})`).join("; ") || null,
      otherAdjustments: lines.filter((l) => l.section === "OTHER").map((l) => `${l.reference}: ${TRIGGER_WORDS[l.trigger].en.toLowerCase()}, ${DIRECTION_WORDS[l.direction].en.toLowerCase()} ${money(l.amount)}`).join("; ") || null,
      nettAdjustment: money(figures.net13),
      earlierAdjustments: money(figures.prior),
      revisedContractSum: money(figures.revised),
      recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`,
    }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}
