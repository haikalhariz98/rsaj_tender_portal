/**
 * Versions are immutable (ADR 0011). A correction is a new version; a withdrawal is
 * recorded once, with a reason; the bytes are never deleted.
 */

import type { Finding, VersionFact } from "./types";

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

export type WithdrawFault = "ALREADY_WITHDRAWN" | "REASON_REQUIRED";

/// Withdrawing a version: once, with a reason. Never refused because something relies
/// on it — a judged record that pinned it is told instead (issue refuses, naming the way out).
export function withdrawFault(version: Pick<VersionFact, "withdrawnAt">, reason: string): Finding<WithdrawFault> | null {
  if (version.withdrawnAt != null) return { code: "ALREADY_WITHDRAWN", level: "block" };
  if (!reason.trim()) return { code: "REASON_REQUIRED", level: "block" };
  return null;
}
