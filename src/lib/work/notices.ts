/**
 * Who the staff inbox tells about a work item (WS-17, W-10; 0008 §4.8), as drafts for `writeNotices`. No watchers: each kind goes to the people it names,
 * never to the person who acted and never to an inactive person.
 *
 * | Kind                       | To                                   |
 * | Assigned to you            | The new assignee                     |
 * | Waiting for you to check   | The raiser                           |
 * | Sent back to you           | The assignee                         |
 * | New comment                | The raiser and the assignee (OQ-10)  |
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
import type { WorkItemType, WorkNoticeEvent, WorkNoticeKind } from "./types";

/// A staff notice draft of a work kind. `kinds.ts` gains the four kinds in step 1; until then the kind is typed here.
export type WorkNoticeDraft = Omit<NoticeDraft, "kind"> & { kind: WorkNoticeKind };

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
  const named = e.kind === "WORK_ITEM_TO_CHECK" ? [e.raisedBy] : e.kind === "WORK_ITEM_COMMENT" ? [e.raisedBy, e.assignee] : [e.assignee];
  return [...new Set(named)].filter((id): id is string => id !== null && id !== e.actorId && e.activeIds.has(id)).sort();
}

export function workNoticeDrafts(event: WorkNoticeEvent, item: NoticeItem): WorkNoticeDraft[] {
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
