/**
 * A Project workspace document's state, and who it waits on (PW-12): the one source of it. Never stored; derived from the latest version, the open request,
 * the live approvers and the decisions. The register, the document page, the portal and the "Waiting for you" list all read it from here. Pure.
 *
 * The order of the rules:
 * 1. An open request wins: it is the newest act (a request is accepted only while the document is Shared, PW-30, or as its first act).
 * 2. No version and no open request cannot happen (a document is created with its first version or its first request, in one transaction). It reads as
 *    asked for, waiting on the document's side, with no request named, so that the side's upload is still accepted and mends it.
 * 3. A document with a kind (PW-9): the mark on its latest version. None yet: Received, waiting on the organisation. Taken up: final. Returned: waiting on the
 *    contractor. Approvers are not read: a document with a kind takes none (trigger PA040, PA043).
 * 4. Otherwise the live approvers and their decisions on the latest version. None live: Shared, waiting on nobody. One rejected: Rejected, waiting on the
 *    document's side for a new version. All approved: Approved, final. Else Waiting for approval, on the organisation. A removed approver's decision never
 *    counts, and nothing decided on an earlier version carries over (PW-6).
 */

import type { ApproverFacts, DecisionFacts, DocumentFacts, RequestFacts, Side, VersionFacts } from "./types";
import { otherSide } from "./types";

export const DOCUMENT_STATES = ["REQUESTED", "WAITING_FOR_APPROVAL", "APPROVED", "REJECTED", "SHARED", "RECEIVED", "TAKEN_UP", "RETURNED"] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];

/// The two states nothing follows: Approved (PW-6, a later change is a new document) and Taken up (PW-9).
export const FINAL_STATES: readonly DocumentState[] = ["APPROVED", "TAKEN_UP"];

export interface DocumentReading {
  state: DocumentState;
  /// The side that must act next. Null: nobody (Shared, or final).
  waitsOn: Side | null;
  /// The live approvers who have not decided the latest version, while it waits for approval. Empty in every other state.
  pendingApproverPersonIds: readonly string[];
  /// Of the pending approvers, those who uploaded the latest version. They may never decide it (PW-6, trigger PA044), so it cannot be approved until another
  /// approver is named and they are removed (PW-25: add first, then remove). Shown so the screen can say so; never left as a silent wait.
  ownVersionApproverPersonIds: readonly string[];
  latest: VersionFacts | null;
  final: boolean;
  openRequest: RequestFacts | null;
}

/// The latest version: the highest number, wherever it sits in the list.
export function latestVersion(d: Pick<DocumentFacts, "versions">): VersionFacts | null {
  let best: VersionFacts | null = null;
  for (const v of d.versions) if (!best || v.number > best.number) best = v;
  return best;
}

/// The number the next version takes: one more than the highest, so 1, 2, 3 with no gap (trigger PA041 refuses any other).
export const nextVersionNumber = (d: Pick<DocumentFacts, "versions">): number => (latestVersion(d)?.number ?? 0) + 1;

export const liveApprovers = (d: Pick<DocumentFacts, "approvers">): ApproverFacts[] => d.approvers.filter((a) => !a.removed);

/// The open request: one no version names. The database holds at most one (trigger PA042); were there more, the first listed is read.
export const openRequestOf = (d: Pick<DocumentFacts, "requests">): RequestFacts | null => d.requests.find((r) => !r.answered) ?? null;

/// Who asked: always the side other than the one asked (trigger PA042).
export const askedBy = (r: Pick<RequestFacts, "toSide">): Side => otherSide(r.toSide);

/// The decisions of live approvers on one version, keyed by the approver's id.
function liveDecisionsOn(d: DocumentFacts, versionId: string): Map<string, DecisionFacts> {
  const live = new Set(liveApprovers(d).map((a) => a.id));
  const out = new Map<string, DecisionFacts>();
  for (const x of d.decisions) if (x.versionId === versionId && x.approverId !== null && live.has(x.approverId)) out.set(x.approverId, x);
  return out;
}

/// The mark on a version of a kind (TAKEN_UP or RETURNED), if any.
export const markOn = (d: Pick<DocumentFacts, "decisions">, versionId: string): DecisionFacts | null =>
  d.decisions.find((x) => x.versionId === versionId && x.approverId === null && (x.outcome === "TAKEN_UP" || x.outcome === "RETURNED")) ?? null;

export function documentState(d: DocumentFacts): DocumentReading {
  const latest = latestVersion(d);
  const openRequest = openRequestOf(d);
  const reading = (state: DocumentState, waitsOn: Side | null, pending: readonly string[] = [], ownVersion: readonly string[] = []): DocumentReading => ({
    state,
    waitsOn,
    pendingApproverPersonIds: pending,
    ownVersionApproverPersonIds: ownVersion,
    latest,
    final: FINAL_STATES.includes(state),
    openRequest,
  });

  if (openRequest) return reading("REQUESTED", openRequest.toSide);
  if (!latest) return reading("REQUESTED", d.side);

  if (d.kind !== null) {
    const mark = markOn(d, latest.id);
    if (!mark) return reading("RECEIVED", "ORGANISATION");
    return mark.outcome === "TAKEN_UP" ? reading("TAKEN_UP", null) : reading("RETURNED", "CONTRACTOR");
  }

  const live = liveApprovers(d);
  if (live.length === 0) return reading("SHARED", null);
  const decided = liveDecisionsOn(d, latest.id);
  if ([...decided.values()].some((x) => x.outcome === "REJECTED")) return reading("REJECTED", d.side);
  const pending = live.filter((a) => decided.get(a.id)?.outcome !== "APPROVED");
  if (pending.length === 0) return reading("APPROVED", null);
  const pendingIds = [...new Set(pending.map((a) => a.personId))];
  const ownVersion = latest.uploaderPersonId !== null && pendingIds.includes(latest.uploaderPersonId) ? [latest.uploaderPersonId] : [];
  return reading("WAITING_FOR_APPROVAL", "ORGANISATION", pendingIds, ownVersion);
}
