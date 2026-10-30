/**
 * The portal's Work list (3b section 4; WS-11, WS-13): three groups, one button per row, and the staff names the contractor may see. Only shared items reach
 * these (the portal readers filter on `sharedAt`). Pure.
 *
 * - Waiting for you: assigned to the contractor and To do or In progress, or raised by it and In review. Closed: Done or Cancelled. Everything else is
 *   with the organisation.
 * - The row's button: Accept answer where the contractor may close it, Send for checking where it may send it, Open on a closed item, else Reply.
 *   An Inspection the contractor holds offers Reply, never Send for checking (WB-5: it cannot set Passed, and OQ-8 stands until the founder rules).
 * - A staff assignee is named only if on the Project team or the organisation's in-force side; otherwise the organisation's name (WS-11).
 */

import { PORTAL_YOU_WORDS } from "./labels";
import { CLOSED_STATUSES, contractorActions, isOpen, OPEN_STATUSES } from "./move";
import { isContractor } from "./party";
import type { Party, PortalAction, PortalGroup, WorkActor, WorkItemFacts } from "./types";
import { workWhere, type WorkWhere } from "./views";

/// The contractor as the portal's rules read it: the session holds the contract (`inHeldContract`).
const CONTRACTOR_ACTOR: WorkActor = { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true };

export function portalGroup(item: WorkItemFacts): PortalGroup {
  if (!isOpen(item.status)) return "CLOSED";
  const held = isContractor(item.assignee) && (item.status === "TO_DO" || item.status === "IN_PROGRESS");
  const toAccept = isContractor(item.raisedBy) && item.status === "IN_REVIEW";
  return held || toAccept ? "WAITING_FOR_YOU" : "WITH_ORG";
}

/// WSEC-5: the contractor replies, attaches and answers on an OPEN item only. Files cannot be removed from a shared item (WB-4) and nobody watches a closed one, so a post there
/// would be a permanent record nobody reads. The cores refuse it (the backstop for a stale page) and the drawer shows no such control.
export const contractorMayPost = (item: Pick<WorkItemFacts, "status">): boolean => isOpen(item.status);

/// WSEC-9: the Answer of an RFI the contractor holds, written but not yet sent for checking, is a draft (WB-6: one field, one row). Staff see it labelled until the contractor
/// sends it; a staff member who takes the item back and closes it accepts the text as it stands (`answerAcceptedBy`, move.ts, audited).
export const answerIsDraft = (item: Pick<WorkItemFacts, "type" | "status" | "assignee" | "answer">): boolean =>
  item.type === "RFI" && isContractor(item.assignee) && (item.status === "TO_DO" || item.status === "IN_PROGRESS") && item.answer.trim() !== "";

/// The portal's order inside a group (WSEC-10 L3): due day, then the reference. Internal priority is the organisation's and never decides what the contractor sees first.
export const PORTAL_ORDER_BY = [{ dueOn: { sort: "asc", nulls: "last" } }, { type: "asc" }, { number: "asc" }, { id: "asc" }] as const;

export function portalAction(item: WorkItemFacts): PortalAction {
  if (!isOpen(item.status)) return "OPEN";
  // WR-1: on a linked item the button follows the line, whoever holds the item: "Mark as fixed" while the line is open (In progress), Reply while it is reported or on a draft CPC's list.
  if (item.linkedLine) return item.linkedLine === "RECORDED" && item.status === "IN_PROGRESS" ? "MARK_AS_FIXED" : "REPLY";
  const may = contractorActions(item, CONTRACTOR_ACTOR);
  if (may.includes("MARK_DONE")) return "ACCEPT_ANSWER";
  if (may.includes("SEND_FOR_REVIEW") && item.type !== "INSPECTION") return "SEND_FOR_CHECKING";
  return "REPLY";
}

/// Who holds an item, as the portal names it: "You", a named staff member on the team or the side, or the organisation.
export function portalStaffLabel(assignee: Party | null, teamIds: ReadonlySet<string>, sideIds: ReadonlySet<string>, names: ReadonlyMap<string, string>, orgName: string): string {
  if (assignee === null) return orgName;
  if (assignee.kind === "CONTRACTOR") return PORTAL_YOU_WORDS.en;
  const name = names.get(assignee.id);
  return name !== undefined && (teamIds.has(assignee.id) || sideIds.has(assignee.id)) ? name : orgName;
}

/// The database's reading of `portalGroup`, for the portal reader's queries (never without `sharedAt: { not: null }`, which the reader adds). "Waiting for you" is the staff
/// view "Waiting on {contractor}" word for word (`workWhere`), so the two cannot drift; the db test holds each row to `portalGroup`.
export function portalWhere(group: PortalGroup): WorkWhere {
  const waiting = workWhere("contractor", {}, { personId: "" }, null);
  if (group === "WAITING_FOR_YOU") return waiting;
  if (group === "CLOSED") return { status: { in: [...CLOSED_STATUSES] } };
  return { AND: [{ status: { in: [...OPEN_STATUSES] } }, { NOT: waiting }] };
}
