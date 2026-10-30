import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LATE_NOT_JUDGED_WORDS, READ_ONLY_WORDS, type WhoNames } from "@/lib/work/labels";
import type { WorkActor, WorkItemFacts } from "@/lib/work/types";

import { closedWords, editWhy, QUICK_TYPES, TYPE_OPTIONS } from "./work-shared";

const DIR = "src/app/projects/[id]";
const src = (f: string) => readFileSync(join(process.cwd(), DIR, f), "utf8");

const item: WorkItemFacts = { id: "i1", type: "TASK", number: 1, status: "TO_DO", raisedBy: { kind: "PERSON", id: "p-raiser" }, assignee: null, sharedAt: null, dueOn: null, answer: "", inspectionResult: null };
const who: WhoNames = { raiser: "Hafiz", assignee: null, lead: { roleLabel: "S.O.", names: ["Nurul"] } };
const as = (personId: string, leadIds: string[] = []): WorkActor => ({ side: "STAFF", personId, leadIds, mayReadContract: true });

describe("the Work tab's states (WS-19, W-2, 0008 §5.8)", () => {
  it("a terminated or closed contract is read only, in the one set of words", () => {
    for (const s of ["TERMINATED", "CLOSED"] as const) expect(closedWords(s)).toBe(READ_ONLY_WORDS.en);
  });
  it("a contract not yet executed says what it waits for, never 'Closed'", () => {
    const words = closedWords("IN_PREPARATION");
    expect(words).not.toBe("");
    expect(words).not.toBe(READ_ONLY_WORDS.en);
  });
  it("an open contract has nothing to say", () => {
    expect(closedWords("ACTIVE")).toBe("");
  });
  it("the Late view with no time zone says what is missing, and the panel renders those words", () => {
    expect(LATE_NOT_JUDGED_WORDS.en).toBe("Needs the organisation's time zone.");
    expect(src("work-panel.tsx")).toMatch(/q\.view === "late" && ctx\.today === null/);
    expect(src("work-panel.tsx")).toContain("LATE_NOT_JUDGED_WORDS.en");
  });
  it("a field the reader may not change says who can; the raiser and the lead can; a closed item must be reopened", () => {
    const open = { open: true, contractStatus: "ACTIVE" as const };
    expect(editWhy(open, item, as("p-raiser"), who)).toBeUndefined();
    expect(editWhy(open, item, as("p-lead", ["p-lead"]), who)).toBeUndefined();
    expect(editWhy(open, item, as("p-other"), who)).toMatch(/Hafiz, who raised it, or the S\.O\. \(Nurul\) can edit this\./);
    expect(editWhy(open, { ...item, status: "DONE" }, as("p-raiser"), who)).toBe("Reopen it first.");
    expect(editWhy({ open: false, contractStatus: "CLOSED" }, item, as("p-raiser"), who)).toBe(READ_ONLY_WORDS.en);
  });
  it("the quick-add row offers only types that need nothing but a title", () => {
    expect(QUICK_TYPES.map((t) => t.value)).toEqual(["INSPECTION", "ACTION", "DEFECT", "TASK"].sort((a, b) => TYPE_OPTIONS.findIndex((t) => t.value === a) - TYPE_OPTIONS.findIndex((t) => t.value === b)));
  });
});

describe("the Work tab uses the shared pieces (AGENTS.md)", () => {
  const files = ["work-panel.tsx", "work-item-panel.tsx", "work-editors.tsx", "work-controls.tsx"].map(src).join("\n");
  it("no retired prototype class, no private tab strip or list", () => {
    // check-ui.mjs holds the retired class list; this only guards that no Work file writes one of the prototype's shapes.
    expect(files).not.toMatch(/className="[^"]*(page[h]ead|tab[b]ar|card__[h]ead|b[t]n|badge-[-])/);
    expect(files).toMatch(/<DataList/);
    expect(files).toMatch(/<Board/);
    expect(files).toMatch(/<SidePanel/);
    expect(files).toMatch(/<Composer/);
    expect(files).toMatch(/<Activity/);
  });
  it("the item opens with scroll kept, so the list does not jump", () => {
    expect(src("work-panel.tsx")).toMatch(/scroll: false/);
    expect(files).toMatch(/router\.push\([^)]*scroll: false/);
  });
  it("no status or type code is drawn as it is stored", () => {
    expect(files).not.toMatch(/>\s*\{\s*[cr]\.(status|type)\s*\}/);
  });
});
