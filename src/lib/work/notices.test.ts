import { describe, expect, it } from "vitest";

import { STAFF_NOTICE_KIND_LABEL, STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";

import { NOTICE_TITLE_WORDS } from "./labels";
import { workItemHref, workNoticeDrafts, type NoticeItem } from "./notices";
import { CONTRACTOR, person } from "./party";
import type { WorkNoticeEvent, WorkNoticeKind } from "./types";

/** The four staff notices (WS-17, W-10; 0008 §4.8): to the people each kind names, never the actor, never the inactive; the body names the item only. */

const item: NoticeItem = { id: "w12", type: "RFI", number: 12, title: "Rebar spacing at grid C4", contractId: "c-1", contractNumber: "C-2026-014" };
const ACTIVE = new Set(["hafiz", "aisyah", "nurul"]);
const ev = (kind: WorkNoticeKind, o: Partial<WorkNoticeEvent> = {}): WorkNoticeEvent => ({ kind, actorId: "nurul", raisedBy: person("hafiz"), assignee: person("aisyah"), leadIds: [], occurrence: "audit-1", activeIds: ACTIVE, ...o });
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
    expect(to(ev("WORK_ITEM_TO_CHECK", { actorId: "hafiz", assignee: person("hafiz") }))).toEqual([]);
  });

  it("never an inactive person", () => {
    expect(to(ev("WORK_ITEM_COMMENT", { activeIds: new Set(["hafiz"]) }))).toEqual(["hafiz"]);
    expect(to(ev("WORK_ITEM_ASSIGNED", { activeIds: new Set() }))).toEqual([]);
  });

  it("one notice per recipient per comment, even when the raiser is the assignee", () => {
    expect(to(ev("WORK_ITEM_COMMENT", { assignee: person("hafiz") }))).toEqual(["hafiz"]);
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

describe("the kinds are the inbox's own (step 1)", () => {
  it("each work kind is a staff notice kind, named in the inbox with the words the notice's title uses", () => {
    for (const [k, words] of Object.entries(NOTICE_TITLE_WORDS) as [WorkNoticeKind, (typeof NOTICE_TITLE_WORDS)[WorkNoticeKind]][]) {
      expect(STAFF_NOTICE_KINDS, k).toContain(k);
      expect(STAFF_NOTICE_KIND_LABEL[k], k).toEqual(words);
    }
  });
});

describe("3b: the contractor in notices (B-16, B-17; WS-17, PW-13)", () => {
  const LEAD = ["nurul"];
  const all = new Set(["hafiz", "aisyah", "nurul", "ca", "ca2"]);

  it("the contractor is never told: a contractor assignee names nobody", () => {
    expect(to(ev("WORK_ITEM_ASSIGNED", { assignee: CONTRACTOR }))).toEqual([]);
    expect(to(ev("WORK_ITEM_RETURNED", { assignee: CONTRACTOR }))).toEqual([]);
    expect(to(ev("WORK_ITEM_COMMENT", { assignee: CONTRACTOR }))).toEqual(["hafiz"]);
  });

  it("From the contractor on a reply: the staff raiser and the staff assignee; the actor is null", () => {
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { actorId: null }))).toEqual(["aisyah", "hafiz"]);
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { actorId: null, assignee: CONTRACTOR, leadIds: LEAD, activeIds: all }))).toEqual(["hafiz"]);
  });

  it("on an item the contractor raised, the lead is told on every kind (WS-17)", () => {
    const raised = { raisedBy: CONTRACTOR, leadIds: LEAD, activeIds: all };
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { ...raised, actorId: null }))).toEqual(["aisyah", "nurul"]);
    expect(to(ev("WORK_ITEM_TO_CHECK", { ...raised, actorId: "aisyah" }))).toEqual(["nurul"]); // Send for checking goes to the lead
    expect(to(ev("WORK_ITEM_COMMENT", { ...raised, actorId: "aisyah" }))).toEqual(["nurul"]);
    expect(to(ev("WORK_ITEM_ASSIGNED", { ...raised, actorId: "nurul" }))).toEqual(["aisyah"]); // the lead acted: not told
    expect(to(ev("WORK_ITEM_RETURNED", { ...raised, actorId: null }))).toEqual(["aisyah", "nurul"]); // Ask again
  });

  it("a raise with no single default assignee tells the role's holders, or the lead when the role is empty (WB-8)", () => {
    const raise = { raisedBy: CONTRACTOR, assignee: null, actorId: null, activeIds: all };
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { ...raise, roleHolders: ["ca", "ca2"], leadIds: [] }))).toEqual(["ca", "ca2"]);
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { ...raise, roleHolders: [], leadIds: LEAD }))).toEqual(["nurul"]);
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { ...raise, roleHolders: [], leadIds: [] }))).toEqual([]);
    // One holder: assigned, and told as the assignee.
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { ...raise, assignee: person("ca"), leadIds: [] }))).toEqual(["ca"]);
  });

  it("never someone inactive, even the lead", () => {
    expect(to(ev("WORK_ITEM_FROM_CONTRACTOR", { raisedBy: CONTRACTOR, assignee: null, actorId: null, leadIds: ["gone"], activeIds: all }))).toEqual([]);
  });

  it("the body names the item and the contract only, never the contractor (B-5)", () => {
    const [d] = workNoticeDrafts(ev("WORK_ITEM_FROM_CONTRACTOR", { actorId: null }), item);
    expect(d.title).toBe("From the contractor: RFI 12");
    expect(d.body).toBe("RFI 12 · Rebar spacing at grid C4 · Contract C-2026-014");
  });
});

