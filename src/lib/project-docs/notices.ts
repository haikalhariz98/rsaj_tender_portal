/**
 * Who the staff inbox tells about the Project workspace (PW-13, ADR 0042 D6): the kind of notice, what it is about, and its recipients. Staff only: the
 * contractor gets no notice and reads its derived "Waiting for you" list (`waitingForContractor`). No overdue notice and no email. The titles and bodies are
 * written by `projectDocumentNotices` in src/lib/inbox/notices.ts, beside the other notice builders. Pure.
 */

import type { StaffNoticeKind } from "@/lib/inbox/kinds";

export type WorkspaceEvent =
  /// A version now waits on its approvers: each live approver who has not decided it, never the person who uploaded it (they may not decide it, PW-6).
  | { event: "VERSION_WAITS_ON_APPROVERS"; versionId: string; approverPersonIds: readonly string[]; uploadedByPersonId: string | null }
  /// The contractor uploaded a document or a version: the S.O. office's holders and those acting in it, on the day.
  | { event: "CONTRACTOR_UPLOADED"; versionId: string; soHolderIds: readonly string[]; soActingIds: readonly string[] }
  /// The contractor asked for a document: the same people.
  | { event: "CONTRACTOR_REQUESTED"; requestId: string; soHolderIds: readonly string[]; soActingIds: readonly string[] };

export interface NoticeTarget {
  kind: Extract<StaffNoticeKind, "PROJECT_DOCUMENT_TO_APPROVE" | "PROJECT_DOCUMENT_FROM_CONTRACTOR" | "PROJECT_DOCUMENT_REQUESTED">;
  subjectEntity: "ProjectDocumentVersion" | "ProjectDocumentRequest";
  /// The version or the request: so Version 2 tells the same people again, though the notice's key (recipient, kind, subject) is unique.
  subjectId: string;
  /// Each person once, in a fixed order.
  recipientPersonIds: string[];
}

const once = (ids: readonly string[], not: string | null = null): string[] => [...new Set(ids)].filter((id) => id !== not).sort();

/// One event's notice. A contractor's upload to a document with approvers raises two events, so an S.O. who is also an approver is told once of each kind.
export function noticeTargets(e: WorkspaceEvent): NoticeTarget {
  switch (e.event) {
    case "VERSION_WAITS_ON_APPROVERS":
      return { kind: "PROJECT_DOCUMENT_TO_APPROVE", subjectEntity: "ProjectDocumentVersion", subjectId: e.versionId, recipientPersonIds: once(e.approverPersonIds, e.uploadedByPersonId) };
    case "CONTRACTOR_UPLOADED":
      return { kind: "PROJECT_DOCUMENT_FROM_CONTRACTOR", subjectEntity: "ProjectDocumentVersion", subjectId: e.versionId, recipientPersonIds: once([...e.soHolderIds, ...e.soActingIds]) };
    case "CONTRACTOR_REQUESTED":
      return { kind: "PROJECT_DOCUMENT_REQUESTED", subjectEntity: "ProjectDocumentRequest", subjectId: e.requestId, recipientPersonIds: once([...e.soHolderIds, ...e.soActingIds]) };
  }
}
