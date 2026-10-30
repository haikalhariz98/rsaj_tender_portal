/**
 * Who the staff inbox tells about a work item (WS-17, W-10; 0008 §4.8), as drafts for `writeNotices`. No watchers: each kind goes to the people it names,
 * never to the person who acted and never to an inactive person.
 *
 * | Kind                       | To                                   |
 * | Assigned to you            | The new assignee                     |
 * | Waiting for you to check   | The raiser                           |
 * | Sent back to you           | The assignee                         |
 * | New comment                | The raiser and the assignee (OQ-10)  |
 * | From the contractor (3b)   | The raiser and the assignee; on a raise with no single default assignee, the role's holders (B-16); nobody: the lead |
 *
 * Only people are told: the contractor gets no notice (PW-13), so a contractor raiser or assignee names nobody. On an item the contractor raised there is
 * no staff raiser, so the lead is told on every kind (WS-17). The contractor acting is `actorId` null.
 *
 * A body holds the item's reference, its title and the contract's number only: never an amount and never a contact's or a supplier's name (WS-9), since a
 * stored notice is read without a gate. The occurrence is the audit row's or the comment's id, so a retried act tells nobody twice and each comment tells
 * once. The occurrence is `writeAudit`'s returned id (M2). `activeIds` are the active people of the organisation who may READ the case (the caller builds it).
 * Due tomorrow and Late are not built (OQ-5: no runner). Pure.
 */

import type { NoticeDraft } from "@/lib/inbox/notices";
import { caseHref } from "@/lib/contract/links";

import { itemRefText, NOTICE_TITLE_WORDS } from "./labels";
import { itemRef } from "./number";
import { personIdOf } from "./party";
import type { WorkItemType, WorkNoticeEvent } from "./types";

/// The item a notice is about, as its body may name it.
export interface NoticeItem {
  id: string;
  type: WorkItemType;
  number: number;
  title: string;
  contractId: string;
  /// The contract's own number (`Contract.number`), never its label with the awardee's name.
  contractNumber: string;
}

/// The address a notice opens: the case's Work tab with the item's panel.
export const workItemHref = (item: Pick<NoticeItem, "contractId" | "type" | "number">): string =>
  `${caseHref({ awardId: "", contractId: item.contractId }, { tab: "work" })}&item=${encodeURIComponent(itemRef(item.type, item.number))}`;

function recipients(e: WorkNoticeEvent): string[] {
  const raiser = personIdOf(e.raisedBy);
  const assignee = personIdOf(e.assignee);
  let named: (string | null)[] =
    e.kind === "WORK_ITEM_TO_CHECK" ? [raiser] : e.kind === "WORK_ITEM_COMMENT" ? [raiser, assignee] : e.kind === "WORK_ITEM_FROM_CONTRACTOR" ? [raiser, assignee, ...(e.roleHolders ?? [])] : [assignee];
  if (e.raisedBy.kind === "CONTRACTOR" || (e.kind === "WORK_ITEM_FROM_CONTRACTOR" && named.every((id) => id === null))) named = [...named, ...e.leadIds];
  return [...new Set(named)].filter((id): id is string => id !== null && id !== e.actorId && e.activeIds.has(id)).sort();
}

export function workNoticeDrafts(event: WorkNoticeEvent, item: NoticeItem): NoticeDraft[] {
  const ref = itemRefText(item.type, item.number);
  return recipients(event).map((r) => ({
    recipientPersonId: r,
    kind: event.kind,
    subjectEntity: "WorkItem",
    subjectId: item.id,
    occurrence: event.occurrence,
    exerciseId: null,
    title: `${NOTICE_TITLE_WORDS[event.kind].en}: ${ref}`,
    body: `${ref} · ${item.title} · Contract ${item.contractNumber}`,
    href: workItemHref(item),
  }));
}
