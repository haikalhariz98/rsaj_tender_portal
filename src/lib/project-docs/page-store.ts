/**
 * What a staff screen needs of one Project workspace document (plan step 4 §5.3; ADR 0042 D4): the document, its versions with their files and decisions, its approvers
 * with their answer on the latest version, the approver picker, and which actions the reader may take, each with why not where it may not. A reader, not pure: it writes
 * nothing and takes no lock (the acts judge again under the locks). Every gate is the pure fault of the act (`faults.ts`) asked with the READER as the actor, so the screen
 * restates no rule and a blocked button always says why (`faultText`).
 *
 * Reading follows `caseVisibility`: the page judges who may open the contract (a HIDDEN case is a 404) before it asks. A reader with no authority to act still reads the
 * whole document; only the gates are blocked. Words are `labels.ts`'s; a code never reaches a screen; the organisation is named by its configured name; no figure.
 */

import type { Tx } from "@/lib/audit/record";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { SCAN_LABEL } from "@/lib/documents/labels";
import { loadStorePolicy } from "@/lib/documents/service";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { loadDocumentFactsMany } from "./facts";
import { addApproverFaults, removeApproverFaults, decideFaults, requestFaults, uploadFaults } from "./faults";
import { faultText, kindWords, outcomeWords, sideWords, stateWords, versionLabel, waitsOnWords } from "./labels";
import { organisationSideOn } from "./side-store";
import { mayActForOrganisation } from "./side";
import { documentState, latestVersion, liveApprovers, type DocumentState } from "./state";
import type { Actor, DocKind, Finding, Outcome, Side } from "./types";

/// Whether the reader may take an action now, and if not, why, in words (never a code). `reasons` is empty when allowed.
export interface Gate {
  allowed: boolean;
  reasons: string[];
}

export interface PageFile {
  /// The store's version id: the staff download is `/api/documents/versions/{versionId}` (as an attachment).
  versionId: string;
  name: string;
  bytes: number;
  mediaType: string;
  /// "Not scanned for malware — scanning not built", until scanning is built.
  scanLabel: string;
}

export interface PageDecision {
  /// The approver's name; null for a mark on a kind (step 6).
  approverName: string | null;
  outcome: Outcome;
  /// Kind-aware ("Noted" on defects rectified).
  outcomeLabel: string;
  remarks: string;
  decidedOn: string;
  decidedByName: string;
}

export interface PageVersion {
  id: string;
  number: number;
  /// "Version 2".
  label: string;
  note: string;
  uploadedOn: string;
  /// A person's name for the organisation's version; the contractor's name for its own.
  uploadedByName: string;
  /// The version answers a request.
  answersRequest: boolean;
  files: PageFile[];
  decisions: PageDecision[];
}

export interface PageApprover {
  id: string;
  personId: string;
  name: string;
  live: boolean;
  /// On the latest version: "APPROVED", "REJECTED" or "PENDING". Null for a removed approver, or while there is no version.
  answer: "APPROVED" | "REJECTED" | "PENDING" | null;
  answerLabel: string | null;
  /// Pending, but uploaded the latest version, so someone else decides it and they stay waiting until another approver is named and they are removed (PW-25).
  ownVersion: boolean;
  addedOn: string;
  removedOn: string | null;
  removeReason: string;
  /// Whether the reader may remove this approver, and why not.
  remove: Gate;
}

export interface PageRequest {
  id: string;
  /// Who was asked.
  toSide: Side;
  toLabel: string;
  note: string;
  requestedOn: string;
  /// The version that answered it, or null while it is open.
  answeredByVersion: number | null;
}

export interface DocumentPage {
  id: string;
  contractId: string;
  title: string;
  note: string;
  side: Side;
  /// "The contractor" or the organisation's configured name: whose versions this document holds.
  sideLabel: string;
  kind: DocKind | null;
  kindLabel: string | null;
  state: DocumentState;
  /// The state in words (kind-aware): what the badge says.
  stateLabel: string;
  waitsOn: Side | null;
  waitsOnLabel: string | null;
  final: boolean;
  createdOn: string;
  versions: PageVersion[];
  requests: PageRequest[];
  /// The open request, if any (also in `requests`).
  openRequest: PageRequest | null;
  approvers: PageApprover[];
  /// Names of pending approvers who uploaded the latest version: the page says so, never a silent wait.
  ownVersionApproverNames: string[];
  /// Who the reader may name as an approver: those on the organisation's side who may act today, and are not live approvers already.
  picker: { personId: string; name: string; officeLabel: string }[];
  /// The reader holds authority to act for the organisation today (PW-5). False reads the document and no more.
  readerMayAct: boolean;
  /// Why the reader's actions are shut where the contract itself shuts them (its state), else null.
  workspaceShut: string | null;
  actions: {
    /// Upload a new version (the organisation's side uploads only to its own document).
    upload: Gate;
    /// Ask the contractor for it (only while Shared, and only for a document of the contractor's side).
    request: Gate;
    addApprover: Gate;
    approve: Gate;
    reject: Gate;
    /// The version approve and reject are about: the latest.
    decideVersionId: string | null;
  };
  /// The project's class for files is set: where false, nothing can be added and the screen names the setting (`faultText` of CLASS_NOT_SET).
  classSet: boolean;
}

const gate = (faults: readonly Finding[], orgName: string, shut: string | null): Gate => {
  if (shut) return { allowed: false, reasons: [shut] };
  const reasons = [...new Set(faults.filter((f) => f.level === "block").map((f) => faultText(f, orgName)))];
  return { allowed: reasons.length === 0, reasons };
};

/**
 * The document, or null where it is not on this contract (a 404). `l` is the loaded contract (the page has it); the reader is the signed-in staff person.
 */
export async function loadDocumentPage(client: Tx, l: LoadedContract, viewer: StaffActor, documentId: string): Promise<DocumentPage | null> {
  const orgName = l.org.name;
  const row = await client.projectDocument.findFirst({
    where: { id: documentId, contractId: l.contract.id, organisationId: l.org.id },
    select: {
      id: true,
      title: true,
      note: true,
      side: true,
      kind: true,
      createdAt: true,
      versions: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          note: true,
          uploadedOn: true,
          noApproversAtUpload: true,
          requestId: true,
          uploadedByPersonId: true,
          uploadedBySupplierAccountId: true,
          uploadedByPerson: { select: { name: true } },
          files: { where: { detachedAt: null }, orderBy: { attachedAt: "asc" }, select: { version: { select: { id: true, originalFilename: true, byteSize: true, mediaType: true, scanState: true } } } },
          decisions: { orderBy: [{ decidedAt: "asc" }, { id: "asc" }], select: { outcome: true, remarks: true, decidedOn: true, decidedBy: { select: { name: true } }, approver: { select: { person: { select: { name: true } } } } } },
        },
      },
      approvers: { orderBy: [{ addedAt: "asc" }, { id: "asc" }], select: { id: true, personId: true, addedAt: true, removedAt: true, removeReason: true, person: { select: { name: true } } } },
      requests: { orderBy: [{ requestedAt: "asc" }, { id: "asc" }], select: { id: true, toSide: true, note: true, requestedAt: true, answeredBy: { select: { id: true, number: true } } } },
    },
  });
  if (!row) return null;
  const facts = (await loadDocumentFactsMany(client, [row.id])).get(row.id)!;
  const reading = documentState(facts);
  const latest = latestVersion(facts);

  const today = dayOf(new Date(), l.org.timeZone);
  const sv = await loadSupervision(l.contract.id, client);
  const so = today ? await soOfficeOn(l, sv, today, client) : null;
  const readerMayAct = today !== null && mayActForOrganisation(viewer.personId, so?.office ?? null, delegationFactsOf(sv), today);
  const policy = await loadStorePolicy(l.org.id, client);
  const classSet = policy.projectDocumentClassId !== null;
  const status = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
  const shut = status ? actStatusText(status) : today === null ? faultText({ code: "ZONE_NOT_SET", level: "block" }, orgName) : null;
  const actor: Actor = { side: "ORGANISATION", personId: viewer.personId, authorityToday: readerMayAct };

  const live = liveApprovers(facts);
  /// An instant (a server clock) is read on the organisation's day, never as a stored day.
  const onDay = (instant: Date): string => dayOf(instant, l.org.timeZone) ?? "";
  const answerOf = (approverId: string): "APPROVED" | "REJECTED" | "PENDING" | null => {
    if (!latest) return null;
    const d = facts.decisions.find((x) => x.versionId === latest.id && x.approverId === approverId);
    return d ? (d.outcome === "APPROVED" ? "APPROVED" : "REJECTED") : "PENDING";
  };
  const ANSWER_WORDS = { APPROVED: "Approved", REJECTED: "Rejected", PENDING: "Waiting" } as const;
  const approvers: PageApprover[] = row.approvers.map((a) => {
    const isLive = a.removedAt === null;
    const answer = isLive ? answerOf(a.id) : null;
    return {
      id: a.id,
      personId: a.personId,
      name: a.person.name,
      live: isLive,
      answer,
      answerLabel: answer ? ANSWER_WORDS[answer] : null,
      ownVersion: isLive && answer === "PENDING" && latest?.uploaderPersonId === a.personId,
      addedOn: onDay(a.addedAt),
      removedOn: a.removedAt ? onDay(a.removedAt) : null,
      removeReason: a.removeReason,
      remove: isLive ? gate(removeApproverFaults({ actor, doc: facts, approverId: a.id, reason: "reason" }), orgName, shut) : { allowed: false, reasons: [faultText({ code: "NOT_LIVE", level: "block" }, orgName)] },
    };
  });

  const toRequest = (r: (typeof row.requests)[number]): PageRequest => ({ id: r.id, toSide: r.toSide, toLabel: sideWords(r.toSide, orgName), note: r.note, requestedOn: onDay(r.requestedAt), answeredByVersion: r.answeredBy?.number ?? null });
  const requests = row.requests.map(toRequest);

  const picker = today
    ? (await organisationSideOn(l, sv, today, client)).filter((m) => m.mayAct && !live.some((x) => x.personId === m.personId)).map((m) => ({ personId: m.personId, name: m.name, officeLabel: m.officeLabel }))
    : [];

  const versionWords = (n: number) => versionLabel(n);
  const decideFor = (outcome: "APPROVED" | "REJECTED") => gate(decideFaults({ actor, doc: facts, versionId: latest?.id ?? "", outcome, remarks: "remarks" }), orgName, shut);

  return {
    id: row.id,
    contractId: l.contract.id,
    title: row.title,
    note: row.note,
    side: row.side,
    sideLabel: sideWords(row.side, orgName),
    kind: row.kind,
    kindLabel: row.kind ? kindWords(row.kind) : null,
    state: reading.state,
    stateLabel: stateWords(reading.state, row.kind),
    waitsOn: reading.waitsOn,
    waitsOnLabel: waitsOnWords(reading, orgName),
    final: reading.final,
    createdOn: onDay(row.createdAt),
    versions: row.versions.map((v) => ({
      id: v.id,
      number: v.number,
      label: versionWords(v.number),
      note: v.note,
      uploadedOn: storedDay(v.uploadedOn),
      uploadedByName: v.uploadedByPerson?.name ?? l.award.awardeeName,
      answersRequest: v.requestId !== null,
      files: v.files.map((f) => ({ versionId: f.version.id, name: f.version.originalFilename, bytes: Number(f.version.byteSize), mediaType: f.version.mediaType, scanLabel: SCAN_LABEL[f.version.scanState] })),
      decisions: v.decisions.map((d) => ({ approverName: d.approver?.person.name ?? null, outcome: d.outcome, outcomeLabel: outcomeWords(d.outcome, row.kind), remarks: d.remarks, decidedOn: storedDay(d.decidedOn), decidedByName: d.decidedBy.name })),
    })),
    requests,
    openRequest: reading.openRequest ? (requests.find((r) => r.id === reading.openRequest!.id) ?? null) : null,
    approvers,
    ownVersionApproverNames: approvers.filter((a) => a.ownVersion).map((a) => a.name),
    picker,
    readerMayAct,
    workspaceShut: shut,
    actions: {
      upload: gate(uploadFaults({ actor, classSet, doc: facts, files: 1, note: "", kind: null, signed: false }), orgName, shut),
      request: gate(requestFaults({ actor, doc: facts, note: "" }), orgName, shut),
      addApprover: gate(addApproverFaults({ actor, doc: facts, personId: "", personAuthorityToday: true }), orgName, shut),
      approve: decideFor("APPROVED"),
      reject: decideFor("REJECTED"),
      decideVersionId: latest?.id ?? null,
    },
    classSet,
  };
}
