/**
 * Sharing an item with the contractor (3b B-1, WB-2; ADR 0049 D1). Sharing is a stored instant, written by the act that shares, and one-way: once set it
 * never changes (trigger PA055) and nothing unshares. It is never read from the type: a type only presets the New item drawer's toggle. Pure.
 *
 * - Assigning to "{contractor}" shares in the same act: ONE UPDATE sets `assignedToContractor`, clears `assigneePersonId`, and sets `sharedAt` if it is
 *   unset (CHECK `WorkItem_contractor_party_shared`). On an unshared item the screen asks the Share confirm first (WB-2): `assignWouldShare`.
 * - Sharing a shared item is a no-op, never a new instant (`sharePatch` null).
 * - The quick-add row posts no toggle, so it never shares.
 */

import type { FieldEdit, NewItem } from "./fields";
import { mayEdit } from "./fields";
import { whoCanWords, type WhoNames } from "./labels";
import { isOpen } from "./move";
import type { FieldFault, Party, WorkActor, WorkItemFacts, WorkItemType } from "./types";

/// The types whose New item drawer presets "Share with {contractor}" on (0008 §4.1, WB-2). Incident, Task and Action are off; an Action, like any
/// item, is on once its assignee is "{contractor}". Fixed product defaults, like the types; staff switch the toggle before Create.
export const SHARED_BY_DEFAULT: readonly WorkItemType[] = ["RFI", "SITE_INSTRUCTION", "INSPECTION", "DEFECT"];

export const shareDefault = (type: WorkItemType, assignee: Party | null): boolean => assignee?.kind === "CONTRACTOR" || SHARED_BY_DEFAULT.includes(type);

/// Whether a new item is created shared: assigned to the contractor, or the toggle on.
export const sharedOnCreate = (n: Pick<NewItem, "share" | "assignedToContractor">): boolean => n.assignedToContractor || n.share;

/// The Share act (or a request to unshare). Unsharing a shared item is SHARE_IS_ONE_WAY; "not shared" on an unshared item asks nothing. Sharing is W-3's
/// (the raiser, the assignee or the lead) on an open item.
export function shareFaults(item: WorkItemFacts, actor: WorkActor, share: boolean, who: WhoNames): FieldFault[] {
  if (!share) return item.sharedAt === null ? [] : [{ code: "SHARE_IS_ONE_WAY" }];
  if (!isOpen(item.status)) return [{ code: "CLOSED_ITEM" }];
  if (!mayEdit(item, actor)) return [{ code: "NOT_EDITABLE", whoCan: whoCanWords("EDIT", who) }];
  return [];
}

/// The Share write: `sharedAt` set now, or null when the item is shared already (PA055 refuses a new instant).
export const sharePatch = (sharedAt: string | null, now: Date): { sharedAt: Date } | null => (sharedAt === null ? { sharedAt: now } : null);

type AssigneeEdit = Extract<FieldEdit, { field: "assigneePersonId" | "assignedToContractor" }>;

/// Whether this assignee edit shares the item, so the screen asks the Share confirm first (WB-2).
export const assignWouldShare = (sharedAt: string | null, edit: AssigneeEdit): boolean => edit.field === "assignedToContractor" && sharedAt === null;

/// The one UPDATE of an assignee change: at most one assignee form is ever set (CHECK `WorkItem_one_assignee`), and the contractor's shares the item.
export function assigneePatch(sharedAt: string | null, edit: AssigneeEdit, now: Date): { assigneePersonId: string | null; assignedToContractor: boolean; sharedAt?: Date } {
  if (edit.field === "assigneePersonId") return { assigneePersonId: edit.value, assignedToContractor: false };
  return { assigneePersonId: null, assignedToContractor: true, ...sharePatch(sharedAt, now) };
}
