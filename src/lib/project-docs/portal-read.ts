/**
 * What the contractor's Project workspace screens read (plan step 5, §6; PW-4, PW-8, PW-13, PW-28). Readers, not pure: they write nothing and take no lock. The staff readers
 * (`register.ts`, `page-store.ts`) are staff-only and must never serve the portal: they name officers and carry the organisation's own state.
 *
 * Every read names the SESSION's supplier and organisation, and returns something only for a contract `supplierHoldsContract` allows (`loadProjectContext`): the answer is the
 * same `null` for a contract that does not exist, one of another organisation and one of another contractor.
 *
 * What the contractor sees is `contractor-view.ts`'s and `visibility.ts`'s, asked per document and never restated here:
 * - an organisation document the contractor did not ask for, with no version it may see, is NOT LISTED: not in `loadPortalRegister`, `null` from `loadPortalDocumentPage`;
 * - only the versions it may see are READ (the others are not selected, so no hidden version's note, file or decision can reach the shape), the day is the latest visible
 *   version's, and the state is the contractor's own (never "Waiting for approval" or "Rejected" on an organisation document);
 * - organisation remarks and decisions are shown to nobody; the remarks on the contractor's own documents are shown, by "the organisation", never by an officer's name.
 * No count, no days waiting, no figure (PW-4): rows carry words and a day.
 */

import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { mediaLabel, SCAN_LABEL } from "@/lib/documents/labels";
import { loadStorePolicy } from "@/lib/documents/service";
import { exerciseOrg } from "@/lib/method/repo";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { STANDING_AWARD } from "@/lib/portal/projects/visibility";

import { contractorFaultText, contractorReading, FROM_YOU, type ContractorReading } from "./contractor-view";
import { loadDocumentFactsMany } from "./facts";
import { createFaults, requestFaults, uploadFaults } from "./faults";
import { kindWords, outcomeWords, versionLabel } from "./labels";
import type { Gate } from "./page-store";
import { decodeRegisterCursor, encodeRegisterCursor, REGISTER_BATCH } from "./register";
import type { DocKind, Finding, Outcome } from "./types";
import { contractorSeesRemarks } from "./visibility";

export const PORTAL_PAGE = 50;
export const WAITING_PAGE = 20;

const fileHref = (attachmentId: string) => `/supplier/projects/documents/file/${attachmentId}`;
const documentHref = (contractId: string, documentId: string) => `/supplier/projects/${contractId}/documents/${documentId}`;

type Holder = Pick<SupplierActor, "supplierId" | "organisationId">;

// ------------------------------------------------------------------ the list

export interface PortalRow {
  id: string;
  title: string;
  /// The kind's name, or null for an ordinary document.
  kindLabel: string | null;
  /// The day (YYYY-MM-DD, the organisation's day; format it with `formatDate`) of the latest version the contractor may see, or null while there is none.
  latestOn: string | null;
  /// The state in the contractor's words (`contractor-view.ts`). `shown` is for a badge's tone: BEING_PREPARED reads as the organisation's work in hand.
  stateLabel: string;
  shown: "VERSIONS" | "BEING_PREPARED";
  /// "Waiting for you", `Waiting on {organisation}`, or null.
  waitsOnLabel: string | null;
  waitsOnYou: boolean;
  href: string;
}

/**
 * One page of a contract's documents as the contractor may see them, newest first (server-paged, cursor on (createdAt, id); no count, PW-4). `next` is the cursor of the page
 * after it, or null at the end. Null where the contract is not the supplier's. Unlisted organisation documents are skipped (PW-28): a page never says how many were.
 */
export async function loadPortalRegister(client: Tx, actor: Holder, contractId: string, i: { after?: string | null; take?: number } = {}): Promise<{ rows: PortalRow[]; next: string | null } | null> {
  const ctx = await loadProjectContext(client, actor, contractId);
  if (!ctx) return null;
  const take = Math.min(Math.max(i.take ?? PORTAL_PAGE, 1), 200);
  let from = decodeRegisterCursor(i.after ?? null);
  const rows: PortalRow[] = [];
  let last: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const batch = await client.projectDocument.findMany({
      where: { organisationId: actor.organisationId, contractId: ctx.contract.id, ...(from ? { OR: [{ createdAt: { lt: from.createdAt } }, { createdAt: from.createdAt, id: { lt: from.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REGISTER_BATCH,
      select: { id: true, title: true, createdAt: true },
    });
    if (batch.length === 0) return { rows, next: null };
    const facts = await loadDocumentFactsMany(client, batch.map((d) => d.id));
    for (const d of batch) {
      last = { createdAt: d.createdAt, id: d.id };
      const f = facts.get(d.id);
      if (!f) continue;
      const r = contractorReading(f, ctx.org.name);
      if (r.shown === "NOT_LISTED") continue;
      rows.push({ id: d.id, title: d.title, kindLabel: f.kind ? kindWords(f.kind as DocKind) : null, latestOn: r.latestVisible?.uploadedOn ?? null, stateLabel: r.stateLabel!, shown: r.shown, waitsOnLabel: r.waitsOnLabel, waitsOnYou: r.waitsOnYou, href: documentHref(ctx.contract.id, d.id) });
      if (rows.length === take) return { rows, next: encodeRegisterCursor(d.createdAt, d.id) };
    }
    if (batch.length < REGISTER_BATCH) return { rows, next: null };
    from = last;
  }
}

// ------------------------------------------------------------------ the page

export interface PortalFile {
  /// The `DocumentAttachment`'s id: the download is `href` (a GET that carries the page's own form token as `t`, as the registration's file does).
  attachmentId: string;
  name: string;
  bytes: number;
  /// The type in words, never the media type itself.
  typeLabel: string;
  /// "Not scanned for malware — scanning not built", until scanning is built.
  scanLabel: string;
  href: string;
}

export interface PortalDecision {
  outcome: Outcome;
  /// Kind-aware ("Noted" on defects rectified).
  outcomeLabel: string;
  remarks: string;
  decidedOn: string;
  /// The organisation, never an officer.
  byName: string;
}

export interface PortalVersion {
  id: string;
  number: number;
  /// "Version 2".
  label: string;
  note: string;
  uploadedOn: string;
  /// The organisation's name for its own versions; the contractor's own colleague's name for the contractor's.
  uploadedByName: string;
  answersRequest: boolean;
  files: PortalFile[];
  /// Only on the contractor's own documents (`contractorSeesRemarks`); empty on an organisation's.
  decisions: PortalDecision[];
}

export interface PortalRequest {
  id: string;
  /// "You" or the organisation's name: who was asked, and who asked.
  toLabel: string;
  byLabel: string;
  note: string;
  requestedOn: string;
  /// The number of the version that answered it, if the contractor may see that version; else null (the request reads as still open).
  answeredByVersion: number | null;
}

export interface PortalDocumentPage {
  id: string;
  contractId: string;
  title: string;
  note: string;
  kindLabel: string | null;
  /// "Being prepared by {organisation}" when `shown` is BEING_PREPARED.
  stateLabel: string;
  shown: "VERSIONS" | "BEING_PREPARED";
  waitsOnLabel: string | null;
  waitsOnYou: boolean;
  /// Whose document it is, in the contractor's words: "Yours" or the organisation's name.
  fromLabel: string;
  createdOn: string;
  versions: PortalVersion[];
  requests: PortalRequest[];
  actions: { upload: Gate; request: Gate };
  /// The contract's own state, when it shuts the workspace.
  workspaceShut: string | null;
  /// Project files have a class set (else nothing can be sent, and the reason says to ask the organisation).
  classSet: boolean;
  /// The organisation's configured name, for the page's own words.
  organisationName: string;
}

function gateOf(faults: readonly Finding[], orgName: string, shut: string | null): Gate {
  if (shut) return { allowed: false, reasons: [shut] };
  const reasons = [...new Set(faults.filter((f) => f.level === "block").map((f) => contractorFaultText(f, orgName)))];
  return { allowed: reasons.length === 0, reasons };
}

/**
 * One document as the contractor may see it, or null where it is not the supplier's to open: not its contract, not on this contract, or an organisation document with no
 * version the contractor may see that it did not ask for (PW-28). The versions are read only for the ids the contractor may see.
 */
export async function loadPortalDocumentPage(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId" | "accountId">, contractId: string, documentId: string): Promise<PortalDocumentPage | null> {
  const ctx = await loadProjectContext(client, actor, contractId);
  if (!ctx) return null;
  const orgName = ctx.org.name;
  const head = await client.projectDocument.findFirst({ where: { id: documentId, contractId: ctx.contract.id, organisationId: actor.organisationId }, select: { id: true, title: true, note: true, side: true, kind: true, createdAt: true } });
  if (!head) return null;
  const facts = (await loadDocumentFactsMany(client, [head.id])).get(head.id);
  if (!facts) return null;
  const reading: ContractorReading = contractorReading(facts, orgName);
  if (reading.shown === "NOT_LISTED") return null;

  const visibleIds = reading.visibleVersions.map((v) => v.id);
  const versions = visibleIds.length
    ? await client.projectDocumentVersion.findMany({
        where: { id: { in: visibleIds }, documentId: head.id },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          note: true,
          uploadedOn: true,
          requestId: true,
          uploadedByPersonId: true,
          uploadedBySupplierAccount: { select: { contact: { select: { name: true } } } },
          files: { where: { detachedAt: null, version: { withdrawnAt: null } }, orderBy: { attachedAt: "asc" }, select: { id: true, version: { select: { originalFilename: true, byteSize: true, mediaType: true, scanState: true } } } },
          decisions: { orderBy: [{ decidedAt: "asc" }, { id: "asc" }], select: { outcome: true, remarks: true, decidedOn: true } },
        },
      })
    : [];
  const requests = await client.projectDocumentRequest.findMany({
    where: { documentId: head.id },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    select: { id: true, toSide: true, note: true, requestedAt: true, requestedByPersonId: true, requestedBySupplierAccount: { select: { contact: { select: { name: true } } } }, answeredBy: { select: { id: true, number: true } } },
  });

  const remarksShown = contractorSeesRemarks(facts);
  const onDay = (instant: Date) => dayOf(instant, ctx.org.timeZone) ?? "";
  const seen = new Set(visibleIds);
  const policy = await loadStorePolicy(actor.organisationId, client);
  const classSet = policy.projectDocumentClassId !== null;
  const status = actStatusFault("PROJECT_WORKSPACE", ctx.contract.status as ContractStatus);
  const shut = status ? actStatusText(status) : null;
  const me = { side: "CONTRACTOR" as const, accountId: actor.accountId };

  return {
    id: head.id,
    contractId: ctx.contract.id,
    title: head.title,
    note: head.note,
    kindLabel: head.kind ? kindWords(head.kind as DocKind) : null,
    stateLabel: reading.stateLabel!,
    shown: reading.shown,
    waitsOnLabel: reading.waitsOnLabel,
    waitsOnYou: reading.waitsOnYou,
    fromLabel: head.side === "CONTRACTOR" ? FROM_YOU : orgName,
    createdOn: onDay(head.createdAt),
    versions: versions.map((v) => ({
      id: v.id,
      number: v.number,
      label: versionLabel(v.number),
      note: v.note,
      uploadedOn: storedDay(v.uploadedOn),
      uploadedByName: v.uploadedByPersonId ? orgName : (v.uploadedBySupplierAccount?.contact.name ?? ctx.contract.awardeeName),
      answersRequest: v.requestId !== null,
      files: v.files.map((f) => ({ attachmentId: f.id, name: f.version.originalFilename, bytes: Number(f.version.byteSize), typeLabel: mediaLabel(f.version.mediaType), scanLabel: SCAN_LABEL[f.version.scanState], href: fileHref(f.id) })),
      decisions: remarksShown ? v.decisions.map((d) => ({ outcome: d.outcome, outcomeLabel: outcomeWords(d.outcome, head.kind as DocKind | null), remarks: d.remarks, decidedOn: storedDay(d.decidedOn), byName: orgName })) : [],
    })),
    requests: requests.map((r) => ({
      id: r.id,
      toLabel: r.toSide === "CONTRACTOR" ? "You" : orgName,
      byLabel: r.requestedByPersonId ? orgName : (r.requestedBySupplierAccount?.contact.name ?? "You"),
      note: r.note,
      requestedOn: onDay(r.requestedAt),
      // A request answered by a version the contractor may not see reads as still open: the answer is the organisation's own working.
      answeredByVersion: r.answeredBy && seen.has(r.answeredBy.id) ? r.answeredBy.number : null,
    })),
    actions: {
      upload: gateOf(uploadFaults({ actor: me, classSet, doc: facts, files: 1, note: "", kind: null, signed: false }), orgName, shut),
      request: gateOf(requestFaults({ actor: me, doc: facts, note: "" }), orgName, shut),
    },
    workspaceShut: shut,
    classSet,
    organisationName: orgName,
  };
}

// ------------------------------------------------------------------ what the contractor may start

export interface PortalStart {
  /// Whether "New document" can be used now, and if not, why, in the contractor's words (the same faults as the create act, asked with a sample title and one file).
  create: Gate;
  /// The organisation's configured name, for the page's own words.
  organisationName: string;
}

/**
 * Whether the contractor may start a document on this contract now (the portal's twin of the staff screen's start gate): the pure create faults for a contractor actor, folded
 * with the contract's state, in words that name the organisation and no setting. Only the state-level faults can show (a sample title and one file are given), so a closed
 * contract or an unset project class says so before the contractor fills in a form. Null where the contract is not the supplier's.
 */
export async function loadPortalStart(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId" | "accountId">, contractId: string): Promise<PortalStart | null> {
  const ctx = await loadProjectContext(client, actor, contractId);
  if (!ctx) return null;
  const classSet = (await loadStorePolicy(actor.organisationId, client)).projectDocumentClassId !== null;
  const status = actStatusFault("PROJECT_WORKSPACE", ctx.contract.status as ContractStatus);
  const shut = status ? actStatusText(status) : null;
  const faults = createFaults({ actor: { side: "CONTRACTOR", accountId: actor.accountId }, classSet, title: "title", note: "", first: { upload: { files: 1, note: "", kind: null, signed: false } }, approvers: [] });
  return { create: gateOf(faults, ctx.org.name, shut), organisationName: ctx.org.name };
}

// ------------------------------------------------------------------ "Waiting for you"

export interface WaitingRow {
  contractId: string;
  /// The contract's number and its title, as the contractor knows it.
  contractLabel: string;
  documentId: string;
  title: string;
  kindLabel: string | null;
  stateLabel: string;
  href: string;
}

/// The contract states in which the workspace is open: a document waiting for the contractor on a contract that shuts it is not something the contractor can act on.
const OPEN_STATUSES: readonly ContractStatus[] = CONTRACT_STATUSES.filter((s) => actStatusFault("PROJECT_WORKSPACE", s) === null);

/**
 * "Waiting for you" (PW-13): the contractor's documents that wait on it (`waitingForContractor`: an open request to it, or its own document rejected or returned), across the
 * contracts its supplier holds, or on one contract (`contractId`). Contracts that shut the workspace are left out. Newest first, paged by a cursor on (createdAt, id) like the
 * list; no count and no days waiting (PW-4). Waiting on the contractor is only ever a CONTRACTOR-side document (a request goes to the document's side), so only those are read.
 */
export async function loadWaitingForYou(client: Tx, actor: Holder, i: { contractId?: string | null; after?: string | null; take?: number } = {}): Promise<{ rows: WaitingRow[]; next: string | null }> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org) return { rows: [], next: null };
  const take = Math.min(Math.max(i.take ?? WAITING_PAGE, 1), 100);
  let from = decodeRegisterCursor(i.after ?? null);
  const rows: WaitingRow[] = [];
  let last: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const batch = await client.projectDocument.findMany({
      where: {
        organisationId: actor.organisationId,
        side: "CONTRACTOR",
        contract: { organisationId: actor.organisationId, ...(i.contractId ? { id: i.contractId } : {}), status: { in: [...OPEN_STATUSES] }, award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } },
        ...(from ? { OR: [{ createdAt: { lt: from.createdAt } }, { createdAt: from.createdAt, id: { lt: from.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REGISTER_BATCH,
      select: { id: true, title: true, createdAt: true, contractId: true, contract: { select: { number: true, award: { select: { exercise: { select: { title: true } } } } } } },
    });
    if (batch.length === 0) return { rows, next: null };
    const facts = await loadDocumentFactsMany(client, batch.map((d) => d.id));
    for (const d of batch) {
      last = { createdAt: d.createdAt, id: d.id };
      const f = facts.get(d.id);
      if (!f) continue;
      const r = contractorReading(f, org.name);
      if (!r.waitsOnYou) continue;
      rows.push({ contractId: d.contractId, contractLabel: `${d.contract.number} · ${d.contract.award.exercise.title}`, documentId: d.id, title: d.title, kindLabel: f.kind ? kindWords(f.kind as DocKind) : null, stateLabel: r.stateLabel!, href: documentHref(d.contractId, d.id) });
      if (rows.length === take) return { rows, next: encodeRegisterCursor(d.createdAt, d.id) };
    }
    if (batch.length < REGISTER_BATCH) return { rows, next: null };
    from = last;
  }
}
