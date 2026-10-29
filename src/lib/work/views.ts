/**
 * The Work tab's views, filters and order (W-12; 0008 §5.1, §5.2), as one rule read two ways: `inView` judges an item in memory, `workWhere` gives the same
 * as a Prisma where object for the server-mode list (step 3 checks the two agree against a database). Pure: the where object is plain data, built here
 * without the generated client; the store adds the organisation and contract scope.
 *
 * - Open: To do, In progress, In review. Mine: open and assigned to the reader. Unassigned: open with no assignee. Non-conformances: open inspections whose
 *   result is Failed (0008 §4.1). Done: Done and Cancelled, the only view they appear in (§5.2).
 * - Late: open and due before the organisation's today. With no today (no time zone) Late matches nothing (WS-19), never UTC's day.
 * - Order: late first, then by due day, then priority. For open items late first is the same as due day ascending (every late item is due before every
 *   other), so the order is due ascending with no due date last, then Urgent to Low, then type and number: total, so a page never shuffles.
 */

import { dayToDate } from "@/lib/dates";
import { likeLiteral } from "@/lib/search/words";

import { TYPE_SHORT } from "./labels";
import { CLOSED_STATUSES, OPEN_STATUSES } from "./move";
import { WORK_ITEM_TYPES, type Day, type WorkItemFacts, type WorkItemType, type WorkPriority, type WorkView } from "./types";

/// An item as the list, the board and the views read it.
export interface WorkRow extends WorkItemFacts {
  title: string;
  priority: WorkPriority;
}

export interface WorkFilters {
  type?: WorkItemType | null;
  /// A Person id.
  assignee?: string | null;
  priority?: WorkPriority | null;
  q?: string;
}

export const WORK_VIEWS: readonly WorkView[] = ["open", "mine", "late", "unassigned", "ncr", "done"];
/// Lowest first, as `WorkItemPriority` must be declared in the schema, so `priority: "desc"` puts Urgent first.
export const PRIORITIES: readonly WorkPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

/// A view from the address; anything else is the default, Open.
export const parseWorkView = (raw: string | undefined): WorkView => (WORK_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as WorkView) : "open";

/// The filters from the address. A value no dropdown offers is dropped, so it never reaches the query.
export function parseWorkFilters(p: { type?: string; assignee?: string; priority?: string; q?: string }): WorkFilters {
  return {
    type: (WORK_ITEM_TYPES as readonly string[]).includes(p.type ?? "") ? (p.type as WorkItemType) : null,
    assignee: p.assignee?.trim() || null,
    priority: (PRIORITIES as readonly string[]).includes(p.priority ?? "") ? (p.priority as WorkPriority) : null,
    q: p.q?.trim() ?? "",
  };
}

/// A search that is a reference ("RFI 12", "rfi-12", "SI3") finds that item too. Matched without case, unlike the address form.
export function searchRef(q: string): { type: WorkItemType; number: number } | null {
  const m = /^([A-Za-z]+)[\s-]?(\d{1,9})$/.exec(q.trim());
  if (!m) return null;
  const type = WORK_ITEM_TYPES.find((t) => TYPE_SHORT[t].toLowerCase() === m[1].toLowerCase());
  return type ? { type, number: Number(m[2]) } : null;
}

export function inView(item: WorkRow, view: WorkView, reader: { personId: string }, today: Day | null, filters: WorkFilters = {}): boolean {
  const open = OPEN_STATUSES.includes(item.status);
  const viewOk =
    view === "open"
      ? open
      : view === "mine"
        ? open && item.assignee === reader.personId
        : view === "late"
          ? open && today !== null && item.dueOn !== null && item.dueOn < today
          : view === "unassigned"
            ? open && item.assignee === null
            : view === "ncr"
              ? open && item.type === "INSPECTION" && item.inspectionResult === "FAILED"
              : CLOSED_STATUSES.includes(item.status);
  if (!viewOk) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.assignee && item.assignee !== filters.assignee) return false;
  if (filters.priority && item.priority !== filters.priority) return false;
  const q = filters.q?.trim();
  if (q) {
    const ref = searchRef(q);
    const byRef = ref !== null && item.type === ref.type && item.number === ref.number;
    if (!byRef && !item.title.toLowerCase().includes(q.toLowerCase())) return false;
  }
  return true;
}

/// A Prisma `WorkItemWhereInput`, as plain data.
export type WorkWhere = { [key: string]: unknown };

export function workWhere(view: WorkView, filters: WorkFilters, reader: { personId: string }, today: Day | null): WorkWhere {
  const open = { status: { in: [...OPEN_STATUSES] } };
  const viewWhere: WorkWhere =
    view === "open"
      ? open
      : view === "mine"
        ? { ...open, assigneePersonId: reader.personId }
        : view === "late"
          ? today === null
            ? { id: { in: [] } }
            : { ...open, dueOn: { lt: dayToDate(today) } }
          : view === "unassigned"
            ? { ...open, assigneePersonId: null }
            : view === "ncr"
              ? { ...open, type: "INSPECTION", inspectionResult: "FAILED" }
              : { status: { in: [...CLOSED_STATUSES] } };
  const and: WorkWhere[] = [viewWhere];
  if (filters.type) and.push({ type: filters.type });
  if (filters.assignee) and.push({ assigneePersonId: filters.assignee });
  if (filters.priority) and.push({ priority: filters.priority });
  const q = filters.q?.trim();
  if (q) {
    // Prisma passes `%`, `_` and `\` through to ILIKE as wildcards, so a search for "50%" would match everything: escaped here (`words.db.test.ts` proved it).
    const title = { title: { contains: likeLiteral(q), mode: "insensitive" } };
    const ref = searchRef(q);
    and.push(ref ? { OR: [title, { type: ref.type, number: ref.number }] } : title);
  }
  return { AND: and };
}

/// The list's and the board's order, for `orderBy` (the enums sort in declaration order).
export const WORK_ORDER_BY = [{ dueOn: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { type: "asc" }, { number: "asc" }, { id: "asc" }] as const;

export function compareItems(a: WorkRow, b: WorkRow): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return (
    PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) ||
    WORK_ITEM_TYPES.indexOf(a.type) - WORK_ITEM_TYPES.indexOf(b.type) ||
    a.number - b.number ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
