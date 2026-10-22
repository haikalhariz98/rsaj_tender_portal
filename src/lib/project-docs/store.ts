/**
 * The Project workspace's acts, as transactional cores (ADR 0042 D1, D2, D6, D8; plan step 4 §5.1; PW-5 to PW-9, PW-13, PW-25, PW-30).
 *
 * Each core runs INSIDE a locked contract, handed to it by its caller: the staff server action (`withLockedContract`, `src/app/projects/[id]/document-actions.ts`) or, in
 * step 5, the portal route (`inHeldContract`, `submission-store.ts`). So neither restates a rule, and the cores never take the contract's lock themselves. Each then
 * takes the ONE row lock of the workspace, `ProjectDocument`, before it reads the document's facts (`loadDocumentFacts`), and judges on those rows with the pure
 * faults (`faults.ts`). The staged files an upload pins are locked after it, in id order, as every attach does (owner first, then the store's document: a concurrent
 * withdrawal is seen, a file is never pinned twice). Lock order: contract, `ProjectDocument`, the store's documents.
 *
 * Every core writes in one transaction: the rows, their audit entries with before and after (`writeAudit`), the attribution of a staff act (`act.write`), and the staff
 * notices (`writeNotices`). A refusal throws `WorkspaceRefused`, which rolls it all back.
 *
 * PW-5: the organisation's side acts only through `mayActForOrganisation` (`side.ts`): the S.O., someone acting as S.O., or a representative whose letter lists
 * contractor communication, on the organisation's day. `recorderFaultToday` alone is NOT that check (it lets a person with no office through). It is asked for the actor, for
 * the approver named when one is added, and for the approver when they decide.
 *
 * NOT here (plan step 6): the six kinds and the statutory declaration's password step-up. The cores take no kind and no step-up, and pass `kind: null, signed: false` to the
 * rules, so the kind path cannot be reached; step 6 adds both. A portal route that is posted a kind refuses it (PW-23) before it reaches a core.
 */

import type { Tx } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { PreparedAct } from "@/lib/auth/act-begin";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { AuditActor, StaffActor, SupplierActor } from "@/lib/auth/types";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayToDate } from "@/lib/dates";
import { documentFaultText, PURPOSE_LABEL } from "@/lib/documents/labels";
import { attachFault } from "@/lib/documents/attach";
import { attached, filed } from "@/lib/documents/audit-view";
import { lockDocument } from "@/lib/documents/lock";
import { loadStorePolicy } from "@/lib/documents/service";
import { formatDate } from "@/lib/format";
import { projectDocumentNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { supplierAuditActor } from "@/lib/portal/projects/submission-store";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { stagedFileFaults, type StagedFile } from "./bounds";
import { addApproverFaults, createFaults, decideFaults, removeApproverFaults, requestFaults, uploadFaults } from "./faults";
import { loadDocumentFacts } from "./facts";
import { refusalText, versionLabel } from "./labels";
import { noticeTargets, type WorkspaceEvent } from "./notices";
import { mayActForOrganisation } from "./side";
import { documentState, latestVersion, liveApprovers, nextVersionNumber } from "./state";
import type { Actor, DocumentFacts, Finding, Side } from "./types";
import { otherSide } from "./types";
import { contractorMayDownload } from "./visibility";

export { loadDocumentFacts } from "./facts";

// ------------------------------------------------------------------ actors, context, refusals

export type StaffWorkspaceActor = { kind: "STAFF"; actor: StaffActor };
export type SupplierWorkspaceActor = { kind: "SUPPLIER"; actor: SupplierActor };
export type WorkspaceActor = StaffWorkspaceActor | SupplierWorkspaceActor;

/// The locked contract and the instant the act is read at, handed in by the caller that locked it: `now` once on entry (to the second), `today` the organisation's day of it.
export interface WorkspaceCtx {
  tx: Tx;
  l: LoadedContract;
  now: Date;
  today: string;
}

/// Raised from inside an act's transaction, so that nothing is written. `status` is what a route answers with: 404 for what is not the actor's to see, 409 for a change
/// that came first, 422 for a rule. `lead` and `message` are for a form: the refusal in words (`workspaceRefusalText`).
export class WorkspaceRefused extends Error {
  constructor(
    readonly faults: readonly Finding[],
    readonly status: 404 | 409 | 422 = 422,
    /// Words that replace the faults' own (the contract's state, said by the act × status table).
    readonly said: string | null = null,
  ) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "WorkspaceRefused";
  }
}

/// A refusal in words, for a form. `orgName` is the organisation's configured name.
export const workspaceRefusalText = (e: WorkspaceRefused, orgName: string): string => e.said ?? refusalText("Not done:", e.faults, orgName);

const refuse = (fs: readonly Finding[], status: 404 | 409 | 422 = 422): never => {
  throw new WorkspaceRefused(fs, status);
};
const NOT_FOUND = (): never => refuse([{ code: "NOT_FOUND", level: "block" }], 404);
const blocking = (fs: readonly Finding[]) => fs.filter((f) => f.level === "block");

const auditActorOf = (a: WorkspaceActor): AuditActor => (a.kind === "STAFF" ? auditActorOfStaff(a.actor) : supplierAuditActor(a.actor));
const sideOf = (a: WorkspaceActor): Side => (a.kind === "STAFF" ? "ORGANISATION" : "CONTRACTOR");

/// The organisation's side on the day, read under the contract's lock: the S.O. office (its holders and those acting in it) and the delegations in force.
async function sideOn(c: WorkspaceCtx) {
  const sv = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, sv, c.today, c.tx);
  const delegations = delegationFactsOf(sv);
  return {
    soHolderIds: so?.office.holderIds ?? [],
    soActingIds: so?.office.actingIds ?? [],
    /// PW-5 for anyone, on today.
    mayAct: (personId: string) => mayActForOrganisation(personId, so?.office ?? null, delegations, c.today),
  };
}
type Side5 = Awaited<ReturnType<typeof sideOn>>;

/// The actor as the rules read them: a staff person with their PW-5 authority today, or the contractor's account.
const ruleActor = (a: WorkspaceActor, side: Side5): Actor => (a.kind === "STAFF" ? { side: "ORGANISATION", personId: a.actor.personId, authorityToday: side.mayAct(a.actor.personId) } : { side: "CONTRACTOR", accountId: a.actor.accountId });

/// A staff act carries its attribution; a portal act has none (the supplier is named by the session, on the audit row).
function requireAttribution(a: WorkspaceActor, act: PreparedAct | null): void {
  if (a.kind === "STAFF" && !act) throw new Error("A staff act of the Project workspace needs its attribution (beginAct).");
  if (a.kind === "SUPPLIER" && act) throw new Error("A portal act of the Project workspace has no staff attribution.");
}
const staffPerson = (a: WorkspaceActor): string | null => (a.kind === "STAFF" ? a.actor.personId : null);

interface Labels {
  contract: string;
  document: string;
}
async function audit(c: WorkspaceCtx, a: WorkspaceActor, labels: Labels, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") {
  await writeAudit(c.tx, { actor: auditActorOf(a), organisationId: c.l.org.id, entity, entityId, entityLabel: `${labels.contract} · ${labels.document}${suffix ? ` · ${suffix}` : ""}`, reason }, action, changes);
}
const contractText = (l: LoadedContract) => contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });

/// Who a version waits on: each live approver, told once (the uploader never: PW-6).
function waitsOn(versionId: string, facts: DocumentFacts): WorkspaceEvent {
  const v = facts.versions.find((x) => x.id === versionId)!;
  return { event: "VERSION_WAITS_ON_APPROVERS", versionId, approverPersonIds: liveApprovers(facts).map((x) => x.personId), uploadedByPersonId: v.uploaderPersonId };
}

/// The staff notices of an act (PW-13), written in the act's transaction. The person who did it is never told of it.
async function notify(c: WorkspaceCtx, a: WorkspaceActor, doc: { id: string; title: string }, events: readonly (WorkspaceEvent & { number?: number })[]): Promise<void> {
  const by = a.kind === "STAFF" ? a.actor.personId : null;
  const href = `/projects/${c.l.contract.id}/documents/${doc.id}`;
  const drafts = events.flatMap((e) =>
    projectDocumentNotices({ target: noticeTargets(e), by, contractLabel: contractText(c.l), documentTitle: doc.title, contractorName: c.l.award.awardeeName, versionLabel: versionLabel(e.number ?? 1), exerciseId: c.l.ex.id, href }),
  );
  await writeNotices(c.tx, c.l.org.id, by, drafts);
}

// ------------------------------------------------------------------ the document's lock, and its staged files

/// The ProjectDocument row, locked, then read: the one row lock of the workspace. Not found (or on another contract or organisation) reads as not found.
async function lockedDocument(c: WorkspaceCtx, documentId: string) {
  await c.tx.$queryRaw`SELECT id FROM "ProjectDocument" WHERE id = ${documentId} FOR UPDATE`;
  const doc = await c.tx.projectDocument.findFirst({ where: { id: documentId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, title: true, side: true, kind: true } });
  if (!doc) return NOT_FOUND();
  return { doc, facts: await loadDocumentFacts(c.tx, doc.id) };
}

interface PinnableFile {
  version: { id: string; documentId: string; versionNo: number; sha256: string; withdrawnAt: Date | null; originalFilename: string; byteSize: bigint };
  document: { id: string; title: string; status: "STAGED" | "FILED" | "WITHDRAWN" | string };
}

/**
 * The staged store versions an act would pin (ADR 0042 D8), locked and judged. Locked in id order, owner first (the contract and the ProjectDocument are held already),
 * then each store document, so a withdrawal that committed while this act waited is seen and nothing is pinned twice. Every fault of every file is returned; the act
 * refuses on any. A version that is not the organisation's reads as not found, with no word of whose it is.
 */
async function stagedFiles(c: WorkspaceCtx, a: WorkspaceActor, ids: readonly string[], projectClassId: string | null): Promise<{ files: PinnableFile[]; faults: Finding[] }> {
  if (ids.length === 0) return { files: [], faults: [] };
  const faults: Finding[] = [];
  const org = c.l.org.id;
  const at = await c.tx.documentVersion.findMany({ where: { id: { in: [...ids] }, organisationId: org }, select: { id: true, documentId: true } });
  for (const documentId of [...new Set(at.map((v) => v.documentId))].sort()) await lockDocument(c.tx, documentId);
  const rows = await c.tx.documentVersion.findMany({
    where: { id: { in: [...ids] }, organisationId: org },
    select: {
      id: true,
      documentId: true,
      versionNo: true,
      sha256: true,
      withdrawnAt: true,
      originalFilename: true,
      byteSize: true,
      recordedByPersonId: true,
      recordedBySupplierAccountId: true,
      document: { select: { id: true, title: true, status: true, stagedFor: true, documentClassId: true, classificationSnapshot: true, documentClass: { select: { classification: true } } } },
      _count: { select: { attachments: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const known: StagedFile[] = [];
  const files: PinnableFile[] = [];
  ids.forEach((id, n) => {
    const r = byId.get(id);
    if (!r) {
      faults.push({ code: "FILE_UNKNOWN", level: "block", data: { file: n + 1 } });
      return;
    }
    known.push({ versionId: r.id, stagedFor: r.document.stagedFor, recordedByPersonId: r.recordedByPersonId, recordedBySupplierAccountId: r.recordedBySupplierAccountId, attachments: r._count.attachments, withdrawn: r.withdrawnAt !== null, documentClassId: r.document.documentClassId });
    // The document store's own judgement of the pin (a withdrawn version, an owner that is frozen), as the generic attach makes it; the staged-file rules are `stagedFileFaults`.
    const own = blocking(attachFault({ purpose: "PROJECT_DOCUMENT_FILE", owner: { kind: "projectDocumentVersion", contractStatus: c.l.contract.status as ContractStatus }, version: { withdrawnAt: r.withdrawnAt }, documentClass: r.document.documentClass, documentClassification: r.document.classificationSnapshot, alreadyAttached: false, byOwnerAct: true }));
    for (const f of own) if (f.code !== "VERSION_WITHDRAWN") faults.push({ code: "FILE_REFUSED", level: "block", data: { file: n + 1, words: documentFaultText(f) } });
    // The contractor downloads a project file, so it is never SULIT or unclassified, now (the class may have been raised since it was staged).
    if (!contractorMayDownload({ versionVisible: true, documentClassification: r.document.classificationSnapshot, classClassification: r.document.documentClass.classification })) faults.push({ code: "FILE_NOT_FOR_CONTRACTOR", level: "block", data: { file: n + 1 } });
    files.push({ version: { id: r.id, documentId: r.documentId, versionNo: r.versionNo, sha256: r.sha256, withdrawnAt: r.withdrawnAt, originalFilename: r.originalFilename, byteSize: r.byteSize }, document: { id: r.document.id, title: r.document.title, status: r.document.status } });
  });
  if (projectClassId !== null) faults.push(...stagedFileFaults(known, a.kind === "STAFF" ? { side: "ORGANISATION", personId: a.actor.personId, authorityToday: true } : { side: "CONTRACTOR", accountId: a.actor.accountId }, projectClassId));
  return { files, faults };
}

/// Pin each staged file to the version (a `DocumentAttachment`, purpose PROJECT_DOCUMENT_FILE), file its store document, and audit both, as the generic attach act does.
async function pinFiles(c: WorkspaceCtx, a: WorkspaceActor, labels: Labels, files: readonly PinnableFile[], projectDocumentVersionId: string, versionNumber: number): Promise<void> {
  for (const f of files) {
    const row = await c.tx.documentAttachment.create({ data: { organisationId: c.l.org.id, purpose: "PROJECT_DOCUMENT_FILE", versionId: f.version.id, projectDocumentVersionId } });
    await writeAudit(
      c.tx,
      { actor: auditActorOf(a), organisationId: c.l.org.id, entity: "DocumentAttachment", entityId: row.id, entityLabel: `${labels.contract} · ${labels.document}, ${versionLabel(versionNumber)} · ${PURPOSE_LABEL.PROJECT_DOCUMENT_FILE}` },
      "CREATE",
      attached({ purpose: "PROJECT_DOCUMENT_FILE", title: f.document.title, versionNo: f.version.versionNo, sha256: f.version.sha256, owner: `${labels.contract} · ${labels.document}, ${versionLabel(versionNumber)}` }),
    );
    if (f.document.status === "STAGED") {
      await c.tx.document.update({ where: { id: f.document.id, organisationId: c.l.org.id }, data: { status: "FILED", filedAt: c.now } });
      await writeAudit(c.tx, { actor: auditActorOf(a), organisationId: c.l.org.id, entity: "Document", entityId: f.document.id, entityLabel: `Document · ${f.document.title}` }, "UPDATE", filed());
    }
  }
}

const filesWords = (files: readonly PinnableFile[]) => files.map((f) => f.version.originalFilename).join("; ");

// ------------------------------------------------------------------ create a document

/**
 * A document with its first version (the creator's side) or its first request (the other side), and any approvers named at once (PW-5, PW-6). A document is never
 * empty (ADR 0042 D1). A contractor's request goes to the organisation, so the S.O. office is told; its upload tells the S.O. office, and the approvers where it has any.
 */
export async function createDocument(
  c: WorkspaceCtx,
  a: WorkspaceActor,
  i: { title: string; note: string; first: { upload: { stagedVersionIds: readonly string[]; note: string } } | { request: { note: string } }; approverPersonIds: readonly string[] },
  act: PreparedAct | null,
): Promise<{ documentId: string; versionId: string | null }> {
  requireAttribution(a, act);
  const tx = c.tx;
  const side = await sideOn(c);
  const policy = await loadStorePolicy(c.l.org.id, tx);
  const actor = ruleActor(a, side);
  const upload = "upload" in i.first ? i.first.upload : null;
  const staged = upload ? await stagedFiles(c, a, upload.stagedVersionIds, policy.projectDocumentClassId) : { files: [], faults: [] };
  const names = [...new Set(i.approverPersonIds)];
  const approvers = i.approverPersonIds.map((personId) => ({ personId, authorityToday: side.mayAct(personId) }));
  const faults = [
    ...createFaults({
      actor,
      classSet: policy.projectDocumentClassId !== null,
      title: i.title,
      note: i.note,
      first: upload ? { upload: { files: upload.stagedVersionIds.length, note: upload.note, kind: null, signed: false } } : { request: { toSide: otherSide(sideOf(a)), note: "request" in i.first ? i.first.request.note : "" } },
      approvers,
    }),
    ...staged.faults,
  ];
  if (blocking(faults).length) refuse(faults);

  const title = i.title.trim();
  const labels: Labels = { contract: contractText(c.l), document: title };
  // The document's side: the creator's when it is uploaded first, the other side's when it is asked for (ADR 0042 D1).
  const docSide: Side = upload ? sideOf(a) : otherSide(sideOf(a));
  const doc = await c.tx.projectDocument.create({
    data: {
      organisationId: c.l.org.id,
      contractId: c.l.contract.id,
      title,
      note: i.note.trim(),
      side: docSide,
      createdByPersonId: a.kind === "STAFF" ? a.actor.personId : null,
      createdBySupplierAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null,
      createdAt: c.now,
    },
    select: { id: true },
  });
  // The document is new and no other act can see it yet, so it takes no lock of its own before its rows are written.
  const approverIds: { id: string; personId: string }[] = [];
  for (const personId of names) {
    const row = await c.tx.projectDocumentApprover.create({ data: { organisationId: c.l.org.id, documentId: doc.id, personId, addedByPersonId: staffPerson(a)!, addedAt: c.now }, select: { id: true } });
    approverIds.push({ id: row.id, personId });
  }
  await audit(c, a, labels, "ProjectDocument", doc.id, "", "CREATE", diffFields(null, { title, note: i.note.trim() || null, from: docSide === "CONTRACTOR" ? "the contractor" : c.l.org.name, createdOn: formatDate(c.today), approvers: approverIds.length || null }));
  if (act) await act.write(c.tx, doc.id);

  let versionId: string | null = null;
  const events: (WorkspaceEvent & { number?: number })[] = [];
  const hearing = { soHolderIds: side.soHolderIds, soActingIds: side.soActingIds };
  if (upload) {
    const v = await c.tx.projectDocumentVersion.create({
      data: {
        organisationId: c.l.org.id,
        documentId: doc.id,
        number: 1,
        note: upload.note.trim(),
        uploadedByPersonId: a.kind === "STAFF" ? a.actor.personId : null,
        uploadedBySupplierAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null,
        uploadedAt: c.now,
        uploadedOn: dayToDate(c.today),
        noApproversAtUpload: approverIds.length === 0,
      },
      select: { id: true },
    });
    versionId = v.id;
    await pinFiles(c, a, labels, staged.files, v.id, 1);
    await audit(c, a, labels, "ProjectDocumentVersion", v.id, versionLabel(1), "CREATE", diffFields(null, { version: versionLabel(1), note: upload.note.trim() || null, files: filesWords(staged.files), uploadedOn: formatDate(c.today), sharedAtOnce: approverIds.length === 0 ? "yes: no approver" : "no: it waits for its approvers" }));
    if (act) await act.writeAlso(tx, "ProjectDocumentVersion.uploadedByPerson", v.id);
    if (a.kind === "SUPPLIER") events.push({ event: "CONTRACTOR_UPLOADED", versionId: v.id, number: 1, ...hearing });
    if (approverIds.length > 0) events.push({ event: "VERSION_WAITS_ON_APPROVERS", versionId: v.id, approverPersonIds: approverIds.map((x) => x.personId), uploadedByPersonId: staffPerson(a), number: 1 });
  } else {
    const r = await c.tx.projectDocumentRequest.create({
      data: {
        organisationId: c.l.org.id,
        documentId: doc.id,
        toSide: docSide,
        note: "request" in i.first ? i.first.request.note.trim() : "",
        requestedByPersonId: a.kind === "STAFF" ? a.actor.personId : null,
        requestedBySupplierAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null,
        requestedAt: c.now,
      },
      select: { id: true },
    });
    await audit(c, a, labels, "ProjectDocumentRequest", r.id, "request", "CREATE", diffFields(null, { askedOf: docSide === "CONTRACTOR" ? "the contractor" : c.l.org.name, note: "request" in i.first ? i.first.request.note.trim() || null : null, askedOn: formatDate(c.today) }));
    if (act) await act.writeAlso(tx, "ProjectDocumentRequest.requestedByPerson", r.id);
    if (a.kind === "SUPPLIER") events.push({ event: "CONTRACTOR_REQUESTED", requestId: r.id, ...hearing });
  }
  for (const x of approverIds) {
    await audit(c, a, labels, "ProjectDocumentApprover", x.id, "approver", "CREATE", diffFields(null, { approver: await nameOf(c, x.personId), addedOn: formatDate(c.today) }));
    if (act) await act.writeAlso(tx, "ProjectDocumentApprover.addedBy", x.id);
  }
  await notify(c, a, { id: doc.id, title }, events);
  return { documentId: doc.id, versionId };
}

const nameOf = async (c: WorkspaceCtx, personId: string): Promise<string> => (await c.tx.person.findFirst({ where: { id: personId, organisationId: c.l.org.id }, select: { name: true } }))?.name ?? "A person";

// ------------------------------------------------------------------ a new version

/**
 * A new version of the document, by the document's side (PW-8). It answers the open request, if there is one. Approvals never carry over (PW-6): a version with live
 * approvers waits on them, and each is told, but never the person who uploaded it. A contractor's version tells the S.O. office too.
 */
export async function addVersion(c: WorkspaceCtx, a: WorkspaceActor, i: { documentId: string; stagedVersionIds: readonly string[]; note: string }, act: PreparedAct | null): Promise<{ versionId: string; number: number }> {
  requireAttribution(a, act);
  const side = await sideOn(c);
  const { doc, facts } = await lockedDocument(c, i.documentId);
  const policy = await loadStorePolicy(c.l.org.id, c.tx);
  const staged = await stagedFiles(c, a, i.stagedVersionIds, policy.projectDocumentClassId);
  const faults = [...uploadFaults({ actor: ruleActor(a, side), classSet: policy.projectDocumentClassId !== null, doc: facts, files: i.stagedVersionIds.length, note: i.note, kind: null, signed: false }), ...staged.faults];
  if (blocking(faults).length) refuse(faults);

  const labels: Labels = { contract: contractText(c.l), document: doc.title };
  const number = nextVersionNumber(facts);
  const open = documentState(facts).openRequest;
  const noApprovers = liveApprovers(facts).length === 0;
  const v = await c.tx.projectDocumentVersion.create({
    data: {
      organisationId: c.l.org.id,
      documentId: doc.id,
      number,
      note: i.note.trim(),
      uploadedByPersonId: a.kind === "STAFF" ? a.actor.personId : null,
      uploadedBySupplierAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null,
      uploadedAt: c.now,
      uploadedOn: dayToDate(c.today),
      noApproversAtUpload: noApprovers,
      requestId: open?.id ?? null,
    },
    select: { id: true },
  });
  await pinFiles(c, a, labels, staged.files, v.id, number);
  await audit(c, a, labels, "ProjectDocumentVersion", v.id, versionLabel(number), "CREATE", diffFields(null, { version: versionLabel(number), note: i.note.trim() || null, files: filesWords(staged.files), uploadedOn: formatDate(c.today), answersRequest: open ? "yes" : null, sharedAtOnce: noApprovers ? "yes: no approver" : "no: it waits for its approvers" }));
  if (act) await act.write(c.tx, v.id);

  const after: DocumentFacts = { ...facts, versions: [...facts.versions, { id: v.id, number, uploaderPersonId: a.kind === "STAFF" ? a.actor.personId : null, uploaderAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null, noApproversAtUpload: noApprovers, requestId: open?.id ?? null, uploadedOn: c.today }], requests: facts.requests.map((r) => (open && r.id === open.id ? { ...r, answered: true } : r)) };
  const events: (WorkspaceEvent & { number?: number })[] = [];
  if (a.kind === "SUPPLIER") events.push({ event: "CONTRACTOR_UPLOADED", versionId: v.id, number, soHolderIds: side.soHolderIds, soActingIds: side.soActingIds });
  if (!noApprovers) events.push({ ...waitsOn(v.id, after), number });
  await notify(c, a, doc, events);
  return { versionId: v.id, number };
}

// ------------------------------------------------------------------ ask for a document

/// Asking for the document again (PW-5, PW-30): to the document's side, from the other, only while it is Shared. A contractor's request tells the S.O. office.
export async function requestDocument(c: WorkspaceCtx, a: WorkspaceActor, i: { documentId: string; note: string }, act: PreparedAct | null): Promise<{ requestId: string }> {
  requireAttribution(a, act);
  const side = await sideOn(c);
  const { doc, facts } = await lockedDocument(c, i.documentId);
  const faults = requestFaults({ actor: ruleActor(a, side), doc: facts, note: i.note });
  if (blocking(faults).length) refuse(faults);
  const labels: Labels = { contract: contractText(c.l), document: doc.title };
  const r = await c.tx.projectDocumentRequest.create({
    data: {
      organisationId: c.l.org.id,
      documentId: doc.id,
      toSide: doc.side,
      note: i.note.trim(),
      requestedByPersonId: a.kind === "STAFF" ? a.actor.personId : null,
      requestedBySupplierAccountId: a.kind === "SUPPLIER" ? a.actor.accountId : null,
      requestedAt: c.now,
    },
    select: { id: true },
  });
  await audit(c, a, labels, "ProjectDocumentRequest", r.id, "request", "CREATE", diffFields(null, { askedOf: doc.side === "CONTRACTOR" ? "the contractor" : c.l.org.name, note: i.note.trim() || null, askedOn: formatDate(c.today) }));
  if (act) await act.write(c.tx, r.id);
  await notify(c, a, doc, a.kind === "SUPPLIER" ? [{ event: "CONTRACTOR_REQUESTED", requestId: r.id, soHolderIds: side.soHolderIds, soActingIds: side.soActingIds }] : []);
  return { requestId: r.id };
}

// ------------------------------------------------------------------ approvers

/**
 * Naming an approver (PW-6): by the organisation's side, at any time before approval, a person who holds PW-5 authority today. If a version already waits on approvers (the
 * document had none, or this person is a new one), the new approver is told (PW-13), unless they uploaded it.
 */
export async function addApprover(c: WorkspaceCtx, a: StaffWorkspaceActor, i: { documentId: string; personId: string }, act: PreparedAct): Promise<{ approverId: string }> {
  requireAttribution(a, act);
  const side = await sideOn(c);
  const { doc, facts } = await lockedDocument(c, i.documentId);
  const faults = addApproverFaults({ actor: ruleActor(a, side), doc: facts, personId: i.personId, personAuthorityToday: side.mayAct(i.personId) });
  if (blocking(faults).length) refuse(faults);
  const labels: Labels = { contract: contractText(c.l), document: doc.title };
  const row = await c.tx.projectDocumentApprover.create({ data: { organisationId: c.l.org.id, documentId: doc.id, personId: i.personId, addedByPersonId: a.actor.personId, addedAt: c.now }, select: { id: true } });
  await audit(c, a, labels, "ProjectDocumentApprover", row.id, "approver", "CREATE", diffFields(null, { approver: await nameOf(c, i.personId), addedOn: formatDate(c.today) }));
  if (act) await act.write(c.tx, row.id);
  // Read after the write: an approver added to a Shared document turns its latest version into one waiting for approval.
  const after: DocumentFacts = { ...facts, approvers: [...facts.approvers, { id: row.id, personId: i.personId, removed: false }] };
  const reading = documentState(after);
  const latest = latestVersion(after);
  if (reading.state === "WAITING_FOR_APPROVAL" && latest) await notify(c, a, doc, [{ event: "VERSION_WAITS_ON_APPROVERS", versionId: latest.id, approverPersonIds: [i.personId], uploadedByPersonId: latest.uploaderPersonId, number: latest.number }]);
  return { approverId: row.id };
}

/// Removing an approver, with a reason (PW-6, PW-25): audited with before and after. Replace an approver by adding the new one first.
export async function removeApprover(c: WorkspaceCtx, a: StaffWorkspaceActor, i: { documentId: string; approverId: string; reason: string }, act: PreparedAct): Promise<void> {
  requireAttribution(a, act);
  const side = await sideOn(c);
  const { doc, facts } = await lockedDocument(c, i.documentId);
  const faults = removeApproverFaults({ actor: ruleActor(a, side), doc: facts, approverId: i.approverId, reason: i.reason });
  if (blocking(faults).length) refuse(faults);
  const target = facts.approvers.find((x) => x.id === i.approverId)!;
  const moved = await c.tx.projectDocumentApprover.updateMany({ where: { id: i.approverId, documentId: doc.id, removedAt: null }, data: { removedAt: c.now, removedByPersonId: a.actor.personId, removeReason: i.reason.trim() } });
  if (moved.count !== 1) refuse([{ code: "NOT_LIVE", level: "block" }], 409);
  const labels: Labels = { contract: contractText(c.l), document: doc.title };
  await audit(c, a, labels, "ProjectDocumentApprover", i.approverId, "approver", "UPDATE", diffFields({ approver: await nameOf(c, target.personId), removed: false }, { approver: await nameOf(c, target.personId), removed: true, removedOn: formatDate(c.today) }), i.reason.trim());
  if (act) await act.write(c.tx, i.approverId);
}

// ------------------------------------------------------------------ approve or reject

/**
 * An approver's answer on the latest version (PW-6, PW-7): Approve, remarks optional; Reject, remarks required. The approver's PW-5 authority is judged today, at the
 * decision, not as it was when they were named. It is the officer's own act, not a signature (PW-26).
 */
export async function decideVersion(c: WorkspaceCtx, a: StaffWorkspaceActor, i: { documentId: string; versionId: string; outcome: "APPROVED" | "REJECTED"; remarks: string }, act: PreparedAct): Promise<void> {
  requireAttribution(a, act);
  const side = await sideOn(c);
  const { doc, facts } = await lockedDocument(c, i.documentId);
  const faults = decideFaults({ actor: ruleActor(a, side), doc: facts, versionId: i.versionId, outcome: i.outcome, remarks: i.remarks });
  if (blocking(faults).length) refuse(faults);
  const mine = liveApprovers(facts).find((x) => x.personId === a.actor.personId)!;
  const version = facts.versions.find((v) => v.id === i.versionId)!;
  const row = await c.tx.projectDocumentDecision.create({ data: { organisationId: c.l.org.id, versionId: i.versionId, approverId: mine.id, outcome: i.outcome, remarks: i.remarks.trim(), decidedByPersonId: a.actor.personId, decidedAt: c.now, decidedOn: dayToDate(c.today) }, select: { id: true } });
  const after: DocumentFacts = { ...facts, decisions: [...facts.decisions, { versionId: i.versionId, approverId: mine.id, outcome: i.outcome, remarks: i.remarks.trim() }] };
  const labels: Labels = { contract: contractText(c.l), document: doc.title };
  await audit(c, a, labels, "ProjectDocumentDecision", row.id, versionLabel(version.number), "CREATE", diffFields(null, { version: versionLabel(version.number), answer: i.outcome === "APPROVED" ? "Approved" : "Rejected", remarks: i.remarks.trim() || null, decidedOn: formatDate(c.today), documentIsNow: documentState(after).state === "APPROVED" ? "approved by every approver" : documentState(after).state === "REJECTED" ? "rejected: a new version is asked for" : "waiting for the other approvers" }));
  if (act) await act.write(c.tx, row.id);
}
