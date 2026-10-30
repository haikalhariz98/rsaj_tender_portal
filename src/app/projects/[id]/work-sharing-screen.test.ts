import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SHARED_BY_DEFAULT } from "@/lib/work/sharing";

import { shareConfirmWords } from "./work-shared";

const src = (f: string) => readFileSync(join(process.cwd(), "src/app/projects/[id]", f), "utf8").replace(/\r\n/g, "\n");

describe("sharing with the contractor: the staff screens (workspace 3b step 5; WB-2, WB-7)", () => {
  it("the confirm says what happens and that it cannot be undone", () => {
    const w = shareConfirmWords("Acme Builders");
    expect(w.question).toBe("Share with Acme Builders?");
    expect(w.words).toBe("Acme Builders will see this item, its replies and files added from now. This can't be undone.");
  });

  it("every path that shares or assigns to the contractor asks the confirm first", () => {
    const editors = src("work-editors.tsx");
    const controls = src("work-controls.tsx");
    // New item: the save waits on the dialog's answer before it posts.
    expect(editors).toMatch(/await new Promise<boolean>[\s\S]*?if \(!yes\) return/);
    expect(editors.indexOf("if (!yes) return")).toBeLessThan(editors.indexOf("await createWorkItem(next)"));
    // The panel's Share posts only from the confirm's onConfirm.
    expect(editors).toMatch(/<ShareConfirm contractor=\{share\.contractor\} onConfirm=\{doShare\}/);
    expect(editors.match(/shareWorkItem\(data\)/g)).toHaveLength(1);
    // The assignee picker holds the contractor pick until Share is pressed.
    expect(controls).toMatch(/if \(next === CONTRACTOR_ASSIGNEE\) setAsking\(next\)/);
    expect(controls).toMatch(/<ShareConfirm[\s\S]*?post\(asking\)/);
  });

  it("the quick-add row never shares", () => {
    const quick = src("work-editors.tsx").split("export function QuickAdd")[1];
    expect(quick).not.toMatch(/share/i);
  });

  it("New item presets the toggle by type: on for the shared-by-default types, off for the rest", () => {
    const editors = src("work-editors.tsx");
    expect(editors).toContain("SHARED_BY_DEFAULT");
    expect(editors).toMatch(/shareOn: own\(\.\.\.sharedTypes\)/);
    expect(editors).toMatch(/values=\{\{ contractId, shareOn: true \}\}/);
    expect(SHARED_BY_DEFAULT).toContain("RFI");
    expect(SHARED_BY_DEFAULT).not.toContain("TASK");
  });

  it("the item panel offers the Reply | Internal switch only on a shared item, and the list's picker never offers the contractor on a row that lacks it", () => {
    expect(src("work-item-panel.tsx")).toContain("audiences={shared ? AUDIENCES : undefined}");
    expect(src("work-item-panel.tsx")).toMatch(/AUDIENCES[\s\S]*?value: "REPLY"[\s\S]*?value: "INTERNAL"/);
    expect(src("work-panel.tsx")).toMatch(/o\.value !== CONTRACTOR_ASSIGNEE \|\| r\.assignee\?\.kind === "CONTRACTOR"/);
  });

  it("Remove file is offered only on an unshared item, and says why when it is not this reader's", () => {
    const panel = src("work-item-panel.tsx");
    expect(panel).toMatch(/ctx\.open && !shared && !f\.withdrawnAt/);
    expect(panel).toContain("removeFileFaults(");
    expect(panel).toContain("removeFileWords(");
    expect(panel).toContain("Seen by " + "$" + "{contractor}");
    expect(panel).toContain('"Staff only"');
  });

  it("the Project team card says when there is no project manager, and names the lead where the reader may not change the team", () => {
    const card = src("project-team-card.tsx");
    expect(card).toContain('title="No project manager"');
    expect(card).toContain("teamFaultText({ code: \"NOT_LEAD\" }, leadWords)");
    expect(card).toContain("<Blocked");
    expect(card).toContain("m.roleLabel");
    expect(src("page.tsx")).toContain("<ProjectTeamCard");
  });
});
