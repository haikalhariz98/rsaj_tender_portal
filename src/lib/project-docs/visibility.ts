/**
 * What the contractor sees of a Project workspace document (PW-8 as amended by PW-28; ADR 0042 D3). One pure place: the portal list, the document page, the
 * file route and the supplier's data export all ask here, and never restate it.
 *
 * - A CONTRACTOR document: every version, every decision and every remark. The portal names the organisation, never the officer.
 * - An ORGANISATION document: a version uploaded with no live approver (shared for information at once, and never hidden by an approver added later), and a
 *   version uploaded with approvers only once it is approved. Remarks on the organisation's own versions are staff-only.
 *   - With an earlier shared version and a later one still with its approvers, the contractor sees the shared one only.
 *   - With no version it may see: "Being prepared by {organisation}" only when the contractor asked for the document (PW-28). One it did not ask for is not
 *     listed at all, and its page is a 404.
 * Pure.
 */

import type { SecurityClass } from "@/lib/documents/types";

import { askedBy, documentState, latestVersion } from "./state";
import type { DocumentFacts, VersionFacts } from "./types";

export function contractorSeesVersion(doc: DocumentFacts, v: VersionFacts): boolean {
  if (doc.side === "CONTRACTOR") return true;
  if (v.noApproversAtUpload) return true;
  return latestVersion(doc)?.id === v.id && documentState(doc).state === "APPROVED";
}

/// Remarks reach the contractor only on its own side's documents: those are what it must answer. The organisation's remarks on its own drafts stay inside.
export const contractorSeesRemarks = (doc: Pick<DocumentFacts, "side">): boolean => doc.side === "CONTRACTOR";

/// The contractor asked for this document: a request from the contractor's side, answered or not (a request always comes from the side not asked, PA042).
export const contractorAskedFor = (doc: Pick<DocumentFacts, "requests">): boolean => doc.requests.some((r) => askedBy(r) === "CONTRACTOR");

export type ContractorView = { shown: "VERSIONS"; versionIds: readonly string[] } | { shown: "BEING_PREPARED" } | { shown: "NOT_LISTED" };

/**
 * How the document appears to the contractor (PW-28):
 * - VERSIONS: listed, with the versions it may see, in number order. A contractor document is always listed, even before its first version (it is asked
 *   for, and waits on the contractor).
 * - BEING_PREPARED: an organisation document the contractor asked for, with no version it may see yet: its title and "Being prepared by {organisation}".
 * - NOT_LISTED: an organisation document the contractor did not ask for, with no version it may see. Not in its list, its page a 404, and left out of the
 *   supplier's data export.
 */
export function contractorView(doc: DocumentFacts): ContractorView {
  const seen = [...doc.versions].sort((a, b) => a.number - b.number).filter((v) => contractorSeesVersion(doc, v));
  if (doc.side === "CONTRACTOR" || seen.length > 0) return { shown: "VERSIONS", versionIds: seen.map((v) => v.id) };
  return contractorAskedFor(doc) ? { shown: "BEING_PREPARED" } : { shown: "NOT_LISTED" };
}

/**
 * The document as the contractor may know it (PW-35, audit L1; enforcing PW-28): the one projection every contractor reading is computed on, so nothing the
 * contractor is told, and no gate it is offered, can turn on the organisation's own working.
 * - A CONTRACTOR document is the contractor's own: the facts as they are.
 * - An ORGANISATION document loses its hidden versions, their decisions, and the request answers they carry: a request answered only by a version the
 *   contractor may not see is still open to it, until a version it may see follows (`contractorAnswer`). Its approvers are its own working too: they stay only where the contractor sees the approved version (the
 *   document reads Approved), so the projection's state is the contractor's own, Asked for, Approved or Shared.
 * The acts still judge on the real facts (`faults.ts`); a refusal the projection did not foresee is said in the generic words (`contractorFaultText`).
 */
export function contractorFacts(doc: DocumentFacts): DocumentFacts {
  if (doc.side === "CONTRACTOR") return doc;
  const seen = new Set(doc.versions.filter((v) => contractorSeesVersion(doc, v)).map((v) => v.id));
  const versions = doc.versions.filter((v) => seen.has(v.id));
  const real = documentState(doc);
  const approvedShown = real.state === "APPROVED" && real.latest !== null && seen.has(real.latest.id);
  return {
    side: doc.side,
    kind: doc.kind,
    versions,
    approvers: approvedShown ? doc.approvers : [],
    decisions: doc.decisions.filter((x) => seen.has(x.versionId)),
    requests: doc.requests.map((r) => ({ ...r, answered: contractorAnswer(doc, doc.versions.find((v) => v.requestId === r.id)?.id ?? null) !== null })),
  };
}

/**
 * The version the contractor reads as the answer to a request, given the version that really answered it (`answeredByVersionId`, null while none has): that version
 * where the contractor may see it; otherwise the first version it may see that came after it (an approved later version is what the contractor was given); otherwise
 * none, and the request reads as still open (PW-35, PW-46). Never a hidden version.
 */
export function contractorAnswer(doc: DocumentFacts, answeredByVersionId: string | null): VersionFacts | null {
  if (answeredByVersionId === null) return null;
  const by = doc.versions.find((v) => v.id === answeredByVersionId);
  if (!by) return null;
  const seen = [...doc.versions].filter((v) => contractorSeesVersion(doc, v)).sort((a, b) => a.number - b.number);
  return seen.find((v) => v.number >= by.number) ?? null;
}

/// A contractor may open the document at all: listed, as versions or as being prepared.
export const contractorMayOpen = (doc: DocumentFacts): boolean => contractorView(doc).shown !== "NOT_LISTED";

/// A contractor's download (PW-14, D7): the version is visible to it, and neither the document's classification nor its class's is SULIT or unset. Both
/// are read now, at the download, so a class raised to SULIT after the upload is refused.
export function contractorMayDownload(i: { versionVisible: boolean; documentClassification: SecurityClass | null; classClassification: SecurityClass | null }): boolean {
  const open = (c: SecurityClass | null) => c !== null && c !== "SULIT";
  return i.versionVisible && open(i.documentClassification) && open(i.classClassification);
}

/// "Waiting for you" (PW-13): the document waits on the contractor. That is an open request to it, or its own document rejected or returned; an organisation
/// document never waits on the contractor.
export const waitingForContractor = (doc: DocumentFacts): boolean => documentState(doc).waitsOn === "CONTRACTOR";
