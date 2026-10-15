"use server";

import { revalidatePath } from "next/cache";

import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import { attributionRefusalState } from "@/app/_auth/act";
import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { personIsAdministrator } from "@/lib/auth/administration-guard";
import { namingOthersRefusal, namingRefusal, type Reader } from "@/lib/auth/sulit-store";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { loadOpeningRoster } from "@/lib/opening/roster-store";
import { rekeyAfterRosterChange } from "@/lib/sealing/store";
import { addOfficerFaults, controlledChangeFaults, rosterChange, type RosterOfficer } from "@/lib/opening/roster";
import { incomingRefusal, rosterChangeText } from "@/lib/opening/roster-labels";
import { openingFindingText } from "@/lib/opening/labels";
import { withLockedExerciseScope, type LockedExercise } from "@/lib/scope/lock";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { datesFaultText } from "@/lib/tender-docs/labels";
import { approvalDatesFault } from "@/lib/tender-docs/tendering";
import { DATES_LOCKED_TEXT, proposedDatesOf } from "@/lib/method/key-dates";
import { FormReader } from "@/lib/validate";

/**
 * Writes for Scope and estimate's preparation sections (Sourcing Requirements v2: SR-05, ruling 8, and SR-07, ruling 11).
 *
 * Every action is reachable by a direct POST, so each asks who is signed in first, locks the exercise's requisition and then the exercise
 * (the same lock order as every other write on an exercise), re-reads what it judges inside that transaction, re-runs the pure rule on the
 * locked data and writes its audit row in the same transaction. A refusal writes nothing and says why in words.
 */

const GONE: FormState = { ok: false, message: "This exercise could not be found." };
const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");
const labelOf = (l: LockedExercise, what: string) => `${l.ex.reference} · ${what}`;

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

async function inExercise(scope: Reader, exerciseId: string, fn: (tx: Tx, l: LockedExercise) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedExerciseScope(scope, exerciseId, fn);
  } catch (e) {
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    if (transactionTimedOut(e)) return { ok: false, message: "That took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result?.ok) {
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
  }
  return result ?? GONE;
}

// ------------------------------------------------------------------ the proposed dates (SR-05)

/**
 * Save the dates proposed for the tendering window (ruling 8): the start day, the closing day and the closing time. Judged by the rule
 * the approver is judged by (`approvalDatesFault`), so a proposal that could not be approved is not stored. They read "Proposed" until
 * the approving step records them. Allowed until the documents are submitted.
 */
export async function saveKeyDates(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const r = new FormReader(data);
  const startOn = r.optionalText("startOn");
  const closingDay = r.optionalText("closingDay");
  const closingTime = r.optionalText("closingTime");
  return inExercise(actor, exerciseIdOf(data), async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT" && ex.status !== "DOCUMENTS_IN_PREPARATION") return { ok: false, message: DATES_LOCKED_TEXT };
    if (ex.packKindSnapshot === "NONE") return { ok: false, message: "This exercise assembles no tender documents, so it has no tendering dates to propose." };
    const judged = approvalDatesFault({ startOn, closingDay, closingTime, timeZone: l.org.timeZone, today: l.org.today });
    if (judged.faults.length) {
      const where = (code: string) => (code === "CLOSING_TIME_NOT_VALID" ? "closingTime" : code === "START_IN_PAST" || code === "DATES_REQUIRED" ? "startOn" : "closingDay");
      return { ok: false, errors: Object.fromEntries(judged.faults.map((f) => [where(f.code), datesFaultText(f)])) };
    }
    const before = proposedDatesOf(ex, l.org.timeZone);
    const after = { startOn: startOn!, closingDay: closingDay!, closingTime: closingTime! };
    if (before.startOn === after.startOn && before.closingDay === after.closingDay && before.closingTime === after.closingTime) return { ok: true };
    // Only the proposal is written here; the exercise's own start and closing are the approving step's (X-2, BD-64-31).
    const proposedInstant = judged.closingAt;
    await tx.sourcingExercise.update({ where: { id: ex.id, organisationId: actor.organisationId }, data: { proposedStartOn: dayToDate(startOn!), proposedClosingAt: proposedInstant } });
    const words = (d: { startOn: string | null; closingDay: string | null; closingTime: string | null }) => ({
      proposedStart: d.startOn ? formatDate(d.startOn) : null,
      proposedClosing: d.closingDay && d.closingTime ? `${formatDate(d.closingDay)}, ${d.closingTime}` : null,
    });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", ex.id, labelOf(l, ex.title), "UPDATE", diffFields(words(before), words(after)));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the opening officers (SR-07)

const NOT_PINNED: FormState = { ok: false, message: "This exercise was made before opening officers were named on it: its panel is still picked when the opening starts." };

/**
 * Wave 3b step 8 (ADR 0036 D3, D11). The exercise key is split across the named officers, so the roster and the key move together. Once an online exercise is published its
 * key is frozen with it and an officer cannot be named, taken off or replaced here: that is a controlled change (step 17), refused in words. Before publication a roster
 * change retires the key and shreds every share of it in the same transaction, and the key is made again at once when every remaining officer already has a share.
 */
const ONLINE_PUBLISHED: FormState = { ok: false, message: "This exercise is published and takes bids online, so its opening officers are fixed together with its key. Changing them is a controlled change that is not built yet." };
const onlinePublished = (ex: { submissionChannel: string | null; publishedKeyFingerprint: string | null }) => ex.submissionChannel === "ONLINE" && ex.publishedKeyFingerprint !== null;

async function keyAfterRosterChange(tx: Tx, actor: StaffActor, l: LockedExercise, reason: string) {
  if (l.ex.submissionChannel !== "ONLINE") return;
  const r = await rekeyAfterRosterChange(tx, l.org.id, l.ex.id, reason || "The opening officers changed", new Date(), actor.personId);
  if (!r.retiredKey && !r.made) return;
  await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, labelOf(l, "Exercise key"), "UPDATE", diffFields({ exerciseKey: r.retiredKey ? "In place" : "Not made" }, { exerciseKey: r.made ? `Made again (${r.made.fingerprint})` : "Retired: the officers set their shares again" }), reason);
}

/// The officer's facts as the roster rules read them, for a person on record in this organisation. Null: not on record.
async function officerFacts(tx: Tx, organisationId: string, personId: string): Promise<(RosterOfficer & { id: string }) | null> {
  const p = await tx.person.findFirst({ where: { id: personId, organisationId }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
  if (!p) return null;
  return { id: p.id, personId: p.id, name: p.name, active: p.isActive, orgUnitCode: p.orgUnitCode, administrator: await personIsAdministrator(tx, p.id) };
}

/// Name one more officer to open the bids. Allowed until the documents are submitted; after that an officer is replaced, not added.
export async function nameOpeningOfficer(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const r = new FormReader(data);
  const personId = r.text("personId", "Officer", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(actor, exerciseIdOf(data), async (tx, l) => {
    const ex = l.ex;
    if (!ex.openingRosterRequired) return NOT_PINNED;
    if (onlinePublished(ex)) return ONLINE_PUBLISHED;
    const change = rosterChange({ status: ex.status, closing: ex.closingAt, now: new Date(), openingStarted: (await tx.opening.count({ where: { exerciseId: ex.id } })) > 0 });
    if (change.fault) return { ok: false, message: openingFindingText({ code: change.fault, level: "block" }) };
    if (change.change !== "FREE") return { ok: false, message: "The documents are already submitted, so the officers are replaced by a controlled change with its authority and reason, not added to." };
    const roster = await loadOpeningRoster(ex, l.org, tx);
    const officer = await officerFacts(tx, l.org.id, personId);
    if (!officer) return { ok: false, errors: { personId: "Choose someone on record." } };
    const refusedBy = incomingRefusal(addOfficerFaults(roster.input, officer));
    if (refusedBy) return { ok: false, ...(refusedBy.message ? { message: refusedBy.message } : {}), ...(refusedBy.personId ? { errors: { personId: refusedBy.personId } } : {}) };
    // Being named opens the exercise's classified figures to the officer, as a participant is: the same rule says who may do it.
    const refused = await namingRefusal(tx, actor, ex.id, [officer.id]);
    if (refused) return { ok: false, errors: { personId: refused } };
    const seat = roster.input.seats.find((s) => s.personId === officer.id)!;
    const row = await tx.exerciseOpeningOfficer.create({
      data: { organisationId: l.org.id, exerciseId: ex.id, personId: officer.id, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, namedAt: new Date(), namedByPersonId: actor.personId },
    });
    await audit(tx, toAuditActor(actor), l.org.id, "ExerciseOpeningOfficer", row.id, labelOf(l, `Opening officer · ${officer.name}`), "CREATE", diffFields(null, { officer: officer.name, seat: seat.seatLabel, committee: roster.committee?.nameEn ?? null }));
    await keyAfterRosterChange(tx, actor, l, "An opening officer was named");
    return { ok: true };
  });
}

/// Take an officer off before the documents are submitted. The row ends and stays; the reason is asked and kept.
export async function removeOpeningOfficer(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const r = new FormReader(data);
  const officerId = r.text("officerId", "Officer", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(actor, exerciseIdOf(data), async (tx, l) => {
    const ex = l.ex;
    if (!ex.openingRosterRequired) return NOT_PINNED;
    if (onlinePublished(ex)) return ONLINE_PUBLISHED;
    const change = rosterChange({ status: ex.status, closing: ex.closingAt, now: new Date(), openingStarted: (await tx.opening.count({ where: { exerciseId: ex.id } })) > 0 });
    if (change.fault) return { ok: false, message: openingFindingText({ code: change.fault, level: "block" }) };
    if (change.change !== "FREE") return { ok: false, message: "The documents are already submitted. An officer is replaced, with the authority and reason, not taken off." };
    // Who may take an officer off is who may name one: the roster decides who opens the classified figures.
    const notAllowed = await namingOthersRefusal(tx, actor, ex.id);
    if (notAllowed) return { ok: false, message: notAllowed };
    const row = await tx.exerciseOpeningOfficer.findFirst({ where: { id: officerId, organisationId: actor.organisationId, exerciseId: ex.id, endedAt: null }, include: { person: { select: { name: true } } } });
    if (!row) return { ok: false, message: "That officer is no longer named." };
    await tx.exerciseOpeningOfficer.update({ where: { id: row.id, organisationId: actor.organisationId }, data: { endedAt: new Date(), endedByPersonId: actor.personId, endedReason: reason } });
    await audit(tx, toAuditActor(actor), l.org.id, "ExerciseOpeningOfficer", row.id, labelOf(l, `Opening officer · ${row.person.name}`), "DELETE", snapshotFields({ officer: row.person.name, seat: row.seatLabelSnapshot }), reason);
    await keyAfterRosterChange(tx, actor, l, `An opening officer was taken off: ${reason}`);
    return { ok: true };
  });
}

/**
 * Replace an officer with another (ruling 11). Before submission it is an ordinary edit with a reason. From submission to the closing it is a
 * controlled change: the authority it is made under and the reason are recorded, and the replacement faces the same seat, size and
 * independence checks. At the closing, and after it, it is refused: the bids cannot be opened without every named officer, and the exercise would
 * have to be re-tendered. (For an online exercise the key is rewrapped here; that arrives with SR-13.)
 */
export async function substituteOpeningOfficer(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const r = new FormReader(data);
  const officerId = r.text("officerId", "Officer to replace", { required: true });
  const personId = r.text("personId", "Replacement", { required: true });
  const authority = r.text("authority", "Authority", { max: 300 });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(actor, exerciseIdOf(data), async (tx, l) => {
    const ex = l.ex;
    if (!ex.openingRosterRequired) return NOT_PINNED;
    if (onlinePublished(ex)) return ONLINE_PUBLISHED;
    const change = rosterChange({ status: ex.status, closing: ex.closingAt, now: new Date(), openingStarted: (await tx.opening.count({ where: { exerciseId: ex.id } })) > 0 });
    if (change.fault) return { ok: false, message: openingFindingText({ code: change.fault, level: "block" }) };
    if (change.change === "CONTROLLED") {
      const missing = controlledChangeFaults({ authority, reason });
      if (missing.length) return { ok: false, errors: Object.fromEntries(missing.map((f) => [f.code === "AUTHORITY_REQUIRED" ? "authority" : "reason", rosterChangeText(f.code as "AUTHORITY_REQUIRED" | "REASON_REQUIRED")])) };
    }
    const departing = await tx.exerciseOpeningOfficer.findFirst({ where: { id: officerId, organisationId: actor.organisationId, exerciseId: ex.id, endedAt: null }, include: { person: { select: { name: true } } } });
    if (!departing) return { ok: false, message: "That officer is no longer named." };
    if (departing.personId === personId) return { ok: false, errors: { personId: "Choose someone other than the officer being replaced." } };
    const roster = await loadOpeningRoster(ex, l.org, tx);
    const without = { ...roster.input, officers: roster.input.officers.filter((o) => o.personId !== departing.personId) };
    const officer = await officerFacts(tx, l.org.id, personId);
    if (!officer) return { ok: false, errors: { personId: "Choose someone on record." } };
    const refusedBy = incomingRefusal(addOfficerFaults(without, officer));
    if (refusedBy) return { ok: false, ...(refusedBy.message ? { message: refusedBy.message } : {}), ...(refusedBy.personId ? { errors: { personId: refusedBy.personId } } : {}) };
    const refused = await namingRefusal(tx, actor, ex.id, [officer.id]);
    if (refused) return { ok: false, errors: { personId: refused } };
    const seat = roster.input.seats.find((s) => s.personId === officer.id)!;
    const now = new Date();
    await tx.exerciseOpeningOfficer.update({ where: { id: departing.id, organisationId: actor.organisationId }, data: { endedAt: now, endedByPersonId: actor.personId, endedAuthority: authority, endedReason: reason } });
    const row = await tx.exerciseOpeningOfficer.create({
      data: { organisationId: l.org.id, exerciseId: ex.id, personId: officer.id, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, namedAt: now, namedByPersonId: actor.personId },
    });
    await audit(tx, toAuditActor(actor), l.org.id, "ExerciseOpeningOfficer", departing.id, labelOf(l, `Opening officer · ${departing.person.name}`), "DELETE", snapshotFields({ officer: departing.person.name, seat: departing.seatLabelSnapshot, replacedBy: officer.name, authority: authority || null }), reason);
    await audit(tx, toAuditActor(actor), l.org.id, "ExerciseOpeningOfficer", row.id, labelOf(l, `Opening officer · ${officer.name}`), "CREATE", diffFields(null, { officer: officer.name, seat: seat.seatLabel, replaces: departing.person.name, authority: authority || null }), reason);
    await keyAfterRosterChange(tx, actor, l, `An opening officer was replaced: ${reason}`);
    return { ok: true };
  });
}
