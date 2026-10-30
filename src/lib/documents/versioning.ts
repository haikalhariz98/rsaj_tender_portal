/**
 * Versions are immutable (ADR 0011). A correction is a new version; a withdrawal is
 * recorded once, with a reason; the bytes are never deleted.
 */

import { PURPOSE_OWNER, type AttachmentPurpose, type Finding, type VersionFact } from "./types";

export type VersionFault = "IDENTICAL_TO_VERSION_N" | "DOCUMENT_WITHDRAWN";

/**
 * Whether bytes with this fingerprint may become the document's next version. Identical
 * bytes are not a new version, whichever earlier version they match (withdrawn or not).
 * A document whose every version is withdrawn takes no more: file the right one as a
 * new document. (To correct a version, add the new one first, then withdraw the old.)
 */
export function nextVersionFault(versions: readonly Pick<VersionFact, "versionNo" | "sha256" | "withdrawnAt">[], sha256: string): Finding<VersionFault> | null {
  const same = versions.find((v) => v.sha256 === sha256);
  if (same) return { code: "IDENTICAL_TO_VERSION_N", level: "block", data: { n: same.versionNo } };
  if (versions.length > 0 && versions.every((v) => v.withdrawnAt != null)) return { code: "DOCUMENT_WITHDRAWN", level: "block" };
  return null;
}

export const nextVersionNo = (versions: readonly Pick<VersionFact, "versionNo">[]) => versions.reduce((n, v) => Math.max(n, v.versionNo), 0) + 1;

/// The version a reader sees first: the highest not withdrawn, else the highest.
export function currentVersion<V extends Pick<VersionFact, "versionNo" | "withdrawnAt">>(versions: readonly V[]): V | null {
  const sorted = [...versions].sort((a, b) => b.versionNo - a.versionNo);
  return sorted.find((v) => v.withdrawnAt == null) ?? sorted[0] ?? null;
}

export type WithdrawFault = "ALREADY_WITHDRAWN" | "PROJECT_FILE_KEPT" | "WORK_ITEM_FILE_REMOVE_FIRST" | "WORK_ITEM_FILE_KEPT" | "REASON_REQUIRED";

/**
 * Withdrawing a version: once, with a reason. Never refused because a judged record relies on it — that record is told instead (issue refuses, naming the way
 * out). The one exception is a project file (ADR 0042; PW-33): a version held by a live Project workspace attachment (purpose PROJECT_DOCUMENT_FILE, not
 * detached) is kept, and is replaced only by a new version of the project document (PW-7, PW-8). `heldByProjectFile` is that fact, read by the caller under
 * the store document's lock (the pin takes the same lock, so the two serialise). Trigger PA047 is the backstop.
 * A live work item file is kept too (workspace 3b, B-6, WB-4), in its own words (`workItemFile`, from `workItemFileHold`): on an unshared item it is removed
 * from the item first; on a shared item it is never removed.
 */
export function withdrawFault(version: Pick<VersionFact, "withdrawnAt">, reason: string, kept: { heldByProjectFile: boolean; workItemFile?: WorkItemFileHold }): Finding<WithdrawFault> | null {
  if (version.withdrawnAt != null) return { code: "ALREADY_WITHDRAWN", level: "block" };
  if (kept.workItemFile) return { code: kept.workItemFile === "SHARED" ? "WORK_ITEM_FILE_KEPT" : "WORK_ITEM_FILE_REMOVE_FIRST", level: "block" };
  if (kept.heldByProjectFile) return { code: "PROJECT_FILE_KEPT", level: "block" };
  if (!reason.trim()) return { code: "REASON_REQUIRED", level: "block" };
  return null;
}

/// Whether a version is held by a live project file: an attachment of a project version's purpose (PROJECT_DOCUMENT_FILE, or a supply claim's delivery order or invoice,
/// ADR 0045 D6) that is not detached. A detached pin holds nothing. Keyed on the owner, as trigger PA047 is. The scans of an online award return are kept too, waiting or
/// decided, detached or not (security review L1): one rule for the drawer and the withdraw act. Workspace 3b (B-6, WB-4): a live work item file is kept as well,
/// shared or not, as trigger PA047 keeps it.
export const heldByProjectFile = (attachments: readonly Pin[]): boolean => attachments.some((a) => projectHeld(a) || workItemHeld(a));

type Pin = { purpose: string; detachedAt: Date | null; awardOnlineReturnId: string | null };
const projectHeld = (a: Pin) => a.awardOnlineReturnId != null || (PURPOSE_OWNER[a.purpose as AttachmentPurpose] === "projectDocumentVersion" && a.detachedAt == null);
const workItemHeld = (a: Pin) => PURPOSE_OWNER[a.purpose as AttachmentPurpose] === "workItem" && a.detachedAt == null;

/// Whether a version is kept as a live work item's file, and on which kind of item: "SHARED" if any such item is shared, else "UNSHARED"; null if no live work
/// item pin holds it, or a project file or award return holds it as well (their words come first, since removing it from the item would not free it).
export type WorkItemFileHold = "SHARED" | "UNSHARED" | null;
export function workItemFileHold(attachments: readonly (Pin & { workItem: { sharedAt: Date | null } | null })[]): WorkItemFileHold {
  if (attachments.some(projectHeld)) return null;
  const live = attachments.filter(workItemHeld);
  if (live.length === 0) return null;
  return live.some((a) => a.workItem?.sharedAt != null) ? "SHARED" : "UNSHARED";
}
