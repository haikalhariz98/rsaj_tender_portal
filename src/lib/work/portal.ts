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
import { contractorActions, isOpen } from "./move";
import { isContractor } from "./party";
import type { Party, PortalAction, PortalGroup, WorkActor, WorkItemFacts } from "./types";

/// The contractor as the portal's rules read it: the session holds the contract (`inHeldContract`).
const CONTRACTOR_ACTOR: WorkActor = { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true };

export function portalGroup(item: WorkItemFacts): PortalGroup {
  if (!isOpen(item.status)) return "CLOSED";
  const held = isContractor(item.assignee) && (item.status === "TO_DO" || item.status === "IN_PROGRESS");
  const toAccept = isContractor(item.raisedBy) && item.status === "IN_REVIEW";
  return held || toAccept ? "WAITING_FOR_YOU" : "WITH_ORG";
}

export function portalAction(item: WorkItemFacts): PortalAction {
  if (!isOpen(item.status)) return "OPEN";
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
