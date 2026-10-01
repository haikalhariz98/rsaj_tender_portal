"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay } from "@/lib/dates";
import { requisitionOfExercise, withLockedRequisitionForSourcing, type ExerciseOrg, type ExerciseRow } from "@/lib/method/repo";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { ASSURANCE_KINDS, confirmFaults } from "@/lib/tender-docs/assurance";
import { liveClauses, overrideFaults } from "@/lib/tender-docs/clauses";
import { ASSURANCE_KIND_LABEL, CONDITIONS_FROZEN_TEXT, conditionsFaultText, confirmFaultText, overrideFaultText, restrictionQuestion } from "@/lib/tender-docs/conditions-labels";
import { eligibilityEditFault, requirementFaults } from "@/lib/tender-docs/eligibility";
import { NOT_SET, yesNoNotSet } from "@/lib/tender-docs/labels";
import { lockPackRows } from "@/lib/tender-docs/owner";
import { permitLabel, permitSaveFaults } from "@/lib/tender-docs/permit";
import { loadClauses, loadConfirmations, loadOverrides, loadPacks, loadPermitList, loadRegistrationBodies, loadRequirements, loadTenderPolicy, partFactsOf, type PackRow } from "@/lib/tender-docs/repo";
import type { Finding } from "@/lib/tender-docs/types";
import { FormReader } from "@/lib/validate";

/**
 * Writes for 6.4 increment 2 on the exercise's Tender documents tab: the registrations a
 * bidder must hold (FR-DOC-005), whether the tender is restricted (FR-DOC-009), whether the
 * works need the regulator's permit and which (FR-DOC-006), the assurance confirmations
 * (FR-DOC-014) and the legal-endorsement overrides of a mandatory clause (FR-DOC-011).
 *
 * Each locks the exercise's requisition, then the exercise, then its pack rows (the order
 * every 6.4 write takes), re-reads what it judges inside the transaction, runs the lib's
 * rule on the locked rows and writes with its audit row, in words, in the same
 * transaction. A refusal saves nothing and says what to do. Nobody is signed in: a Person
 * named is recorded on their behalf, not signed, and the audit is unattributed.
 */

const GONE: FormState = { ok: false, message: "That exercise no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "The organisation's time zone is not set, so nothing on the tender's conditions can be judged or dated. Set it under Configuration, Organisation." };
const NO_DRAFT: FormState = { ok: false, message: "There is no draft of the tender documents. Start one on the Tender documents tab." };

type Locked = { org: ExerciseOrg; ex: ExerciseRow; packs: PackRow[] };

const refuse = (fs: readonly Finding[], text: (f: Finding) => string): FormState => ({ ok: false, message: `Nothing was saved: ${fs.filter((f) => f.level === "block").map(text).join(" ")}` });

async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every row is labelled with its exercise's reference, so the exercise's History finds it.
const label = (l: { ex: { reference: string } }, what: string) => `${l.ex.reference} · ${what}`;

/// Lock the requisition, the exercise and its packs; run `fn` on what was read under the lock.
async function locked(exerciseId: string, fn: (tx: Tx, l: Locked) => Promise<FormState>): Promise<FormState> {
  const requisitionId = await requisitionOfExercise(exerciseId);
  if (!requisitionId) return GONE;
  let result: FormState | null;
  try {
    result = await withLockedRequisitionForSourcing(requisitionId, exerciseId, async (tx, l) => {
      if (!l.ex) return GONE;
      await lockPackRows(tx, exerciseId);
      return fn(tx, { org: l.org, ex: l.ex, packs: await loadPacks(exerciseId, tx) });
    });
  } catch (e) {
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result?.ok) revalidatePath(`/sourcing/${exerciseId}`);
  return result ?? GONE;
}

const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");
const draftOf = (packs: readonly PackRow[]) => packs.find((p) => p.status === "DRAFT") ?? null;
const frozen = (l: Locked): FormState | null => (eligibilityEditFault(l.ex.status) ? { ok: false, message: CONDITIONS_FROZEN_TEXT } : null);

// ------------------------------------------------------------------ eligibility (FR-DOC-005)

/// Add a registration the bidders must hold, from a configured body.
export async function addRequirement(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const bodyCode = r.text("bodyCode", "Registration body", { required: true, max: 80 });
  const qualifiers = r.text("qualifiers", "What is required with it", { max: 500 });
  const alternativeGroup = r.int("alternativeGroup", "Group", { required: true, min: 1 });
  if (r.failed || alternativeGroup == null) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    if (!l.org.today) return NO_ZONE;
    const stop = frozen(l);
    if (stop) return stop;
    const bodies = await loadRegistrationBodies(l.org.id, tx);
    const faults = requirementFaults({ bodyCode, qualifiers, alternativeGroup }, bodies, l.org.today);
    if (faults.length) {
      const f = faults[0];
      const field = f.code === "QUALIFIERS_REQUIRED" || f.code === "QUALIFIERS_NOT_TAKEN" ? "qualifiers" : f.code === "GROUP_NOT_VALID" ? "alternativeGroup" : "bodyCode";
      return { ok: false, errors: { [field]: conditionsFaultText(f) } };
    }
    const existing = await loadRequirements(exerciseId, tx);
    if (existing.some((x) => x.bodyCode === bodyCode && x.alternativeGroup === alternativeGroup)) return { ok: false, errors: { bodyCode: conditionsFaultText({ code: "BODY_TWICE_IN_GROUP", level: "block", data: { body: bodies.find((b) => b.code === bodyCode)!.labelEn } }) } };
    const body = bodies.find((b) => b.code === bodyCode)!;
    const sortOrder = existing.filter((x) => x.alternativeGroup === alternativeGroup).reduce((m, x) => Math.max(m, x.sortOrder + 1), 0);
    const row = await tx.exerciseRegistrationRequirement.create({ data: { organisationId: l.org.id, exerciseId, bodyCode, bodyLabelSnapshot: body.labelEn, qualifierLabelSnapshot: body.qualifierLabelEn, qualifiers: qualifiers.trim(), alternativeGroup, sortOrder } });
    await audit(tx, l.org.id, "ExerciseRegistrationRequirement", row.id, label(l, `Registration required · ${body.labelEn}`), "CREATE", diffFields(null, { registrationBody: body.labelEn, requiredWithIt: qualifiers.trim() || null, alternativeGroup: `Group ${alternativeGroup}` }));
    return { ok: true };
  });
}

/// Remove a registration requirement, with the reason.
export async function removeRequirement(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const reason = r.text("reason", "Why it is removed", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    const stop = frozen(l);
    if (stop) return stop;
    const row = await tx.exerciseRegistrationRequirement.findFirst({ where: { id, exerciseId } });
    if (!row) return { ok: false, message: "That requirement is no longer on the exercise." };
    await tx.exerciseRegistrationRequirement.delete({ where: { id } });
    await audit(tx, l.org.id, "ExerciseRegistrationRequirement", id, label(l, `Registration required · ${row.bodyLabelSnapshot}`), "DELETE", snapshotFields({ registrationBody: row.bodyLabelSnapshot, requiredWithIt: row.qualifiers || null, alternativeGroup: `Group ${row.alternativeGroup}` }), reason);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ restriction (FR-DOC-009) and permit (FR-DOC-006)

const TRI = ["yes", "no", "unset"] as const;
const tri = (v: (typeof TRI)[number] | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

/// Answer whether the tender is restricted, in the customer's configured words. Unset may be chosen again: it is honest.
export async function saveRestriction(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const answer = r.choice("restrictedTender", "Restricted", TRI, { required: true });
  if (r.failed || !answer) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    const stop = frozen(l);
    if (stop) return stop;
    const value = tri(answer);
    if (value === l.ex.restrictedTender) return { ok: true };
    const policy = await loadTenderPolicy(l.org.id, tx);
    await tx.sourcingExercise.update({ where: { id: exerciseId }, data: { restrictedTender: value } });
    // In the customer's words for the restriction, as the screen asks it.
    await audit(tx, l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ restrictedTender: yesNoNotSet(l.ex.restrictedTender) }, { restrictedTender: yesNoNotSet(value) }), restrictionQuestion(policy.restrictionLabelEn));
    return { ok: true };
  });
}

/// Answer whether the works need the regulator's permit, and which type from the configured list.
export async function savePermit(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const answer = r.choice("regulatedActivity", "Needs the regulator's permit", TRI, { required: true });
  const code = r.optionalText("regulatorPermitCode");
  if (r.failed || !answer) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    if (!l.org.today) return NO_ZONE;
    const stop = frozen(l);
    if (stop) return stop;
    const regulated = tri(answer);
    // A type only where the works are regulated (the database refuses one otherwise).
    const permitCode = regulated === true ? code : null;
    const policy = await loadTenderPolicy(l.org.id, tx);
    const list = await loadPermitList(l.org.id, policy.regulatorPermitTaxonomyCode, l.org.today, tx);
    const faults = permitSaveFaults(regulated, permitCode, list);
    if (faults.length) return { ok: false, errors: { regulatorPermitCode: conditionsFaultText(faults[0]) } };
    if (regulated === l.ex.regulatedActivity && permitCode === l.ex.regulatorPermitCode) return { ok: true };
    await tx.sourcingExercise.update({ where: { id: exerciseId }, data: { regulatedActivity: regulated, regulatorPermitCode: permitCode } });
    const words = (reg: boolean | null, pc: string | null) => ({ needsRegulatorPermit: yesNoNotSet(reg), permitType: reg === true ? (permitLabel(reg, pc, list) ?? NOT_SET) : null });
    await audit(tx, l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields(words(l.ex.regulatedActivity, l.ex.regulatorPermitCode), words(regulated, permitCode)));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ assurance (FR-DOC-014)

/// Record a confirmation on the draft: a named Person and the day, recorded on their behalf, not signed.
export async function recordAssurance(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const kind = r.choice("kind", "Confirmation", ASSURANCE_KINDS, { required: true });
  const personId = r.text("personId", "Confirmed by", { required: true });
  const on = r.date("confirmedOn", "Confirmed on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !kind || !on) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    const pack = draftOf(l.packs);
    if (!pack) return NO_DRAFT;
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const existing = await loadConfirmations(pack.id, tx);
    const startedOn = l.org.timeZone ? new Intl.DateTimeFormat("en-CA", { timeZone: l.org.timeZone }).format(pack.createdAt) : storedDay(pack.createdAt);
    const faults = confirmFaults({ packStatus: pack.status, exerciseStatus: l.ex.status, kind, parts: pack.parts.map(partFactsOf), existing, person, confirmedOn: storedDay(on), today: l.org.today, packStartedOn: startedOn });
    if (faults.length) {
      const f = faults[0];
      return f.code === "PERSON_REQUIRED" || f.code === "PERSON_NOT_ACTIVE" ? { ok: false, errors: { personId: confirmFaultText(f) } } : f.code.startsWith("DAY") ? { ok: false, errors: { confirmedOn: confirmFaultText(f) } } : refuse(faults, confirmFaultText);
    }
    const row = await tx.packAssurance.create({ data: { organisationId: l.org.id, packId: pack.id, kind, personId: person!.id, confirmedOn: dayToDate(storedDay(on)), note, recordedAt: new Date() } });
    await audit(tx, l.org.id, "PackAssurance", row.id, label(l, `Tender documents v${pack.versionNo} · ${ASSURANCE_KIND_LABEL[kind]}`), "CREATE", diffFields(null, { confirmation: ASSURANCE_KIND_LABEL[kind], confirmedBy: person!.name, confirmedOn: storedDay(on), recordedOnBehalf: "not signed", note: note || null }));
    return { ok: true };
  });
}

/// Take a confirmation off the draft (recorded in error, or the documents changed since), with the reason.
export async function removeAssurance(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const reason = r.text("reason", "Why it is removed", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    const pack = draftOf(l.packs);
    if (!pack || l.ex.status !== "DOCUMENTS_IN_PREPARATION") return { ok: false, message: confirmFaultText({ code: "PACK_NOT_EDITABLE", level: "block" }) };
    const row = await tx.packAssurance.findFirst({ where: { id, packId: pack.id }, include: { person: { select: { name: true } } } });
    if (!row) return { ok: false, message: "That confirmation is not on the draft." };
    await tx.packAssurance.delete({ where: { id } });
    await audit(tx, l.org.id, "PackAssurance", id, label(l, `Tender documents v${pack.versionNo} · ${ASSURANCE_KIND_LABEL[row.kind]}`), "DELETE", snapshotFields({ confirmation: ASSURANCE_KIND_LABEL[row.kind], confirmedBy: row.person.name, confirmedOn: storedDay(row.confirmedOn) }), reason);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ clause overrides (FR-DOC-011)

/// Record a legal endorsement letting this version go without a mandatory clause: a named Person and the reason.
export async function recordClauseOverride(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const clauseCode = r.text("clauseCode", "Clause", { required: true, max: 80 });
  const personId = r.text("personId", "Endorsed by", { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    if (!l.org.today) return NO_ZONE;
    const pack = draftOf(l.packs);
    if (!pack) return NO_DRAFT;
    const clauses = await loadClauses(l.org.id, tx);
    const clause = clauses.find((c) => c.code === clauseCode) ?? null;
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const faults = overrideFaults({ packStatus: pack.status, exerciseStatus: l.ex.status, clause, today: l.org.today, existing: await loadOverrides(pack.id, tx), person, reason });
    if (faults.length) {
      const f = faults[0];
      return f.code === "PERSON_REQUIRED" || f.code === "PERSON_NOT_ACTIVE" ? { ok: false, errors: { personId: overrideFaultText(f) } } : f.code === "REASON_REQUIRED" ? { ok: false, errors: { reason: overrideFaultText(f) } } : refuse(faults, overrideFaultText);
    }
    const live = liveClauses([clause!], l.org.today)[0];
    const row = await tx.clauseOverride.create({ data: { organisationId: l.org.id, packId: pack.id, clauseCode, clauseTitleSnapshot: live.titleEn, personId: person!.id, reason, recordedAt: new Date() } });
    await audit(tx, l.org.id, "ClauseOverride", row.id, label(l, `Tender documents v${pack.versionNo} · without ${live.titleEn}`), "CREATE", diffFields(null, { clauseLeftOut: live.titleEn, endorsedBy: person!.name, recordedOnBehalf: "not signed" }), reason);
    return { ok: true };
  });
}

/// Withdraw an override on the draft, with the reason: the clause is required again.
export async function removeClauseOverride(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const reason = r.text("reason", "Why it is withdrawn", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return locked(exerciseId, async (tx, l) => {
    const pack = draftOf(l.packs);
    if (!pack || l.ex.status !== "DOCUMENTS_IN_PREPARATION") return { ok: false, message: overrideFaultText({ code: "PACK_NOT_EDITABLE", level: "block" }) };
    const row = await tx.clauseOverride.findFirst({ where: { id, packId: pack.id }, include: { person: { select: { name: true } } } });
    if (!row) return { ok: false, message: "That endorsement is not on the draft." };
    await tx.clauseOverride.delete({ where: { id } });
    await audit(tx, l.org.id, "ClauseOverride", id, label(l, `Tender documents v${pack.versionNo} · without ${row.clauseTitleSnapshot}`), "DELETE", snapshotFields({ clauseLeftOut: row.clauseTitleSnapshot, endorsedBy: row.person.name }), reason);
    return { ok: true };
  });
}

