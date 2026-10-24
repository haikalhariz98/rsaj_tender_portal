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

export type WithdrawFault = "ALREADY_WITHDRAWN" | "PROJECT_FILE_KEPT" | "REASON_REQUIRED";

/**
 * Withdrawing a version: once, with a reason. Never refused because a judged record relies on it — that record is told instead (issue refuses, naming the way
 * out). The one exception is a project file (ADR 0042; PW-33): a version held by a live Project workspace attachment (purpose PROJECT_DOCUMENT_FILE, not
 * detached) is kept, and is replaced only by a new version of the project document (PW-7, PW-8). `heldByProjectFile` is that fact, read by the caller under
 * the store document's lock (the pin takes the same lock, so the two serialise). Trigger PA047 is the backstop.
 */
export function withdrawFault(version: Pick<VersionFact, "withdrawnAt">, reason: string, kept: { heldByProjectFile: boolean }): Finding<WithdrawFault> | null {
  if (version.withdrawnAt != null) return { code: "ALREADY_WITHDRAWN", level: "block" };
  if (kept.heldByProjectFile) return { code: "PROJECT_FILE_KEPT", level: "block" };
  if (!reason.trim()) return { code: "REASON_REQUIRED", level: "block" };
  return null;
}

/// Whether a version is held by a live project file: an attachment of a project version's purpose (PROJECT_DOCUMENT_FILE, or a supply claim's delivery order or invoice,
/// ADR 0045 D6) that is not detached. A detached pin holds nothing. Keyed on the owner, as trigger PA047 is.
export const heldByProjectFile = (attachments: readonly { purpose: string; detachedAt: Date | null }[]): boolean => attachments.some((a) => PURPOSE_OWNER[a.purpose as AttachmentPurpose] === "projectDocumentVersion" && a.detachedAt == null);
