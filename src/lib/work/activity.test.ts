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

describe("WSEC-3 and WSEC-9: addresses read as type and number; closing an RFI says the answer was accepted", () => {
  const link = (changes: ActivityAuditRow["changes"]): ActivityAuditRow => ({ id: "l", entity: "WorkItemLink", action: "CREATE", changes, actorName: "Hafiz", at: at(1) });
  it("the audit holds the address form (RFI-12, Incident-3); the line shows the type word and the number", () => {
    expect(activityFeed([], [link([{ field: "linkedTo", before: null, after: "RFI-12 · Slab" }])], KL)[0]).toMatchObject({ text: "added a link to RFI 12 · Slab" });
    expect(activityFeed([], [link([{ field: "linkedTo", before: null, after: "Incident-3 · Fall from height" }])], KL)[0]).toMatchObject({ text: "added a link to Incident 3 · Fall from height" });
    // A document's title is left alone.
    expect(activityFeed([], [link([{ field: "linkedTo", before: null, after: "Layout-2 plan" }])], KL)[0]).toMatchObject({ text: "added a link to Layout-2 plan" });
  });
  it("the accepted answer is a line of its own that quotes nothing", () => {
    const row: ActivityAuditRow = { id: "m", entity: "WorkItem", action: "UPDATE", changes: [{ field: "status", before: "IN_PROGRESS", after: "DONE" }, { field: "answerAccepted", before: null, after: "Use 20 mm bars." }], actorName: "Hafiz", at: at(1) };
    const text = activityFeed([], [row], KL)[0];
    expect(text).toMatchObject({ kind: "CHANGE", text: "Status: In progress → Done; Answer accepted" });
    expect(JSON.stringify(text)).not.toContain("20 mm");
  });
});

describe("3b step 3: sharing, the company as assignee, a removed file, a comment's audience", () => {
  const withContractor = new Map([["p-hafiz", "Hafiz"], ["contractor", "Acme Builders Sdn Bhd"]]);
  const row = (id: string, entity: string, action: ActivityAuditRow["action"], changes: ActivityAuditRow["changes"]): ActivityAuditRow => ({ id, entity, action, changes, actorName: "Aisyah", at: at(1) });

  it("a person to the contractor is ONE Assignee line naming the company, with the share beside it; never a column key", () => {
    const lines = activityFeed([], [row("a1", "WorkItem", "UPDATE", [{ field: "assigneePersonId", before: "p-hafiz", after: "contractor" }, { field: "sharedAt", before: null, after: "2026-11-05T02:01:00.000Z" }])], KL, withContractor);
    expect(lines).toHaveLength(1);
    const text = lines[0].kind === "CHANGE" ? lines[0].text : "";
    expect(text).toBe("Assignee: Hafiz → Acme Builders Sdn Bhd; Shared: none → 05 Nov 2026 · 10:01");
    expect(text).not.toMatch(/assignee[A-Z]|sharedAt|assignedToContractor|contractor →/);
  });

  it("the company back to a person is one line too", () => {
    const lines = activityFeed([], [row("a1", "WorkItem", "UPDATE", [{ field: "assigneePersonId", before: "contractor", after: "p-hafiz" }])], KL, withContractor);
    expect(lines.map((l) => (l.kind === "CHANGE" ? l.text : ""))).toEqual(["Assignee: Acme Builders Sdn Bhd → Hafiz"]);
  });

  it("a removed file reads as a line; a comment carries its audience (absent reads as internal, the safe side)", () => {
    const lines = activityFeed(
      [{ id: "c1", body: "Reply", personName: "Acme Builders Sdn Bhd", at: at(2), internal: false }, { id: "c2", body: "Note", personName: "Aisyah", at: at(3) }],
      [row("a1", "DocumentAttachment", "UPDATE", [{ field: "attached", before: "yes", after: "no" }])],
      KL,
    );
    expect(lines.map((l) => [l.id, l.kind === "COMMENT" ? l.internal : l.text])).toEqual([["a1", "removed a file"], ["c1", false], ["c2", true]]);
  });
});
