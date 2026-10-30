/**
 * The contractor's readers of work items (workspace 3b step 4; plan B-3, B-4, B-14, section 4; WS-11, WS-13; ADR 0049). The only other files of this folder that touch the
 * database are `store.ts`, `load.ts`, `team-store.ts` and `portal-store.ts`; nothing here writes and nothing takes a lock.
 *
 * What a contractor may read, and how each reader holds it (a source scan pins the first two on every query: `portal-scan.test.ts`):
 * - ITEMS: only shared ones (`sharedAt: { not: null }` in every `workItem` query), only on a contract this session's supplier holds (`loadProjectContext`: another's, another
 *   organisation's and a non-existent id are all null), and never by an id the request names beyond its contract and reference.
 * - COMMENTS: only Replies (`internal: false` in every `workItemComment` query). The staff side's internal notes never reach this file.
 * - FILES: only those `portalSeesFile` lists (the contractor's own, or attached at or after the share) and `contractorMayDownload` allows, never a withdrawn one or a detached pin.
 * - PEOPLE: a staff member is named only if `portalStaffLabel` allows it (on the Project team or the organisation's in-force side, WS-11); otherwise it is the organisation's
 *   name. The contractor's own acts read "You". No account, contact, person id or code is returned.
 * - No audit rows, no links (the drawer holds none), no `assigneeSupplierAccountId`, no internal fields (priority, impact, result, cancel reason).
 */

import type { Prisma } from "@/generated/prisma/client";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import { loadContract, type LoadedContract } from "@/lib/contract/repo";
import { dayOf, dayOrNull } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { loadProjectContext, type ProjectContext } from "@/lib/portal/projects/context-store";
import { STANDING_AWARD } from "@/lib/portal/projects/visibility";
import { organisationSideOn } from "@/lib/project-docs/side-store";
import { contractorMayDownload } from "@/lib/project-docs/visibility";
import { SCAN_LABEL } from "@/lib/documents/labels";
import { loadSupervision } from "@/lib/supervision/load";

import { portalSeesFile } from "./audience";
import { PORTAL_ROWS_PER_GROUP } from "./bounds";
import { lateness } from "./late";
import { itemRefText } from "./labels";
import { linkedLineOf, returnNoteOf } from "./defect-link";
import { LINK_EVENTS_SELECT, LINK_SELECT, namesOf, loadTeamMembers } from "./load";
import { contractorActions, isOpen } from "./move";
import { itemRef, parseItemRef } from "./number";
import { assigneeOf, isContractor, person, raiserOf } from "./party";
import { WORK_OPEN_CONTRACT_STATUSES } from "./my-work";
import { contractorMayPost, PORTAL_ORDER_BY, portalAction, portalGroup, portalStaffLabel, portalWhere } from "./portal";
import type { Day, IncidentSeverity, Lateness, Party, PortalAction, PortalGroup, WorkAction, WorkItemFacts, WorkItemType, WorkStatus } from "./types";

/// Where a contractor downloads an item's file: the route that applies `portalSeesFile` itself (`src/app/supplier/projects/work/file/[attachmentId]/route.ts`).
export const workFileHref = (attachmentId: string): string => `/supplier/projects/work/file/${attachmentId}`;
/// The portal's address of one item, in the Work tab.
export const workItemPortalHref = (contractId: string, ref: string): string => `/supplier/projects/${encodeURIComponent(contractId)}?${new URLSearchParams({ tab: "work", item: ref }).toString()}`;

const CONTRACTOR_ACTOR = { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true } as const;

// ------------------------------------------------------------------ who is named

/// The staff names a contractor may see on one contract (WS-11): the Project team, and the organisation's in-force side (the S.O. office and its delegates). With no time zone
/// there is no day to judge the side on, so only the team is named.
async function staffNames(client: Tx, l: LoadedContract, today: Day | null, ids: readonly string[]) {
  const team = new Set((await loadTeamMembers(client, l.org.id, l.contract.id)).map((m) => m.personId));
  const side = new Set(today === null ? [] : (await organisationSideOn(l, await loadSupervision(l.contract.id, client), today, client)).map((m) => m.personId));
  const allowed = ids.filter((id) => team.has(id) || side.has(id));
  return { team, side, names: await namesOf(client, l.org.id, allowed) };
}

// ------------------------------------------------------------------ the list

const ROW_SELECT = {
  id: true,
  type: true,
  number: true,
  title: true,
  status: true,
  dueOn: true,
  answer: true,
  inspectionResult: true,
  sharedAt: true,
  raisedByPersonId: true,
  assigneePersonId: true,
  assignedToContractor: true,
  defectItem: LINK_SELECT,
} as const;
type Row = Prisma.WorkItemGetPayload<{ select: typeof ROW_SELECT }>;

const factsOfRow = (r: Row): WorkItemFacts => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: raiserOf(r), assignee: assigneeOf(r), sharedAt: r.sharedAt?.toISOString() ?? null, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult, linkedLine: linkedLineOf(r.defectItem) });

export interface PortalRow {
  /// The address form ("RFI-12"): for links and route values only. A screen shows `label`.
  ref: string;
  /// What a screen shows (WSEC-3): the type word and the number ("RFI 12", "Incident 3"), never the address form.
  label: string;
  type: WorkItemType;
  title: string;
  status: WorkStatus;
  dueOn: Day | null;
  /// Overdue is judged on the organisation's day; with no time zone it is NOT_JUDGED, never late by UTC's day.
  late: Lateness;
  group: PortalGroup;
  /// The row's one button (WS-13).
  action: PortalAction;
  /// Who holds it, as the portal names it: "You", a named staff member (WS-11) or the organisation.
  heldBy: string;
  /// The contractor raised it.
  raisedByYou: boolean;
}

export interface PortalGroupView {
  group: PortalGroup;
  total: number;
  rows: PortalRow[];
  /// True where more rows follow this page (`PORTAL_ROWS_PER_GROUP` a page).
  more: boolean;
  /// How many rows come before this page.
  from: number;
}

export interface PortalWork {
  orgName: string;
  /// The organisation's time zone: the drawer's instants are read in it, not in the server's.
  timeZone: string | null;
  today: Day | null;
  /// Whether the contractor can act at all now: the contract's state opens work (`WORK_ITEM`) and the organisation's time zone is set (a portal act is refused without it).
  canAct: boolean;
  groups: PortalGroupView[];
}

const GROUPS: readonly PortalGroup[] = ["WAITING_FOR_YOU", "WITH_ORG", "CLOSED"];
const shared = (ctx: { org: { id: string }; contract: { id: string } }, group: PortalGroup): Prisma.WorkItemWhereInput => ({ organisationId: ctx.org.id, contractId: ctx.contract.id, sharedAt: { not: null }, AND: [portalWhere(group) as Prisma.WorkItemWhereInput] });
export const canAct = (ctx: ProjectContext): boolean => actStatusFault("WORK_ITEM", ctx.contract.status) === null && ctx.org.timeZone !== null;

/// The contract's shared items in three groups, each capped (B-14). Null: the contract is not this supplier's.
export async function loadPortalWork(actor: Pick<SupplierActor, "supplierId" | "organisationId">, contractId: string, now: Date = new Date(), page = 0): Promise<PortalWork | null> {
  const ctx = await loadProjectContext(db, actor, contractId, now);
  if (!ctx) return null;
  const skip = Math.max(0, Math.floor(page)) * PORTAL_ROWS_PER_GROUP;
  const l = await loadContract(actor.organisationId, contractId);
  if (!l) return null;
  const today = dayOf(now, ctx.org.timeZone);
  const orgCtx = { org: { id: actor.organisationId }, contract: { id: contractId } };
  const per = await Promise.all(
    GROUPS.map(async (group) => {
      const where = shared(orgCtx, group);
      const [total, rows] = await Promise.all([
        db.workItem.count({ where }),
        db.workItem.findMany({ where, select: ROW_SELECT, orderBy: group === "CLOSED" ? [{ closedAt: "desc" }, { id: "asc" }] : ([...PORTAL_ORDER_BY] as Prisma.WorkItemOrderByWithRelationInput[]), skip, take: PORTAL_ROWS_PER_GROUP }),
      ]);
      return { group, total, rows, skip };
    }),
  );
  const staffIds = per.flatMap((g) => g.rows.map((r) => r.assigneePersonId).filter((x): x is string => x !== null));
  const who = await staffNames(db, l, today, staffIds);
  return {
    orgName: ctx.org.name,
    timeZone: ctx.org.timeZone,
    today,
    canAct: canAct(ctx),
    groups: per.map((g) => ({
      group: g.group,
      total: g.total,
      more: g.total > g.skip + g.rows.length,
      from: g.skip,
      rows: g.rows.map((r) => {
        const facts = factsOfRow(r);
        return { ref: itemRef(r.type, r.number), label: itemRefText(r.type, r.number), type: r.type, title: r.title, status: r.status, dueOn: facts.dueOn, late: lateness(facts.dueOn, r.status, today), group: portalGroup(facts), action: portalAction(facts), heldBy: portalStaffLabel(facts.assignee, who.team, who.side, who.names, ctx.org.name), raisedByYou: isContractor(facts.raisedBy) };
      }),
    })),
  };
}

// ------------------------------------------------------------------ one item

export interface PortalComment {
  /// Replies only. "You" for the contractor's own, a named staff member only as `portalStaffLabel` allows, else the organisation.
  by: string;
  byYou: boolean;
  body: string;
  at: Date;
}
export interface PortalFile {
  attachmentId: string;
  filename: string;
  attachedAt: Date;
  byYou: boolean;
  href: string;
  /// What the scan says of the file (WSEC-6): "Not scanned for malware" until something scans. A contractor's file must not look as trusted as a staff one.
  scanLabel: string;
}
export interface PortalItem {
  row: PortalRow;
  description: string;
  /// A linked defect's latest return note, read from its line, as the Defects view prints it (WR-2); null otherwise.
  returnNote: string | null;
  location: string;
  /// An RFI's answer; "" on every other type.
  answer: string;
  severity: IncidentSeverity | null;
  happenedAt: Date | null;
  /// The moves the contractor may make now (`contractorActions`): Send for checking (SEND_FOR_REVIEW), Accept answer (MARK_DONE), Ask again (SEND_BACK). An Inspection it holds
  /// offers none that it can clear itself (WB-5), and the row's button is then Reply.
  moves: WorkAction[];
  /// The Answer of an RFI it holds is editable while the item is open (WB-6).
  mayAnswer: boolean;
  /// Whether the contractor may reply to, attach to or answer the item (WSEC-5): open items only. A closed item shows none of those controls.
  mayPost: boolean;
  comments: PortalComment[];
  files: PortalFile[];
  orgName: string;
  canAct: boolean;
}

/// The most replies one item's conversation reads: a technical bound (an item with more has outgrown a drawer).
const REPLIES_CAP = 500;

/// The item an address names, as this supplier may read it, or null: an address that names no item, an item that is not shared, another contract's or another contractor's.
export async function loadPortalItem(actor: Pick<SupplierActor, "supplierId" | "organisationId">, contractId: string, ref: string, now: Date = new Date()): Promise<PortalItem | null> {
  const parsed = parseItemRef(ref);
  if (!parsed) return null;
  const ctx = await loadProjectContext(db, actor, contractId, now);
  if (!ctx) return null;
  const l = await loadContract(actor.organisationId, contractId);
  if (!l) return null;
  const r = await db.workItem.findFirst({
    where: { organisationId: actor.organisationId, contractId, type: parsed.type, number: parsed.number, sharedAt: { not: null } },
    select: { ...ROW_SELECT, defectItem: LINK_EVENTS_SELECT, description: true, location: true, severity: true, happenedAt: true },
  });
  if (!r) return null;
  const [comments, attachments] = await Promise.all([
    db.workItemComment.findMany({ where: { organisationId: actor.organisationId, workItemId: r.id, internal: false }, select: { body: true, recordedAt: true, personId: true, supplierAccountId: true }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }], take: REPLIES_CAP }),
    db.documentAttachment.findMany({
      where: { organisationId: actor.organisationId, workItemId: r.id, purpose: "WORK_ITEM_FILE", detachedAt: null, version: { withdrawnAt: null } },
      select: { id: true, attachedAt: true, version: { select: { originalFilename: true, scanState: true, recordedBySupplierAccountId: true, document: { select: { classificationSnapshot: true, documentClass: { select: { classification: true } } } } } } },
      orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const today = dayOf(now, ctx.org.timeZone);
  const who = await staffNames(db, l, today, [...(r.assigneePersonId ? [r.assigneePersonId] : []), ...comments.flatMap((c) => (c.personId ? [c.personId] : []))]);
  const facts = factsOfRow(r);
  const label = (p: Party | null) => portalStaffLabel(p, who.team, who.side, who.names, ctx.org.name);
  const mine = (id: string | null) => id !== null;
  return {
    row: { ref: itemRef(r.type, r.number), label: itemRefText(r.type, r.number), type: r.type, title: r.title, status: r.status, dueOn: facts.dueOn, late: lateness(facts.dueOn, r.status, today), group: portalGroup(facts), action: portalAction(facts), heldBy: label(facts.assignee), raisedByYou: isContractor(facts.raisedBy) },
    description: r.description,
    returnNote: r.defectItem ? returnNoteOf(r.defectItem.events) : null,
    location: r.location,
    answer: r.type === "RFI" ? r.answer : "",
    severity: r.severity,
    happenedAt: r.happenedAt,
    // WRS-5: on a linked item the only contractor act is Mark as fixed (`portalAction`), posted through the linked branch; the item-level moves do not apply.
    moves: facts.linkedLine ? [] : contractorActions(facts, CONTRACTOR_ACTOR),
    mayAnswer: r.type === "RFI" && isContractor(facts.assignee) && isOpen(r.status),
    mayPost: contractorMayPost(r),
    comments: comments.map((c) => ({ by: mine(c.supplierAccountId) ? "You" : label(c.personId ? person(c.personId) : null), byYou: mine(c.supplierAccountId), body: c.body, at: c.recordedAt })),
    files: attachments
      .filter((a) => portalSeesFile({ attachedAt: a.attachedAt, byContractor: a.version.recordedBySupplierAccountId !== null }, r.sharedAt) && contractorMayDownload({ versionVisible: true, documentClassification: a.version.document.classificationSnapshot, classClassification: a.version.document.documentClass.classification }))
      .map((a) => ({ attachmentId: a.id, filename: a.version.originalFilename, attachedAt: a.attachedAt, byYou: a.version.recordedBySupplierAccountId !== null, href: workFileHref(a.id), scanLabel: SCAN_LABEL[a.version.scanState] })),
    orgName: ctx.org.name,
    canAct: canAct(ctx),
  };
}

// ------------------------------------------------------------------ one file

export interface PortalWorkFile {
  versionId: string;
  sha256: string;
  mediaType: string;
  originalFilename: string;
}
export type WorkFileLookup = { ok: true; file: PortalWorkFile } | { ok: false; status: 404 | 403; log: { reason: string; versionId: string } | null };

const ID = /^[A-Za-z0-9_-]{8,40}$/;

/**
 * Which file of a shared work item a contractor may download (B-3, WB-3): the route asks here before it reads a byte, and `portalSeesFile` is applied HERE, not left to the list. The
 * attachment is reached through its item and the item's contract and award, all in the supplier's own organisation; every way of failing the chain (another contractor's file, an
 * unshared item's, a file attached before the share, a detached or withdrawn one, an unknown id) is the same 404. The classification is judged now: a class raised to SULIT after
 * the upload is refused 403.
 */
export async function findWorkFile(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, attachmentId: string): Promise<WorkFileLookup> {
  if (!ID.test(attachmentId)) return { ok: false, status: 404, log: null };
  const a = await client.documentAttachment.findFirst({
    where: { id: attachmentId, organisationId: actor.organisationId, purpose: "WORK_ITEM_FILE", detachedAt: null, workItemId: { not: null }, workItem: { organisationId: actor.organisationId, sharedAt: { not: null } } },
    select: {
      versionId: true,
      attachedAt: true,
      workItem: { select: { sharedAt: true, contract: { select: { status: true, award: { select: { vendorId: true, status: true } } } } } },
      version: { select: { sha256: true, mediaType: true, originalFilename: true, withdrawnAt: true, recordedBySupplierAccountId: true, document: { select: { classificationSnapshot: true, documentClass: { select: { classification: true } } } } } },
    },
  });
  if (!a || !a.workItem) return { ok: false, status: 404, log: null };
  const log = (reason: string) => ({ reason, versionId: a.versionId });
  const award = a.workItem.contract.award;
  if (award.vendorId !== actor.supplierId || !(STANDING_AWARD as readonly string[]).includes(award.status)) return { ok: false, status: 404, log: log("NOT_HELD") };
  if (!portalSeesFile({ attachedAt: a.attachedAt, byContractor: a.version.recordedBySupplierAccountId !== null }, a.workItem.sharedAt)) return { ok: false, status: 404, log: log("NOT_VISIBLE") };
  if (a.version.withdrawnAt) return { ok: false, status: 404, log: log("WITHDRAWN") };
  const open = contractorMayDownload({ versionVisible: true, documentClassification: a.version.document.classificationSnapshot, classClassification: a.version.document.documentClass.classification });
  if (!open) return { ok: false, status: 403, log: log("NOT_OPEN_TO_CONTRACTOR") };
  return { ok: true, file: { versionId: a.versionId, sha256: a.version.sha256, mediaType: a.version.mediaType, originalFilename: a.version.originalFilename } };
}

// ------------------------------------------------------------------ waiting for you

/// A work row of "Waiting for you", in the shape of a document's (`WaitingRow`, `project-docs/portal-read.ts`) so the one list draws both. `documentId` is a stable key, not a document:
/// the contract and the item's reference, never the row's internal id (WSEC-10 L1).
export interface WaitingWorkRow {
  contractId: string;
  contractLabel: string;
  documentId: string;
  title: string;
  kindLabel: string | null;
  stateLabel: string;
  href: string;
}


/// Shared items waiting on the contractor across the contracts its supplier holds: assigned to it and To do or In progress, or raised by it and In review (B-17: derived, never
/// notified). Contracts whose state shuts work are left out. Capped.
export async function portalWaitingRows(actor: Pick<SupplierActor, "supplierId" | "organisationId">, o: { contractId?: string | null; take?: number } = {}): Promise<{ rows: WaitingWorkRow[]; more: boolean }> {
  if (!(await exerciseOrg(actor.organisationId, db))) return { rows: [], more: false };
  const take = Math.min(Math.max(o.take ?? 20, 1), PORTAL_ROWS_PER_GROUP);
  const rows = await db.workItem.findMany({
    where: {
      organisationId: actor.organisationId,
      sharedAt: { not: null },
      contract: { organisationId: actor.organisationId, ...(o.contractId ? { id: o.contractId } : {}), status: { in: [...WORK_OPEN_CONTRACT_STATUSES] }, award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } },
      AND: [portalWhere("WAITING_FOR_YOU") as Prisma.WorkItemWhereInput],
    },
    select: { ...ROW_SELECT, contractId: true, contract: { select: { number: true, award: { select: { exercise: { select: { title: true } } } } } } },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { contractId: "asc" }, { type: "asc" }, { number: "asc" }],
    take: take + 1,
  });
  return {
    more: rows.length > take,
    rows: rows.slice(0, take).map((r) => ({
      contractId: r.contractId,
      contractLabel: `${r.contract.number} · ${r.contract.award.exercise.title}`,
      documentId: `work-${r.contractId}-${itemRef(r.type, r.number)}`,
      title: r.title,
      kindLabel: itemRefText(r.type, r.number),
      stateLabel: isContractor(raiserOf(r)) ? "To accept" : "Waiting for you",
      href: workItemPortalHref(r.contractId, itemRef(r.type, r.number)),
    })),
  };
}
