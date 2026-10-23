"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import type { StaffActor } from "@/lib/auth/types";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf } from "@/lib/dates";
import { addApprover, addVersion, createDocument, decideVersion, markVersion, removeApprover, requestDocument, WorkspaceRefused, workspaceRefusalText, type WorkspaceCtx } from "@/lib/project-docs/store";
import { FormReader } from "@/lib/validate";

/**
 * The Project workspace's staff acts (ADR 0042, plan step 4 §5.2): create a document, upload a version, ask for a document, add and remove an approver, approve or
 * reject a version. Each is the signed-in officer's own act, begun with `beginAct` BEFORE the contract is locked (it may read the clock and the organisation's
 * switches) and written inside the lock, with its audit row and its notices, by the cores in `src/lib/project-docs/store.ts`. This file owns only the edge: who is
 * asking (an administrator account is refused, NFR-SEC-004), the form read once, the contract's lock and its act × status row (PROJECT_WORKSPACE, open from
 * Executed through Terminated), and the words of a refusal. It restates no rule: PW-5 (who may act), the state, and every fault are the store's and `faults.ts`'s.
 *
 * Files are never posted here: each is staged first through the staff upload route (`/api/documents`, `stagedFor=project-document`), which returns its `versionId`, and
 * the form posts those ids (`stagedVersionId`, repeated). A Server Action body is capped at 1 MB (ADR 0011 D5).
 *
 * The six kinds (plan step 6): staff never make a document of one, so nothing here reads a kind, and a statutory declaration is never recorded from paper (AC-59). Staff mark
 * the contractor's version of one: Taken up (Noted, on defects rectified) or Returned with remarks (`markProjectVersion`). Approving and marking ask no password (PW-26).
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const NO_ZONE = "Time zone not set. An administrator sets it under Configuration › Organisation.";

/// The contract, locked (requisition, exercise, award, contract: `withLockedContract`), the PROJECT_WORKSPACE row asked first, then the act.
async function inContract(actor: StaffActor, contractId: string, now: Date, fn: (c: WorkspaceCtx) => Promise<FormState>): Promise<FormState> {
  let orgName = "the organisation";
  let result: FormState | null;
  try {
    result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
      orgName = l.org.name;
      // The act x status table, first and under the lock: the workspace is open from Executed through Terminated (PW-22), refused before execution, when cancelled, and when closed.
      const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
      if (shut) return { ok: false, message: actStatusText(shut) };
      // The organisation's day, never UTC's.
      const today = dayOf(now, l.org.timeZone);
      if (!today) return { ok: false, message: NO_ZONE };
      return fn({ tx, l, now, today });
    });
  } catch (e) {
    if (e instanceof WorkspaceRefused) return { ok: false, message: workspaceRefusalText(e, orgName) };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${contractId}`);
    revalidatePath("/", "layout");
  }
  return result ?? GONE;
}

// ------------------------------------------------------------------ the form, read once

const ID = { required: true, max: 100 } as const;
const idsOf = (data: FormData, name: string): string[] => data.getAll(name).flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim()] : []));

const failed = (r: FormReader): { ok: false; state: FormState } => ({ ok: false, state: { ok: false, errors: r.errors } });

function readCreate(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const title = r.text("title", "Title", { required: true });
  const note = r.text("note", "Note");
  const mode = r.choice("mode", "How it starts", ["upload", "request"] as const, { required: true });
  const firstNote = r.text("firstNote", "Note");
  const stagedVersionIds = idsOf(data, "stagedVersionId");
  const approverPersonIds = idsOf(data, "approverPersonId");
  if (r.failed || !mode) return failed(r);
  return { ok: true as const, value: { contractId, title, note, mode, firstNote, stagedVersionIds, approverPersonIds } };
}

function readVersion(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const note = r.text("note", "Note");
  const stagedVersionIds = idsOf(data, "stagedVersionId");
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, documentId, note, stagedVersionIds } };
}

function readRequest(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const note = r.text("note", "Note");
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, documentId, note } };
}

function readAddApprover(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const personId = r.text("approverPersonId", "Approver", ID);
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, documentId, personId } };
}

function readRemoveApprover(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const approverId = r.text("approverId", "Approver", ID);
  const reason = r.text("reason", "Why the approver is removed", { required: true });
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, documentId, approverId, reason } };
}

function readDecision(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const versionId = r.text("versionId", "Version", ID);
  const outcome = r.choice("outcome", "The answer", ["APPROVED", "REJECTED"] as const, { required: true });
  const remarks = r.text("remarks", "Remarks");
  if (r.failed || !outcome) return failed(r);
  return { ok: true as const, value: { contractId, documentId, versionId, outcome, remarks } };
}

function readMark(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const documentId = r.text("documentId", "Document", ID);
  const versionId = r.text("versionId", "Version", ID);
  const outcome = r.choice("outcome", "The mark", ["TAKEN_UP", "RETURNED"] as const, { required: true });
  const remarks = r.text("remarks", "Remarks");
  if (r.failed || !outcome) return failed(r);
  return { ok: true as const, value: { contractId, documentId, versionId, outcome, remarks } };
}

const documentHref = (contractId: string, documentId: string) => `/projects/${contractId}/documents/${documentId}`;

// ------------------------------------------------------------------ the acts

/// A document with its first version (files staged first) or its first request, and the approvers named at once.
export async function createProjectDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readCreate(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocument.createdByPerson", { personField: "createdByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    const made = await createDocument(c, { kind: "STAFF", actor }, { title: v.title, note: v.note, first: v.mode === "upload" ? { upload: { stagedVersionIds: v.stagedVersionIds, note: v.firstNote } } : { request: { note: v.firstNote } }, approverPersonIds: v.approverPersonIds }, act);
    return { ok: true, message: v.mode === "upload" ? "Document added." : "Document asked for.", href: documentHref(v.contractId, made.documentId) };
  });
}

/// A new version of a document, from the document's own side (the organisation's, for a staff officer).
export async function uploadProjectVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readVersion(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentVersion.uploadedByPerson", { personField: "uploadedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    const made = await addVersion(c, { kind: "STAFF", actor }, { documentId: v.documentId, stagedVersionIds: v.stagedVersionIds, note: v.note }, act);
    return { ok: true, message: `Version ${made.number} added.`, href: documentHref(v.contractId, v.documentId) };
  });
}

/// Ask the document's side for it again, while the document is Shared.
export async function requestProjectDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readRequest(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentRequest.requestedByPerson", { personField: "requestedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await requestDocument(c, { kind: "STAFF", actor }, { documentId: v.documentId, note: v.note }, act);
    return { ok: true, message: "Asked for.", href: documentHref(v.contractId, v.documentId) };
  });
}

/// Name an approver: someone who holds authority to act today. The approver is told if a version already waits.
export async function addProjectApprover(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readAddApprover(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentApprover.addedBy", { personField: "addedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await addApprover(c, { kind: "STAFF", actor }, { documentId: v.documentId, personId: v.personId }, act);
    return { ok: true, message: "Approver added." };
  });
}

/// Remove an approver, with the reason, before they decide the latest version.
export async function removeProjectApprover(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readRemoveApprover(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentApprover.removedBy", { personField: "removedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await removeApprover(c, { kind: "STAFF", actor }, { documentId: v.documentId, approverId: v.approverId, reason: v.reason }, act);
    return { ok: true, message: "Approver removed." };
  });
}

/// An approver approves or rejects the latest version. A rejection needs its remarks, which go back to the side that sent it.
export async function decideProjectVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readDecision(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentDecision.decidedBy", { personField: "decidedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await decideVersion(c, { kind: "STAFF", actor }, { documentId: v.documentId, versionId: v.versionId, outcome: v.outcome, remarks: v.remarks }, act);
    return { ok: true, message: v.outcome === "APPROVED" ? "Approved." : "Rejected. The remarks go back with it." };
  });
}

/// Mark the contractor's latest version of one of the six kinds: Taken up (Noted, on defects rectified), or Returned with remarks, which go back with it for a new version.
export async function markProjectVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readMark(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "ProjectDocumentDecision.decidedBy", { personField: "decidedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    const marked = await markVersion(c, { kind: "STAFF", actor }, { documentId: v.documentId, versionId: v.versionId, outcome: v.outcome, remarks: v.remarks }, act);
    return { ok: true, message: v.outcome === "RETURNED" ? "Returned. The remarks go back with it." : `${marked.outcomeLabel}.` };
  });
}
