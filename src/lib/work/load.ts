/**
 * Work items, read (workspace 3a step 3; plan §3.4, §5). The readers of the Work tab: the list's page, the board's columns, one item with its links and files, its
 * Activity, and the pickers. The only other file of this folder that touches the database is `store.ts`, which writes; nothing here writes and nothing takes a lock.
 *
 * - Every query names the organisation and the contract, so a crafted id of another contract or organisation reads as nothing (the trust boundary).
 * - A reader of the Work tab is any active staff member of the organisation: a contract exists, so `caseVisibility` is never HIDDEN (at worst CONTRACT_STAGES_ONLY,
 *   and Work is a contract stage). The page judges who may open the contract; these readers do not restate it.
 * - The views and filters are `workWhere` (the pure rule); the order is `WORK_ORDER_BY`. A search is Prisma's `contains`, which matches `%` and `_` literally.
 * - The board is capped by the database, per column: `total` and `older` are counts, never the length of what was fetched.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { FieldChange } from "@/lib/audit/diff";
import { actorDisplayName } from "@/lib/audit/actor";
import { dayOf, dayOrNull, dayPlus, instantAt } from "@/lib/dates";
import { OPEN_STATUSES } from "./move";
import { db, type Tx } from "@/lib/db";
import { actStatusFault } from "@/lib/contract/act-status";
import { contractLabel, loadContract, type LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { SCAN_LABEL } from "@/lib/documents/labels";
import { loadStorePolicy } from "@/lib/documents/service";
import { likeLiteral } from "@/lib/search/words";
import { mayActOnDefectLines } from "@/lib/supervision/capacity-on";
import { loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { activityFeed, type ActivityLine } from "./activity";
import { BOARD_COLUMN_CAP, BOARD_DONE_DAYS, boardColumns, type BoardColumnOf, type BoardItem } from "./board";
import { portalSeesFile } from "./audience";
import { CONTRACTOR_ASSIGNEE } from "./fields";
import { leadIds, teamChangerIds } from "./lead";
import { linkedLineOf, returnNoteOf } from "./defect-link";
import { assigneeOf, raiserOf } from "./party";
import { contractorActorWords, itemRefText, TEAM_ROLE_WORDS, type TeamChangers, type WhoNames } from "./labels";
import { myWorkGroup, myWorkWhere, type MyWorkSection } from "./my-work";
import { itemRef, parseItemRef } from "./number";
import type { BoardColumn, Day, TeamMember, TeamRole, WorkStatus, WorkView } from "./types";
import { WORK_ORDER_BY, workWhere, type WorkFilters } from "./views";

// ------------------------------------------------------------------ shared reads (the store uses them inside its transaction)

/// The label prefix every audit row of one item carries, so Activity finds them with one query (W-11). It starts "Work item", never "Contract {number} ·", so an item
/// stays out of the case History (OQ-6). The trailing " · " ends the contract's number: "Contract 1 · " is not a prefix of "Contract 10 · ".
export const workAuditPrefix = (contractNumber: string, type: BoardItem["type"], number: number): string => `Work item ${itemRef(type, number)} · Contract ${contractNumber} · `;

/// Whether an item stands for a defect line (B-18). Read before the contract's lock only to choose which attribution the edge begins; the core reads the locked row and refuses
/// a page and a row that disagree (409), so this is a hint, never the authority.
export async function isLinkedItem(organisationId: string, contractId: string, itemId: string): Promise<boolean> {
  const row = await db.workItem.findFirst({ where: { id: itemId, contractId, organisationId }, select: { defectItemId: true } });
  return row?.defectItemId != null;
}

/// Names of people of the organisation, by id.
export async function namesOf(client: Tx, organisationId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const want = [...new Set(ids)];
  if (want.length === 0) return new Map();
  const rows = await client.person.findMany({ where: { organisationId, id: { in: want } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/// Of these ids, those that are active people of the organisation: the set the rules call `activeIds`. Every active person of the organisation may read a contract's
/// Work (see the header), so "active" is the whole test.
export async function activeAmong(client: Tx, organisationId: string, ids: readonly (string | null)[]): Promise<Set<string>> {
  const want = [...new Set(ids.filter((x): x is string => x !== null))];
  if (want.length === 0) return new Set();
  return new Set((await client.person.findMany({ where: { organisationId, isActive: true, id: { in: want } }, select: { id: true } })).map((r) => r.id));
}

/// The company on a staff surface, by the awardee's name (B-4): never a contact's. If WS-10 changes, `contractorActorWords` is the one place.
export const contractorNameOf = (l: LoadedContract): string => contractorActorWords(l.award.awardeeName).en;

/// The people a who-can sentence names (`primaryActions`, `cardMoves` and the faults' words), resolved by name. `lead` is `leadOf`'s. The contractor, as raiser (no
/// person) or as the assignee, reads as `contractorName`.
export async function whoNamesOf(
  client: Tx,
  organisationId: string,
  r: { raisedByPersonId: string | null; assigneePersonId: string | null; assignedToContractor?: boolean },
  lead: { ids: string[]; roleLabel: string | null },
  contractorName = "The contractor",
): Promise<WhoNames> {
  const names = await namesOf(client, organisationId, [r.raisedByPersonId ?? "", r.assigneePersonId ?? "", ...lead.ids]);
  return {
    raiser: r.raisedByPersonId === null ? contractorName : (names.get(r.raisedByPersonId) ?? "Someone"),
    assignee: r.assignedToContractor ? contractorName : r.assigneePersonId ? (names.get(r.assigneePersonId) ?? "Someone") : null,
    lead: lead.roleLabel ? { roleLabel: lead.roleLabel, names: lead.ids.map((id) => names.get(id) ?? "Someone") } : null,
  };
}

/// `whoNamesOf` for an act's context: the contractor reads as the awardee.
export const whoNamesIn = (c: { tx: Tx; l: LoadedContract }, r: Parameters<typeof whoNamesOf>[2], lead: Parameters<typeof whoNamesOf>[3]): Promise<WhoNames> => whoNamesOf(c.tx, c.l.org.id, r, lead, contractorNameOf(c.l));

/// The Project team of a contract (B-12). Only the lead and the team card read it.
export async function loadTeamMembers(client: Tx, organisationId: string, contractId: string): Promise<TeamMember[]> {
  const rows = await client.projectTeamMember.findMany({ where: { organisationId, contractId }, select: { role: true, personId: true }, orderBy: [{ role: "asc" }, { recordedAt: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ role: r.role as TeamRole, personId: r.personId }));
}

/// W-4, B-13: the lead on the organisation's day. The Project manager when named and active (no time zone needed), else every holder and acting holder of the
/// contract's S.O. office (which needs the day). `roleLabel` is the office's label for the words.
export async function leadOf(l: LoadedContract, today: Day | null, client: Tx = db): Promise<{ ids: string[]; roleLabel: string | null }> {
  const { team, activeIds, so } = await leadFacts(l, today, client);
  const ids = leadIds(team, so?.office ?? null, today, activeIds);
  const pm = team.some((m) => m.role === "PROJECT_MANAGER" && activeIds.has(m.personId));
  return { ids, roleLabel: pm ? TEAM_ROLE_WORDS.PROJECT_MANAGER.en : (so?.office.roleLabel ?? null) };
}

/// The team, who of it is active, and the S.O. office on the day: what the lead and the team's changers are both read from.
async function leadFacts(l: LoadedContract, today: Day | null, client: Tx) {
  const team = await loadTeamMembers(client, l.org.id, l.contract.id);
  const activeIds = await activeAmong(client, l.org.id, team.map((m) => m.personId));
  const so = today === null ? null : await soOfficeOn(l, await loadSupervision(l.contract.id, client), today, client);
  return { team, activeIds, so };
}

/// WSEC-2: who may change the team on the organisation's day, and the words naming them (the active Project manager, and the S.O. office in force). `ids` is empty when nobody may.
export async function teamChangersOf(l: LoadedContract, today: Day | null, client: Tx = db): Promise<{ ids: string[]; words: TeamChangers; hasManager: boolean }> {
  const { team, activeIds, so } = await leadFacts(l, today, client);
  const office = so?.office ?? null;
  const ids = teamChangerIds(team, office, today, activeIds);
  const pmIds = team.filter((m) => m.role === "PROJECT_MANAGER" && activeIds.has(m.personId)).map((m) => m.personId);
  const soIds = office && today !== null ? [...new Set([...office.holderIds, ...office.actingIds])].sort() : [];
  const names = await namesOf(client, l.org.id, ids);
  const said = (label: string, group: string[]) => ({ roleLabel: label, names: group.map((id) => names.get(id) ?? "Someone") });
  return { ids, hasManager: pmIds.length > 0, words: [...(pmIds.length ? [said(TEAM_ROLE_WORDS.PROJECT_MANAGER.en, pmIds)] : []), ...(soIds.length && office ? [said(office.roleLabel, soIds)] : [])] };
}

/// Whether the contract's contractor has at least one active portal account (0008 §5.8, "No active portal account"): the awardee's supplier has an ACTIVE account.
export async function contractorHasActiveAccount(client: Tx, l: LoadedContract): Promise<boolean> {
  const vendorId = l.award.vendorId;
  if (!vendorId) return false;
  return (await client.supplierAccount.count({ where: { organisationId: l.org.id, supplierId: vendorId, status: { in: ["ACTIVE"] } } })) > 0;
}

// ------------------------------------------------------------------ the context of the tab

export interface WorkContext {
  contractNumber: string;
  contractStatus: ContractStatus;
  /// False when WORK_ITEM refuses the contract's status: the tab reads, and offers no act.
  open: boolean;
  /// The organisation's zone, and its day; null when no zone is set (Late is then not judged).
  timeZone: string | null;
  today: Day | null;
  lead: { ids: string[]; roleLabel: string | null };
  /// Whether the class for project files is set; while it is not, attaching is refused and the panel names the setting.
  filesAllowed: boolean;
}

/// Null: the contract is not this organisation's.
export async function loadWorkContext(i: { organisationId: string; contractId: string; now: Date }): Promise<{ context: WorkContext; contract: LoadedContract } | null> {
  const l = await loadContract(i.organisationId, i.contractId);
  if (!l) return null;
  const today = dayOf(i.now, l.org.timeZone);
  const policy = await loadStorePolicy(i.organisationId);
  const status = l.contract.status as ContractStatus;
  return {
    contract: l,
    context: { contractNumber: l.contract.number, contractStatus: status, open: actStatusFault("WORK_ITEM", status) === null, timeZone: l.org.timeZone, today, lead: await leadOf(l, today), filesAllowed: policy.projectDocumentClassId !== null },
  };
}

// ------------------------------------------------------------------ the defect link, read through the relation

/// What a reader needs of a linked item's line: whether it is on a draft CPC's list (`linkedLineOf`), and its events (the return note, `returnNoteOf`).
export const LINK_SELECT = {
  select: { practicalCompletionId: true, practicalCompletion: { select: { certificate: { select: { status: true } } } } },
} as const;
export const LINK_EVENTS_SELECT = {
  select: { ...LINK_SELECT.select, events: { select: { kind: true, on: true, note: true, recordedAt: true }, orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }] } },
};

// ------------------------------------------------------------------ the list and the board

/// An item as the list and the board draw it: the rules' row, with the names a screen shows.
export interface WorkCardRow extends BoardItem {
  /// "RFI-12", the address form.
  ref: string;
  location: string;
  raisedByName: string;
  assigneeName: string | null;
  /// The item stands for a defect line (its status follows the line's acts).
  linked: boolean;
  /// The linked item's line is on a draft CPC's list: it moves once the certificate is issued (WR-1).
  linkedDraft: boolean;
}

const CARD_SELECT = {
  id: true,
  type: true,
  number: true,
  status: true,
  title: true,
  priority: true,
  dueOn: true,
  location: true,
  answer: true,
  inspectionResult: true,
  closedAt: true,
  raisedByPersonId: true,
  assigneePersonId: true,
  assignedToContractor: true,
  sharedAt: true,
  defectItemId: true,
  defectItem: LINK_SELECT,
  raisedBy: { select: { name: true } },
  assignee: { select: { name: true } },
} as const;
type CardRow = Prisma.WorkItemGetPayload<{ select: typeof CARD_SELECT }>;

const cardOf = (r: CardRow, timeZone: string | null, contractor: string): WorkCardRow => ({
  id: r.id,
  ref: itemRef(r.type, r.number),
  type: r.type,
  number: r.number,
  status: r.status,
  title: r.title,
  priority: r.priority,
  dueOn: dayOrNull(r.dueOn),
  location: r.location,
  answer: r.answer,
  inspectionResult: r.inspectionResult,
  raisedBy: raiserOf(r),
  assignee: assigneeOf(r),
  sharedAt: r.sharedAt?.toISOString() ?? null,
  // A contractor raiser or assignee reads as the company on staff surfaces (B-4): no account or contact is joined.
  raisedByName: r.raisedByPersonId === null ? contractor : (r.raisedBy?.name ?? "Someone"),
  assigneeName: r.assignedToContractor ? contractor : (r.assignee?.name ?? null),
  closedOn: r.closedAt ? dayOf(r.closedAt, timeZone) : null,
  linked: r.defectItemId !== null,
  linkedDraft: linkedLineOf(r.defectItem) === "DRAFT",
});

const scope = (i: { organisationId: string; contractId: string }) => ({ organisationId: i.organisationId, contractId: i.contractId });

/// The company's name for a contract's cards: the award's awardee, read once per load. A contract that is not there: "The contractor".
async function contractorOf(i: { organisationId: string; contractId: string }): Promise<string> {
  const c = await db.contract.findFirst({ where: { id: i.contractId, organisationId: i.organisationId }, select: { award: { select: { awardeeName: true } } } });
  return contractorActorWords(c?.award.awardeeName ?? "The contractor").en;
}
const whereOf = (i: { organisationId: string; contractId: string; viewerId: string; today: Day | null }, view: WorkView, filters: WorkFilters) =>
  ({ ...scope(i), ...workWhere(view, filters, { personId: i.viewerId }, i.today) }) as Prisma.WorkItemWhereInput;

/// The list's sortable columns (ST-7): any other key is the default order. Ties break on type, number and id, so a page never shuffles.
export const WORK_SORT_KEYS = ["item", "title", "type", "status", "assignee", "due", "priority"] as const;
export type WorkSortKey = (typeof WORK_SORT_KEYS)[number];
const TIE: Prisma.WorkItemOrderByWithRelationInput[] = [{ type: "asc" }, { number: "asc" }, { id: "asc" }];
function orderFor(sort: WorkSortKey | null, dir: "asc" | "desc"): Prisma.WorkItemOrderByWithRelationInput[] {
  switch (sort) {
    case "item":
      return [{ type: dir }, { number: dir }, { id: "asc" }];
    case "title":
      return [{ title: dir }, ...TIE];
    case "type":
      return [{ type: dir }, ...TIE.slice(1)];
    case "status":
      return [{ status: dir }, ...TIE];
    case "assignee":
      return [{ assignee: { name: dir } }, ...TIE];
    case "due":
      return [{ dueOn: { sort: dir, nulls: "last" } }, ...TIE];
    case "priority":
      return [{ priority: dir }, ...TIE];
    default:
      return [...WORK_ORDER_BY] as Prisma.WorkItemOrderByWithRelationInput[];
  }
}

export interface WorkListInput {
  organisationId: string;
  contractId: string;
  viewerId: string;
  view: WorkView;
  filters: WorkFilters;
  today: Day | null;
  timeZone: string | null;
  /// From 0; a page past the last is clamped.
  page: number;
  size: number;
  sort?: WorkSortKey | null;
  dir?: "asc" | "desc";
}

/// One page of the server-mode list, and the true total.
export async function loadWorkList(i: WorkListInput): Promise<{ rows: WorkCardRow[]; total: number; page: number }> {
  const where = whereOf(i, i.view, i.filters);
  const contractor = await contractorOf(i);
  const total = await db.workItem.count({ where });
  const page = Math.max(0, Math.min(i.page, Math.ceil(total / i.size) - 1));
  const rows = await db.workItem.findMany({ where, select: CARD_SELECT, orderBy: orderFor(i.sort ?? null, i.dir ?? "asc"), skip: page * i.size, take: i.size });
  return { rows: rows.map((r) => cardOf(r, i.timeZone, contractor)), total, page };
}

export interface BoardInput {
  organisationId: string;
  contractId: string;
  viewerId: string;
  view: WorkView;
  filters: WorkFilters;
  today: Day | null;
  timeZone: string | null;
}

/**
 * The board: four columns, each capped at `BOARD_COLUMN_CAP` by the database, with its true count. The view narrows the open columns (Mine, Late, Unassigned,
 * Non-conformances); Open and Done show all four columns, since a board with no Done column is not a board. Done holds what closed in the last
 * `BOARD_DONE_DAYS` days (with no time zone, every closed item), and `older` counts the rest. The views that are open-only leave Done empty.
 */
export async function loadBoard(i: BoardInput): Promise<BoardColumnOf<WorkCardRow>[]> {
  const openView: WorkView = i.view === "done" ? "open" : i.view;
  const doneShown = i.view === "open" || i.view === "done";
  const windowStart = i.today === null ? null : instantAt(dayPlus(i.today, -(BOARD_DONE_DAYS - 1)), "00:00", i.timeZone);
  const contractor = await contractorOf(i);
  const cols = await Promise.all(
    (["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const satisfies readonly BoardColumn[]).map(async (column) => {
      if (column === "DONE" && !doneShown) return { column, items: [] as WorkCardRow[], total: 0, older: 0 };
      const base = column === "DONE" ? whereOf(i, "done", i.filters) : whereOf(i, openView, i.filters);
      const inColumn: Prisma.WorkItemWhereInput = { AND: [base, { status: column as WorkStatus }] };
      const recent: Prisma.WorkItemWhereInput = column === "DONE" && windowStart ? { AND: [inColumn, { closedAt: { gte: windowStart } }] } : inColumn;
      const [total, all, rows] = await Promise.all([
        db.workItem.count({ where: recent }),
        column === "DONE" ? db.workItem.count({ where: inColumn }) : Promise.resolve(0),
        db.workItem.findMany({ where: recent, select: CARD_SELECT, orderBy: [...WORK_ORDER_BY] as Prisma.WorkItemOrderByWithRelationInput[], take: BOARD_COLUMN_CAP }),
      ]);
      return { column, items: rows.map((r) => cardOf(r, i.timeZone, contractor)), total, older: all - total };
    }),
  );
  // `boardColumns` puts each fetched card in its order; the counts are the database's.
  const placed = boardColumns(cols.flatMap((c) => c.items), i.today);
  return placed.map((p) => {
    const c = cols.find((x) => x.column === p.column)!;
    return { column: p.column, items: p.items, total: c.total, more: Math.max(0, c.total - p.items.length), older: c.older };
  });
}

// ------------------------------------------------------------------ one item

/// The most comments, and the most audit rows, one item's Activity reads: a technical bound (an item with more than this has outgrown a panel).
const ACTIVITY_CAP = 500;

export interface WorkLinkView {
  id: string;
  /// TO: this item links to it; FROM: it links to this item. The panel shows both alike (one row is one link).
  direction: "TO" | "FROM";
  target: { kind: "ITEM"; ref: string; /** The reference as a screen prints it ("RFI 12"). */ label: string; title: string; status: WorkStatus } | { kind: "DOCUMENT"; id: string; title: string };
}
export interface WorkFileView {
  attachmentId: string;
  versionId: string;
  filename: string;
  title: string;
  attachedAt: Date;
  /// Set when the store withdrew the file: it is still listed, marked, and not offered as a download.
  withdrawnAt: Date | null;
  /// Who attached it: the staff member whose staged file it was (null when the contractor uploaded it). `attachFiles` pins only the actor's own staged versions, so
  /// the version's recorder is the person who attached it; "Remove" is theirs or the lead's (B-6).
  attachedByPersonId: string | null;
  /// Whether the portal lists it ("Visible to {contractor}", B-3, WSEC-10 L6: there are no read receipts, so never "seen"): the contractor's own file, or attached at or after the share.
  seenByContractor: boolean;
  /// What the scan says of the file (WSEC-6): "Not scanned for malware" until something scans. A contractor's file must not look as trusted as a staff one.
  scanLabel: string;
  /// The contractor uploaded it (not staff): shown beside the scan state.
  byContractor: boolean;
}
export interface WorkItemDetail {
  card: WorkCardRow;
  description: string;
  impact: string | null;
  severity: string | null;
  happenedAt: Date | null;
  fromDocument: { id: string; title: string } | null;
  cancelReason: string;
  /// A linked item's latest return note, read from its line (WR-2).
  returnNote: string | null;
  recordedAt: Date;
  links: WorkLinkView[];
  files: WorkFileView[];
}

/// The item an address names (`item=RFI-12`), or null: an address that names no item, or an item of another contract or organisation.
export async function loadItem(i: { organisationId: string; contractId: string; ref: string; timeZone: string | null }): Promise<WorkItemDetail | null> {
  const parsed = parseItemRef(i.ref);
  if (!parsed) return null;
  const r = await db.workItem.findFirst({
    where: { ...scope(i), type: parsed.type, number: parsed.number },
    select: {
      ...CARD_SELECT,
      description: true,
      impact: true,
      severity: true,
      happenedAt: true,
      cancelReason: true,
      recordedAt: true,
      defectItem: LINK_EVENTS_SELECT,
      fromDocument: { select: { id: true, title: true } },
      linksFrom: { select: { id: true, toWorkItem: { select: { type: true, number: true, title: true, status: true } }, projectDocument: { select: { id: true, title: true } } }, orderBy: { recordedAt: "asc" } },
      linksTo: { select: { id: true, workItem: { select: { type: true, number: true, title: true, status: true } } }, orderBy: { recordedAt: "asc" } },
    },
  });
  if (!r) return null;
  const files = await db.documentAttachment.findMany({
    where: { organisationId: i.organisationId, workItemId: r.id, detachedAt: null },
    select: { id: true, versionId: true, attachedAt: true, version: { select: { originalFilename: true, withdrawnAt: true, scanState: true, recordedByPersonId: true, recordedBySupplierAccountId: true, document: { select: { title: true } } } } },
    orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
  });
  const item = (x: { type: BoardItem["type"]; number: number; title: string; status: WorkStatus }) => ({ kind: "ITEM" as const, ref: itemRef(x.type, x.number), label: itemRefText(x.type, x.number), title: x.title, status: x.status });
  return {
    card: cardOf(r, i.timeZone, await contractorOf(i)),
    description: r.description,
    impact: r.impact,
    severity: r.severity,
    happenedAt: r.happenedAt,
    fromDocument: r.fromDocument,
    cancelReason: r.cancelReason,
    returnNote: r.defectItem ? returnNoteOf(r.defectItem.events) : null,
    recordedAt: r.recordedAt,
    links: [
      ...r.linksFrom.map((l): WorkLinkView => ({ id: l.id, direction: "TO", target: l.toWorkItem ? item(l.toWorkItem) : { kind: "DOCUMENT", id: l.projectDocument!.id, title: l.projectDocument!.title } })),
      ...r.linksTo.map((l): WorkLinkView => ({ id: l.id, direction: "FROM", target: item(l.workItem) })),
    ],
    files: files.map((f) => ({
      attachmentId: f.id,
      versionId: f.versionId,
      filename: f.version.originalFilename,
      title: f.version.document.title,
      attachedAt: f.attachedAt,
      withdrawnAt: f.version.withdrawnAt,
      attachedByPersonId: f.version.recordedByPersonId,
      seenByContractor: portalSeesFile({ attachedAt: f.attachedAt, byContractor: f.version.recordedBySupplierAccountId !== null }, r.sharedAt),
      scanLabel: SCAN_LABEL[f.version.scanState],
      byContractor: f.version.recordedBySupplierAccountId !== null,
    })),
  };
}

/// An item's Activity: its comments and the audit rows of its acts (fields, moves, links, files), oldest first (WS-18, W-11). The names a change line shows (an assignee, a
/// "From" document) are read here, so the pure feed prints a name and never an id.
export async function loadActivity(i: { organisationId: string; contractId: string; contractNumber: string; item: { id: string; type: BoardItem["type"]; number: number }; timeZone: string | null }): Promise<ActivityLine[]> {
  const [comments, entries, contractor] = await Promise.all([
    db.workItemComment.findMany({ where: { organisationId: i.organisationId, workItemId: i.item.id }, select: { id: true, body: true, recordedAt: true, internal: true, supplierAccountId: true, person: { select: { name: true } } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: ACTIVITY_CAP }),
    db.auditEntry.findMany({
      where: { organisationId: i.organisationId, entity: { in: ["WorkItem", "WorkItemLink", "DocumentAttachment"] }, entityLabel: { startsWith: likeLiteral(workAuditPrefix(i.contractNumber, i.item.type, i.item.number)) } },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: ACTIVITY_CAP,
      include: { actorPerson: { select: { name: true } } },
    }),
    contractorOf(i),
  ]);
  // A contractor's act (a SUPPLIER row, a comment with an account) is the company on staff surfaces, never the contact (B-4, WS-9).
  const rows = entries.map((e) => ({ id: e.id, entity: e.entity, action: e.action as "CREATE" | "UPDATE" | "DELETE", changes: (e.changes ?? []) as unknown as FieldChange[], actorName: e.actorKind === "SUPPLIER" ? contractor : actorDisplayName(e), at: e.at, reason: e.reason }));
  const ids = new Set<string>();
  for (const r of rows) for (const c of r.changes) if ((c.field === "assigneePersonId" || c.field === "fromDocumentId") && c.before) ids.add(c.before);
  for (const r of rows) for (const c of r.changes) if ((c.field === "assigneePersonId" || c.field === "fromDocumentId") && c.after) ids.add(c.after);
  const [people, documents] = await Promise.all([
    namesOf(db, i.organisationId, [...ids]),
    ids.size ? db.projectDocument.findMany({ where: { organisationId: i.organisationId, contractId: i.contractId, id: { in: [...ids] } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const names = new Map([...people, ...documents.map((d): [string, string] => [d.id, d.title]), [CONTRACTOR_ASSIGNEE, contractor]]);
  return activityFeed(
    comments.map((c) => ({ id: c.id, body: c.body, personName: c.supplierAccountId !== null ? contractor : (c.person?.name ?? null), at: c.recordedAt, internal: c.internal })),
    rows.map((r) => ({ id: r.id, entity: r.entity, action: r.action, changes: r.changes, actorName: r.actorName, at: r.at, reason: r.reason })),
    i.timeZone,
    names,
  );
}

// ------------------------------------------------------------------ the pickers

/// The assignee dropdown (0008 §4.3, B-7): the contract's team first, then "{contractor}", then everyone else; the organisation's active people, by name. "Me" first is
/// the screen's. Capped (a dropdown, not a register). `value` for the company is `CONTRACTOR_ASSIGNEE`, never a person id.
export type AssigneeOption = { value: string; label: string; group: "TEAM" | "CONTRACTOR" | "EVERYONE" };
export async function assigneeOptions(i: { organisationId: string; contractId?: string }): Promise<AssigneeOption[]> {
  const rows = await db.person.findMany({ where: { organisationId: i.organisationId, isActive: true }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 500 });
  if (!i.contractId) return rows.map((p) => ({ value: p.id, label: p.name, group: "EVERYONE" as const }));
  const [team, contractor] = await Promise.all([loadTeamMembers(db, i.organisationId, i.contractId), contractorOf({ organisationId: i.organisationId, contractId: i.contractId })]);
  const onTeam = new Set(team.map((m) => m.personId));
  const people = (inTeam: boolean) => rows.filter((p) => onTeam.has(p.id) === inTeam).map((p) => ({ value: p.id, label: p.name, group: inTeam ? ("TEAM" as const) : ("EVERYONE" as const) }));
  return [...people(true), { value: CONTRACTOR_ASSIGNEE, label: contractor, group: "CONTRACTOR" as const }, ...people(false)];
}

export interface TeamCardMember {
  role: TeamRole;
  roleLabel: string;
  personId: string;
  name: string;
}
/// The Project team card's rows (B-12), in role order, each with a name.
export async function loadTeamCard(i: { organisationId: string; contractId: string }): Promise<TeamCardMember[]> {
  const team = await loadTeamMembers(db, i.organisationId, i.contractId);
  const names = await namesOf(db, i.organisationId, team.map((m) => m.personId));
  return team.map((m) => ({ role: m.role, roleLabel: TEAM_ROLE_WORDS[m.role].en, personId: m.personId, name: names.get(m.personId) ?? "Someone" }));
}

// ------------------------------------------------------------------ My work

/// The most items My work draws: a technical bound; `more` counts the rest.
export const MY_WORK_CAP = 500;

export interface MyWorkRow {
  id: string;
  contractId: string;
  /// "Contract C-1 · Awardee": the exercise's title is not read, since a restricted exercise's title is not for every reader.
  contractLabel: string;
  /// "RFI-12", the address form.
  ref: string;
  type: BoardItem["type"];
  number: number;
  title: string;
  status: WorkStatus;
  dueOn: Day | null;
  group: MyWorkSection;
}

/// The items on one staff member across the organisation's contracts (0008 §5.6). Every contract of the organisation is readable to its staff (see the header: Work is a
/// contract stage, never HIDDEN), so the scope is the organisation. Late first by the database's order (due day ascending, no date last); the groups are `myWorkGroup`'s.
export async function loadMyWork(i: { organisationId: string; personId: string; today: Day | null }): Promise<{ rows: MyWorkRow[]; more: number }> {
  const where = { organisationId: i.organisationId, ...myWorkWhere({ personId: i.personId }) } as Prisma.WorkItemWhereInput;
  // C3: the cap cuts the least urgent. "To check" is the first group, so it is fetched first; the rest (late first, by due day) fills what is left of the cap.
  const toCheck: Prisma.WorkItemWhereInput = { AND: [where, { raisedByPersonId: i.personId, status: "IN_REVIEW" }] };
  const rest: Prisma.WorkItemWhereInput = { AND: [where, { NOT: { raisedByPersonId: i.personId, status: "IN_REVIEW" } }] };
  const select = {
        id: true,
        contractId: true,
        type: true,
        number: true,
        title: true,
        status: true,
        dueOn: true,
        raisedByPersonId: true,
        assigneePersonId: true,
        assignedToContractor: true,
        defectItemId: true,
        contract: { select: { number: true, award: { select: { awardeeName: true } } } },
  } as const;
  const orderBy: Prisma.WorkItemOrderByWithRelationInput[] = [{ dueOn: { sort: "asc", nulls: "last" } }, { contract: { number: "asc" } }, { type: "asc" }, { number: "asc" }, { id: "asc" }];
  const checking = await db.workItem.findMany({ where: toCheck, select, orderBy, take: MY_WORK_CAP });
  const [others, total] = await Promise.all([db.workItem.findMany({ where: rest, select, orderBy, take: MY_WORK_CAP - checking.length }), db.workItem.count({ where })]);
  const found = [...checking, ...others];
  // WRS-3: a linked In-review item raised by me is "to check" only if I may accept it, asked once per contract through the one who-may (`mayActOnDefectLines`).
  const linkedContracts = [...new Set(found.filter((r) => r.defectItemId !== null && r.status === "IN_REVIEW" && r.raisedByPersonId === i.personId).map((r) => r.contractId))];
  const mayAccept = new Map<string, boolean>();
  for (const id of linkedContracts) {
    const l = i.today ? await loadContract(i.organisationId, id) : null;
    mayAccept.set(id, l !== null && i.today !== null && (await mayActOnDefectLines(l, db, i.personId, i.today)));
  }
  const rows = found.flatMap((r): MyWorkRow[] => {
    const dueOn = dayOrNull(r.dueOn);
    const group = myWorkGroup({ status: r.status, raisedBy: raiserOf(r), assignee: assigneeOf(r), dueOn, cannotAccept: r.defectItemId !== null && mayAccept.get(r.contractId) === false }, { personId: i.personId }, i.today);
    return group ? [{ id: r.id, contractId: r.contractId, contractLabel: contractLabel(r.contract), ref: itemRef(r.type, r.number), type: r.type, number: r.number, title: r.title, status: r.status, dueOn, group }] : [];
  });
  return { rows, more: Math.max(0, total - found.length) };
}

/// The most Defect items the CPC's pick list draws; `total` says how many there are.
export const PICKABLE_DEFECT_CAP = 200;

/// The Defect items the draft CPC's list can take: open and not In review (WRS-2: it waits to be checked), on no defect list yet (`addLinesFromItems` judges the same on the locked row). `total` counts the rest, so the drawer can say "First 200 of N".
export async function pickableDefectItems(i: { organisationId: string; contractId: string }): Promise<{ options: { value: string; label: string }[]; total: number }> {
  const where = { ...scope(i), type: "DEFECT" as const, defectItemId: null, status: { in: OPEN_STATUSES.filter((s) => s !== "IN_REVIEW") } };
  const [rows, total] = await Promise.all([db.workItem.findMany({ where, select: { id: true, number: true, title: true }, orderBy: { number: "asc" }, take: PICKABLE_DEFECT_CAP }), db.workItem.count({ where })]);
  return { options: rows.map((x) => ({ value: x.id, label: `${itemRefText("DEFECT", x.number)} · ${x.title}` })), total };
}

/// The link dropdowns: the contract's other items (open first, then newest) and its project documents, each capped.
export async function linkOptions(i: { organisationId: string; contractId: string; exceptItemId?: string }): Promise<{ items: { value: string; label: string }[]; documents: { value: string; label: string }[] }> {
  const [items, documents] = await Promise.all([
    db.workItem.findMany({ where: { ...scope(i), ...(i.exceptItemId ? { id: { not: i.exceptItemId } } : {}) }, select: { id: true, type: true, number: true, title: true, status: true }, orderBy: [{ status: "asc" }, { recordedAt: "desc" }, { id: "asc" }], take: 200 }),
    db.projectDocument.findMany({ where: scope(i), select: { id: true, title: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 200 }),
  ]);
  return {
    items: items.map((x) => ({ value: x.id, label: `${itemRefText(x.type, x.number)} · ${x.title}` })),
    documents: documents.map((d) => ({ value: d.id, label: d.title })),
  };
}
