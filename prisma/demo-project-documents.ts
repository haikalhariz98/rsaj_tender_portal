/**
 * Demo data for the simple Project workspace (ADR 0042, plan project-workspace-simple-plan.md): documents on demo_con13 (DEMO/KP/T/005/2026, held by the contractor whose portal account is
 * `demo.ctr13`) in each state the founder's flow passes through, and the contract's kick-off meeting held, with its agenda, who attended and its minutes. Invented throughout; it sets no policy.
 *
 *   demo_pwd1  the contractor's site safety and health plan, sent with no approver named: Shared (an approver may still be added).
 *   demo_pwd2  a revised work programme the organisation asked the contractor for, an approver named: Requested, waiting on the contractor.
 *   demo_pwd3  the contractor's material submission, an approver added after it came in: Waiting for approval.
 *   demo_pwd4  the contractor's method statement, asked for, rejected with remarks on Version 1, sent again as Version 2 and approved.
 *   demo_pwd5  construction drawings the organisation shared for information, no approver: Shared, seen by the contractor at once.
 *   demo_pwko1 the kick-off meeting, scheduled with an agenda and recorded held with who attended; its minutes are demo_pwd6, shared for information.
 *
 * There is no "draft" state: a document is created with its first version or its first request (ADR 0042 D1), and with no approver it reads Shared. The team lists are derived from the S.O.
 * office and its delegations (PW-16), so nothing is written for them.
 *
 * The rows are written directly, as the workspace's acts would have written them and in their order, each document (and the meeting held, with its minutes and attendance) in ONE transaction
 * at its top level, so every trigger (PA040 to PA047) judges them as it judges the acts. Each is skipped where its stable id exists: a second run adds nothing. The approver and the officer are
 * read, not named: whoever may act for the organisation on the contract today (PW-5).
 *
 * Applied alone to a database the demonstration is already loaded in by `npm run demo:project-documents`, and at the end of a full load.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { contractLabel, loadContract } from "../src/lib/contract/repo";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { STAGED_FOR_PROJECT_DOCUMENT } from "../src/lib/documents/staged-for";
import { formatDate, formatOrgDateTime } from "../src/lib/format";
import { projectDocumentNotices } from "../src/lib/inbox/notices";
import { loadDocumentFacts } from "../src/lib/project-docs/facts";
import { MINUTES_TITLE } from "../src/lib/project-docs/kick-off";
import { versionLabel } from "../src/lib/project-docs/labels";
import { noticeTargets, type WorkspaceEvent } from "../src/lib/project-docs/notices";
import { organisationSideOn } from "../src/lib/project-docs/side-store";
import { documentState, type DocumentState } from "../src/lib/project-docs/state";
import { loadSupervision } from "../src/lib/supervision/load";
import { DEMO_ACTOR } from "./demo-actor";
import { demoPdf, writeDemoDocs } from "./demo-documents";

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
const P = "demo_";
const CON = `${P}con13`;
const FILE_CLASS = { classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const };
const KICK_OFF = { scheduledOn: "2026-06-10", meetsOn: "2026-06-15" };

type Step =
  | { do: "request"; day: string; time: string; note: string }
  | { do: "upload"; day: string; time: string; note: string; file: string; lines: string[] }
  | { do: "approver"; day: string; time: string }
  | { do: "decide"; day: string; time: string; outcome: "APPROVED" | "REJECTED"; remarks: string };
interface Spec {
  id: string;
  title: string;
  note: string;
  side: "CONTRACTOR" | "ORGANISATION";
  steps: Step[];
  expect: DocumentState;
}

export async function loadProjectDocumentsDemo(db: Db, organisationId: string): Promise<{ loaded: boolean; notes: string[] }> {
  const notes: string[] = [];
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo Project workspace: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;
  const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

  const l = await loadContract(organisationId, CON);
  if (!l || l.contract.status !== "ACTIVE" || !l.award.vendorId) {
    notes.push("DEMO/KP/T/005/2026 is not an active contract with its contractor on the register in this database, so the Project workspace demonstration was not added");
    return { loaded: false, notes };
  }
  const account = await db.supplierAccount.findFirst({ where: { supplierId: l.award.vendorId, organisationId }, orderBy: { id: "asc" }, select: { id: true } });
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: l.award.vendorId }, select: { registeredName: true } });
  const side = (await organisationSideOn(l, await loadSupervision(CON, db), L, db)).filter((m) => m.mayAct);
  const officer = side[0] ?? null;
  if (!account || !officer) {
    notes.push(!account ? "the contractor has no portal account, so no Project document was added" : "nobody may act for the organisation on DEMO/KP/T/005/2026 today (no S.O. holder), so no Project document was added");
    return { loaded: false, notes };
  }
  const accountId = account.id;
  const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  const from = (s: Spec["side"]) => (s === "CONTRACTOR" ? "the contractor" : org.name);

  /// One document, played act by act inside the caller's transaction, with the audit rows, files and staff notices each act writes.
  async function play(tx: Tx, s: Spec): Promise<void> {
    const trail: object[] = [];
    let n = 0;
    const entry = (entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", when: Date, changes: object[]) =>
      trail.push({ id: `${s.id}_au${++n}`, organisationId, entity, entityId, entityLabel: `${label} · ${s.title}${suffix ? ` · ${suffix}` : ""}`, action, at: when, changes, reason: "", ...DEMO_ACTOR });
    const notices: { at: Date; by: string | null; event: WorkspaceEvent; number: number }[] = [];
    const first = s.steps[0];
    const byStaff = first.do !== "upload" || s.side === "ORGANISATION";
    const createdAt = T(first.day, first.time);
    await tx.projectDocument.create({
      data: { id: s.id, organisationId, contractId: CON, title: s.title, note: s.note, side: s.side, kind: null, createdByPersonId: byStaff ? officer.personId : null, createdBySupplierAccountId: byStaff ? null : accountId, createdAt },
    });
    entry("ProjectDocument", s.id, "", "CREATE", createdAt, diffFields(null, { title: s.title, note: s.note || null, from: from(s.side), createdOn: formatDate(first.day) }));

    let versions = 0;
    let requests = 0;
    let decisions = 0;
    let openRequest: string | null = null;
    let approver: string | null = null;
    for (const step of s.steps) {
      const when = T(step.day, step.time);
      const latest = versions ? `${s.id}v${versions}` : null;
      if (step.do === "request") {
        openRequest = `${s.id}r${++requests}`;
        await tx.projectDocumentRequest.create({ data: { id: openRequest, organisationId, documentId: s.id, toSide: s.side, note: step.note, requestedByPersonId: officer.personId, requestedAt: when } });
        entry("ProjectDocumentRequest", openRequest, "request", "CREATE", when, diffFields(null, { askedOf: from(s.side), note: step.note || null, askedOn: formatDate(step.day) }));
      } else if (step.do === "upload") {
        const number = ++versions;
        const id = `${s.id}v${number}`;
        const contractor = s.side === "CONTRACTOR";
        await tx.projectDocumentVersion.create({
          data: {
            id, organisationId, documentId: s.id, number, note: step.note, uploadedByPersonId: contractor ? null : officer.personId, uploadedBySupplierAccountId: contractor ? accountId : null,
            uploadedAt: when, uploadedOn: dayToDate(step.day), noApproversAtUpload: approver === null, requestId: openRequest,
          },
        });
        // The file, as the upload route staged it and the act pinned it (writeDemoDocs writes the store's own trail rows).
        const fileId = `${id}f`;
        const iso = when.toISOString().slice(0, 16);
        const files = await writeDemoDocs(
          tx as unknown as Db,
          organisationId,
          [{ id: fileId, title: step.file, ...FILE_CLASS, createdAt: iso, stagedFor: STAGED_FOR_PROJECT_DOCUMENT, versions: [{ id: `${fileId}1`, n: 1, bytes: demoPdf(step.lines), mediaType: "application/pdf", filename: `${step.file}.pdf`, receivedOn: step.day, storedAt: iso }], attachments: [{ id: `${fileId}a`, purpose: "PROJECT_DOCUMENT_FILE", owner: { projectDocumentVersionId: id }, ownerLabel: `${label} · ${s.title}, ${versionLabel(number)}`, versionId: `${fileId}1`, at: iso }] }],
          `${fileId}_au`,
          contractor ? { supplierAccountId: accountId, name: supplier.registeredName } : { id: officer.personId, name: officer.name },
        );
        await files.flush();
        entry("ProjectDocumentVersion", id, versionLabel(number), "CREATE", when, diffFields(null, { version: versionLabel(number), note: step.note || null, files: `${step.file}.pdf`, uploadedOn: formatDate(step.day), received: formatOrgDateTime(when, tz), answersRequest: openRequest ? "yes" : null, sharedAtOnce: approver === null ? "yes: no approver" : "no: it waits for its approvers" }));
        if (contractor) notices.push({ at: when, by: null, number, event: { event: "CONTRACTOR_UPLOADED", versionId: id, soHolderIds: [officer.personId], soActingIds: [] } });
        if (approver) notices.push({ at: when, by: contractor ? null : officer.personId, number, event: { event: "VERSION_WAITS_ON_APPROVERS", versionId: id, approverPersonIds: [officer.personId], uploadedByPersonId: contractor ? null : officer.personId } });
        openRequest = null;
      } else if (step.do === "approver") {
        approver = `${s.id}a1`;
        await tx.projectDocumentApprover.create({ data: { id: approver, organisationId, documentId: s.id, personId: officer.personId, addedByPersonId: officer.personId, addedAt: when } });
        entry("ProjectDocumentApprover", approver, "approver", "CREATE", when, diffFields(null, { approver: officer.name, addedOn: formatDate(step.day) }));
        if (latest && s.side === "CONTRACTOR") notices.push({ at: when, by: officer.personId, number: versions, event: { event: "VERSION_WAITS_ON_APPROVERS", versionId: latest, approverPersonIds: [officer.personId], uploadedByPersonId: null } });
      } else {
        if (!latest || !approver) throw new Error(`Demo Project workspace: ${s.id} decides before it has a version and an approver.`);
        const id = `${s.id}d${++decisions}`;
        await tx.projectDocumentDecision.create({ data: { id, organisationId, versionId: latest, approverId: approver, outcome: step.outcome, remarks: step.remarks, decidedByPersonId: officer.personId, decidedAt: when, decidedOn: dayToDate(step.day) } });
        entry("ProjectDocumentDecision", id, versionLabel(versions), "CREATE", when, diffFields(null, { version: versionLabel(versions), answer: step.outcome === "APPROVED" ? "Approved" : "Rejected", remarks: step.remarks || null, decidedOn: formatDate(step.day), documentIsNow: step.outcome === "APPROVED" ? "approved by every approver" : "rejected: a new version is asked for" }));
      }
    }
    await tx.auditEntry.createMany({ data: trail as never });

    // The staff notices the acts raised. Those the officer has since acted on are read; the newest stays unread while the document waits on the organisation.
    const waiting = documentState(await loadDocumentFacts(tx, s.id)).waitsOn === "ORGANISATION";
    const href = `/projects/${CON}/documents/${s.id}`;
    const drafts = notices.flatMap((x) =>
      projectDocumentNotices({ target: noticeTargets(x.event), by: x.by, contractLabel: label, documentTitle: s.title, contractorName: l!.award.awardeeName, versionLabel: versionLabel(x.number), exerciseId: null, href }).map((d) => ({ ...d, organisationId, raisedByPersonId: x.by, raisedAt: x.at })),
    );
    const newest = Math.max(0, ...drafts.map((d) => d.raisedAt.getTime()));
    const rows = drafts.map((d) => ({ ...d, readAt: waiting && d.raisedAt.getTime() === newest ? null : plusHours(d.raisedAt, 2) }));
    if (rows.length) await tx.staffNotice.createMany({ data: rows, skipDuplicates: true });
  }

  const specs: Spec[] = [
    {
      id: `${P}pwd1`, title: "Site safety and health plan", note: "", side: "CONTRACTOR", expect: "SHARED",
      steps: [{ do: "upload", day: D(-12), time: "15:10", note: "For the works from site possession to completion.", file: "site-safety-and-health-plan", lines: ["Site safety and health plan", "Hazards, controls and emergency contacts for the pipeline works."] }],
    },
    {
      id: `${P}pwd2`, title: "Revised work programme", note: "", side: "CONTRACTOR", expect: "REQUESTED",
      steps: [
        { do: "request", day: D(-3), time: "10:00", note: "Send the programme revised for the late road crossing permit, with the critical path shown." },
        { do: "approver", day: D(-3), time: "10:00" },
      ],
    },
    {
      id: `${P}pwd3`, title: "Material submission: ductile iron pipes and fittings", note: "", side: "CONTRACTOR", expect: "WAITING_FOR_APPROVAL",
      steps: [
        { do: "upload", day: D(-2), time: "11:45", note: "Manufacturer's data sheets and test certificates attached.", file: "material-submission-di-pipes", lines: ["Material submission: ductile iron pipes and fittings", "DN300, class K9, with the manufacturer's test certificates."] },
        { do: "approver", day: D(-1), time: "09:15" },
      ],
    },
    {
      id: `${P}pwd4`, title: "Method statement: road crossing at chainage 0+350", note: "", side: "CONTRACTOR", expect: "APPROVED",
      steps: [
        { do: "request", day: D(-20), time: "09:30", note: "Send the method statement for the road crossing before work on it starts." },
        { do: "approver", day: D(-20), time: "09:30" },
        { do: "upload", day: D(-17), time: "16:20", note: "", file: "method-statement-road-crossing", lines: ["Method statement: road crossing at chainage 0+350", "Open cut, one lane at a time."] },
        { do: "decide", day: D(-15), time: "10:40", outcome: "REJECTED", remarks: "The traffic management plan is missing. Show the lane closure, signs and flagmen for each phase, and the permit's conditions." },
        { do: "upload", day: D(-10), time: "14:05", note: "Traffic management plan added for each phase.", file: "method-statement-road-crossing-rev1", lines: ["Method statement: road crossing at chainage 0+350, revised", "Open cut, one lane at a time, with the traffic management plan."] },
        { do: "decide", day: D(-8), time: "11:00", outcome: "APPROVED", remarks: "" },
      ],
    },
    {
      id: `${P}pwd5`, title: "Construction drawings, pipeline alignment", note: "For information.", side: "ORGANISATION", expect: "SHARED",
      steps: [{ do: "upload", day: D(-25), time: "08:50", note: "", file: "construction-drawings-alignment", lines: ["Construction drawings: pipeline alignment, sheets 1 to 6", "Issued for construction."] }],
    },
  ];

  for (const s of specs) {
    if (await db.projectDocument.findUnique({ where: { id: s.id }, select: { id: true } })) continue;
    await db.$transaction((tx) => play(tx, s), { timeout: 60_000 });
    notes.push(`the Project document "${s.title}"`);
  }

  // ---- the kick-off meeting: scheduled with its agenda, then recorded held in one act with its minutes and who attended (PW-18, PW-29).
  const meetingId = `${P}pwko1`;
  const minutes: Spec = {
    id: `${P}pwd6`, title: MINUTES_TITLE, note: "", side: "ORGANISATION", expect: "SHARED",
    steps: [{ do: "upload", day: KICK_OFF.meetsOn, time: "16:00", note: "", file: "kick-off-meeting-minutes", lines: ["Kick-off meeting minutes", "Programme, site possession, safety, submissions and payments discussed."] }],
  };
  if (!(await db.kickOffMeeting.findUnique({ where: { contractId: CON }, select: { id: true } }))) {
    const meetsAt = T(KICK_OFF.meetsOn, "10:00");
    const scheduledAt = T(KICK_OFF.scheduledOn, "09:00");
    const place = "Site office, Northern Works Depot";
    const agenda = "1. Introductions and contacts on both sides\n2. Programme and site possession\n3. Safety and health on site\n4. Documents to be sent and how they are approved\n5. Payments and valuations\n6. Any other matters";
    await db.$transaction(async (tx) => {
      await tx.kickOffMeeting.create({ data: { id: meetingId, organisationId, contractId: CON, meetsAt, place, onlineLink: "", agenda, scheduledByPersonId: officer.personId, scheduledAt } });
      await tx.auditEntry.createMany({ data: [{ id: `${meetingId}_au1`, organisationId, entity: "KickOffMeeting", entityId: meetingId, entityLabel: `${label} · Kick-off meeting`, action: "CREATE", at: scheduledAt, changes: diffFields(null, { meetsAt: formatOrgDateTime(meetsAt, tz), place, onlineLink: null, agenda, scheduledOn: formatDate(KICK_OFF.scheduledOn) }), reason: "", ...DEMO_ACTOR }] as never });
    });
    notes.push("the kick-off meeting, scheduled with its agenda");
  }
  const meeting = await db.kickOffMeeting.findUnique({ where: { contractId: CON }, select: { id: true, heldOn: true } });
  if (meeting?.id === meetingId && meeting.heldOn === null && !(await db.projectDocument.findUnique({ where: { id: minutes.id }, select: { id: true } }))) {
    const heldAt = T(KICK_OFF.meetsOn, "16:00");
    const other = "Tan Mei Hua, the contractor's site agent";
    // One transaction at its top level: the minutes, the four held columns, then the attendance (triggers PA045 and PA046 read this transaction's own rows).
    await db.$transaction(
      async (tx) => {
        await play(tx, minutes);
        await tx.kickOffMeeting.update({ where: { id: meetingId }, data: { heldOn: dayToDate(KICK_OFF.meetsOn), heldRecordedByPersonId: officer.personId, heldRecordedAt: heldAt, minutesDocumentId: minutes.id } });
        await tx.kickOffAttendance.createMany({
          data: [
            { id: `${meetingId}_at1`, organisationId, meetingId, side: "ORGANISATION", personId: officer.personId, name: "" },
            { id: `${meetingId}_at2`, organisationId, meetingId, side: "CONTRACTOR", supplierAccountId: accountId, name: "" },
            { id: `${meetingId}_at3`, organisationId, meetingId, side: null, name: other },
          ],
        });
        await tx.auditEntry.createMany({ data: [{ id: `${meetingId}_au2`, organisationId, entity: "KickOffMeeting", entityId: meetingId, entityLabel: `${label} · Kick-off meeting`, action: "UPDATE", at: heldAt, changes: diffFields({ heldOn: null, minutes: null, attended: null }, { heldOn: formatDate(KICK_OFF.meetsOn), minutes: MINUTES_TITLE, attended: `${officer.name}; 1 of the contractor's portal accounts; ${other}` }), reason: "", ...DEMO_ACTOR }] as never });
      },
      { timeout: 60_000 },
    );
    notes.push("the kick-off meeting recorded held, with who attended and its minutes shared for information");
  }

  // Read back: each document reads the state it was written to show, through the same rule the screens use.
  for (const s of [...specs, minutes]) {
    if (!(await db.projectDocument.findUnique({ where: { id: s.id }, select: { id: true } }))) continue;
    const state = documentState(await loadDocumentFacts(db, s.id)).state;
    if (state !== s.expect) throw new Error(`Demo Project workspace: "${s.title}" reads ${state}, not ${s.expect}.`);
  }
  return { loaded: notes.length > 0, notes };
}
