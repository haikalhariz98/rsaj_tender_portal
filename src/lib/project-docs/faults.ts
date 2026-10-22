/**
 * What refuses each act of the Project workspace (ADR 0042, PW-5 to PW-9, PW-25, PW-30), judged on the rows the act read under the document's lock. One
 * function per act; each returns every fault it finds, never only the first, so the form can show them together. Pure.
 *
 * Every refusal the database would give is caught here first (the triggers PA040 to PA044, the CHECKs and the unique keys of migration 20261122000100 are the
 * backstop, never the first word): one open request per document (ALREADY_WAITING); no kind set while an approver is live (KIND_WITH_APPROVERS); one live
 * row per approver (ALREADY_APPROVER, APPROVER_TWICE); only a live approver of the same document decides, as themselves (NOT_AN_APPROVER), on the latest
 * version (NOT_CURRENT), once (ALREADY_DECIDED, ALREADY_MARKED), never on a version they uploaded (OWN_VERSION); a version comes from the document's side
 * (NOT_YOUR_SIDE); a request goes to the document's side from the other (OWN_SIDE, REQUEST_OWN_SIDE); a title, a reason, and a rejection's or return's
 * remarks are never blank. Versions are numbered by `nextVersionNumber` (`state.ts`).
 *
 * No password is asked by any of these acts' rules except the statutory declaration's version (PW-10, AC-30), which must have been signed with the
 * contractor's password before it reaches here (DECLARATION_NOT_SIGNED). Approving, rejecting and marking are the officer's own acts, never signature-class
 * (PW-26).
 */

import { PROJECT_FILES_PER_VERSION } from "./bounds";
import { documentState, liveApprovers, markOn, type DocumentReading } from "./state";
import type { Actor, DocKind, DocumentFacts, Finding, Side } from "./types";

export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;
export const REMARKS_MAX = 4000;
export const REASON_MAX = 2000;

const blank = (s: string) => s.trim().length === 0;
const tooLong = (s: string, max: number) => s.trim().length > max;
const DECLARATION: DocKind = "STATUTORY_DECLARATION";

/// PW-5: an organisation actor without authority today. A contractor's reach was settled before (`inHeldContract`).
const lacksAuthority = (a: Actor) => a.side === "ORGANISATION" && !a.authorityToday;

/// The state, worded by the caller: a fault that turns on it carries it, and the kind, so "Noted" reads right on defects rectified (PW-24).
const stateData = (d: DocumentFacts, r: DocumentReading) => ({ state: r.state, kind: d.kind });

function collector<C extends string>() {
  const out: Finding<C>[] = [];
  const add = (code: C, data?: Finding<C>["data"]) => out.push(data ? { code, level: "block", data } : { code, level: "block" });
  return { out, add };
}

// ------------------------------------------------------------------ create

export type CreateFault =
  | "NO_AUTHORITY"
  | "CLASS_NOT_SET"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "NOTE_TOO_LONG"
  | "NO_FILES"
  | "TOO_MANY_FILES"
  | "KIND_NOT_CONTRACTOR"
  | "KIND_WITH_APPROVERS"
  | "DECLARATION_NOT_SIGNED"
  | "APPROVERS_NOT_ORGANISATION"
  | "APPROVER_NO_AUTHORITY"
  | "APPROVER_TWICE"
  | "REQUEST_OWN_SIDE";

/// The document's first act: an upload (its side is the creator's) or a request (its side is the one asked). `signed`: the statutory declaration's password
/// was asked again at this upload.
export type FirstAct = { upload: { files: number; note: string; kind: DocKind | null; signed: boolean } } | { request: { toSide: Side; note: string } };

/**
 * Creating a document with its first version or its first request (ADR 0042 D1), and any approvers named at once (PW-6). Each named approver must hold
 * PW-5 authority today (`authorityToday`, as for the actor), and is named once. NOTE_TOO_LONG says which note: `data.field` is "document", "version" or
 * "request". APPROVER_NO_AUTHORITY carries the person's id in `data.personId`, for the form to name them; the words never show it.
 */
export function createFaults(i: { actor: Actor; classSet: boolean; title: string; note: string; first: FirstAct; approvers: readonly { personId: string; authorityToday: boolean }[] }): Finding<CreateFault>[] {
  const { out, add } = collector<CreateFault>();
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  if (!i.classSet) add("CLASS_NOT_SET");
  if (blank(i.title)) add("TITLE_REQUIRED");
  if (tooLong(i.title, TITLE_MAX)) add("TITLE_TOO_LONG", { limit: TITLE_MAX });
  if (tooLong(i.note, NOTE_MAX)) add("NOTE_TOO_LONG", { field: "document", limit: NOTE_MAX });
  if ("upload" in i.first) {
    const u = i.first.upload;
    if (u.files < 1) add("NO_FILES");
    if (u.files > PROJECT_FILES_PER_VERSION) add("TOO_MANY_FILES", { limit: PROJECT_FILES_PER_VERSION, files: u.files });
    if (tooLong(u.note, NOTE_MAX)) add("NOTE_TOO_LONG", { field: "version", limit: NOTE_MAX });
    if (u.kind !== null && i.actor.side !== "CONTRACTOR") add("KIND_NOT_CONTRACTOR");
    if (u.kind !== null && i.approvers.length > 0) add("KIND_WITH_APPROVERS");
    if (u.kind === DECLARATION && !u.signed) add("DECLARATION_NOT_SIGNED");
  } else {
    const r = i.first.request;
    if (r.toSide === i.actor.side) add("REQUEST_OWN_SIDE");
    if (tooLong(r.note, NOTE_MAX)) add("NOTE_TOO_LONG", { field: "request", limit: NOTE_MAX });
  }
  if (i.approvers.length > 0 && i.actor.side !== "ORGANISATION") add("APPROVERS_NOT_ORGANISATION");
  const seen = new Set<string>();
  for (const a of i.approvers) {
    if (seen.has(a.personId)) add("APPROVER_TWICE", { personId: a.personId });
    else if (!a.authorityToday) add("APPROVER_NO_AUTHORITY", { personId: a.personId });
    seen.add(a.personId);
  }
  return out;
}

// ------------------------------------------------------------------ upload a version

export type UploadFault =
  | "NO_AUTHORITY"
  | "CLASS_NOT_SET"
  | "NOT_YOUR_SIDE"
  | "FINAL"
  | "NO_FILES"
  | "TOO_MANY_FILES"
  | "NOTE_TOO_LONG"
  | "KIND_NOT_CONTRACTOR"
  | "KIND_ALREADY_SET"
  | "KIND_WITH_APPROVERS"
  | "DECLARATION_NOT_SIGNED";

/**
 * A new version (PW-8). Accepted in every state but the final ones: approvals never carry over (PW-6), and it answers the open request, if any. Only the
 * document's side uploads (NOT_YOUR_SIDE). A kind is offered only with a contractor document's first version, while no approver is live (KIND_ALREADY_SET,
 * KIND_WITH_APPROVERS, trigger PA040). A statutory declaration's every version is signed (DECLARATION_NOT_SIGNED reads the document's kind, or the kind
 * offered with this first version).
 */
export function uploadFaults(i: { actor: Actor; classSet: boolean; doc: DocumentFacts; files: number; note: string; kind: DocKind | null; signed: boolean }): Finding<UploadFault>[] {
  const { out, add } = collector<UploadFault>();
  const r = documentState(i.doc);
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  if (!i.classSet) add("CLASS_NOT_SET");
  if (i.actor.side !== i.doc.side) add("NOT_YOUR_SIDE", { side: i.doc.side });
  if (r.final) add("FINAL", stateData(i.doc, r));
  if (i.files < 1) add("NO_FILES");
  if (i.files > PROJECT_FILES_PER_VERSION) add("TOO_MANY_FILES", { limit: PROJECT_FILES_PER_VERSION, files: i.files });
  if (tooLong(i.note, NOTE_MAX)) add("NOTE_TOO_LONG", { field: "version", limit: NOTE_MAX });
  if (i.kind !== null) {
    if (i.actor.side !== "CONTRACTOR" || i.doc.side !== "CONTRACTOR") add("KIND_NOT_CONTRACTOR");
    if (i.doc.kind !== null || i.doc.versions.length > 0) add("KIND_ALREADY_SET");
    if (liveApprovers(i.doc).length > 0) add("KIND_WITH_APPROVERS");
  }
  if ((i.doc.kind ?? i.kind) === DECLARATION && !i.signed) add("DECLARATION_NOT_SIGNED");
  return out;
}

// ------------------------------------------------------------------ ask for a document

export type RequestFault = "NO_AUTHORITY" | "OWN_SIDE" | "FINAL" | "ALREADY_WAITING" | "UNDER_REVIEW" | "NOTE_TOO_LONG";

/**
 * Asking for a document again (PW-5, PW-30). The request goes to the document's side, from the other side (OWN_SIDE otherwise), and only while the document
 * is Shared. At any other time it is final (FINAL), or it already waits on the document's side (ALREADY_WAITING: an open request, a rejection or a return, or
 * an organisation document waiting for its approvers), or the asker's own side has the latest version in hand (UNDER_REVIEW: a contractor document waiting
 * for approval, or received and not yet marked).
 */
export function requestFaults(i: { actor: Actor; doc: DocumentFacts; note: string }): Finding<RequestFault>[] {
  const { out, add } = collector<RequestFault>();
  const r = documentState(i.doc);
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  if (i.actor.side === i.doc.side) add("OWN_SIDE", { side: i.doc.side });
  if (r.final) add("FINAL", stateData(i.doc, r));
  else if (r.state !== "SHARED") {
    if (r.openRequest !== null || r.waitsOn === i.doc.side) add("ALREADY_WAITING", { ...stateData(i.doc, r), side: i.doc.side });
    else add("UNDER_REVIEW", stateData(i.doc, r));
  }
  if (tooLong(i.note, NOTE_MAX)) add("NOTE_TOO_LONG", { field: "request", limit: NOTE_MAX });
  return out;
}

// ------------------------------------------------------------------ approvers

export type AddApproverFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "APPROVER_NO_AUTHORITY" | "ALREADY_APPROVER" | "FINAL" | "KIND_TAKES_NO_APPROVERS";

/// Naming an approver (PW-6): by the organisation's side, at any time before approval, a person holding PW-5 authority today, not already a live approver
/// (the partial unique key), on a document with no kind (trigger PA043).
export function addApproverFaults(i: { actor: Actor; doc: DocumentFacts; personId: string; personAuthorityToday: boolean }): Finding<AddApproverFault>[] {
  const { out, add } = collector<AddApproverFault>();
  const r = documentState(i.doc);
  if (i.actor.side !== "ORGANISATION") add("NOT_ORGANISATION");
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  if (!i.personAuthorityToday) add("APPROVER_NO_AUTHORITY", { personId: i.personId });
  if (liveApprovers(i.doc).some((a) => a.personId === i.personId)) add("ALREADY_APPROVER");
  if (r.final) add("FINAL", stateData(i.doc, r));
  if (i.doc.kind !== null) add("KIND_TAKES_NO_APPROVERS");
  return out;
}

export type RemoveApproverFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NOT_LIVE" | "DECIDED_CURRENT" | "LAST_APPROVER" | "WOULD_APPROVE" | "FINAL" | "REASON_REQUIRED" | "REASON_TOO_LONG";

/**
 * Removing an approver, with a reason (PW-6, PW-25). Only a live approver of this document (NOT_LIVE), who has not decided the latest version
 * (DECIDED_CURRENT). Refused when no live approver would remain (LAST_APPROVER, even before any version), or when everyone remaining has already approved the
 * latest version (WOULD_APPROVE: the document would become Approved with no decision taken). To replace an approver, add the new one first, then remove.
 */
export function removeApproverFaults(i: { actor: Actor; doc: DocumentFacts; approverId: string; reason: string }): Finding<RemoveApproverFault>[] {
  const { out, add } = collector<RemoveApproverFault>();
  const r = documentState(i.doc);
  if (i.actor.side !== "ORGANISATION") add("NOT_ORGANISATION");
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  const live = liveApprovers(i.doc);
  const target = live.find((a) => a.id === i.approverId);
  if (!target) add("NOT_LIVE");
  else {
    const latest = r.latest;
    const decidedLatest = (approverId: string) => latest !== null && i.doc.decisions.some((x) => x.versionId === latest.id && x.approverId === approverId);
    if (decidedLatest(target.id)) add("DECIDED_CURRENT");
    const remaining = live.filter((a) => a.id !== target.id);
    if (remaining.length === 0) add("LAST_APPROVER");
    else if (latest !== null && remaining.every((a) => i.doc.decisions.some((x) => x.versionId === latest.id && x.approverId === a.id && x.outcome === "APPROVED"))) add("WOULD_APPROVE");
  }
  if (r.final) add("FINAL", stateData(i.doc, r));
  if (blank(i.reason)) add("REASON_REQUIRED");
  if (tooLong(i.reason, REASON_MAX)) add("REASON_TOO_LONG", { limit: REASON_MAX });
  return out;
}

// ------------------------------------------------------------------ decide (approve or reject)

export type DecideFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NOT_AN_APPROVER" | "OWN_VERSION" | "NOT_CURRENT" | "ALREADY_DECIDED" | "NOT_WAITING" | "REMARKS_REQUIRED" | "REMARKS_TOO_LONG";

/**
 * An approver's answer on the latest version (PW-6, PW-7): Approve, remarks optional; Reject, remarks required. `actor.authorityToday` is the approver's PW-5
 * authority re-checked on the day they decide. NOT_WAITING: the document is not waiting for approval (another approver rejected it, it is approved, it is
 * asked for again, or it has a kind and is never approved).
 */
export function decideFaults(i: { actor: Actor; doc: DocumentFacts; versionId: string; outcome: "APPROVED" | "REJECTED"; remarks: string }): Finding<DecideFault>[] {
  const { out, add } = collector<DecideFault>();
  const r = documentState(i.doc);
  if (i.actor.side !== "ORGANISATION") add("NOT_ORGANISATION");
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  const personId = i.actor.side === "ORGANISATION" ? i.actor.personId : null;
  const mine = personId === null ? undefined : liveApprovers(i.doc).find((a) => a.personId === personId);
  if (personId !== null && !mine) add("NOT_AN_APPROVER");
  const version = i.doc.versions.find((v) => v.id === i.versionId);
  if (personId !== null && version?.uploaderPersonId === personId) add("OWN_VERSION");
  if (r.latest?.id !== i.versionId) add("NOT_CURRENT");
  if (mine && i.doc.decisions.some((x) => x.versionId === i.versionId && x.approverId === mine.id)) add("ALREADY_DECIDED");
  if (r.state !== "WAITING_FOR_APPROVAL") add("NOT_WAITING", stateData(i.doc, r));
  if (i.outcome === "REJECTED" && blank(i.remarks)) add("REMARKS_REQUIRED", { outcome: i.outcome });
  if (tooLong(i.remarks, REMARKS_MAX)) add("REMARKS_TOO_LONG", { limit: REMARKS_MAX });
  return out;
}

// ------------------------------------------------------------------ mark a version of a kind

export type MarkFault = "NOT_ORGANISATION" | "NO_AUTHORITY" | "NO_KIND" | "OWN_VERSION" | "NOT_CURRENT" | "ALREADY_MARKED" | "REMARKS_REQUIRED" | "REMARKS_TOO_LONG";

/**
 * The mark on a version of one of the six kinds (PW-9): Taken up (Noted, on defects rectified), or Returned with remarks for a new version. By a person with
 * PW-5 authority, on the latest version, once (the partial unique key). OWN_VERSION mirrors trigger PA044, which refuses a decider who uploaded the version;
 * a kind's versions come from the contractor, so it is there for the backstop's sake.
 */
export function markFaults(i: { actor: Actor; doc: DocumentFacts; versionId: string; outcome: "TAKEN_UP" | "RETURNED"; remarks: string }): Finding<MarkFault>[] {
  const { out, add } = collector<MarkFault>();
  const r = documentState(i.doc);
  if (i.actor.side !== "ORGANISATION") add("NOT_ORGANISATION");
  if (lacksAuthority(i.actor)) add("NO_AUTHORITY");
  if (i.doc.kind === null) add("NO_KIND");
  const version = i.doc.versions.find((v) => v.id === i.versionId);
  if (i.actor.side === "ORGANISATION" && version?.uploaderPersonId === i.actor.personId) add("OWN_VERSION");
  if (r.latest?.id !== i.versionId) add("NOT_CURRENT");
  if (markOn(i.doc, i.versionId)) add("ALREADY_MARKED", { kind: i.doc.kind });
  if (i.outcome === "RETURNED" && blank(i.remarks)) add("REMARKS_REQUIRED", { outcome: i.outcome });
  if (tooLong(i.remarks, REMARKS_MAX)) add("REMARKS_TOO_LONG", { limit: REMARKS_MAX });
  return out;
}
