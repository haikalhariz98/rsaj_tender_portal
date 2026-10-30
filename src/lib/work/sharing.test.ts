import { describe, expect, it } from "vitest";

import { parseNewItem } from "./fields";
import type { WhoNames } from "./labels";
import { CONTRACTOR, person } from "./party";
import { assignWouldShare, assigneePatch, shareDefault, sharedOnCreate, shareFaults, sharePatch } from "./sharing";
import { WORK_ITEM_TYPES, type WorkActor, type WorkItemFacts, type WorkItemType } from "./types";

/** Sharing (3b B-1, WB-2; ADR 0049 D1): stored, one-way, never read from the type; assigning to the contractor shares in the same UPDATE. */

const NOW = new Date("2026-11-05T02:00:00.000Z");
const SHARED = "2026-11-01T02:00:00.000Z";
const who: WhoNames = { raiser: "Hafiz", assignee: "Aisyah", lead: { roleLabel: "S.O.", names: ["Nurul"] } };
const as = (personId: string): WorkActor => ({ side: "STAFF", personId, leadIds: ["nurul"], mayReadContract: true });
const item = (o: Partial<WorkItemFacts> = {}): WorkItemFacts => ({ id: "w1", type: "RFI", number: 1, status: "IN_PROGRESS", raisedBy: person("hafiz"), assignee: person("aisyah"), sharedAt: null, dueOn: "2026-11-10", answer: "", inspectionResult: null, ...o });

describe("shareDefault: the New item drawer's preset (B-1, WB-2)", () => {
  it("by type, with nobody or a person assigned", () => {
    const want: Record<WorkItemType, boolean> = { RFI: true, SITE_INSTRUCTION: true, INSPECTION: true, SAFETY_INCIDENT: false, ACTION: false, DEFECT: true, TASK: false };
    for (const t of WORK_ITEM_TYPES) {
      expect(shareDefault(t, null), t).toBe(want[t]);
      expect(shareDefault(t, person("aisyah")), t).toBe(want[t]);
    }
  });
  it("an Action (and any type) is on once its assignee is the contractor", () => {
    for (const t of WORK_ITEM_TYPES) expect(shareDefault(t, CONTRACTOR), t).toBe(true);
  });
});

describe("sharedOnCreate", () => {
  const form = (o: Record<string, string>) => new Map(Object.entries(o));
  it("the toggle on, or the contractor assigned, shares", () => {
    expect([sharedOnCreate({ share: false, assignedToContractor: false }), sharedOnCreate({ share: true, assignedToContractor: false }), sharedOnCreate({ share: false, assignedToContractor: true })]).toEqual([false, true, true]);
  });
  it("the drawer's toggle and the contractor assignee parse from the form", () => {
    const n = parseNewItem(form({ type: "ACTION", title: "Chase drawings", share: "on", assigneePersonId: "contractor" }), null)!;
    expect([n.share, n.assignedToContractor, n.assigneePersonId, sharedOnCreate(n)]).toEqual([true, true, null, true]);
  });
  it("the quick-add row posts a type and a title only, so it never shares", () => {
    const n = parseNewItem(form({ type: "TASK", title: "Book a survey" }), null)!;
    expect([n.share, n.assignedToContractor, sharedOnCreate(n)]).toEqual([false, false, false]);
  });
});

describe("shareFaults: the Share act, and unsharing", () => {
  it("unsharing a shared item is refused; 'not shared' on an unshared one asks nothing", () => {
    expect(shareFaults(item({ sharedAt: SHARED }), as("hafiz"), false, who)).toEqual([{ code: "SHARE_IS_ONE_WAY" }]);
    expect(shareFaults(item(), as("hafiz"), false, who)).toEqual([]);
  });
  it("the raiser, the assignee or the lead shares an open item; anyone else is told who can", () => {
    for (const p of ["hafiz", "aisyah", "nurul"]) expect(shareFaults(item(), as(p), true, who), p).toEqual([]);
    expect(shareFaults(item(), as("other"), true, who)).toEqual([{ code: "NOT_EDITABLE", whoCan: { en: "Aisyah, the assignee, Hafiz, who raised it, or the S.O. (Nurul) can edit this." } }]);
  });
  it("a closed item is reopened first", () => {
    expect(shareFaults(item({ status: "DONE" }), as("hafiz"), true, who)).toEqual([{ code: "CLOSED_ITEM" }]);
  });
  it("the contractor never shares", () => {
    expect(shareFaults(item({ sharedAt: SHARED, assignee: CONTRACTOR }), { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true }, true, who)[0].code).toBe("NOT_EDITABLE");
  });
});

describe("the writes the store follows", () => {
  it("sharing writes now once; on a shared item it is a no-op, never a new instant (PA055)", () => {
    expect(sharePatch(null, NOW)).toEqual({ sharedAt: NOW });
    expect(sharePatch(SHARED, NOW)).toBeNull();
  });
  it("assigning to the contractor is one UPDATE: the flag, no person, and sharedAt if unset", () => {
    expect(assigneePatch(null, { field: "assignedToContractor", value: true }, NOW)).toEqual({ assigneePersonId: null, assignedToContractor: true, sharedAt: NOW });
    expect(assigneePatch(SHARED, { field: "assignedToContractor", value: true }, NOW)).toEqual({ assigneePersonId: null, assignedToContractor: true });
  });
  it("assigning a person, or nobody, clears the contractor and never touches sharedAt (one-way)", () => {
    expect(assigneePatch(SHARED, { field: "assigneePersonId", value: "aisyah" }, NOW)).toEqual({ assigneePersonId: "aisyah", assignedToContractor: false });
    expect(assigneePatch(SHARED, { field: "assigneePersonId", value: null }, NOW)).toEqual({ assigneePersonId: null, assignedToContractor: false });
  });
  it("only assigning an unshared item to the contractor asks the Share confirm (WB-2)", () => {
    expect(assignWouldShare(null, { field: "assignedToContractor", value: true })).toBe(true);
    expect(assignWouldShare(SHARED, { field: "assignedToContractor", value: true })).toBe(false);
    expect(assignWouldShare(null, { field: "assigneePersonId", value: "aisyah" })).toBe(false);
  });
});
