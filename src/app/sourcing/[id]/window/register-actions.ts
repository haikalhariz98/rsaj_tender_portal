"use server";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, instantAt, storedDay } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { manualFeeReceipt } from "@/lib/integration/fee-receipt";
import { addendaForNewPurchaser, addendumWindowFault, deliveryFaults, issueFaults, nextAddendumNumber, recipientsFor } from "@/lib/window/addendum";
import { addendumFields, deliveryFields, ENTITY, eventFields, partyFields, saleFields } from "@/lib/window/audit-view";
import { invitedSaleFault, windowEditFault } from "@/lib/window/edit";
import { eventFaults, heldFault } from "@/lib/window/events";
import { regKey } from "@/lib/window/invitees";
import { lockAddendumRows, lockSaleRows } from "@/lib/window/lock";
import { closingDay, pathOf, phaseOf, renderAddendum } from "@/lib/window/judge";
import { windowFindingText } from "@/lib/window/labels";
import { eventFactsOf, type WindowData } from "@/lib/window/repo";
import { ATTESTABLE_CHECKS, saleAnnotation, saleFaults, voidSaleFault } from "@/lib/window/sale";
import { CERT_SIGHTED, DELIVERY_METHODS, SITE_EVENT_KINDS, type CertSighted, type CheckState, type DeliveryMethod, type Finding, type PartySource, type SiteEventKind } from "@/lib/window/types";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, CHANGED, exerciseIdOf, inWindow, label, NO_WINDOW, NO_ZONE, notes, refuse, Refusal, type LockedWindow } from "./shared";

/**
 * Writes for 6.5's registers (plan §4.4–4.6): the sale of the documents (FR-ADV-009–012), the
 * briefing and site visit with their attendance (FR-ADV-013) and the addenda with each copy's
 * delivery (FR-ADV-014). Each re-derives the window's phase now, under the locks, and re-runs its
 * rule on the locked rows (`shared.ts`).
 */

const TRI = ["yes", "no", "unset"] as const;
const tri = (v: (typeof TRI)[number] | null) => (v === "yes" ? true : v === "no" ? false : null);

/// The party a register act names: an existing one by id, or one found or made by registration number.
async function partyFor(tx: Tx, l: LockedWindow, d: WindowData, r: { partyId: string | null; name: string; registrationNo: string; address: string; phone: string; fax: string; email: string }, source: PartySource) {
  if (r.partyId) return d.parties.find((p) => p.id === r.partyId) ?? null;
  const known = d.parties.find((p) => regKey(p.registrationNo) === regKey(r.registrationNo));
  if (known) return known;
  const row = { source, name: r.name, registrationNo: r.registrationNo, address: r.address, phone: r.phone, fax: r.fax, email: r.email };
  const party = await tx.exerciseParty.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, ...row } });
  await audit(tx, l.org.id, ENTITY.party, party.id, label(l, `Contractor ${r.name}`), "CREATE", diffFields(null, partyFields(row)));
  return party;
}

function readParty(r: FormReader) {
  const partyId = r.optionalText("partyId");
  const name = r.text("name", "Contractor", { required: !partyId, max: 240 });
  const registrationNo = r.text("registrationNo", "Registration number", { required: !partyId, max: 80 });
  return { partyId, name, registrationNo, address: r.text("address", "Address", { max: 1000 }), phone: r.text("phone", "Telephone", { max: 60 }), fax: r.text("fax", "Fax", { max: 60 }), email: r.text("email", "Email", { max: 200 }) };
}

// ------------------------------------------------------------------ sales

/**
 * Sell the documents (FR-ADV-009–012). The sale day is the organisation's today, stamped here; the
 * amount is the window's fee as it stands; the finance receipt number is consumed (or recorded
 * later, the sale then on the reconciliation list). The register checks are attested "not checked"
 * (OD-9), a warning carried with the sale. Every issued addendum goes with the documents.
 */
export async function recordSale(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const party = readParty(r);
  const collectedBy = r.text("collectedBy", "Collected by", { max: 240 });
  const authority = r.choice("authoritySighted", "Proof of authority sighted", TRI);
  const cert = r.choice("restrictionCertSighted", "Status certificate", CERT_SIGHTED) as CertSighted | null;
  const certUntil = r.date("restrictionCertValidUntil", "Status certificate valid until");
  const registrationCheck = (r.choice("registrationCheck", "Registration", ATTESTABLE_CHECKS) ?? "NOT_CHECKED") as CheckState;
  const suspensionCheck = (r.choice("suspensionCheck", "Suspension", ATTESTABLE_CHECKS) ?? "NOT_CHECKED") as CheckState;
  const checkNote = r.text("checkNote", "Note on the checks", { max: 2000 });
  const paymentMethod = r.text("paymentMethod", "How the fee was paid", { max: 120 });
  const receiptNo = r.optionalText("financeReceiptNo");
  const personId = r.optionalText("issuedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockSaleRows(tx, w.id);
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { issuedByPersonId: windowFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const now = new Date();
    const phase = phaseOf(l.ex, w, now, l.org.timeZone).phase;
    const known = party.partyId ? d.parties.find((p) => p.id === party.partyId) ?? null : d.parties.find((p) => regKey(p.registrationNo) === regKey(party.registrationNo)) ?? null;
    if (party.partyId && !known) return { ok: false, message: "That contractor is not on this exercise." };
    const invited = invitedSaleFault(pathOf(d).path, !!known && w.letters.some((x) => x.partyId === known.id));
    if (invited) return refuse([invited], "Not sold:");
    const taken = receiptNo ? !!(await tx.documentSale.findFirst({ where: { organisationId: l.org.id, financeReceiptNo: receiptNo }, select: { id: true } })) : false;
    const fs: Finding[] = saleFaults({
      phase,
      soldOn: l.org.today,
      closingDay: closingDay(l.ex.closingAt, l.org.timeZone),
      restricted: l.ex.restrictedTender,
      certSighted: cert,
      certValidUntil: certUntil ? storedDay(certUntil) : null,
      authoritySighted: tri(authority),
      registrationCheck,
      suspensionCheck,
      partyId: known?.id ?? null,
      alreadySold: !!known && w.sales.some((s) => s.partyId === known.id && !s.voidedAt),
      events: eventFactsOf(w),
      mandatoryPermitted: d.policy.mandatoryAttendancePermitted,
      receiptNo,
      receiptTaken: taken,
      feeSet: w.feeAmount != null,
      collectedBy,
      paymentMethod,
    });
    if (receiptNo) for (const rf of manualFeeReceipt.check({ number: receiptNo, recordedOn: l.org.today }, { pattern: null, today: l.org.today, taken: false })) fs.push({ code: rf, level: "block" });
    if (fs.some((f) => f.level === "block")) return refuse(fs, "Not sold:");
    const buyer = await partyFor(tx, l, d, party, "PURCHASER");
    if (!buyer) return { ok: false, message: "That contractor is not on this exercise." };
    const soldOn = dayToDate(l.org.today);
    const annotation = saleAnnotation({ exerciseReference: l.ex.reference, purchaser: buyer.name, address: buyer.address, phone: buyer.phone, fax: buyer.fax, closingText: formatOrgDateTime(l.ex.closingAt, l.org.timeZone), issuedBy: person.name, soldOnText: formatDate(l.org.today), receiptNo });
    const row = {
      partyId: buyer.id,
      soldOn,
      collectedBy,
      authoritySighted: true,
      restrictionCertSighted: l.ex.restrictedTender ? cert : null,
      restrictionCertValidUntil: l.ex.restrictedTender ? certUntil : null,
      registrationCheck,
      suspensionCheck,
      checkNote,
      amount: w.feeAmount!,
      paymentMethod,
      financeReceiptNo: receiptNo,
      receiptRecordedOn: receiptNo ? soldOn : null,
      issuedByPersonId: person.id,
    };
    const sale = await tx.documentSale.create({ data: { organisationId: l.org.id, windowId: w.id, ...row, annotation: annotation as unknown as Prisma.InputJsonValue } });
    await audit(tx, l.org.id, ENTITY.sale, sale.id, label(l, `Sale · ${buyer.name}`), "CREATE", diffFields(null, saleFields({ ...row, partyName: buyer.name, issuedBy: person.name })));
    // Every addendum issued so far goes with the documents (FR-ADV-014).
    for (const a of addendaForNewPurchaser(w.addenda)) {
      if (a.recipients.some((x) => x.partyId === buyer.id)) continue;
      const copy = await tx.addendumRecipient.create({ data: { organisationId: l.org.id, addendumId: a.id, partyId: buyer.id, withDocuments: true } });
      await audit(tx, l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${a.number} · ${buyer.name}`), "CREATE", diffFields(null, { recipient: buyer.name, given: "with the documents" }));
    }
    const said = notes(fs);
    return { ok: true, message: `Sold to ${buyer.name}.${said ? ` ${said}` : ""}` };
  });
}

/// Void a sale recorded in error, with a reason; refused once the window has closed (X-11).
export async function voidSale(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const saleId = String(data.get("saleId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inWindow(exerciseId, async (tx, l, d) => {
    const w = d.window;
    const s = w?.sales.find((x) => x.id === saleId);
    if (!w || !s) return { ok: false, message: "That sale is not on this exercise." };
    await lockSaleRows(tx, w.id);
    const f = voidSaleFault(s, phaseOf(l.ex, w, new Date(), l.org.timeZone).phase, reason);
    if (f) return f.code === "REASON_REQUIRED" ? { ok: false, errors: { reason: windowFindingText(f) } } : refuse([f], "Not voided:");
    const moved = await tx.documentSale.updateMany({ where: { id: s.id, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, ENTITY.sale, s.id, label(l, `Sale · ${s.party.name}`), "UPDATE", diffFields({ voided: "no" }, { voided: "yes" }), reason);
    return { ok: true };
  });
}

/// Record the finance receipt number of a sale that has none yet (OD-11: consumed, unique, never minted).
export async function recordReceipt(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const saleId = String(data.get("saleId") ?? "");
  const r = new FormReader(data);
  const number = r.text("financeReceiptNo", "Receipt number", { required: true, max: 80 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const s = d.window?.sales.find((x) => x.id === saleId);
    if (!s || s.voidedAt) return { ok: false, message: "That sale is not live on this exercise." };
    if (s.financeReceiptNo) return { ok: false, message: "A receipt number is already recorded on this sale." };
    const taken = !!(await tx.documentSale.findFirst({ where: { organisationId: l.org.id, financeReceiptNo: number, NOT: { id: s.id } }, select: { id: true } }));
    const fs = manualFeeReceipt.check({ number, recordedOn: l.org.today }, { pattern: null, today: l.org.today, taken });
    if (fs.length) return { ok: false, errors: { financeReceiptNo: fs.map((code) => windowFindingText({ code, level: "block" })).join(" ") } };
    const on = dayToDate(l.org.today);
    await tx.documentSale.update({ where: { id: s.id }, data: { financeReceiptNo: number, receiptRecordedOn: on } });
    await audit(tx, l.org.id, ENTITY.sale, s.id, label(l, `Sale · ${s.party.name}`), "UPDATE", diffFields({ financeReceipt: null }, { financeReceipt: number, receiptRecordedOn: formatDate(l.org.today), source: "typed by an officer from the finance receipt" }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ briefings and site visits

/**
 * Schedule a briefing or site visit (FR-ADV-003 (e)/(f)), while the window is prepared. Its day,
 * time and place together; mandatory only where the policy permits it (OD-8), and then answered.
 */
export async function scheduleEvent(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const kind = r.choice("kind", "Event", SITE_EVENT_KINDS, { required: true }) as SiteEventKind | null;
  const on = r.date("day", "Day", { required: true });
  const time = r.text("time", "Time", { required: true, max: 5 });
  const place = r.text("place", "Place", { required: true, max: 400 });
  const mandatory = r.choice("mandatory", "Attendance mandatory", TRI);
  const notesText = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !kind || !on) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    if (!d.window) return NO_WINDOW;
    const startsAt = instantAt(storedDay(on), time, l.org.timeZone);
    if (!l.org.timeZone) return NO_ZONE;
    if (!startsAt) return { ok: false, errors: { time: "Give the time on the 24-hour clock, such as 10:00." } };
    const ev = { kind, startsAt, place, mandatory: tri(mandatory), cancelled: false };
    const blocks = eventFaults(ev, d.policy.mandatoryAttendancePermitted, l.ex.closingAt).filter((f) => f.code === "MANDATORY_NOT_PERMITTED" || f.code === "EVENT_AFTER_CLOSING");
    if (blocks.length) return refuse(blocks, "Not scheduled:");
    const row = await tx.siteEvent.create({ data: { organisationId: l.org.id, windowId: d.window.id, kind, startsAt, place, mandatory: tri(mandatory), notes: notesText } });
    await audit(tx, l.org.id, ENTITY.event, row.id, label(l, `${kind === "BRIEFING" ? "Tender briefing" : "Site visit"}`), "CREATE", diffFields(null, eventFields({ ...row }, l.org.timeZone)));
    return { ok: true };
  });
}

/// Answer whether attendance at an event is mandatory, while the window is prepared (OD-8).
export async function setEventMandatory(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const mandatory = r.choice("mandatory", "Attendance mandatory", TRI, { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e || e.cancelledAt) return { ok: false, message: "That event is not scheduled on this exercise." };
    const answer = tri(mandatory);
    if (answer === true && d.policy.mandatoryAttendancePermitted !== true) return refuse([{ code: "MANDATORY_NOT_PERMITTED", level: "block", data: { kind: e.kind, permitted: d.policy.mandatoryAttendancePermitted == null ? "not set" : "no" } }]);
    await tx.siteEvent.update({ where: { id: e.id }, data: { mandatory: answer } });
    await audit(tx, l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ mandatory: e.mandatory == null ? "Not answered" : e.mandatory ? "Yes" : "No" }, { mandatory: answer == null ? "Not answered" : answer ? "Yes" : "No" }));
    return { ok: true };
  });
}

/**
 * Cancel an event, with a reason. Before publication it simply comes off the notice; after, the
 * notice stated it, so the purchasers are told by an addendum (the screen says so).
 */
export async function cancelEvent(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(exerciseId, async (tx, l, d) => {
    if (l.ex.status === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e || e.cancelledAt) return { ok: false, message: "That event is not scheduled on this exercise." };
    if (e.heldOn) return refuse([{ code: "ALREADY_HELD", level: "block" }]);
    await tx.siteEvent.update({ where: { id: e.id }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ cancelled: "no" }, { cancelled: "yes" }), reason);
    const published = l.ex.status === "ADVERTISED" || l.ex.status === "INVITED";
    return { ok: true, message: published ? "Cancelled. The published notice stated it: tell the purchasers by an addendum." : "Cancelled." };
  });
}

/// Record an event held, on a day not before its start and not after today.
export async function markEventHeld(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const on = r.date("heldOn", "Held on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    if (l.ex.status !== "ADVERTISED" && l.ex.status !== "INVITED") return refuse([{ code: "NOT_PUBLISHED", level: "block" }]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e) return { ok: false, message: "That event is not scheduled on this exercise." };
    const f = heldFault({ startsAt: e.startsAt, heldOn: e.heldOn ? storedDay(e.heldOn) : null, cancelled: e.cancelledAt != null }, storedDay(on), l.org.today, l.org.timeZone);
    if (f) return f.code === "HELD_BEFORE_START" || f.code === "HELD_IN_FUTURE" ? { ok: false, errors: { heldOn: windowFindingText(f) } } : refuse([f]);
    await tx.siteEvent.update({ where: { id: e.id }, data: { heldOn: on } });
    await audit(tx, l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ heldOn: null }, { heldOn: formatDate(storedDay(on)) }));
    return { ok: true };
  });
}

/// Record a contractor's attendance at a held event, by a named Person (recorded on their behalf, not signed).
export async function recordAttendance(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const party = readParty(r);
  const representative = r.text("representative", "Representative", { required: true, max: 240 });
  const personId = r.optionalText("recordedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    const w = d.window;
    const e = w?.events.find((x) => x.id === eventId);
    if (!w || !e) return { ok: false, message: "That event is not scheduled on this exercise." };
    if (e.cancelledAt) return refuse([{ code: "EVENT_CANCELLED", level: "block" }]);
    if (!e.heldOn) return { ok: false, message: "Record the event held first, then its attendance." };
    const phase = phaseOf(l.ex, w, new Date(), l.org.timeZone).phase;
    if (phase === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }]);
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { recordedByPersonId: windowFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const known = party.partyId ? d.parties.find((p) => p.id === party.partyId) ?? null : d.parties.find((p) => regKey(p.registrationNo) === regKey(party.registrationNo)) ?? null;
    if (party.partyId && !known) return { ok: false, message: "That contractor is not on this exercise." };
    if (known && e.attendance.some((a) => a.partyId === known.id)) return { ok: false, message: `${known.name} is already on this event's register.` };
    // On the invited path only the invitees attend (they alone may buy).
    if (pathOf(d).path === "INVITED" && (!known || known.source !== "PROPOSED_INVITEE")) return refuse([{ code: "NOT_INVITED", level: "block" }]);
    const attendee = await partyFor(tx, l, d, party, "ATTENDEE");
    if (!attendee) return { ok: false, message: "That contractor is not on this exercise." };
    const row = await tx.siteEventAttendance.create({ data: { organisationId: l.org.id, eventId: e.id, partyId: attendee.id, representative, recordedByPersonId: person.id } });
    await audit(tx, l.org.id, ENTITY.attendance, row.id, label(l, `${e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"} · ${attendee.name}`), "CREATE", diffFields(null, { contractor: attendee.name, representative, recordedBy: person.name, recordedOnBehalf: "not signed" }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ addenda (FR-ADV-014)

/// Draft an addendum during the window: its title and what it changes; the signed copy is attached to it.
export async function saveAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "") || null;
  const r = new FormReader(data);
  const title = r.text("title", "Title", { required: true, max: 240 });
  const whatChanged = r.text("whatChanged", "What it changes", { required: true, max: 8000 });
  const closingChangeId = r.optionalText("closingChangeId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    const w = d.window;
    if (!w) return NO_WINDOW;
    const wf = addendumWindowFault(phaseOf(l.ex, w, new Date(), l.org.timeZone).phase);
    if (wf) return refuse([wf], "Not saved:");
    if (closingChangeId && !w.closingChanges.some((c) => c.id === closingChangeId)) return { ok: false, errors: { closingChangeId: "That change is not on this exercise." } };
    const row = { title, whatChanged, closingChangeId };
    if (addendumId) {
      const a = w.addenda.find((x) => x.id === addendumId);
      if (!a || a.status !== "DRAFT") return refuse([{ code: "NOT_DRAFT", level: "block" }]);
      await tx.addendum.update({ where: { id: a.id }, data: row });
      await audit(tx, l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${title}`), "UPDATE", diffFields({ title: a.title, whatChanged: a.whatChanged }, { title, whatChanged }));
    } else {
      const a = await tx.addendum.create({ data: { organisationId: l.org.id, windowId: w.id, ...row } });
      await audit(tx, l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${title}`), "CREATE", diffFields(null, addendumFields({ ...a })));
    }
    return { ok: true };
  });
}

/// Void a draft addendum, with a reason. It never took a number.
export async function voidAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(exerciseId, async (tx, l, d) => {
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockAddendumRows(tx, w.id);
    const a = w.addenda.find((x) => x.id === addendumId);
    if (!a || a.status !== "DRAFT") return refuse([{ code: "NOT_DRAFT", level: "block" }]);
    const moved = await tx.addendum.updateMany({ where: { id: a.id, status: "DRAFT" }, data: { status: "VOID", voidReason: reason } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${a.title}`), "UPDATE", diffFields({ status: "Draft" }, { status: "Voided" }), reason);
    return { ok: true };
  });
}

/**
 * Issue an addendum (FR-ADV-014): under the window's lock and its addenda's, numbered one after the
 * last issued, its text frozen from the configured template, its recipients the register as it
 * stands (FR-ADV-012). Delivery is then recorded per recipient; nothing is sent.
 */
export async function issueAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "");
  return inWindow(exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockAddendumRows(tx, w.id);
    const a = w.addenda.find((x) => x.id === addendumId);
    if (!a) return { ok: false, message: "That addendum is not on this exercise." };
    const number = nextAddendumNumber(w.addenda);
    const rendered = renderAddendum(d, l.ex, l.org.timeZone, { number, title: a.title, whatChanged: a.whatChanged, issuedOn: l.org.today });
    const recipients = recipientsFor(w.sales, w.letters.map((x) => ({ partyId: x.partyId })));
    const signedCopies = a.attachments.filter((x) => !x.detachedAt && !x.version.withdrawnAt).length;
    const fs = issueFaults({ status: a.status, phase: phaseOf(l.ex, w, new Date(), l.org.timeZone).phase, title: a.title, whatChanged: a.whatChanged, signedCopies, template: { state: rendered.state === "NO_LANGUAGE" ? "NO_TEXT" : rendered.state, missing: rendered.missing, unknown: rendered.unknown, stampMissing: rendered.stampMissing }, recipients: recipients.length, today: l.org.today });
    if (fs.some((f) => f.level === "block")) return refuse(fs, "Not issued:");
    const t = d.templates.addendum!;
    const issuedOn = dayToDate(l.org.today);
    const moved = await tx.addendum.updateMany({ where: { id: a.id, status: "DRAFT" }, data: { status: "ISSUED", number, issuedOn, renderedText: rendered.text!, templateCode: t.code, templateBodyVersion: t.bodyVersion, frozenAt: new Date() } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, ENTITY.addendum, a.id, label(l, `Addendum ${number}, ${a.title}`), "UPDATE", diffFields({ status: "Draft", number: null }, { status: "Issued", number, issuedOn: formatDate(l.org.today), frozenFrom: `${t.nameEn}, text version ${t.bodyVersion}`, recipients: recipients.length }));
    for (const partyId of recipients) {
      const p = d.parties.find((x) => x.id === partyId)!;
      const copy = await tx.addendumRecipient.create({ data: { organisationId: l.org.id, addendumId: a.id, partyId } });
      await audit(tx, l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${number} · ${p.name}`), "CREATE", diffFields(null, { recipient: p.name }));
    }
    return { ok: true, message: recipients.length ? `Addendum ${number} issued to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}. Record each copy's delivery.` : `Addendum ${number} issued. ${windowFindingText({ code: "NO_RECIPIENTS", level: "info" })}` };
  });
}

/// How a copy of an addendum went: recorded, never sent.
export async function recordAddendumDelivery(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const recipientId = String(data.get("recipientId") ?? "");
  const r = new FormReader(data);
  const method = r.choice("method", "Sent by", DELIVERY_METHODS) as DeliveryMethod | null;
  const consignmentRef = r.text("consignmentRef", "Consignment", { max: 120 });
  const sent = r.date("despatchedOn", "Sent on");
  const ack = r.date("acknowledgedOn", "Acknowledged on");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(exerciseId, async (tx, l, d) => {
    const a = d.window?.addenda.find((x) => x.recipients.some((c) => c.id === recipientId));
    const copy = a?.recipients.find((c) => c.id === recipientId);
    if (!a || !copy) return { ok: false, message: "That copy is not on this exercise." };
    const fs = deliveryFaults({ method, despatchedOn: sent ? storedDay(sent) : null, acknowledgedOn: ack ? storedDay(ack) : null, withDocuments: copy.withDocuments }, l.org.today);
    if (fs.length) return refuse(fs, "Not recorded:");
    const after = { method, consignmentRef, despatchedOn: sent, acknowledgedOn: ack };
    await tx.addendumRecipient.update({ where: { id: copy.id }, data: after });
    await audit(tx, l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${a.number} · ${copy.party.name}`), "UPDATE", diffFields(deliveryFields(copy), deliveryFields(after)));
    return { ok: true };
  });
}
