import { describe, expect, it } from "vitest";

import { workItemHref, workNoticeDrafts, type NoticeItem } from "./notices";
import type { WorkNoticeEvent, WorkNoticeKind } from "./types";

/** The four staff notices (WS-17, W-10; 0008 §4.8): to the people each kind names, never the actor, never the inactive; the body names the item only. */

const item: NoticeItem = { id: "w12", type: "RFI", number: 12, title: "Rebar spacing at grid C4", contractId: "c-1", contractNumber: "C-2026-014" };
const ACTIVE = new Set(["hafiz", "aisyah", "nurul"]);
const ev = (kind: WorkNoticeKind, o: Partial<WorkNoticeEvent> = {}): WorkNoticeEvent => ({ kind, actorId: "nurul", raisedBy: "hafiz", assignee: "aisyah", occurrence: "audit-1", activeIds: ACTIVE, ...o });
const to = (e: WorkNoticeEvent) => workNoticeDrafts(e, item).map((d) => d.recipientPersonId);

describe("who is told", () => {
  it("Assigned: the new assignee; Waiting to check: the raiser; Sent back: the assignee; Comment: raiser and assignee", () => {
    expect(to(ev("WORK_ITEM_ASSIGNED"))).toEqual(["aisyah"]);
    expect(to(ev("WORK_ITEM_TO_CHECK"))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_RETURNED"))).toEqual(["aisyah"]);
    expect(to(ev("WORK_ITEM_COMMENT"))).toEqual(["aisyah", "hafiz"]);
  });

  it("never the person who acted: assigning yourself tells nobody; a comment tells the other party only", () => {
    expect(to(ev("WORK_ITEM_ASSIGNED", { actorId: "aisyah" }))).toEqual([]);
    expect(to(ev("WORK_ITEM_COMMENT", { actorId: "hafiz" }))).toEqual(["aisyah"]);
    expect(to(ev("WORK_ITEM_COMMENT", { actorId: "aisyah" }))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_TO_CHECK", { actorId: "hafiz", assignee: "hafiz" }))).toEqual([]);
  });

  it("never an inactive person", () => {
    expect(to(ev("WORK_ITEM_COMMENT", { activeIds: new Set(["hafiz"]) }))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_ASSIGNED", { activeIds: new Set() }))).toEqual([]);
  });

  it("one notice per recipient per comment, even when the raiser is the assignee", () => {
    expect(to(ev("WORK_ITEM_COMMENT", { assignee: "hafiz" }))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_COMMENT", { assignee: null }))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_RETURNED", { assignee: null }))).toEqual([]);
  });

  it("each comment is its own occurrence; a retry of the same act is the same key", () => {
    const a = workNoticeDrafts(ev("WORK_ITEM_COMMENT", { occurrence: "comment-1" }), item);
    const b = workNoticeDrafts(ev("WORK_ITEM_COMMENT", { occurrence: "comment-2" }), item);
    expect(a.map((d) => d.occurrence)).toEqual(["comment-1", "comment-1"]);
    expect(b.map((d) => d.occurrence)).toEqual(["comment-2", "comment-2"]);
  });
});

describe("what a notice says", () => {
  it("the reference, the title and the contract's number, and it opens the item on the Work tab", () => {
    expect(workNoticeDrafts(ev("WORK_ITEM_TO_CHECK"), item)).toEqual([
      {
        recipientPersonId: "hafiz",
        kind: "WORK_ITEM_TO_CHECK",
        subjectEntity: "WorkItem",
        subjectId: "w12",
        occurrence: "audit-1",
        exerciseId: null,
        title: "Waiting for you to check: RFI 12",
        body: "RFI 12 · Rebar spacing at grid C4 · Contract C-2026-014",
        href: "/projects/c-1?tab=work&item=RFI-12",
      },
    ]);
  });

  it("titles by kind, with no code", () => {
    const titles = (["WORK_ITEM_ASSIGNED", "WORK_ITEM_TO_CHECK", "WORK_ITEM_RETURNED", "WORK_ITEM_COMMENT"] as const).map((k) => workNoticeDrafts(ev(k, { actorId: "x" }), item)[0].title);
    expect(titles).toEqual(["Assigned to you: RFI 12", "Waiting for you to check: RFI 12", "Sent back to you: RFI 12", "New comment: RFI 12"]);
  });

  it("the address is the case's, with the item in its address form", () => {
    expect(workItemHref({ contractId: "c 1", type: "SITE_INSTRUCTION", number: 3 })).toBe("/projects/c%201?tab=work&item=SI-3");
  });
});
