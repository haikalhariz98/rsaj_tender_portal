import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activityFeed } from "./activity";
import { linkedPanelActions } from "./defect-link";
import { contractorSeesWords, defectListSeesWords, LINKED_DRAFT_WORDS } from "./labels";
import { myWorkGroup } from "./my-work";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\r\n/g, "\n");
const KL = "Asia/Kuala_Lumpur";

describe("workspace 3b-ii security rulings (pure)", () => {
  it("WRS-1: the words say what the contractor reads, and the three places carry the marker", () => {
    expect(defectListSeesWords("Acme")).toBe("Acme will see the title, description, location and due day on the defect list.");
    expect(contractorSeesWords("Acme")).toBe("Acme will see this.");
    expect(src("src/app/projects/[id]/closeout-editors.tsx")).toContain('{ kind: "note", text: defectListSeesWords(contractor) }');
    const editors = src("src/app/projects/[id]/work-editors.tsx");
    expect(editors).toContain("hint: contractorSeesWords(contractor), info: defectListSeesWords(contractor)");
    expect(editors.split("export function QuickAdd")[1]).toContain("contractorSeesWords(contractor)");
    expect(src("src/app/projects/[id]/work-item-panel.tsx")).toMatch(/c\.linked && !shared && \([\s\S]*?contractorSeesWords\(contractor\)/);
  });

  it("WRS-3: a reader the line's who-may refuses is offered no defect move; the panel reads it from the one rule", () => {
    expect(linkedPanelActions("IN_PROGRESS", true, "STAFF", false, true).primary).not.toBeNull();
    expect(linkedPanelActions("IN_PROGRESS", true, "STAFF", false, false)).toEqual({ primary: null, menu: [] });
    expect(linkedPanelActions("IN_REVIEW", true, "STAFF", false, false)).toEqual({ primary: null, menu: [] });
    const panel = src("src/app/projects/[id]/work-item-panel.tsx");
    expect(panel).toContain("mayActOnDefectLines(l, db, personId, ctx.today)");
    expect(panel).toContain("linkedMoveWords(null)");
  });

  it("WRS-3: a linked In-review item raised by me is not 'to check' when I may not accept it", () => {
    const item = { status: "IN_REVIEW" as const, raisedBy: { kind: "PERSON" as const, id: "p1" }, assignee: null, dueOn: null };
    expect(myWorkGroup(item, { personId: "p1" }, "2026-01-01")).toBe("TO_CHECK");
    expect(myWorkGroup({ ...item, cannotAccept: true }, { personId: "p1" }, "2026-01-01")).toBeNull();
    expect(myWorkGroup({ ...item, cannotAccept: true, assignee: { kind: "PERSON", id: "p1" } }, { personId: "p1" }, "2026-01-01")).toBe("NO_DATE");
  });

  it("WRS-8: an unlink with a reason reads as the removal and its why", () => {
    const row = { id: "a", entity: "WorkItem", action: "UPDATE" as const, changes: [{ field: "defectItemId", before: "x", after: null }], actorName: "S.O.", at: new Date(), reason: "the certificate was voided" };
    expect(activityFeed([], [row], KL).map((l) => (l.kind === "CHANGE" ? l.text : ""))).toEqual(["Removed from the defect list: the certificate was voided."]);
  });

  it("C2: the draft-line words name practical completion", () => {
    expect(LINKED_DRAFT_WORDS).toBe("Moves once practical completion is certified.");
  });
});
