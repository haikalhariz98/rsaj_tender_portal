"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { Tx } from "@/lib/audit/record";
import { loadIssue } from "@/lib/authority/load";
import { toSecond } from "@/lib/bids/lateness";
import { openCertificate } from "@/lib/certificate/write";
import { CertificateRefusal } from "@/lib/certificate/write";
import { changedFields, derive, latestVersion } from "@/lib/contract/baseline";
import { baselineRows, contractGate, frozenInputsOf, liveOf, rowOf, sectionRows, valuesOf } from "@/lib/contract/load";
import { contractLabel, withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import { contractTransition, isExecuted } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { amountOf, parseSen, senToDecimalString } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { parsePercent } from "@/lib/securities/money";
import { capacityFor, capacityText, type ActNeed, type Capacity } from "@/lib/supervision/authority";
import { delegationFaults, latestActDay, revokeFaults } from "@/lib/supervision/delegation";
import { attestFaults, disputeFaults, endorseFaults, entryFaults } from "@/lib/supervision/diary";
import { ACT_WORDS, AREA_WORDS, BRANCH_WORDS, CAUSE_WORDS, DELEGATE_KIND_WORDS, ENDORSER_WORDS, PARTY_KIND_WORDS, PROGRAMME_DECISION_WORDS, PROGRAMME_KIND_WORDS, RECORDS_SET_WORDS, supervisionRefusal, VARIANT_WORDS } from "@/lib/supervision/labels";
import { actsByPerson, delayOn, delegationFactsOf, loadPostAwardPolicy, loadSupervision, methodKeyOf, revisionsOf, soOfficeOn, type SupervisionRows } from "@/lib/supervision/load";
import { possessionFaults, startRuleReading } from "@/lib/supervision/possession";
import { decideFaults, openRevision, pointFaults, scrutinyFaults, submitFaults, type PointIn } from "@/lib/supervision/programme";
import { earlyActionFaults, handoverFaults, meetingFaults, onSiteFaults, partyFaults, progressFaults, retirePartyFaults, selfHelpFaults } from "@/lib/supervision/records";
import { resolveActFaults, resolveSo, soFaults } from "@/lib/supervision/so";
import { COMPLIANCE_AREAS, CONTRACT_PARTY_KINDS, DELEGATE_KINDS, DIARY_ENDORSERS, DIRECTION_CAUSES, EARLY_ACTION_BRANCHES, PROGRAMME_DECISIONS, PROGRAMME_KINDS, SITE_RECORDS_SETS, SUPERVISION_ACTS, type DelegationVariant, type Finding } from "@/lib/supervision/types";
import { FormReader } from "@/lib/validate";

/**
 * Supervising the contract (6.13 Part A, 4b, FR-SUP-001–015, B1).
 *
 * Every act is reachable by a direct POST, so each reads the server's clock once on entry (truncated to the
 * second), then locks the requisition, the exercise, the award and the contract in the canonical order
 * (`withLockedContract`), then any domain row it changes, re-reads the contract's supervision on the locked
 * transaction, re-runs the pure rule, writes, and audits in the same transaction. A refusal throws, so nothing is
 * half-written. Nobody is signed in: each act records the Person the officer names, "recorded on behalf of, not
 * signed", and judges whether that Person may be recorded for it (the S.O., or a representative in scope). A
 * cancelled contract refuses every act. The organisation's day is the act's day; with no time zone, nothing is
 * recorded (never UTC's day).
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const CHANGED: FormState = { ok: false, message: "The contract changed while this was being saved. Reload and try again." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: it is kept as it was." };
const ON_BEHALF = "recorded on behalf of, not signed";

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

interface Ctx {
  tx: Tx;
  l: LoadedContract;
  /// The server's instant, read once on entry, to the second.
  now: Date;
  /// The organisation's day of that instant.
  today: string;
  label: string;
}

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inContract(id: string, now: Date, fn: (c: Ctx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(id, async (tx, l) => {
      if (l.contract.status === "CANCELLED") return CANCELLED;
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      return fn({ tx, l, now, today, label: contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } }) });
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message };
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
  }
  return result ?? GONE;
}

async function audit(c: Ctx, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(c.tx, { organisationId: c.l.org.id, entity, entityId, entityLabel: `${c.label} · ${suffix}`, reason }, action, changes);
}

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new Refusal({ ok: false, message: supervisionRefusal(lead, fs) });
};
const idOf = (data: FormData) => String(data.get("id") ?? "");
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const linesOf = (raw: string) => raw.split("\n").map((x) => x.trim()).filter(Boolean);

async function personOf(c: Ctx, id: string | null) {
  if (!id) return null;
  return c.tx.person.findFirst({ where: { id, organisationId: c.l.org.id }, select: { id: true, name: true, isActive: true } });
}

/// The contract's supervision, read on the locked transaction.
const supervisionOf = (c: Ctx) => loadSupervision(c.l.contract.id, c.tx);

/// The Person the officer names, and the capacity they may be recorded in for the act on the day; refused otherwise.
async function recordedFor(c: Ctx, s: SupervisionRows, personId: string | null, need: ActNeed, on: string): Promise<{ person: { id: string; name: string }; capacity: Capacity; soLabel: string }> {
  const person = await personOf(c, personId);
  if (!person || !person.isActive) throw new Refusal({ ok: false, errors: { personId: "Choose someone on record and active." } });
  const so = await soOfficeOn(c.l, s, on, c.tx);
  const r = capacityFor(person.id, need, so?.office ?? null, delegationFactsOf(s), on);
  if (!r.capacity) refuse("Not recorded:", r.faults);
  return { person, capacity: r.capacity!, soLabel: so!.office.roleLabel };
}

/// The baseline version in force today, its values (the latest recorded version).
function latestValues(c: Ctx) {
  const { versions } = baselineRows(c.l.contract);
  const latest = latestVersion(versions);
  return latest ? { row: latest, values: valuesOf(latest) } : null;
}

// ------------------------------------------------------------------ the S.O. (FR-SUP-001)

/**
 * Resolve the S.O. of a contract executed before supervision was recorded (the signature resolves it since): the
 * office the matrix in force today gives at the contract's value and regime, effective from today.
 */
export async function resolveSuperintendingOfficer(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const reason = r.text("reason", "Why it is recorded now", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const k = c.l.contract;
    const s = await supervisionOf(c);
    const fs = resolveActFaults({ executed: isExecuted(k.status as ContractStatus), assignments: s.soAssignments.length, reason });
    if (fs.length) refuse("Not resolved:", fs);
    // Review 1: from the Contract Date, on the matrix in force that day, so no day of the contract is without an S.O.
    const from = day(k.contractDate)!;
    const issue = await loadIssue(ORGANISATION_CODE, dayToDate(from), undefined, null, c.tx);
    if (!issue) return { ok: false, message: `No approval matrix was in force on the Contract Date (${formatDate(from)}): the S.O. is resolved from it. Issue one under Configuration › Approval matrix.` };
    const latest = latestValues(c);
    const value = latest ? amountOf(senToDecimalString(latest.values.contractSum)) : amountOf(k.contractSum);
    const res = resolveSo(issue.matrix, { contractValue: value, method: await methodKeyOf(c.l, c.tx), contractTypeCode: c.l.ex.contractTypeCode });
    if (res.state !== "RESOLVED") return refuse("Not resolved:", soFaults(res, issue.label));
    const valueText = senToDecimalString(parseSen(String(value.toFixed(2))));
    const row = await c.tx.contractSoAssignment.create({
      data: { organisationId: c.l.org.id, contractId: k.id, roleCode: res.roleCode, roleLabel: res.roleLabel, reason: "RESOLVED", matrixLabel: issue.label, ruleKey: res.ruleKey, ruleLabel: res.ruleLabel, clause: res.clause, contractValue: valueText, regime: c.l.ex.regime, warnings: res.notes.map((n) => n.messageEn) as Prisma.InputJsonValue, effectiveOn: dayToDate(from), recordedAt: c.now },
    });
    await audit(c, "ContractSoAssignment", row.id, "Superintending Officer resolved", "CREATE", diffFields(null, { office: res.roleLabel, resolvedFrom: `${issue.label}: ${res.ruleLabel} (${res.clause})`, contractValue: valueText, effectiveOn: from, effectiveFromTheContractDate: "yes", recordedOn: c.today, assumption: res.notes.map((n) => n.messageEn).join(" ") || null }), reason.trim());
    return { ok: true };
  });
}

// ------------------------------------------------------------------ delegation (FR-SUP-002–004)

/// The delegation letter pair's forms for a variant, as the post-award policy sets them.
const formsFor = (p: Awaited<ReturnType<typeof loadPostAwardPolicy>>, v: DelegationVariant | null) =>
  !p || !v ? { letter: null, notice: null } : v === "CONVENTIONAL" ? { letter: p.delegationLetterConventionalId, notice: p.delegationNoticeConventionalId } : { letter: p.delegationLetterDesignBuildId, notice: p.delegationNoticeDesignBuildId };

/**
 * The S.O. delegates to a representative: the competency confirmation, the delegate's type and scope, and the
 * letter pair of the contract type's variant, opened as two certificates (DELEGATION_LETTER and
 * DELEGATION_NOTICE) through the 6.14 core in this transaction. The delegation holds from the letter's date.
 */
export async function recordDelegation(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("kind", "Type of representative", DELEGATE_KINDS, { required: true });
  const grantorId = r.text("grantorPersonId", "Delegated by (the S.O.)", { required: true });
  const delegateId = r.text("delegatePersonId", "Representative", { required: true });
  const competencyNote = r.text("competencyNote", "On what the S.O.'s satisfaction rests", { max: 2000 });
  const competencyConfirmed = r.bool("competencyConfirmed");
  const scope = linesOf(String(data.get("scope") ?? "")).filter((x): x is (typeof SUPERVISION_ACTS)[number] => (SUPERVISION_ACTS as readonly string[]).includes(x));
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const so = await soOfficeOn(c.l, s, c.today, c.tx);
    const delegate = await personOf(c, delegateId);
    const type = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { nameEn: true, delegationVariant: true } }) : null;
    const variant = (type?.delegationVariant ?? null) as DelegationVariant | null;
    const forms = formsFor(await loadPostAwardPolicy(c.l.org.id, c.tx), variant);
    const fs = delegationFaults({ kind, grantorId, delegate, competencyConfirmed, competencyNote, scope }, { so: so?.office ?? null, delegations: delegationFactsOf(s), today: c.today, variant, typeName: type?.nameEn ?? null, forms });
    if (fs.length) refuse("Not delegated:", fs);
    const grantor = (await personOf(c, grantorId))!;
    // FR-SUP-003: the letter pair, through the certificate core, in this transaction (Contract → Certificate → the delegation).
    const letterId = await openCertificate(c.tx, c.l, { kind: "DELEGATION_LETTER", templateId: forms.letter, routingTypeId: null, sectionId: null, computed: null }, c.now, c.today);
    const noticeId = await openCertificate(c.tx, c.l, { kind: "DELEGATION_NOTICE", templateId: forms.notice, routingTypeId: null, sectionId: null, computed: null }, c.now, c.today);
    const row = await c.tx.soDelegation.create({
      data: { organisationId: c.l.org.id, contractId: c.l.contract.id, assignmentId: so!.assignment.id, kind, delegatePersonId: delegate!.id, delegateName: delegate!.name, grantorPersonId: grantor.id, grantorName: grantor.name, competencyConfirmed: true, competencyNote: competencyNote.trim(), variant: variant!, letterCertificateId: letterId, noticeCertificateId: noticeId, recordedAt: c.now, recordedOn: dayToDate(c.today) },
    });
    for (const act of scope) await c.tx.soDelegationScope.create({ data: { organisationId: c.l.org.id, delegationId: row.id, act } });
    await audit(c, "SoDelegation", row.id, `delegation to ${delegate!.name}`, "CREATE", diffFields(null, { representative: delegate!.name, representativeType: DELEGATE_KIND_WORDS[kind].en, delegatedBy: `${grantor.name}, as ${so!.office.roleLabel}`, competency: competencyNote.trim(), scope: scope.map((a) => ACT_WORDS[a].en).join("; "), letters: VARIANT_WORDS[variant!].en, inForceFrom: "the letter's date, once issued", recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

/// Revoke a delegation from a day, with the reason. Its letters stay as they were.
export async function revokeDelegation(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const delegationId = r.text("delegationId", "Delegation", { required: true });
  const on = r.date("on", "Revoked from", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    // The delegation is a domain row: locked after the contract.
    await c.tx.$queryRaw`SELECT id FROM "SoDelegation" WHERE id = ${delegationId} FOR UPDATE`;
    const d = await c.tx.soDelegation.findFirst({ where: { id: delegationId, contractId: c.l.contract.id } });
    if (!d) return { ok: false, message: "That delegation is not on this contract." };
    // Review 6: never on or before the representative's latest recorded act or signature on this contract.
    const latestAct = latestActDay(await actsByPerson(await supervisionOf(c), c.l.contract.id, c.tx), d.delegatePersonId);
    const fs = revokeFaults({ revokedOn: day(d.revokedOn), recordedOn: storedDay(d.recordedOn), on: storedDay(on), today: c.today, reason, latestAct });
    if (fs.length) refuse("Not revoked:", fs);
    const moved = await c.tx.soDelegation.updateMany({ where: { id: d.id, revokedOn: null }, data: { revokedOn: on, revokeReason: reason.trim(), revokedAt: c.now } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "SoDelegation", d.id, `delegation to ${d.delegateName}`, "UPDATE", diffFields({ revokedOn: null }, { revokedOn: storedDay(on) }), reason.trim());
    return { ok: true };
  });
}

// ------------------------------------------------------------------ possession (FR-SUP-005)

/**
 * Record possession of site: once, on a fully executed (stamped) contract, by the S.O. or the Principal
 * Representative. The contract type's start-of-work behaviour is read now and frozen with it (BD-612-22). Writes
 * the POSSESSION baseline version (the Date of Possession, and the date for completion from it) and moves the
 * contract to ACTIVE: the only act that does.
 */
export async function recordPossession(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const on = r.date("possessionOn", "Date of possession", { required: true });
  const personId = r.text("personId", "Recorded for", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const k = c.l.contract;
    const s = await supervisionOf(c);
    const day0 = storedDay(on);
    const gate = await contractGate(c.l, c.tx);
    const type = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { nameEn: true, startRequiresSecurities: true } }) : null;
    const { versions, draft } = baselineRows(k);
    // The contract's own state first (stamped, not yet possessed), then who it is recorded for.
    // Review 1 backstop: never before the first S.O. assignment takes effect.
    const soFrom = s.soAssignments.length ? s.soAssignments.map((a) => storedDay(a.effectiveOn)).sort()[0] : null;
    const fs = possessionFaults({ status: k.status, possessed: !!s.possession, versions: versions.length, on: day0, today: c.today, datedOn: day(k.contractDate), startRequiresSecurities: type?.startRequiresSecurities ?? null, typeName: type?.nameEn ?? null, gate: gate.items, soFrom });
    if (fs.length) refuse("Not recorded:", fs);
    // Review 7: who may record it is judged on the possession day.
    const who = await recordedFor(c, s, personId, { principalOrSo: true }, day0);
    // The POSSESSION version: the latest version with the Date of Possession added, derived again.
    const prior = latestVersion(versions)!;
    const inputs = frozenInputsOf(k);
    const before = valuesOf(prior);
    const after = inputs ? derive({ ...before, possessionDate: day0 }, inputs.interimPolicy) : { ...before, possessionDate: day0 };
    const judgedUnder = { startOfWork: startRuleReading(type?.startRequiresSecurities ?? null), type: type?.nameEn ?? null, gate: gate.items.filter((g) => g.key !== "RETURNED") };
    const version = await writePossessionVersion(c, prior, draft, after, judgedUnder);
    const row = await c.tx.possession.create({ data: { organisationId: c.l.org.id, contractId: k.id, possessionOn: on, recordedByPersonId: who.person.id, baselineId: version.id, judgedUnder: judgedUnder as unknown as Prisma.InputJsonValue, note, recordedAt: c.now, recordedOn: dayToDate(c.today) } });
    // 6.12 condition: only this act writes ACTIVE, from STAMPED, under the contract's lock.
    const t = contractTransition(k.status as ContractStatus, "ACTIVE", { act: "POSSESSION" });
    if (t) throw new Refusal({ ok: false, message: "The contract cannot move to active from where it stands." });
    const moved = await c.tx.contract.updateMany({ where: { id: k.id, status: "STAMPED" }, data: { status: "ACTIVE" } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "Possession", row.id, "possession of site", "CREATE", diffFields(null, { possessionOn: day0, dateForCompletion: after.dateForCompletion, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, startOfWork: judgedUnder.startOfWork === "WITHOUT_SECURITIES" ? "this contract type starts without its securities" : "the bond and the required insurance verified", recordedOnBehalf: ON_BEHALF }), note);
    await writeAudit(c.tx, { organisationId: c.l.org.id, entity: "Contract", entityId: k.id, entityLabel: c.label, reason: "" }, "UPDATE", diffFields({ status: k.status }, { status: "ACTIVE" }));
    return { ok: true };
  });
}

/// The POSSESSION version: written once, never updated, with its sections; its CREATE entry says what it changed.
async function writePossessionVersion(c: Ctx, prior: ReturnType<typeof latestVersion<ReturnType<typeof baselineRows>["versions"][number]>> & object, draft: ReturnType<typeof baselineRows>["draft"], v: ReturnType<typeof valuesOf>, judgedUnder: object) {
  const version = (prior.version ?? 0) + 1;
  const row = await c.tx.contractBaseline.create({
    data: { organisationId: c.l.org.id, contractId: c.l.contract.id, version, reason: "POSSESSION", correctionReason: "", recordedAt: c.now, recordedOn: dayToDate(c.today), ...rowOf(v), entered: (prior.entered ?? {}) as Prisma.InputJsonValue, snapshot: { ...(draft?.snapshot as object), possession: judgedUnder } as Prisma.InputJsonValue },
  });
  for (const s of sectionRows(v, c.l.org.id)) await c.tx.contractSection.create({ data: { ...s, baselineId: row.id } });
  await audit(c, "ContractBaseline", row.id, `baseline version ${version}`, "CREATE", diffFields(null, { version, reason: "POSSESSION", changed: changedFields(valuesOf(prior), v).join(", ") || "nothing" }));
  return row;
}

// ------------------------------------------------------------------ the programme (FR-SUP-006, 012)

/// Points as "day | planned %" lines, oldest first.
function readPoints(r: FormReader, raw: string): PointIn[] {
  const out: PointIn[] = [];
  for (const [n, line] of linesOf(raw).entries()) {
    const [d, p] = line.split("|").map((x) => x.trim());
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !p) {
      r.reject("points", `Line ${n + 1}: write it as "YYYY-MM-DD | planned %".`);
      continue;
    }
    out.push({ day: d, plannedPct: p.replace(/%$/, "") });
  }
  return out;
}

/// The contractor submits a revision of its programme (or service schedule), with its planned progress.
export async function submitProgramme(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("kind", "What it is", PROGRAMME_KINDS, { required: true });
  const submittedOn = r.date("submittedOn", "Submitted on", { required: true });
  const points = readPoints(r, String(data.get("points") ?? ""));
  const note = r.text("note", "Note", { max: 2000 });
  const directionId = r.optionalText("directionId");
  if (r.failed || !kind || !submittedOn) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const revs = revisionsOf(s);
    const open = openRevision(revs);
    const fs = [...submitFaults({ executed: isExecuted(c.l.contract.status as ContractStatus), submittedOn: storedDay(submittedOn), today: c.today, openRevision: open?.revision ?? null }), ...pointFaults(points, day(s.possession?.possessionOn))];
    if (fs.length) refuse("Not submitted:", fs);
    if (directionId && !s.programmeDirections.some((d) => d.id === directionId)) return { ok: false, errors: { directionId: "Choose a direction recorded on this contract." } };
    const revision = revs.reduce((m, x) => Math.max(m, x.revision), 0) + 1;
    const row = await c.tx.workProgramme.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, revision, kind, submittedOn, directionId: directionId ?? null, note, recordedAt: c.now } });
    for (const p of points) await c.tx.programmePoint.create({ data: { organisationId: c.l.org.id, programmeId: row.id, day: dayToDate(p.day), plannedPct: p.plannedPct } });
    await audit(c, "WorkProgramme", row.id, `programme revision ${revision}`, "CREATE", diffFields(null, { programme: PROGRAMME_KIND_WORDS[kind].en, revision, submittedOn: storedDay(submittedOn), plannedProgress: points.map((p) => `${p.plannedPct}% by ${p.day}`).join("; "), answersDirection: directionId ? "yes" : null }), note);
    return { ok: true };
  });
}

/// Lock and read a programme revision of this contract.
async function lockedRevision(c: Ctx, programmeId: string) {
  await c.tx.$queryRaw`SELECT id FROM "WorkProgramme" WHERE id = ${programmeId} FOR UPDATE`;
  const s = await supervisionOf(c);
  const rev = revisionsOf(s).find((x) => x.id === programmeId);
  if (!rev) throw new Refusal({ ok: false, message: "That programme is not on this contract." });
  return { s, rev };
}

/// The S.O. Representative's scrutiny: whether it reflects a reasonable and realistic sequence.
export async function scrutiniseProgramme(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const programmeId = r.text("programmeId", "Programme", { required: true });
  const personId = r.text("personId", "Scrutinised by", { required: true });
  const on = r.date("on", "Scrutinised on", { required: true });
  const answer = r.choice("reasonable", "Reasonable and realistic", ["yes", "no"] as const, { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on || !answer) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const { s, rev } = await lockedRevision(c, programmeId);
    const who = await recordedFor(c, s, personId, { act: "PROGRAMME_SCRUTINY" }, storedDay(on));
    const reasonable = answer === "yes";
    const fs = scrutinyFaults(rev, { on: storedDay(on), today: c.today, reasonable, note });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.workProgramme.updateMany({ where: { id: rev.id, decision: null, scrutinisedOn: null }, data: { scrutinisedByPersonId: who.person.id, scrutinisedOn: on, reasonable, scrutinyNote: note } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "WorkProgramme", rev.id, `programme revision ${rev.revision}`, "UPDATE", diffFields({ scrutinisedOn: null }, { scrutinisedOn: storedDay(on), scrutinisedBy: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, reasonableAndRealistic: reasonable ? "yes" : "no", recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}

/// The Principal S.O. Representative approves the revision (the baseline for progress from then) or returns it for revision.
export async function decideProgramme(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const programmeId = r.text("programmeId", "Programme", { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("on", "Decided on", { required: true });
  const decision = r.choice("decision", "Decision", PROGRAMME_DECISIONS, { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on || !decision) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const { s, rev } = await lockedRevision(c, programmeId);
    const who = await recordedFor(c, s, personId, { principalOrSo: true }, storedDay(on));
    const fs = decideFaults(rev, { decision, on: storedDay(on), today: c.today, note, points: rev.points.length });
    if (fs.length) refuse("Not decided:", fs);
    const moved = await c.tx.workProgramme.updateMany({ where: { id: rev.id, decision: null }, data: { decision, decidedByPersonId: who.person.id, decidedOn: on, decisionNote: note, decidedAt: c.now } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "WorkProgramme", rev.id, `programme revision ${rev.revision}`, "UPDATE", diffFields({ programmeDecision: null }, { programmeDecision: PROGRAMME_DECISION_WORDS[decision].en, decidedOn: storedDay(on), decidedBy: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ progress (FR-SUP-010)

/// Actual physical progress on a day.
export async function recordProgress(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const personId = r.text("personId", "Recorded for", { required: true });
  const on = r.date("day", "Day", { required: true });
  const pct = (r.optionalText("actualPct") ?? "").replace(/%$/, "").trim();
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(on);
    const who = await recordedFor(c, s, personId, { act: "PROGRESS" }, d);
    let parsed: bigint | null = null;
    try {
      parsed = /^\d{1,3}(\.\d{1,4})?$/.test(pct) ? parsePercent(pct) : null;
    } catch {
      parsed = null;
    }
    const rows = s.progressRecords.map((x) => ({ day: storedDay(x.day), pct: parsePercent(x.actualPct.toString()) }));
    const earlier = [...rows].reverse().find((x) => x.day < d) ?? null;
    const later = rows.find((x) => x.day > d) ?? null;
    const fs = progressFaults({ possessionOn: day(s.possession?.possessionOn), day: d, today: c.today, pct, exists: rows.some((x) => x.day === d), earlier, later, parsed });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.progressRecord.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, day: on, actualPct: pct, recordedByPersonId: who.person.id, note, recordedAt: c.now } });
    await audit(c, "ProgressRecord", row.id, `progress on ${formatDate(d)}`, "CREATE", diffFields(null, { day: d, actualProgress: `${pct}%`, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the site diary (FR-SUP-007, 008)

/// A day's diary entry, kept by the responsible officer (the S.O. or a representative with the diary in scope).
export async function recordDiaryEntry(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const personId = r.text("personId", "Responsible officer", { required: true });
  const on = r.date("day", "Day", { required: true });
  const weather = r.text("weather", "Weather", { max: 200 });
  const entry = r.text("entry", "Entry", { required: true, max: 10000 });
  const backdatedReason = r.text("backdatedReason", "Why it was not written on the day", { max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(on);
    const who = await recordedFor(c, s, personId, { act: "DIARY" }, d);
    const fs = entryFaults({ possessionOn: day(s.possession?.possessionOn), day: d, today: c.today, exists: s.siteDiaryEntries.some((x) => storedDay(x.day) === d), entry, backdatedReason });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.siteDiaryEntry.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, day: on, weather, entry, officerPersonId: who.person.id, backdatedReason: d < c.today ? backdatedReason.trim() : "", recordedAt: c.now, recordedOn: dayToDate(c.today) } });
    await audit(c, "SiteDiaryEntry", row.id, `site diary ${formatDate(d)}`, "CREATE", diffFields(null, { day: d, weather: weather || null, responsibleOfficer: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, writtenOn: c.today, exception: d < c.today ? backdatedReason.trim() : null, recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

/// Lock and read a diary entry of this contract.
async function lockedEntry(c: Ctx, entryId: string) {
  await c.tx.$queryRaw`SELECT id FROM "SiteDiaryEntry" WHERE id = ${entryId} FOR UPDATE`;
  const e = await c.tx.siteDiaryEntry.findFirst({ where: { id: entryId, contractId: c.l.contract.id }, include: { officer: { select: { name: true } } } });
  if (!e) throw new Refusal({ ok: false, message: "That diary entry is not on this contract." });
  return e;
}

/// An attestation at the end of the day: the responsible officer's, or the contractor's agent's (by name).
export async function attestDiary(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const entryId = r.text("entryId", "Entry", { required: true });
  const who = r.choice("who", "Who attests", ["OFFICER", "AGENT"] as const, { required: true });
  const on = r.date("on", "Attested on", { required: true });
  const agentName = r.text("agentName", "The contractor's agent", { max: 200 });
  if (r.failed || !on || !who) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const e = await lockedEntry(c, entryId);
    const fs = attestFaults({ who, already: who === "OFFICER" ? e.officerAttestedOn != null : e.agentAttestedOn != null, day: storedDay(e.day), on: storedDay(on), today: c.today, agentName });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = who === "OFFICER" ? await c.tx.siteDiaryEntry.updateMany({ where: { id: e.id, officerAttestedOn: null }, data: { officerAttestedOn: on } }) : await c.tx.siteDiaryEntry.updateMany({ where: { id: e.id, agentAttestedOn: null }, data: { agentAttestedOn: on, agentName: agentName.trim() } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "SiteDiaryEntry", e.id, `site diary ${formatDate(storedDay(e.day))}`, "UPDATE", diffFields({ attestedBy: null }, { attestedBy: who === "OFFICER" ? `${e.officer.name} (responsible officer)` : `${agentName.trim()} (the contractor's agent)`, attestedOn: storedDay(on), recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

/// A disagreement between the two is recorded on the entry and escalated to the S.O. (ASSUMED path).
export async function disputeDiary(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const entryId = r.text("entryId", "Entry", { required: true });
  const disagreement = r.text("disagreement", "What they disagree on", { required: true, max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const e = await lockedEntry(c, entryId);
    const fs = disputeFaults({ disagreement, existing: e.disagreement });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.siteDiaryEntry.updateMany({ where: { id: e.id, disagreement: "" }, data: { disagreement: disagreement.trim(), escalatedOn: dayToDate(c.today) } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "SiteDiaryEntry", e.id, `site diary ${formatDate(storedDay(e.day))}`, "UPDATE", diffFields({ disagreement: null }, { disagreement: disagreement.trim(), escalatedToTheSo: c.today }));
    return { ok: true };
  });
}

/// An endorsement of the diary at a site visit, over the days it covers (FR-SUP-008).
export async function endorseDiary(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const role = r.choice("role", "Endorsed as", DIARY_ENDORSERS, { required: true });
  const personId = r.text("personId", "Endorsed by", { required: true });
  const visitedOn = r.date("visitedOn", "Visited on", { required: true });
  const coversFrom = r.date("coversFrom", "Covers from", { required: true });
  const coversTo = r.date("coversTo", "Covers to", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !role || !visitedOn || !coversFrom || !coversTo) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    // The S.O.'s endorsement is the S.O.'s; the superior officer's is recorded as named (no reporting lines yet).
    // Review 8: the superior officer is someone on record and active, as every other person named (recordedFor checks the S.O.).
    const named = role === "SUPERINTENDING_OFFICER" ? null : await personOf(c, personId);
    if (role !== "SUPERINTENDING_OFFICER" && (!named || !named.isActive)) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const person = role === "SUPERINTENDING_OFFICER" ? (await recordedFor(c, s, personId, { soOnly: true }, storedDay(visitedOn))).person : named!;
    const from = storedDay(coversFrom);
    const to = storedDay(coversTo);
    const fs = endorseFaults({ possessionOn: day(s.possession?.possessionOn), visitedOn: storedDay(visitedOn), coversFrom: from, coversTo: to, today: c.today, entriesInCover: s.siteDiaryEntries.filter((x) => storedDay(x.day) >= from && storedDay(x.day) <= to).length });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.diaryEndorsement.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, role, personId: person.id, visitedOn, coversFrom, coversTo, note, recordedAt: c.now } });
    await audit(c, "DiaryEndorsement", row.id, `site diary endorsed ${formatDate(storedDay(visitedOn))}`, "CREATE", diffFields(null, { endorsedAs: ENDORSER_WORDS[role].en, endorsedBy: person.name, visitedOn: storedDay(visitedOn), coversFrom: from, coversTo: to, recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ meetings, observations, directions (FR-SUP-011, 012, 014)

/// A special meeting chaired by the S.O. after an In Delay classification, with its minutes and the reading that called it.
export async function recordSiteMeeting(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const personId = r.text("personId", "Chaired by (the S.O.)", { required: true });
  const heldOn = r.date("heldOn", "Held on", { required: true });
  const attendees = linesOf(String(data.get("attendees") ?? ""));
  const minutes = r.text("minutes", "Minutes", { required: true, max: 20000 });
  if (r.failed || !heldOn) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(heldOn);
    const who = await recordedFor(c, s, personId, { soOnly: true }, d);
    const policy = await loadPostAwardPolicy(c.l.org.id, c.tx);
    const latest = latestValues(c);
    const reading = delayOn(s, { today: d, dateForCompletion: latest?.values.dateForCompletion ?? null, policyPct: policy?.inDelayProgressPct?.toString() ?? null });
    const fs = meetingFaults({ inDelay: reading.state === "IN_DELAY", heldOn: d, today: c.today, minutes, attendees });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.siteMeeting.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, heldOn, chairPersonId: who.person.id, attendees, minutes, inDelayReading: reading as unknown as Prisma.InputJsonValue, recordedAt: c.now } });
    await audit(c, "SiteMeeting", row.id, `special meeting ${formatDate(d)}`, "CREATE", diffFields(null, { heldOn: d, chairedBy: who.person.name, attendees: attendees.join("; "), calledBy: "the In Delay classification", recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

/// A compliance observation (FR-SUP-014).
export async function recordObservation(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const area = r.choice("area", "About", COMPLIANCE_AREAS, { required: true });
  const personId = r.text("personId", "Observed by", { required: true });
  const on = r.date("on", "Observed on", { required: true });
  const note = r.text("note", "Observation", { required: true, max: 4000 });
  if (r.failed || !area || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(on);
    const who = await recordedFor(c, s, personId, { act: "OBSERVATION" }, d);
    const fs = onSiteFaults({ possessionOn: day(s.possession?.possessionOn), on: d, today: c.today, note });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.complianceObservation.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, area, observedOn: on, personId: who.person.id, note, recordedAt: c.now } });
    await audit(c, "ComplianceObservation", row.id, `observation ${formatDate(d)}`, "CREATE", diffFields(null, { about: AREA_WORDS[area].en, observedOn: d, observedBy: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}`, observation: note, recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

/// A direction to review the completion date and submit a revised programme (FR-SUP-012). A variation's is raised by the variation itself.
export async function recordDirection(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const cause = r.choice("cause", "Called for by", DIRECTION_CAUSES.filter((x) => x !== "VARIATION"), { required: true });
  const personId = r.text("personId", "Directed by", { required: true });
  const on = r.date("on", "Directed on", { required: true });
  const note = r.text("note", "Direction", { required: true, max: 4000 });
  if (r.failed || !cause || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(on);
    const who = await recordedFor(c, s, personId, { principalOrSo: true }, d);
    const fs = onSiteFaults({ possessionOn: day(s.possession?.possessionOn), on: d, today: c.today, note });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.programmeDirection.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, cause, directedOn: on, personId: who.person.id, note, recordedAt: c.now } });
    await audit(c, "ProgrammeDirection", row.id, `direction ${formatDate(d)}`, "CREATE", diffFields(null, { calledForBy: CAUSE_WORDS[cause].en, directedOn: d, directedBy: who.person.name, directionGiven: note, recordedOnBehalf: ON_BEHALF }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ self-help, early action (FR-SUP-013, 015)

/// The S.O.'s self-help on insurance: the premium the employer paid becomes a deduction waiting for the next interim.
export async function recordSelfHelp(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const policyId = r.text("policyId", "Policy", { required: true });
  const amount = r.money("amount", "Premium paid", { required: true });
  const paidOn = r.date("paidOn", "Paid on", { required: true });
  const extendedTo = r.date("extendedTo", "Cover extended to");
  const personId = r.text("personId", "Decided by (the S.O.)", { required: true });
  const note = r.text("note", "Why", { required: true, max: 2000 });
  if (r.failed || !amount || !paidOn) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const who = await recordedFor(c, s, personId, { soOnly: true }, c.today);
    const policy = c.l.contract.policies.find((p) => p.id === policyId) ?? null;
    const sen = parseSen(amount);
    const fs = selfHelpFaults({ policyOnContract: !!policy, amount: sen, paidOn: storedDay(paidOn), today: c.today, extendedTo: extendedTo ? storedDay(extendedTo) : null, periodEnd: policy ? storedDay(policy.periodEnd) : null, note });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.pendingDeduction.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, kind: "INSURANCE_PREMIUM", policyId: policy!.id, amount: senToDecimalString(sen), paidOn, extendedTo: extendedTo ?? null, personId: who.person.id, note, recordedAt: c.now } });
    await audit(c, "PendingDeduction", row.id, "insurance premium paid by self-help", "CREATE", diffFields(null, { policy: policy!.policyNo || "the policy", premiumPaid: senToDecimalString(sen), paidOn: storedDay(paidOn), coverExtendedTo: extendedTo ? storedDay(extendedTo) : null, decidedBy: who.person.name, deductedFrom: "the next interim certificate", recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}

/// The S.O.'s early-action decision: one or more branches, each opening its module.
export async function recordEarlyAction(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const branches = linesOf(String(data.get("branches") ?? "")).filter((x): x is (typeof EARLY_ACTION_BRANCHES)[number] => (EARLY_ACTION_BRANCHES as readonly string[]).includes(x));
  const personId = r.text("personId", "Decided by (the S.O.)", { required: true });
  const on = r.date("on", "Decided on", { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 4000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const d = storedDay(on);
    const who = await recordedFor(c, s, personId, { soOnly: true }, d);
    const fs = earlyActionFaults({ possessed: !!s.possession, branches, reason, on: d, today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.earlyActionDecision.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, decidedOn: on, branches, personId: who.person.id, reason, recordedAt: c.now } });
    await audit(c, "EarlyActionDecision", row.id, `early action ${formatDate(d)}`, "CREATE", diffFields(null, { actions: branches.map((b) => BRANCH_WORDS[b].en).join("; "), decidedOn: d, decidedBy: who.person.name, recordedOnBehalf: ON_BEHALF }), reason);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ parties (B1, ADR 0025)

/// A nominated sub-contractor, nominated supplier or approved assignee paid through the contract's certificates.
export async function recordParty(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("kind", "Party", CONTRACT_PARTY_KINDS, { required: true });
  const name = r.text("name", "Name", { required: true, max: 300 });
  const sum = r.money("sum", "Sub-contract or assigned sum");
  const direct = r.choice("directPayment", "Paid direct", ["yes", "no"] as const);
  const provenance = r.choice("provenance", "Where it came from", ["STATED", "OBSERVED", "ASSUMED"] as const);
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const sen = sum ? parseSen(sum) : null;
    const fs = partyFaults({ executed: isExecuted(c.l.contract.status as ContractStatus), kind, name, sum: sen, others: s.contractParties.map((p) => ({ kind: p.kind, name: p.name, retired: p.retiredOn != null })) });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.contractParty.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, kind, name: name.trim(), sum: sen == null ? null : senToDecimalString(sen), directPayment: direct == null ? null : direct === "yes", provenance: provenance ?? null, note, recordedAt: c.now } });
    await audit(c, "ContractParty", row.id, `${PARTY_KIND_WORDS[kind].en.toLowerCase()} ${name.trim()}`, "CREATE", diffFields(null, { partyType: PARTY_KIND_WORDS[kind].en, name: name.trim(), partySum: sen == null ? null : senToDecimalString(sen), paidDirect: direct ?? null, provenance: provenance ?? null }), note);
    return { ok: true };
  });
}

/// Retire a party, with the reason: it is never deleted, so a certificate that carried it still reads it.
export async function retireParty(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const partyId = r.text("partyId", "Party", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    await c.tx.$queryRaw`SELECT id FROM "ContractParty" WHERE id = ${partyId} FOR UPDATE`;
    const p = await c.tx.contractParty.findFirst({ where: { id: partyId, contractId: c.l.contract.id } });
    if (!p) return { ok: false, message: "That party is not on this contract." };
    const fs = retirePartyFaults({ retired: p.retiredOn != null, reason });
    if (fs.length) refuse("Not retired:", fs);
    const moved = await c.tx.contractParty.updateMany({ where: { id: p.id, retiredOn: null }, data: { retiredOn: dayToDate(c.today), retireReason: reason.trim() } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(c, "ContractParty", p.id, `${PARTY_KIND_WORDS[p.kind].en.toLowerCase()} ${p.name}`, "UPDATE", diffFields({ retiredOn: null }, { retiredOn: c.today }), reason.trim());
    return { ok: true };
  });
}

// ------------------------------------------------------------------ site records (FR-SUP-009)

/// Hand a set of site records to the Implementing Department, the versions live now pinned.
export async function handOverRecords(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const set = r.choice("recordsSet", "Records", SITE_RECORDS_SETS, { required: true });
  const on = r.date("on", "Handed over on", { required: true });
  const toLabel = r.text("toLabel", "Handed to", { required: true, max: 300 });
  const receivedByName = r.text("receivedByName", "Received by", { required: true, max: 200 });
  const personId = r.text("personId", "Handed over by", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !set || !on) return { ok: false, errors: r.errors };
  return inContract(idOf(data), now, async (c) => {
    const s = await supervisionOf(c);
    const person = await personOf(c, personId);
    if (!person || !person.isActive) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const live = liveOf(c.l.contract, set);
    const fs = handoverFaults({ possessed: !!s.possession, set, liveVersions: live.length, toLabel, receivedByName, on: storedDay(on), today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    const pinned = live.map((a) => ({ versionId: a.versionId, title: a.version.document.title, versionNo: a.version.versionNo, sha256: a.version.sha256 }));
    const row = await c.tx.siteRecordsHandover.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, recordsSet: set, handedOverOn: on, toLabel: toLabel.trim(), receivedByName: receivedByName.trim(), personId: person.id, pinnedVersions: pinned as Prisma.InputJsonValue, note, recordedAt: c.now } });
    await audit(c, "SiteRecordsHandover", row.id, `${RECORDS_SET_WORDS[set].en.toLowerCase()} handed over`, "CREATE", diffFields(null, { records: RECORDS_SET_WORDS[set].en, handedOverOn: storedDay(on), handedTo: toLabel.trim(), receivedBy: receivedByName.trim(), versions: pinned.map((p) => `${p.title} v${p.versionNo}`).join("; "), handedOverBy: person.name, recordedOnBehalf: ON_BEHALF }), note);
    return { ok: true };
  });
}
