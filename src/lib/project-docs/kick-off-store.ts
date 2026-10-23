/**
 * The kick-off meeting's acts, as transactional cores (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2): schedule it, change it before it is held, record it held.
 *
 * Each core runs INSIDE a locked contract, handed to it by the staff server action (`withLockedContract`, `src/app/projects/[id]/kick-off-actions.ts`), which has
 * already asked the act x status row PROJECT_WORKSPACE under that lock. Each then reads PW-5 on the organisation's today (`mayActForOrganisation`, `side.ts`: the S.O.,
 * someone acting as S.O., or a representative whose letter lists contractor communication; NOT `recorderFaultToday` alone), takes the ONE row lock of the meeting
 * (`SELECT ... FOR UPDATE` by the contract, never a no-op UPDATE, which the trigger refuses once held), and judges the locked row with the pure faults (`kick-off.ts`).
 * Lock order: contract, `KickOffMeeting`; recording it held then pins the minutes' staged files through `createDocument` (the store's documents, in id order).
 *
 * Recording it held is ONE act at the transaction's TOP level (PW-29; migration 20261123000000): (1) the minutes, an ordinary Project document of the organisation with no
 * approver, through `createDocument` (its Version 1 is shared at once, so the contractor sees it); (2) ONE UPDATE setting the four held columns; (3) the attendance rows. The
 * meeting's trigger (PA045) accepts only minutes made by this same transaction (`xmin`), and refuses at COMMIT a held meeting with no attendance; the attendance trigger
 * (PA046) only rows of a meeting set held by this same transaction. So no nested `$transaction`, no savepoint and no self-transacting helper is used here; and NO_MINUTES and
 * NO_ATTENDANCE are refused by `heldFaults` before anything is written, so the commit-time refusal is a backstop only.
 *
 * Every core writes its audit row with before and after (`writeAudit`, `diffFields`) in the same transaction. Scheduling attributes "Recorded by" (`KickOffMeeting.scheduledBy`);
 * recording it held attributes "Recorded by" (`KickOffMeeting.heldRecordedBy`) on the meeting, and the same person, the same way, as the minutes' "Raised by" and "Sent by"
 * (`minutesAct`). A change writes no Person column, so it is attributed by its audit row alone. No staff notice is written: there is no notice kind for the meeting.
 * A refusal throws `WorkspaceRefused`, which rolls it all back.
 */

import type { Tx } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { PreparedAct } from "@/lib/auth/act-begin";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { StaffActor } from "@/lib/auth/types";
import { contractLabel } from "@/lib/contract/repo";
import { dayToDate } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { attendanceOf, changeFaults, heldFaults, MINUTES_TITLE, offSideAttendees, scheduleFaults, type AttendeeRow } from "./kick-off";
import { mayActForOrganisation } from "./side";
import { organisationSideOn } from "./side-store";
import { createDocument, WorkspaceRefused, type WorkspaceCtx } from "./store";
import type { Finding } from "./types";

/// Refusals the store raises on the rows it reads, beyond the pure rules: a ticked person not of the organisation, or an account not the awardee's; an account ticked where
/// the award names no supplier on the register.
export type KickOffStoreFault = "ATTENDEE_UNKNOWN" | "NO_CONTRACTOR";

const blocking = (fs: readonly Finding[]) => fs.filter((f) => f.level === "block");
const refuseOn = (fs: readonly Finding[]): void => {
  if (blocking(fs).length > 0) throw new WorkspaceRefused(fs, 422);
};

/// PW-5 for the person, on the organisation's today, from the contract's S.O. office and delegations read under the contract's lock.
async function authorityToday(c: WorkspaceCtx, personId: string): Promise<boolean> {
  const sv = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, sv, c.today, c.tx);
  return mayActForOrganisation(personId, so?.office ?? null, delegationFactsOf(sv), c.today);
}

const MEETING = { id: true, meetsAt: true, place: true, onlineLink: true, agenda: true, heldOn: true } as const;

/// The contract's meeting, locked, then read: the one row lock of these acts. None yet reads as null (the contract's lock serialises two schedulings; the unique key is the backstop).
async function lockedMeeting(c: WorkspaceCtx) {
  await c.tx.$queryRaw`SELECT id FROM "KickOffMeeting" WHERE "contractId" = ${c.l.contract.id} FOR UPDATE`;
  return c.tx.kickOffMeeting.findFirst({ where: { contractId: c.l.contract.id, organisationId: c.l.org.id }, select: MEETING });
}

const labelOf = (c: WorkspaceCtx) => `${contractLabel({ number: c.l.contract.number, award: { awardeeName: c.l.award.awardeeName } })} · Kick-off meeting`;
async function audit(c: WorkspaceCtx, a: StaffActor, entity: string, entityId: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>) {
  await writeAudit(c.tx, { actor: auditActorOfStaff(a), organisationId: c.l.org.id, entity, entityId, entityLabel: labelOf(c) }, action, changes);
}

/// When, where and the agenda, as the audit row words them: the moment on the organisation's clock, never a code.
const arrangementWords = (c: WorkspaceCtx, m: { meetsAt: Date; place: string; onlineLink: string; agenda: string }) => ({
  meetsAt: formatOrgDateTime(m.meetsAt, c.l.org.timeZone),
  place: m.place || null,
  onlineLink: m.onlineLink || null,
  agenda: m.agenda,
});

export interface Arrangement {
  /// The instant it meets (the action reads the day and the time in the organisation's zone, `instantAt`), or null where the form gave none that exists.
  meetsAt: Date | null;
  place: string;
  onlineLink: string;
  agenda: string;
}
const trimmed = (i: Arrangement) => ({ place: i.place.trim(), onlineLink: i.onlineLink.trim(), agenda: i.agenda.trim() });

// ------------------------------------------------------------------ schedule

/// The contract's one kick-off meeting, from EXECUTED (the caller asked PROJECT_WORKSPACE's row), by a person with PW-5 authority today.
export async function scheduleMeeting(c: WorkspaceCtx, a: StaffActor, i: Arrangement, act: PreparedAct): Promise<{ meetingId: string }> {
  const may = await authorityToday(c, a.personId);
  const existing = await lockedMeeting(c);
  refuseOn(scheduleFaults({ authorityToday: may, exists: existing !== null, ...i }));
  const t = trimmed(i);
  const m = await c.tx.kickOffMeeting.create({
    data: { organisationId: c.l.org.id, contractId: c.l.contract.id, meetsAt: i.meetsAt!, ...t, scheduledByPersonId: act.subjectPersonId, scheduledAt: c.now },
    select: { id: true },
  });
  await audit(c, a, "KickOffMeeting", m.id, "CREATE", diffFields(null, { ...arrangementWords(c, { meetsAt: i.meetsAt!, ...t }), scheduledOn: formatDate(c.today) }));
  await act.write(c.tx, m.id);
  return { meetingId: m.id };
}

// ------------------------------------------------------------------ change

/// When, where or the agenda, changed before the meeting is held; audited before and after. Nothing changed writes nothing. It begins no act slot: it writes no Person column.
export async function changeMeeting(c: WorkspaceCtx, a: StaffActor, i: Arrangement): Promise<{ meetingId: string; changed: boolean }> {
  const may = await authorityToday(c, a.personId);
  const m = await lockedMeeting(c);
  if (!m) throw new WorkspaceRefused([...(may ? [] : [{ code: "NO_AUTHORITY", level: "block" as const }]), { code: "NOT_SCHEDULED", level: "block" }], 422);
  refuseOn(changeFaults({ authorityToday: may, held: m.heldOn !== null, ...i }));
  const t = trimmed(i);
  const before = arrangementWords(c, m);
  const after = arrangementWords(c, { meetsAt: i.meetsAt!, ...t });
  const changes = diffFields(before, after);
  if (changes.length === 0 && m.meetsAt.getTime() === i.meetsAt!.getTime()) return { meetingId: m.id, changed: false };
  // Only the four columns a change may touch (the trigger refuses any other in the same UPDATE).
  await c.tx.kickOffMeeting.update({ where: { id: m.id }, data: { meetsAt: i.meetsAt!, ...t } });
  await audit(c, a, "KickOffMeeting", m.id, "UPDATE", changes);
  return { meetingId: m.id, changed: true };
}

// ------------------------------------------------------------------ record it held

/**
 * The act that writes the minutes' document is the meeting's: the document's "Raised by" and its version's "Sent by" are written beside the meeting's "Recorded by",
 * the same person the same way (`writeAlso`), so that `createDocument` never writes the meeting's slot against the document.
 */
function minutesAct(act: PreparedAct): PreparedAct {
  return {
    ...act,
    write: (tx: Tx, entityId: string, extra) => act.writeAlso(tx, "ProjectDocument.createdByPerson", entityId, extra),
    writeAlso: (tx: Tx, slotKey: string, entityId: string, extra) => act.writeAlso(tx, slotKey, entityId, extra),
  };
}

export interface HeldInput {
  /// The day it was held, YYYY-MM-DD in the organisation's calendar; null where the form gave none.
  heldOn: string | null;
  /// Ticked on the organisation's side, and of the contractor's portal accounts.
  personIds: readonly string[];
  accountIds: readonly string[];
  /// Anyone on neither list.
  otherNames: readonly string[];
  /// The minutes' files, staged first through the staff upload route (`stagedFor=project-document`).
  stagedVersionIds: readonly string[];
}

/// The rows ticked, checked against who they may be: a person on the organisation's side today, exactly as the form offers them (PW-34, `offSideAttendees`; read
/// under the contract's lock); an account of the awardee (`Award.vendorId`, as trigger PA046 holds).
async function attendeeFaults(c: WorkspaceCtx, rows: readonly AttendeeRow[]): Promise<Finding<KickOffStoreFault>[]> {
  const personIds = rows.flatMap((r) => (r.side === "ORGANISATION" ? [r.personId] : []));
  const accountIds = rows.flatMap((r) => (r.side === "CONTRACTOR" ? [r.supplierAccountId] : []));
  const out: Finding<KickOffStoreFault>[] = [];
  if (personIds.length > 0) {
    const side = await organisationSideOn(c.l, await loadSupervision(c.l.contract.id, c.tx), c.today, c.tx);
    if (offSideAttendees(personIds, side.map((m) => m.personId)).length > 0) out.push({ code: "ATTENDEE_UNKNOWN", level: "block" });
  }
  if (accountIds.length > 0) {
    const vendorId = c.l.award.vendorId;
    if (!vendorId) out.push({ code: "NO_CONTRACTOR", level: "block" });
    else if ((await c.tx.supplierAccount.count({ where: { id: { in: accountIds }, supplierId: vendorId, organisationId: c.l.org.id } })) !== accountIds.length) out.push({ code: "ATTENDEE_UNKNOWN", level: "block" });
  }
  // Said once, however many were not found.
  return out.filter((f, n) => out.findIndex((g) => g.code === f.code) === n);
}

/// Who attended, in words for the audit row: the organisation's people by name, the contractor's accounts counted (their contacts' names are SULIT), and the other names.
async function attendanceWords(c: WorkspaceCtx, rows: readonly AttendeeRow[]): Promise<string> {
  const ids = rows.flatMap((r) => (r.side === "ORGANISATION" ? [r.personId] : []));
  const people = ids.length ? await c.tx.person.findMany({ where: { id: { in: ids }, organisationId: c.l.org.id }, select: { id: true, name: true } }) : [];
  const name = new Map(people.map((p) => [p.id, p.name]));
  const accounts = rows.filter((r) => r.side === "CONTRACTOR").length;
  return [
    ...ids.map((id) => name.get(id) ?? "A person"),
    ...(accounts ? [`${accounts} of the contractor's portal account${accounts === 1 ? "" : "s"}`] : []),
    ...rows.flatMap((r) => (r.side === null ? [r.name] : [])),
  ].join("; ");
}

/**
 * Record the meeting held, in one act (PW-29): the minutes (required), the four held columns, and who attended (required), in that order and at the transaction's top level.
 */
export async function recordMeetingHeld(c: WorkspaceCtx, a: StaffActor, i: HeldInput, act: PreparedAct): Promise<{ meetingId: string; minutesDocumentId: string }> {
  const may = await authorityToday(c, a.personId);
  const m = await lockedMeeting(c);
  const who = attendanceOf(i);
  refuseOn([
    ...heldFaults({ authorityToday: may, scheduled: m !== null, held: m?.heldOn != null, heldOn: i.heldOn, today: c.today, attendees: who.rows.length, minutesFiles: i.stagedVersionIds.length }),
    ...who.faults,
    ...(await attendeeFaults(c, who.rows)),
  ]);
  const meeting = m!;
  const heldOn = i.heldOn!;

  // (1) The minutes: the organisation's document, no approver, so its Version 1 is shared at once (the trigger checks this transaction made it).
  const minutes = await createDocument(c, { kind: "STAFF", actor: a }, { title: MINUTES_TITLE, note: "", first: { upload: { stagedVersionIds: i.stagedVersionIds, note: "" } }, approverPersonIds: [] }, minutesAct(act));

  // (2) The four held columns, in ONE update.
  await c.tx.kickOffMeeting.update({
    where: { id: meeting.id },
    data: { heldOn: dayToDate(heldOn), heldRecordedByPersonId: act.subjectPersonId, heldRecordedAt: c.now, minutesDocumentId: minutes.documentId },
  });
  await act.write(c.tx, meeting.id);

  // (3) Who attended, each once (`attendanceOf`), after the meeting is set held by this transaction (PA046).
  for (const r of who.rows) {
    await c.tx.kickOffAttendance.create({
      data: {
        organisationId: c.l.org.id,
        meetingId: meeting.id,
        side: r.side,
        personId: r.side === "ORGANISATION" ? r.personId : null,
        supplierAccountId: r.side === "CONTRACTOR" ? r.supplierAccountId : null,
        name: r.side === null ? r.name : "",
      },
      select: { id: true },
    });
  }
  await audit(c, a, "KickOffMeeting", meeting.id, "UPDATE", diffFields({ heldOn: null, minutes: null, attended: null }, { heldOn: formatDate(heldOn), minutes: MINUTES_TITLE, attended: await attendanceWords(c, who.rows) }));
  return { meetingId: meeting.id, minutesDocumentId: minutes.documentId };
}
