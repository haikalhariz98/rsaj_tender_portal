/**
 * Who sees a comment or a file (3b B-2, B-3, WB-3, WB-9; ADR 0048 D4, ADR 0049 D3). A comment's audience is chosen when it is written and stored, never
 * re-read: sharing later never re-classifies an earlier comment. A file has no audience column: the portal reads it from when it was attached. Pure.
 *
 * - Unshared item: every comment is INTERNAL, whatever was chosen; no choice is shown.
 * - Shared item: staff choose Reply or Internal note; the composer's PRESET is `DEFAULT_AUDIENCE` (0008 §4.5, kept as settled: WB-9). The composer always posts its choice,
 *   so a post with NO choice is internal on the server (WSEC-1): sharing is one-way, and a missing value must never resolve to the more public audience.
 * - The contractor's comment is always a Reply (CHECK `WorkItemComment_contractor_replies`).
 * - Send back writes a Reply on an item the contractor holds (it must see why it came back); on any other item it stays internal.
 * - A Reply needs the item shared at or before the comment's instant (PA056): `audienceFaults`.
 * - A file is seen by the portal if the contractor uploaded it, or it was attached at or after `sharedAt` (WB-3). An internal note carries no file on a
 *   shared item (`filesWith`), so no file the contractor sees hangs off an internal note.
 */

import type { Words } from "@/lib/contract/labels";

import { isOpen } from "./move";
import { isContractor } from "./party";
import type { Audience, FieldFault, WorkActor, WorkItemFacts } from "./types";

/// The composer's preset on a shared item (0008 §4.5; WB-9). A screen default only: the server never falls back to it (WSEC-1). One constant: changing it changes nothing else.
export const DEFAULT_AUDIENCE: Audience = "REPLY";

type Facts = Pick<WorkItemFacts, "sharedAt" | "assignee">;

/// The audience a comment is written with. `choice` is the composer's (null: not chosen); `action` is Send back's comment or a plain one.
export function commentAudience(item: Facts, side: "STAFF" | "CONTRACTOR", choice: Audience | null, action: "COMMENT" | "SEND_BACK"): Audience {
  if (side === "CONTRACTOR") return "REPLY";
  if (item.sharedAt === null) return "INTERNAL";
  if (action === "SEND_BACK") return isContractor(item.assignee) ? "REPLY" : "INTERNAL";
  return choice ?? "INTERNAL";
}

/// A Reply on an item not shared by the comment's instant is NOT_SHARED (PA056: `sharedAt` ≤ `recordedAt`; equal is shared).
export function audienceFaults(sharedAt: string | null, audience: Audience, recordedAt: Date): FieldFault[] {
  if (audience === "INTERNAL") return [];
  return sharedAt === null || new Date(sharedAt).getTime() > recordedAt.getTime() ? [{ code: "NOT_SHARED" }] : [];
}

/// Whether the composer offers files with this audience: on a shared item only with Reply (B-3).
export const filesWith = (sharedAt: string | null, audience: Audience): boolean => sharedAt === null || audience === "REPLY";

/// Whether the portal lists and serves an item's file (WB-3). Never on an unshared item.
export function portalSeesFile(file: { attachedAt: Date; byContractor: boolean }, sharedAt: Date | string | null): boolean {
  if (sharedAt === null) return false;
  return file.byContractor || file.attachedAt.getTime() >= new Date(sharedAt).getTime();
}

/// Remove a file from an item (B-6, WB-4): never on a shared item (the contractor may hold it; a correction is a new file and a reply); on an unshared
/// open item, only the staff member who attached it or the lead, with a reason. `whoCan` is the caller's sentence naming them.
export function removeFileFaults(item: Pick<WorkItemFacts, "sharedAt" | "status">, actor: WorkActor, attachedByPersonId: string | null, reason: string, whoCan: Words): FieldFault[] {
  if (item.sharedAt !== null) return [{ code: "FILE_ON_SHARED_ITEM" }];
  if (!isOpen(item.status)) return [{ code: "CLOSED_ITEM" }];
  const me = actor.side === "STAFF" && actor.mayReadContract ? actor.personId : null;
  const out: FieldFault[] = [];
  if (me === null || (me !== attachedByPersonId && !actor.leadIds.includes(me))) out.push({ code: "NOT_EDITABLE", whoCan });
  if (reason.trim() === "") out.push({ code: "REASON_NEEDED" });
  return out;
}
