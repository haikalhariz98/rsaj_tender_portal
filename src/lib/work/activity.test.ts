import { describe, expect, it } from "vitest";

import { activityFeed, type ActivityAuditRow, type ActivityComment } from "./activity";

/** Activity (WS-18, W-11): comments and audit rows in time order, no grouping, Comments keeps the conversation, and no column key or code reaches a line. */

const KL = "Asia/Kuala_Lumpur";
const at = (min: number) => new Date(Date.UTC(2026, 10, 5, 2, min));
const comments: ActivityComment[] = [
  { id: "c1", body: "Checking with our engineer.", personName: "Aisyah", at: at(10) },
  { id: "c2", body: "Designer says 150 governs.", personName: null, at: at(30) },
];
const rows: ActivityAuditRow[] = [
  { id: "a3", entity: "WorkItem", action: "UPDATE", changes: [{ field: "status", before: "TO_DO", after: "IN_PROGRESS" }], actorName: "Aisyah", at: at(20) },
  { id: "a1", entity: "WorkItem", action: "CREATE", changes: [{ field: "title", before: null, after: "Rebar" }], actorName: "Hafiz", at: at(0) },
  {
    id: "a2",
    entity: "WorkItem",
    action: "UPDATE",
    changes: [
      { field: "assigneePersonId", before: null, after: "p-aisyah" },
      { field: "priority", before: "NORMAL", after: "URGENT" },
      { field: "updatedAt", before: "2026-11-04", after: "2026-11-05" },
    ],
    actorName: "Hafiz",
    at: at(5),
  },
  { id: "a4", entity: "WorkItem", action: "UPDATE", changes: [{ field: "dueOn", before: "2026-11-10", after: "2026-11-12" }, { field: "answer", before: "", after: "150 c/c" }], actorName: null, at: at(40) },
  { id: "a5", entity: "WorkItemLink", action: "CREATE", changes: [{ field: "toWorkItemId", before: null, after: "w2" }], actorName: "Hafiz", at: at(50) },
  { id: "a6", entity: "WorkItem", action: "UPDATE", changes: [{ field: "updatedAt", before: "x", after: "y" }], actorName: "Hafiz", at: at(55) },
  { id: "a7", entity: "WorkItemLink", action: "DELETE", changes: [], actorName: "Hafiz", at: at(56) },
  { id: "a8", entity: "DocumentAttachment", action: "CREATE", changes: [], actorName: "Hafiz", at: at(57) },
];
const names = new Map([["p-aisyah", "Aisyah"]]);

describe("activityFeed", () => {
  it("All: every comment and every audit row with something to say, oldest first, one line each", () => {
    expect(activityFeed(comments, rows, KL, names).map((l) => [l.id, l.who, l.kind === "COMMENT" ? l.body : l.text])).toEqual([
      ["a1", "Hafiz", "raised this"],
      ["a2", "Hafiz", "Assignee: none → Aisyah; Priority: Normal → Urgent"],
      ["c1", "Aisyah", "Checking with our engineer."],
      ["a3", "Aisyah", "Status: To do → In progress"],
      ["c2", "Someone", "Designer says 150 governs."],
      ["a4", "Someone", "Due: 10 Nov 2026 → 12 Nov 2026; Answer added"],
      ["a5", "Hafiz", "added a link"],
      ["a7", "Hafiz", "removed a link"],
      ["a8", "Hafiz", "added a file"],
    ]);
  });

  it("marks each line a comment or a change, for the component's All / Comments filter", () => {
    expect(activityFeed(comments, rows, KL).filter((l) => l.kind === "COMMENT").map((l) => l.id)).toEqual(["c1", "c2"]);
  });

  it("an instant reads as the organisation's day and clock; with no zone it is marked, never a bare UTC value", () => {
    const happened = (after: string): ActivityAuditRow => ({ ...rows[2], changes: [{ field: "happenedAt", before: null, after }] });
    expect(activityFeed([], [happened("2026-11-04T23:00:00.000Z")], KL)[0]).toMatchObject({ text: "Happened: none → 05 Nov 2026 · 07:00" });
    const [none] = activityFeed([], [happened("2026-11-04T23:00:00.000Z")], null);
    expect(none.kind === "CHANGE" && none.text).toMatch(/^Happened: none → 04 Nov 2026 · 23:00 \(.+\)$/);
    // a due day is a plain day in either case
    expect(activityFeed([], [{ ...rows[2], changes: [{ field: "dueOn", before: null, after: "2026-11-10" }] }], null)[0]).toMatchObject({ text: "Due: none → 10 Nov 2026" });
  });

  it("no line carries a column key or an enum code", () => {
    const text = activityFeed(comments, rows, KL, names).map((l) => (l.kind === "CHANGE" ? l.text : "")).join(" ");
    expect(text).not.toMatch(/\b(assigneePersonId|updatedAt|dueOn|IN_PROGRESS|TO_DO|URGENT|NORMAL|toWorkItemId)\b/);
  });

  it("a person or document no longer known is said so, not shown as an id", () => {
    const [line] = activityFeed([], [{ ...rows[2], changes: [{ field: "assigneePersonId", before: "p-gone", after: null }] }], KL, names);
    expect(line).toMatchObject({ text: "Assignee: someone no longer listed → none" });
  });

  it("long text is said to change, never quoted", () => {
    const [line] = activityFeed([], [{ ...rows[2], changes: [{ field: "description", before: "a", after: "b" }, { field: "answer", before: "a", after: null }] }], KL);
    expect(line).toMatchObject({ text: "Description changed; Answer cleared" });
  });

  it("a tie in time is broken by id, so the order is stable", () => {
    const same = at(0);
    expect(activityFeed([{ id: "b", body: "x", personName: "A", at: same }], [{ ...rows[1], id: "a", at: same }], KL).map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("a link line says what was linked", () => {
  it("names the other end from the audit diff", () => {
    const link = (action: "CREATE" | "DELETE", changes: ActivityAuditRow["changes"]): ActivityAuditRow => ({ id: "l", entity: "WorkItemLink", action, changes, actorName: "Hafiz", at: at(1) });
    expect(activityFeed([], [link("CREATE", [{ field: "linkedTo", before: null, after: "RFI 12 · Slab" }])], KL)[0]).toMatchObject({ text: "added a link to RFI 12 · Slab" });
    expect(activityFeed([], [link("DELETE", [{ field: "linkedTo", before: "RFI 12 · Slab", after: null }])], KL)[0]).toMatchObject({ text: "removed a link to RFI 12 · Slab" });
  });
});
