/**
 * What the kick-off meeting's two cards read (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2): the staff card on Project › Overview, with each act's gate and its reasons in
 * words, and the contractor's read-only card on the portal's Overview. Readers, not pure: they write nothing (a contact's name is read through the SULIT gate the caller
 * asks and hands in) and take no lock (the acts judge again under the locks). Every gate is the pure fault of the act (`kick-off.ts`) asked with the READER as the actor, so
 * a blocked button always says why and no rule is restated. The state is `kickOffState`: a meeting whose day has passed unrecorded reads "Not recorded as held", never
 * upcoming. The Integrity Pact briefing is not the meeting's: the staff card asks `briefingMissing` (`src/lib/contract/sign.ts`) unchanged, for the link to its own act.
 *
 * Words only: no code, no id shown (ids ride for links and forms). Times are on the organisation's clock. Who scheduled it and who recorded it held are named to staff only;
 * the contractor's card names the attendees (the organisation's people, its own accounts' contacts, and the other names), never who acted.
 */

import type { Tx } from "@/lib/audit/record";
import { SUPPLIER_PROJECT_DOCUMENT_FILE } from "@/lib/auth/routes";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import { briefingMissing } from "@/lib/contract/sign";
import type { ContractStatus } from "@/lib/contract/types";
import { clockTimeIn, dayIn, dayOf, storedDay } from "@/lib/dates";
import { loadStorePolicy } from "@/lib/documents/service";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import type { ProjectContext } from "@/lib/portal/projects/context-store";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { contractorReading } from "./contractor-view";
import { loadDocumentFactsMany } from "./facts";
import { changeFaults, heldFaults, KICK_OFF_STATE_TONE, KICK_OFF_STATE_WORDS, kickOffFaultText, kickOffState, scheduleFaults, type KickOffState } from "./kick-off";
import { faultText } from "./labels";
import { mayActForOrganisation } from "./side";
import { organisationSideOn } from "./side-store";
import { awardeeSubject, CONTACT_NAME_FIELDS, loadContractorAccounts, UNNAMED_ACCOUNT, type ContactNamesGate, type PortalAccountRow } from "./team-read";
import type { Finding } from "./types";

export { CONTACT_NAME_FIELDS };

/// Whether the reader may take an act now, and if not, why, in words (never a code). `reasons` is empty when allowed.
export interface KickOffGate {
  allowed: boolean;
  reasons: string[];
}

const gate = (faults: readonly Finding[], orgName: string, shut: string | null): KickOffGate => {
  if (shut) return { allowed: false, reasons: [shut] };
  const reasons = [...new Set(faults.filter((f) => f.level === "block").map((f) => kickOffFaultText(f) ?? faultText(f, orgName)))];
  return { allowed: reasons.length === 0, reasons };
};

const MEETING_SELECT = {
  id: true,
  meetsAt: true,
  place: true,
  onlineLink: true,
  agenda: true,
  scheduledAt: true,
  heldOn: true,
  scheduledBy: { select: { name: true } },
  heldRecordedBy: { select: { name: true } },
  minutesDocumentId: true,
  attendance: { orderBy: { id: "asc" }, select: { side: true, name: true, person: { select: { name: true } }, supplierAccountId: true } },
} as const;

type MeetingRow = NonNullable<Awaited<ReturnType<typeof readMeeting>>>;
const readMeeting = (client: Tx, organisationId: string, contractId: string) => client.kickOffMeeting.findFirst({ where: { contractId, organisationId }, select: MEETING_SELECT });

/// Who attended, in three lists: the organisation's people by name, the contractor's accounts by their contact's name (or `contractorName` where that is not to be shown), the other names.
function attendanceLists(m: MeetingRow, contractorName: (accountId: string) => string) {
  const organisation: string[] = [];
  const contractor: string[] = [];
  const others: string[] = [];
  for (const a of m.attendance) {
    if (a.side === "ORGANISATION") organisation.push(a.person?.name ?? "A person");
    else if (a.side === "CONTRACTOR" && a.supplierAccountId) contractor.push(contractorName(a.supplierAccountId));
    else others.push(a.name);
  }
  return { organisation, contractor, others };
}

const arrangementOf = (m: MeetingRow, timeZone: string | null) => ({ meetsAtText: formatOrgDateTime(m.meetsAt, timeZone), place: m.place, onlineLink: m.onlineLink, agenda: m.agenda });

// ------------------------------------------------------------------ staff: the Overview card

export interface KickOffAttendance {
  organisation: string[];
  contractor: string[];
  others: string[];
}

export interface KickOffCardView {
  state: KickOffState;
  stateLabel: string;
  tone: "neutral" | "info" | "warn" | "ok";
  /// When, where and the agenda (the link is plain text: never rendered as a link). `meetsOn` and `meetsTime` fill the change form, in the organisation's zone (null where none is set).
  meeting: { meetsAtText: string; meetsOn: string | null; meetsTime: string | null; place: string; onlineLink: string; agenda: string; scheduledBy: string; scheduledOn: string } | null;
  held: { heldOnText: string; recordedBy: string; attendance: KickOffAttendance; minutes: { documentId: string; title: string; href: string; files: { versionId: string; name: string }[] } | null } | null;
  actions: { schedule: KickOffGate; change: KickOffGate; recordHeld: KickOffGate };
  /// Who may be ticked as attending, for the held form: the organisation's side today, and the contractor's active portal accounts (named only where the SULIT read was granted).
  /// Empty unless a meeting is scheduled and not yet held (the only time the form is offered).
  choices: { organisation: { personId: string; name: string; office: string }[]; contractor: PortalAccountRow[]; contractorNamesWithheld: string | null };
  /// The organisation's today (YYYY-MM-DD), the held form's default day; null where no time zone is set.
  today: string | null;
  /// `briefingMissing(status, exists)`, asked unchanged: while true, the card links to the existing briefing act (`recordBriefing`). The meeting never writes the briefing.
  briefingMissing: boolean;
}

/**
 * The staff card. `viewer` is the signed-in reader (the gates are asked with them as the actor: PW-5 on today); `now` is the request's moment; `gate` is the SULIT read of the
 * contractor's contacts' names (`sulitGate(actor, subject, CONTACT_NAME_FIELDS)`), asked at most once.
 */
export async function loadKickOffCard(client: Tx, l: LoadedContract, viewer: StaffActor, now: Date, gateNames: ContactNamesGate): Promise<KickOffCardView> {
  const orgName = l.org.name;
  const tz = l.org.timeZone;
  const today = dayOf(now, tz);
  const m = await readMeeting(client, l.org.id, l.contract.id);
  const held = m?.heldOn != null;
  const state = kickOffState(m ? { meetsAt: m.meetsAt, held } : null, today, tz);

  const sv = await loadSupervision(l.contract.id, client);
  const so = today ? await soOfficeOn(l, sv, today, client) : null;
  const may = today !== null && mayActForOrganisation(viewer.personId, so?.office ?? null, delegationFactsOf(sv), today);
  const status = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
  const shut = status ? actStatusText(status) : today === null ? faultText({ code: "ZONE_NOT_SET", level: "block" }, orgName) : null;
  const classSet = (await loadStorePolicy(l.org.id, client)).projectDocumentClassId !== null;
  // Placeholders stand for the form's own fields: the gates say only what the reader and the meeting's state refuse.
  const form = { meetsAt: now, place: "place", onlineLink: "", agenda: "agenda" };
  const actions = {
    schedule: gate(scheduleFaults({ authorityToday: may, exists: m !== null, ...form }), orgName, shut),
    change: gate(m ? changeFaults({ authorityToday: may, held, ...form }) : [{ code: "NOT_SCHEDULED", level: "block" }], orgName, shut),
    recordHeld: gate(
      [...heldFaults({ authorityToday: may, scheduled: m !== null, held, heldOn: today ?? "", today: today ?? "", attendees: 1, minutesFiles: 1 }).filter((f) => f.code !== "WHEN_REQUIRED"), ...(classSet ? [] : [{ code: "CLASS_NOT_SET", level: "block" as const }])],
      orgName,
      shut,
    ),
  };

  // The held form's choices are read only while it can be used (a meeting not yet held), so a contact's name is not read, and its read not logged, for nothing.
  const choosing = m !== null && !held;
  const accounts = choosing ? await loadContractorAccounts(client, l, viewer, gateNames) : { rows: [], namesWithheld: null };
  const side = choosing && today ? await organisationSideOn(l, sv, today, client) : [];

  let heldView: KickOffCardView["held"] = null;
  if (m && held) {
    const minutes = m.minutesDocumentId
      ? await client.projectDocument.findFirst({
          where: { id: m.minutesDocumentId, organisationId: l.org.id },
          // PW-53: the files of the minutes' LATEST version (staff read every version), never Version 1's alone; the document page keeps the full history.
          select: { id: true, title: true, versions: { orderBy: { number: "desc" }, take: 1, select: { files: { where: { detachedAt: null }, orderBy: { attachedAt: "asc" }, select: { version: { select: { id: true, originalFilename: true } } } } } } },
        })
      : null;
    // The contractor's attendees by their contact's name, only where the SULIT read is granted (asked once). An account no longer active is still a past attendee, and its
    // name is SULIT as any other's.
    const attended = m.attendance.flatMap((a) => (a.supplierAccountId ? [a.supplierAccountId] : []));
    let named = false;
    if (attended.length > 0) {
      const subject = await awardeeSubject(client, l);
      named = subject ? (await gateNames(subject)).state === "GRANTED" : false;
    }
    const contacts = attended.length > 0 && named ? await client.supplierAccount.findMany({ where: { id: { in: attended }, organisationId: l.org.id }, select: { id: true, contact: { select: { name: true } } } }) : [];
    const contactName = new Map(contacts.map((a) => [a.id, a.contact.name]));
    heldView = {
      heldOnText: formatDate(storedDay(m.heldOn!)),
      recordedBy: m.heldRecordedBy?.name ?? "A person",
      attendance: attendanceLists(m, (id) => contactName.get(id) ?? UNNAMED_ACCOUNT),
      minutes: minutes ? { documentId: minutes.id, title: minutes.title, href: `/projects/${l.contract.id}/documents/${minutes.id}`, files: (minutes.versions[0]?.files ?? []).map((f) => ({ versionId: f.version.id, name: f.version.originalFilename })) } : null,
    };
  }

  return {
    state,
    stateLabel: KICK_OFF_STATE_WORDS[state],
    tone: KICK_OFF_STATE_TONE[state],
    meeting: m
      ? { ...arrangementOf(m, tz), meetsOn: tz ? dayIn(m.meetsAt, tz) : null, meetsTime: clockTimeIn(m.meetsAt, tz), scheduledBy: m.scheduledBy.name, scheduledOn: formatOrgDateTime(m.scheduledAt, tz) }
      : null,
    held: heldView,
    actions,
    choices: { organisation: side.map((x) => ({ personId: x.personId, name: x.name, office: x.officeLabel })), contractor: accounts.rows, contractorNamesWithheld: accounts.namesWithheld },
    today,
    briefingMissing: briefingMissing(l.contract.status as ContractStatus, !!l.contract.briefing),
  };
}

// ------------------------------------------------------------------ portal: the contractor's read-only card

export interface PortalKickOffView {
  state: KickOffState;
  stateLabel: string;
  tone: "neutral" | "info" | "warn" | "ok";
  meeting: { meetsAtText: string; place: string; onlineLink: string; agenda: string } | null;
  held: {
    heldOnText: string;
    attendance: KickOffAttendance;
    /// The minutes, as the contractor may read them (`contractorReading`: an organisation document with no approver is shared at once). `href` is the document's portal page;
    /// each file's `href` is the step 5 download, to which the page adds its own form token as `t`.
    minutes: { title: string; href: string; files: { name: string; href: string }[] } | null;
  } | null;
}

/**
 * The contractor's card, read-only. `ctx` is the contract as this supplier holds it (`loadProjectContext`). The contractor's own accounts are named by their contacts (its own
 * people); the organisation's attendees by name; who scheduled or recorded it is never said.
 */
export async function loadPortalKickOff(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId">, ctx: ProjectContext): Promise<PortalKickOffView> {
  const tz = ctx.org.timeZone;
  const m = await readMeeting(client, actor.organisationId, ctx.contract.id);
  const held = m?.heldOn != null;
  const state = kickOffState(m ? { meetsAt: m.meetsAt, held } : null, ctx.org.today, tz);
  let heldView: PortalKickOffView["held"] = null;
  if (m && held) {
    const ids = m.attendance.flatMap((a) => (a.supplierAccountId ? [a.supplierAccountId] : []));
    const own = ids.length ? await client.supplierAccount.findMany({ where: { id: { in: ids }, supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { id: true, contact: { select: { name: true } } } }) : [];
    const name = new Map(own.map((a) => [a.id, a.contact.name]));
    let minutes: NonNullable<PortalKickOffView["held"]>["minutes"] = null;
    if (m.minutesDocumentId) {
      const doc = await client.projectDocument.findFirst({
        where: { id: m.minutesDocumentId, contractId: ctx.contract.id, organisationId: actor.organisationId },
        select: { id: true, title: true, versions: { orderBy: { number: "asc" }, select: { id: true, files: { where: { detachedAt: null, version: { withdrawnAt: null } }, orderBy: { attachedAt: "asc" }, select: { id: true, version: { select: { originalFilename: true } } } } } } },
      });
      const facts = doc ? (await loadDocumentFactsMany(client, [doc.id])).get(doc.id) : undefined;
      const reading = facts ? contractorReading(facts, ctx.org.name) : null;
      if (doc && reading && reading.shown === "VERSIONS") {
        // PW-53: the files of the latest version the contractor may see (`contractorReading`), never every version flattened; the document page keeps the full history.
        const latest = reading.latestVisible ? doc.versions.find((v) => v.id === reading.latestVisible!.id) : undefined;
        minutes = {
          title: doc.title,
          href: `/supplier/projects/${ctx.contract.id}/documents/${doc.id}`,
          files: (latest?.files ?? []).map((f) => ({ name: f.version.originalFilename, href: `${SUPPLIER_PROJECT_DOCUMENT_FILE}/${f.id}` })),
        };
      }
    }
    heldView = { heldOnText: formatDate(storedDay(m.heldOn!)), attendance: attendanceLists(m, (id) => name.get(id) ?? UNNAMED_ACCOUNT), minutes };
  }
  return { state, stateLabel: KICK_OFF_STATE_WORDS[state], tone: KICK_OFF_STATE_TONE[state], meeting: m ? arrangementOf(m, tz) : null, held: heldView };
}
