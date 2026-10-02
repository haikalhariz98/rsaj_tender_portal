"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { appliedFields, bidAnswerFields, BID_ENTITY, boxFields, correctionFields, envelopeFields, extensionFields, returnFields, statusField, withdrawalFields } from "@/lib/bids/audit-view";
import { lockFaults } from "@/lib/bids/box";
import { correctionFaults, type CorrectionChange } from "@/lib/bids/correction";
import { applyFaults, extensionFaults } from "@/lib/bids/extension";
import { bidFindingText } from "@/lib/bids/labels";
import { LATE_DOMAIN, lateMatterFault, lateMatterSubject } from "@/lib/bids/late";
import { lockBoxRows, lockEnvelopeRows, lockExtensionRows, lockWithdrawalRows } from "@/lib/bids/lock";
import { toSecond } from "@/lib/bids/lateness";
import { judgeReceipt, receiptFaults } from "@/lib/bids/receipt";
import { exerciseForBids, liveConsents, loadBidRule, loadBidWindow, loadBoxEvents, loadEnvelopes, loadExtensions, loadLateMatters, loadValidityOffsets, orgDay, validityOf } from "@/lib/bids/repo";
import { blocking, OFFICER_CHANNELS, RECEIPT_KINDS, type EnvelopeChannel, type Finding } from "@/lib/bids/types";
import { bidFieldsFaults } from "@/lib/bids/window-fields";
import { returnFaults, withdrawFaults } from "@/lib/bids/withdrawal";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { sittingPermits } from "@/lib/committee/meeting";
import { lockSittingIn } from "@/lib/committee/sittings";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { dayToDate, instantAt, isDay, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { ORGANISATION_CODE } from "@/lib/org";
import { organisationTimeZone } from "@/lib/org-time";
import { loadRoster } from "@/lib/people/load";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, exerciseIdOf, inWindow, label, type LockedWindow } from "../window/shared";

/**
 * Writes for 6.6's envelope register (plan §4). Each runs in one transaction that locks the
 * exercise's requisition, the exercise and its window (`inWindow`), then the register's rows the
 * act is about (envelopes, then withdrawals, box events or extensions), re-reads the closing, the
 * method's rules and the register under those locks, and re-runs the pure rule on the locked data.
 * The server's clock is read once, at the action's entry, before any lock is asked for, and
 * truncated to the second (`stampNow`, 6.6 CR-3); it is judged against the closing read under the
 * locks, so an extension committed while the act waited is honoured. No form field carries a time
 * on the server-stamped path. `sequence` stays recording order (taken under the envelope lock), so
 * under contention it may differ from stamp order by up to a second; it is never reordered. Every write is audited before and after in the same transaction. People are
 * "recorded on their behalf, not signed": there is no sign-in.
 */

const PROVENANCES = ["STATED", "OBSERVED", "ASSUMED"] as const;

/// CR-3: the server's stamp for a server-stamped act, read at the act's entry, to the second.
const stampNow = () => toSecond(new Date());

const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${blocking(fs).map(bidFindingText).join(" ")}` });
const warnings = (fs: readonly Finding[]) => fs.filter((f) => f.level !== "block").map(bidFindingText).join(" ");

/// The register's rows and rules, read under the locks `inWindow` and this take.
async function locked(tx: Tx, l: LockedWindow) {
  await lockEnvelopeRows(tx, l.ex.id);
  const window = await loadBidWindow(l.ex.id, tx);
  const events = await loadBoxEvents(l.ex.id, tx);
  const envelopes = await loadEnvelopes(l.ex.id, tx);
  return { window, events, envelopes, exercise: exerciseForBids(l.ex, window, l.org.timeZone, events) };
}

const nameOf = async (tx: Tx, orgId: string, personId: string | null) => (await activePerson(tx, orgId, personId)) ?? null;

function readReceipt(r: FormReader) {
  return {
    kind: r.choice("kind", "Envelope", RECEIPT_KINDS, { required: true }),
    channel: r.choice("channel", "How it came", OFFICER_CHANNELS, { required: true }),
    markings: r.text("markings", "Markings", { required: true, max: 1000 }),
    receivedByPersonId: r.optionalText("receivedByPersonId"),
    parentEnvelopeId: r.optionalText("parentEnvelopeId"),
  };
}

/**
 * Record a receipt, stamped now by the server. `stated` is the after-the-fact path's: the
 * officer's stated time and reason, kept beside the stamp and never judged (OD-3 amended).
 */
async function receive(exerciseId: string, v: ReturnType<typeof readReceipt>, stated: { at: Date; reason: string } | null, now: Date): Promise<FormState> {
  return inWindow(exerciseId, async (tx, l) => {
    const r = await locked(tx, l);
    const person = await nameOf(tx, l.org.id, v.receivedByPersonId);
    const parent = v.parentEnvelopeId ? (r.envelopes.find((e) => e.id === v.parentEnvelopeId) ?? null) : undefined;
    const fs = receiptFaults({ exercise: r.exercise, kind: v.kind!, channel: v.channel!, markings: v.markings, personActive: !!person, now, stated, parent: parent === undefined ? undefined : parent && { kind: parent.kind, status: parent.status } });
    if (blocking(fs).length) return refuse(fs);
    const judged = judgeReceipt(now, l.ex.closingAt!);
    const sequence = r.envelopes.reduce((n, e) => Math.max(n, e.sequence), 0) + 1;
    const row = await tx.bidEnvelope.create({
      data: {
        organisationId: l.org.id,
        exerciseId: l.ex.id,
        sequence,
        kind: v.kind!,
        channel: v.channel!,
        receivedAt: judged.receivedAt,
        receivedSource: stated ? "ENTERED" : "SERVER",
        statedReceivedAt: stated?.at ?? null,
        entryReason: stated?.reason ?? "",
        receivedByPersonId: person!.id,
        markings: v.markings,
        late: judged.late,
        closingAtJudged: judged.closingAtJudged,
        recordedAfterClosing: judged.recordedAfterClosing,
        parentEnvelopeId: parent ? parent.id : null,
      },
    });
    await audit(tx, l.org.id, BID_ENTITY.envelope, row.id, label(l, `Envelope ${sequence}`), "CREATE",
      diffFields(null, envelopeFields({ ...row, receivedBy: person!.name, parentSequence: parent ? parent.sequence : null }, l.org.timeZone)), stated?.reason ?? "");
    const said = warnings(fs);
    return { ok: true, message: `Envelope ${sequence} recorded${judged.late ? ", late" : ", in time"}.${said ? ` ${said}` : ""}` };
  });
}

/// FR-BID-002: record an envelope received now. The server stamps it; there is no time on this form.
export async function recordReceiptNow(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const v = readReceipt(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return receive(exerciseIdOf(data), v, null, now);
}

/// OD-3 amended: a receipt recorded after the event. The server still stamps it and the stamp decides; the officer's stated time and reason are kept beside it, shown.
export async function recordReceiptAfterTheFact(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const v = readReceipt(r);
  const statedDay = r.text("statedDay", "Received on", { required: true, max: 10 });
  const statedTime = r.text("statedTime", "At", { required: true, max: 5 });
  const reason = r.text("entryReason", "Why it is recorded now", { required: true, max: 1000 });
  if (statedDay && !isDay(statedDay)) r.reject("statedDay", "Give a day.");
  if (r.failed) return { ok: false, errors: r.errors };
  const exerciseId = exerciseIdOf(data);
  const tz = await organisationTimeZone();
  const at = instantAt(statedDay, statedTime, tz);
  if (!at) return { ok: false, errors: tz ? { statedTime: "Give a time of day, as HH:MM." } : {}, message: tz ? undefined : bidFindingText({ code: "TIME_ZONE_UNSET", level: "block" }) };
  return receive(exerciseId, v, { at, reason }, now);
}

/**
 * FR-BID-004, X-11: record a bidder's withdrawal letter, received before the closing. Its own
 * record, stamped now; the envelope named (over the counter or by post) is marked withdrawn, one in
 * the box is matched at opening. The letter is attached to the withdrawal (SULIT) from its row.
 */
export async function recordWithdrawal(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const envelopeId = r.optionalText("envelopeId");
  const markings = r.text("markings", "How the letter identifies the envelope", { required: true, max: 1000 });
  const personId = r.optionalText("receivedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    await lockWithdrawalRows(tx, l.ex.id);
    const person = await nameOf(tx, l.org.id, personId);
    const env = envelopeId ? reg.envelopes.find((e) => e.id === envelopeId) : null;
    if (envelopeId && !env) return { ok: false, message: "That envelope is not on this exercise." };
    const fs = withdrawFaults({ exercise: reg.exercise, now, envelope: env ? { kind: env.kind, late: env.late, status: env.status, withdrawn: env.withdrawal != null } : null, markings, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    const w = await tx.bidWithdrawal.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, receivedAt: now, receivedByPersonId: person!.id, markings, closingAtJudged: l.ex.closingAt!, envelopeId: env?.id ?? null } });
    await audit(tx, l.org.id, BID_ENTITY.withdrawal, w.id, label(l, env ? `Withdrawal of envelope ${env.sequence}` : "Withdrawal of an envelope in the box"), "CREATE", diffFields(null, withdrawalFields({ receivedAt: w.receivedAt, markings, receivedBy: person!.name, envelopeSequence: env?.sequence ?? null }, l.org.timeZone)));
    if (env) {
      const moved = await tx.bidEnvelope.updateMany({ where: { id: env.id, status: "RECEIVED" }, data: { status: "WITHDRAWN" } });
      if (moved.count !== 1) return { ok: false, message: "The envelope changed while this was being saved. Reload and try again." };
      await audit(tx, l.org.id, BID_ENTITY.envelope, env.id, label(l, `Envelope ${env.sequence}`), "UPDATE", diffFields(statusField("RECEIVED"), statusField("WITHDRAWN")));
    }
    return { ok: true, message: "Withdrawal recorded. Attach the letter to it on the Bids received tab." };
  });
}

/// Record that a withdrawn envelope was handed back unopened, on a day.
export async function recordReturnedUnopened(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const envelopeId = r.text("envelopeId", "Envelope", { required: true });
  const day = r.text("returnedOn", "Handed back on", { required: true, max: 10 });
  const note = r.text("returnNote", "To whom, and how", { max: 1000 });
  if (day && !isDay(day)) r.reject("returnedOn", "Give a day.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    const env = reg.envelopes.find((e) => e.id === envelopeId);
    if (!env) return { ok: false, message: "That envelope is not on this exercise." };
    const fs = returnFaults({ envelope: env, withdrawnOn: orgDay(env.withdrawal?.receivedAt ?? null, l.org.timeZone), day, today: l.org.today, cancelled: l.ex.status === "CANCELLED" });
    if (fs.length) return { ok: false, errors: { returnedOn: fs.map(bidFindingText).join(" ") } };
    const on = dayToDate(day);
    await tx.bidEnvelope.update({ where: { id: env.id }, data: { returnedUnopenedOn: on, returnNote: note } });
    await audit(tx, l.org.id, BID_ENTITY.envelope, env.id, label(l, `Envelope ${env.sequence}`), "UPDATE", diffFields({ returnedUnopened: null, note: null }, returnFields({ returnedUnopenedOn: on, note })));
    return { ok: true };
  });
}

/// FR-BID-005: a clerical correction of the markings, the channel or the receiving officer, before the closing, with a reason.
export async function correctEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const envelopeId = r.text("envelopeId", "Envelope", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  // Anything else posted is refused by name, never ignored (IMMUTABLE_FIELD).
  const change: CorrectionChange = {};
  for (const [k, v] of data.entries()) {
    if (["exerciseId", "envelopeId", "reason"].includes(k) || k.startsWith("$")) continue;
    change[k] = typeof v === "string" ? v.trim() : v;
  }
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    const env = reg.envelopes.find((e) => e.id === envelopeId);
    if (!env) return { ok: false, message: "That envelope is not on this exercise." };
    const person = change.receivedByPersonId !== undefined ? await nameOf(tx, l.org.id, String(change.receivedByPersonId)) : env.receivedBy;
    const fs = correctionFaults({ exercise: reg.exercise, now, envelope: { kind: env.kind, status: env.status, channel: env.channel, markings: env.markings, receivedByPersonId: env.receivedByPersonId }, change, reason, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    const next = { markings: change.markings ?? env.markings, channel: (change.channel ?? env.channel) as EnvelopeChannel, receivedByPersonId: person!.id };
    await tx.bidEnvelope.update({ where: { id: env.id }, data: { ...next, correctedAt: now } });
    await audit(tx, l.org.id, BID_ENTITY.envelope, env.id, label(l, `Envelope ${env.sequence}`), "UPDATE",
      diffFields(correctionFields({ channel: env.channel, markings: env.markings, receivedBy: env.receivedBy.name }), correctionFields({ channel: next.channel, markings: next.markings, receivedBy: person!.name })), reason);
    return { ok: true };
  });
}

/// Record the box locked at the closing, by a named officer, stamped now. Refused before the closing.
export async function lockBox(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const personId = r.optionalText("personId");
  const note = r.text("note", "Note", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    await lockBoxRows(tx, l.ex.id);
    const person = await nameOf(tx, l.org.id, personId);
    const fs = lockFaults({ exercise: reg.exercise, now, events: reg.events, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    const at = now;
    const row = await tx.boxEvent.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, kind: "LOCKED", occurredAt: at, personId: person!.id, note } });
    await audit(tx, l.org.id, BID_ENTITY.box, row.id, label(l, "Tender box locked"), "CREATE", diffFields(null, boxFields({ at, by: person!.name, note }, l.org.timeZone)));
    return { ok: true };
  });
}

/**
 * FR-CTE-008: table a late envelope's admission at a sitting of the committee the method names, as
 * a LATE_TENDER matter naming the envelope by its typed key. Locks the exercise (requisition,
 * exercise, window, envelopes) and then the sitting, as scope tabling does; re-runs
 * `lateMatterFault` and the Secretariat rule on the locked rows. The committee's decision is the
 * admission: CARRIED admits, NOT_CARRIED does not; it is decided at the sitting like any matter.
 */
export async function tableLateMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const envelopeId = r.text("envelopeId", "Envelope", { required: true });
  const meetingId = r.text("meetingId", "Sitting", { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  const roster = await loadRoster(ORGANISATION_CODE);
  const result = await inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    const env = reg.envelopes.find((e) => e.id === envelopeId);
    if (!env) return { ok: false, message: "That envelope is not on this exercise." };
    const s = await lockSittingIn(tx, meetingId, roster);
    if (!s) return { ok: false, errors: { meetingId: "That sitting no longer exists." } };
    // CR-2: the committee frozen with the window at publication, never today's method.
    const { rule, committee } = await loadBidRule(reg.window, l.org.id, l.ex.sourcingMethodCode, tx);
    const matters = await loadLateMatters(l.ex.id, tx);
    const fs = lateMatterFault({ exerciseCancelled: l.ex.status === "CANCELLED", committeeCode: rule?.lateAdmissionCommitteeCode ?? null, committeeSource: committee, envelope: env, matters, sitting: { committeeCode: s.meeting.committee.code, frozen: !sittingPermits(s.meeting.status, "TABLE") } });
    if (blocking(fs).length) return refuse(fs);
    const code = s.meeting.committee.secretariatRoleCode;
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(s.roster, code, s.today).map((h) => h.id), tablingDay: s.today });
    if (!tabling.ok) {
      return tabling.fault === "NOT_TABLED" || tabling.fault === "NOT_SECRETARIAT_HOLDER"
        ? { ok: false, errors: { tabledByPersonId: TABLING_FAULT_MESSAGE[tabling.fault] } }
        : { ok: false, message: `Nothing was saved: ${TABLING_FAULT_MESSAGE[tabling.fault]}` };
    }
    const subject = lateMatterSubject(l.ex.title, env.sequence);
    const tabledAt = dayToDate(s.today!);
    const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    // The committee decides admission itself: its decision is the act (BD-66-6).
    const row = await tx.committeeDecision.create({ data: { meetingId: s.meeting.id, subject, domain: LATE_DOMAIN, matterKind: "LATE_TENDER", matterRef: l.ex.reference, bidEnvelopeId: env.id, act: "A", tabledByPersonId, tabledAt, sequence } });
    await audit(tx, l.org.id, "CommitteeDecision", row.id, label(l, subject), "CREATE",
      diffFields(null, { matter: subject, envelope: `Envelope ${env.sequence}`, sitting: s.meeting.reference, committee: s.meeting.committee.nameEn, tabledBy: tabledByPersonId ? (s.names[tabledByPersonId] ?? null) : null, tabledOn: formatDate(s.today!), recordedOnBehalf: "yes" }));
    return { ok: true, message: `Tabled at ${s.meeting.reference}. It is decided there, at the sitting.` };
  });
  if (result.ok) {
    revalidatePath("/committees");
    revalidatePath(`/committees/${meetingId}`);
  }
  return result;
}

/**
 * FR-BID-010: record an extension of the bids' validity, on the recommended tenderer's consent
 * (named by the officer and attested until 6.8; OD-7). It is applied once the consent is attached.
 */
export async function recordValidityExtension(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const toExpiry = r.text("toExpiry", "New expiry", { required: true, max: 10 });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  const partyId = r.optionalText("consentPartyId");
  const consentOn = r.text("consentReceivedOn", "Consent received on", { required: true, max: 10 });
  const personId = r.optionalText("recordedByPersonId");
  if (toExpiry && !isDay(toExpiry)) r.reject("toExpiry", "Give a day.");
  if (consentOn && !isDay(consentOn)) r.reject("consentReceivedOn", "Give a day.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    await lockExtensionRows(tx, l.ex.id);
    const extensions = await loadExtensions(l.ex.id, tx);
    const { offsets } = await loadValidityOffsets(l.org.id, tx);
    const v = validityOf({ closing: l.ex.closingAt, timeZone: l.org.timeZone, days: reg.window?.bidValidityDays ?? null, extensions, offsets, now: new Date() });
    const party = partyId ? await tx.exerciseParty.findFirst({ where: { id: partyId, exerciseId: l.ex.id }, select: { id: true, name: true } }) : null;
    const person = await nameOf(tx, l.org.id, personId);
    const fs = extensionFaults({
      cancelled: l.ex.status === "CANCELLED",
      closing: l.ex.closingAt,
      now: new Date(),
      today: l.org.today,
      currentExpiry: v.expiry,
      toExpiry,
      reason,
      partyKnown: !!party,
      partyId,
      // 6.8 names the recommended tenderer; until it exists none is known, and the officer's naming is attested (OD-7).
      recommendedPartyId: null,
      consentReceivedOn: consentOn,
      pendingExists: extensions.some((x) => x.appliedAt == null),
      personActive: !!person,
    });
    if (blocking(fs).length) return refuse(fs);
    const row = await tx.validityExtension.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, fromExpiry: dayToDate(v.expiry!), toExpiry: dayToDate(toExpiry), reason, consentPartyId: party!.id, consentReceivedOn: dayToDate(consentOn), recordedByPersonId: person!.id } });
    await audit(tx, l.org.id, BID_ENTITY.extension, row.id, label(l, `Validity extension to ${formatDate(toExpiry)}`), "CREATE", diffFields(null, extensionFields({ ...row, consentParty: party!.name, recordedBy: person!.name })), reason);
    return { ok: true, message: "Extension recorded. Attach the tenderer's written consent to it, then apply it." };
  });
}

/// Apply a recorded extension, once its consent is attached and it is still later than the expiry that stands.
export async function applyValidityExtension(_prev: FormState, data: FormData): Promise<FormState> {
  const extensionId = String(data.get("extensionId") ?? "");
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const reg = await locked(tx, l);
    await lockExtensionRows(tx, l.ex.id);
    const extensions = await loadExtensions(l.ex.id, tx);
    const x = extensions.find((e) => e.id === extensionId);
    if (!x) return { ok: false, message: "That extension is not on this exercise." };
    const { offsets } = await loadValidityOffsets(l.org.id, tx);
    const v = validityOf({ closing: l.ex.closingAt, timeZone: l.org.timeZone, days: reg.window?.bidValidityDays ?? null, extensions, offsets, now: new Date() });
    const fs = applyFaults({ cancelled: l.ex.status === "CANCELLED", appliedAt: x.appliedAt, liveConsents: liveConsents(x), toExpiry: storedDay(x.toExpiry), currentExpiry: v.expiry });
    if (fs.length) return refuse(fs);
    const appliedAt = new Date();
    const moved = await tx.validityExtension.updateMany({ where: { id: x.id, appliedAt: null }, data: { appliedAt } });
    if (moved.count !== 1) return { ok: false, message: "The extension changed while this was being saved. Reload and try again." };
    await audit(tx, l.org.id, BID_ENTITY.extension, x.id, label(l, `Validity extension to ${formatDate(storedDay(x.toExpiry))}`), "UPDATE", diffFields({ applied: null }, appliedFields(appliedAt, l.org.timeZone)));
    revalidatePath("/awards");
    return { ok: true };
  });
}

/**
 * FR-BID-006, 009: the window's bid answers — the validity days the documents state, with where
 * the figure came from, and whether alternatives are permitted. Prepared before publication; once
 * published, only an unset validity may be recorded, once, with a reason (`bidFieldsFaults`).
 */
export async function saveBidAnswers(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const days = r.int("bidValidityDays", "Bids valid for (days)", { min: 1 });
  const provenance = r.choice("bidValidityProvenance", "Where the days came from", PROVENANCES);
  const alt = r.choice("alternativesPermitted", "Alternative bids", ["yes", "no", "unset"] as const, { required: true });
  const reason = r.text("reason", "Reason", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const alternativesPermitted = alt === "yes" ? true : alt === "no" ? false : null;
  return inWindow(exerciseIdOf(data), async (tx, l) => {
    const w = await loadBidWindow(l.ex.id, tx);
    if (!w) return { ok: false, message: "The window is not prepared yet. Save its notice items on the Invitation tab first." };
    const fs = bidFieldsFaults({ status: l.ex.status, packKind: l.ex.packKindSnapshot, current: { days: w.bidValidityDays, alternativesPermitted: w.alternativesPermitted }, next: { days, provenance, alternativesPermitted }, reason });
    if (fs.length) return refuse(fs);
    const next = { bidValidityDays: days, bidValidityProvenance: days == null ? null : provenance, alternativesPermitted };
    await tx.exerciseWindow.update({ where: { id: w.id }, data: next });
    await audit(tx, l.org.id, "ExerciseWindow", w.id, label(l, "Bids received · window answers"), "UPDATE", diffFields(bidAnswerFields(w), bidAnswerFields(next)), reason);
    return { ok: true };
  });
}
