"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import type { PreparedAct } from "@/lib/auth/act-begin";
import type { StaffActor } from "@/lib/auth/types";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf } from "@/lib/dates";
import { parseFieldEdit, parseNewItem } from "@/lib/work/fields";
import { defectActOf } from "@/lib/work/defect-link";
import { isLinkedItem } from "@/lib/work/load";
import { actionOf } from "@/lib/work/move";
import { attachFiles, comment, createItem, editField, link, moveItem, removeFile, shareItem, unlink, WorkRefused, type WorkCtx } from "@/lib/work/store";
import type { Audience, WorkStatus } from "@/lib/work/types";

/**
 * The Work tab's staff acts (workspace 3a step 3; plan §5): raise an item, edit a field, move it, comment, link, unlink, attach files; 3b step 3: share an item, remove a file. This file owns only the edge: who is
 * asking (`staffForAct`: an administrator account is refused, NFR-SEC-004), the form read by hand once per act (`fields.ts`; nothing the client sends is trusted, the item's
 * type and status included), the contract's lock and its `WORK_ITEM` row, and the words of a refusal. It restates no rule: the faults and the permissions are `src/lib/work`'s.
 *
 * Every act answers `{ refused?: string }`, never throws a rule: the Board, the select cell and the Composer take it as their action (they show `refused` and put the
 * card, the choice or the words back). Raising also answers the new item's reference (`ref`, "RFI-12"), so the quick-add row can open its panel. The page is revalidated after
 * every act that reached the contract, a refusal included, so an optimistic move settles on what the server holds (MOVED_ALREADY is the example).
 *
 * Files are never posted here: each is staged first through the staff upload route (`/api/documents`, `stagedFor=work-item`), which returns its `versionId`, and the form posts
 * those ids (`stagedVersionId`, repeated). A Server Action body is capped at 1 MB (ADR 0011 D5).
 *
 * Form fields (all acts take `contractId`; every act on an item takes `itemId`):
 *   createWorkItem       `type`, `title`, `description`, `priority`, `dueOn`, `location`, `assigneePersonId` (a person id, or "contractor"), `answer`, `impact`, `inspectionResult`, `severity`, `happenedAt`, `fromDocumentId`;
 *                        `share` ("on" shares it; the quick-add row posts none, so it never shares). A Defect past practical completion is raised with its defect line (WB-12) and also needs
 *                        `observedOn` (the day it was seen) and `dueOn`; the line's own rules refuse a missing or out-of-period day in their words.
 *   editWorkField        `field` (a column of `fields.ts`), `value`. The select cell posts its pick as `value`; "contractor" as an assignee shares the item (one-way).
 *   moveWorkItem         `from` (the status the reader saw), `to`; `reason` for Cancel; `comment` for Send back. The Board posts the card's `fields` with `from` and `to`.
 *   commentOnWorkItem    `body`; `expectedShared` ("yes" or "no": the share state the page was drawn with; required); `audience` ("REPLY" or "INTERNAL"; absent is internal on the server, WSEC-1).
 *   shareWorkItem        `share` ("on"; "off" is refused: sharing can't be undone).   removeWorkFile   `attachmentId`, `reason`.
 *   linkWorkItem         `toItemId` or `documentId`.   unlinkWorkItem   `linkId`.   attachWorkFiles   `stagedVersionId` (repeated); `expectedShared` as for a comment (required).
 */

export type WorkResult = { refused?: string; ref?: string };

const GONE: WorkResult = { refused: "That contract no longer exists." };
const UNREADABLE: WorkResult = { refused: "That didn't go through. Reload and try again." };

const STATUSES: readonly WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

/// The contract, locked (requisition, exercise, award, contract: `withLockedContract`), the WORK_ITEM row asked first, then the act.
async function inContract(actor: StaffActor, contractId: string, now: Date, fn: (c: WorkCtx) => Promise<WorkResult>): Promise<WorkResult> {
  let result: WorkResult | null;
  const told = { count: 0 };
  try {
    result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
      // The act x status table, first and under the lock: Work is open from Executed through Final certificate issued (W-2), refused otherwise.
      const shut = actStatusFault("WORK_ITEM", l.contract.status as ContractStatus);
      if (shut) return { refused: actStatusText(shut) };
      // The organisation's day, never UTC's; null when no time zone is set.
      const today = dayOf(now, l.org.timeZone);
      return fn({ tx, l, now, today, told });
    });
  } catch (e) {
    if (e instanceof WorkRefused) {
      // A refusal rolled the act back; the page is revalidated all the same, so a screen that guessed (a dragged card) settles on what is there.
      revalidatePath(`/projects/${contractId}`);
      revalidatePath("/my-work");
      return { refused: e.words };
    }
    const attribution = attributionRefusalState(e);
    if (attribution) return { refused: stateWords(attribution) };
    throw e;
  }
  if (result === null) return GONE;
  revalidatePath(`/projects/${contractId}`);
  revalidatePath("/my-work"); // the items on a person, across contracts
  if (!result.refused && told.count > 0) revalidatePath("/", "layout"); // the inbox counts
  return result;
}

const stateWords = (s: FormState): string => s.message ?? (Object.values(s.errors ?? {}).join(" ") || "Not recorded.");

// ------------------------------------------------------------------ the form, read once

const text = (data: FormData, name: string): string => {
  const v = data.get(name);
  return typeof v === "string" ? v.trim() : "";
};
/// An id the form names: a non-empty string of a sane length, else "" (which every act refuses as unreadable).
const idOf = (data: FormData, name: string): string => {
  const v = text(data, name);
  return v.length <= 100 ? v : "";
};
const idsOf = (data: FormData, name: string): string[] => data.getAll(name).flatMap((v) => (typeof v === "string" && v.trim() && v.trim().length <= 100 ? [v.trim()] : []));
const statusOf = (data: FormData, name: string): WorkStatus | null => {
  const v = text(data, name);
  return (STATUSES as readonly string[]).includes(v) ? (v as WorkStatus) : null;
};

/// The composer's audience: absent is null; anything but REPLY or INTERNAL is false (a tampered request, refused whole).
const audienceOf = (data: FormData): Audience | null | false => {
  const v = text(data, "audience");
  return v === "" ? null : v === "REPLY" || v === "INTERNAL" ? v : false;
};

/// The share state the page was drawn with (WSEC-1): "yes" or "no". Anything else is null, which the act refuses as unreadable (a post that cannot say what it saw cannot be judged).
const expectedSharedOf = (data: FormData): boolean | null => {
  const v = text(data, "expectedShared");
  return v === "yes" ? true : v === "no" ? false : null;
};

// ------------------------------------------------------------------ the acts

/// Raise an item. The attribution is "Raised by" (the signed-in officer's own act).
export async function createWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  if (!contractId) return UNREADABLE;
  const begun = await beginAct(actor, data, "WorkItem.raisedBy", { personField: "raisedByPersonId", onBehalf: false });
  if (!begun.ok) return { refused: stateWords(begun.state) };
  const act = begun.act;
  return inContract(actor, contractId, now, async (c) => {
    const n = parseNewItem(data, c.l.org.timeZone);
    if (!n) return UNREADABLE;
    const made = await createItem(c, actor, n, act);
    return { ref: made.ref };
  });
}

/// Edit one field of an item. No attribution slot: the audit row carries the signed-in person, the field, and its before and after.
export async function editWorkField(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  if (!contractId || !itemId) return UNREADABLE;
  return inContract(actor, contractId, now, async (c) => {
    const edit = parseFieldEdit(text(data, "field"), typeof data.get("value") === "string" ? (data.get("value") as string) : "", c.l.org.timeZone);
    if (!edit) return UNREADABLE;
    await editField(c, actor, { itemId, edit });
    return {};
  });
}

/// Move an item to a status, from the status the reader saw. Send back writes its comment in the same act, so it begins an attribution (the comment's); on a linked item the defect act's event is the attribution instead.
export async function moveWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const from = statusOf(data, "from");
  const to = statusOf(data, "to");
  if (!contractId || !itemId || !from || !to) return UNREADABLE;
  let act: PreparedAct | null = null;
  // B-18: a move on an item that stands for a defect line is a defect act, attributed as the line's event; the core refuses a page and a row that disagree.
  const viaDefectAct = defectActOf(actionOf(from, to), "STAFF") !== null && (await isLinkedItem(actor.organisationId, contractId, itemId));
  if (viaDefectAct || actionOf(from, to) === "SEND_BACK") {
    const begun = await beginAct(actor, data, viaDefectAct ? "DefectEvent.person" : "WorkItemComment.person", { personField: "personId", onBehalf: false });
    if (!begun.ok) return { refused: stateWords(begun.state) };
    act = begun.act;
  }
  return inContract(actor, contractId, now, async (c) => {
    await moveItem(c, actor, { itemId, expectedFrom: from, to, reason: text(data, "reason"), comment: text(data, "comment"), viaDefectAct }, act);
    return {};
  });
}

/// Comment on an item. The audience is the composer's choice, absent or REPLY or INTERNAL; the core decides what the item allows (B-2).
export async function commentOnWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const body = text(data, "body");
  const audience = audienceOf(data);
  const expectedShared = expectedSharedOf(data);
  if (!contractId || !itemId || audience === false || expectedShared === null) return UNREADABLE;
  const begun = await beginAct(actor, data, "WorkItemComment.person", { personField: "personId", onBehalf: false });
  if (!begun.ok) return { refused: stateWords(begun.state) };
  const act = begun.act;
  return inContract(actor, contractId, now, async (c) => {
    await comment(c, actor, { itemId, body, audience, expectedShared }, act);
    return {};
  });
}

/// Link an item to another item or to a project document of the same contract.
export async function linkWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const toItemId = idOf(data, "toItemId") || null;
  const documentId = idOf(data, "documentId") || null;
  if (!contractId || !itemId) return UNREADABLE;
  const begun = await beginAct(actor, data, "WorkItemLink.person", { personField: "personId", onBehalf: false });
  if (!begun.ok) return { refused: stateWords(begun.state) };
  const act = begun.act;
  return inContract(actor, contractId, now, async (c) => {
    await link(c, actor, { itemId, toItemId, documentId }, act);
    return {};
  });
}

/// Remove a link. A delete, audited; no attribution slot.
export async function unlinkWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const linkId = idOf(data, "linkId");
  if (!contractId || !itemId || !linkId) return UNREADABLE;
  return inContract(actor, contractId, now, async (c) => {
    await unlink(c, actor, { itemId, linkId });
    return {};
  });
}

/// Pin files already staged through the upload route to an item.
export async function attachWorkFiles(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const expectedShared = expectedSharedOf(data);
  if (!contractId || !itemId || expectedShared === null) return UNREADABLE;
  const stagedVersionIds = idsOf(data, "stagedVersionId");
  return inContract(actor, contractId, now, async (c) => {
    await attachFiles(c, actor, { itemId, stagedVersionIds, expectedShared });
    return {};
  });
}

/// Share an item with the contractor. One-way and audited; "off" is asked only by a tampered form and is refused in words. The screen asks its confirm first.
export async function shareWorkItem(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const share = text(data, "share");
  if (!contractId || !itemId || (share !== "on" && share !== "off")) return UNREADABLE;
  return inContract(actor, contractId, now, async (c) => {
    await shareItem(c, actor, { itemId, share: share === "on" });
    return {};
  });
}

/// Remove a file from an unshared item, with a reason. A detach, audited; no attribution slot.
export async function removeWorkFile(data: FormData): Promise<WorkResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const itemId = idOf(data, "itemId");
  const attachmentId = idOf(data, "attachmentId");
  if (!contractId || !itemId || !attachmentId) return UNREADABLE;
  const reason = text(data, "reason");
  return inContract(actor, contractId, now, async (c) => {
    await removeFile(c, actor, { itemId, attachmentId, reason });
    return {};
  });
}
