import { describe, expect, it } from "vitest";

import { STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";
import { projectDocumentNotices } from "@/lib/inbox/notices";

import { noticeTargets } from "./notices";
import { documentState } from "./state";
import { story } from "./story.fixture";

/** Who is told (PW-13): exactly the approvers, or the S.O. office's holders and acting holders, each once. */

describe("noticeTargets", () => {
  it("a version waiting on its approvers tells each pending approver once, never its uploader", () => {
    expect(noticeTargets({ event: "VERSION_WAITS_ON_APPROVERS", versionId: "v2", approverPersonIds: ["b", "a", "b", "so"], uploadedByPersonId: "so" })).toEqual({
      kind: "PROJECT_DOCUMENT_TO_APPROVE",
      subjectEntity: "ProjectDocumentVersion",
      subjectId: "v2",
      recipientPersonIds: ["a", "b"],
    });
  });

  it("the contractor's upload and request tell the S.O. holders and acting holders, each once", () => {
    expect(noticeTargets({ event: "CONTRACTOR_UPLOADED", versionId: "v1", soHolderIds: ["h", "x"], soActingIds: ["x", "act"] })).toEqual({
      kind: "PROJECT_DOCUMENT_FROM_CONTRACTOR",
      subjectEntity: "ProjectDocumentVersion",
      subjectId: "v1",
      recipientPersonIds: ["act", "h", "x"],
    });
    expect(noticeTargets({ event: "CONTRACTOR_REQUESTED", requestId: "r1", soHolderIds: ["h"], soActingIds: [] })).toEqual({
      kind: "PROJECT_DOCUMENT_REQUESTED",
      subjectEntity: "ProjectDocumentRequest",
      subjectId: "r1",
      recipientPersonIds: ["h"],
    });
  });

  it("an S.O. who is also an approver is told once of each kind when the contractor uploads to a document with approvers", () => {
    const s = story("CONTRACTOR");
    s.addApprover("h");
    s.addApprover("e");
    const v = s.upload();
    const pending = documentState(s.doc).pendingApproverPersonIds;
    const told = [
      noticeTargets({ event: "VERSION_WAITS_ON_APPROVERS", versionId: v, approverPersonIds: pending, uploadedByPersonId: null }),
      noticeTargets({ event: "CONTRACTOR_UPLOADED", versionId: v, soHolderIds: ["h"], soActingIds: ["h"] }),
    ];
    const pairs = told.flatMap((t) => t.recipientPersonIds.map((p) => `${t.kind}:${p}`));
    expect(pairs.sort()).toEqual(["PROJECT_DOCUMENT_FROM_CONTRACTOR:h", "PROJECT_DOCUMENT_TO_APPROVE:e", "PROJECT_DOCUMENT_TO_APPROVE:h"]);
  });

  it("Version 2 is another subject, so the approver is told again", () => {
    const one = noticeTargets({ event: "VERSION_WAITS_ON_APPROVERS", versionId: "v1", approverPersonIds: ["e"], uploadedByPersonId: null });
    const two = noticeTargets({ event: "VERSION_WAITS_ON_APPROVERS", versionId: "v2", approverPersonIds: ["e"], uploadedByPersonId: null });
    expect(one.subjectId).not.toBe(two.subjectId);
    expect(one.recipientPersonIds).toEqual(two.recipientPersonIds);
  });

  it("every kind it gives is one of the closed list, and the inbox builder writes exactly its recipients", () => {
    for (const t of [
      noticeTargets({ event: "VERSION_WAITS_ON_APPROVERS", versionId: "v", approverPersonIds: ["e"], uploadedByPersonId: null }),
      noticeTargets({ event: "CONTRACTOR_UPLOADED", versionId: "v", soHolderIds: ["h"], soActingIds: [] }),
      noticeTargets({ event: "CONTRACTOR_REQUESTED", requestId: "r", soHolderIds: ["h"], soActingIds: [] }),
    ]) {
      expect(STAFF_NOTICE_KINDS).toContain(t.kind);
      const drafts = projectDocumentNotices({ target: t, by: null, contractLabel: "CON/1", documentTitle: "Drainage layout", contractorName: "A Contractor", versionLabel: "Version 1", exerciseId: null, href: "/projects/c/documents/d" });
      expect(drafts.map((d) => [d.kind, d.subjectEntity, d.subjectId, d.recipientPersonId])).toEqual(t.recipientPersonIds.map((p) => [t.kind, t.subjectEntity, t.subjectId, p]));
    }
  });
});
