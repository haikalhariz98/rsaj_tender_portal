import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/\r\n/g, "\n");

describe("the staff assignee select and a contractor with no portal account (0008 section 5.8)", () => {
  it("the tab asks the loader once and hands the answer to the item panel; the select shows the warn chip only for the contractor", () => {
    const tab = read("work-panel.tsx");
    expect(tab.match(/contractorHasActiveAccount\(db, l\)/g)).toHaveLength(1);
    expect(tab).toContain("noAccount={noAccount}");
    const panel = read("work-item-panel.tsx");
    expect(panel).not.toContain("contractorHasActiveAccount");
    expect(panel).toContain("noAccount={noAccount}");
    const controls = read("work-controls.tsx");
    expect(controls).toContain("noAccount && (picked === CONTRACTOR_ASSIGNEE");
    expect(controls).toContain("No active portal account");
  });

  it("the New item drawer and the list's assignee picker show the same chip, through the shared select pieces (flag on the form select and on the list's select cell)", () => {
    const tab = read("work-panel.tsx");
    expect(tab).toContain("flag: { value: CONTRACTOR_ASSIGNEE, text: \"No active portal account\" }");
    const drawer = read("work-editors.tsx");
    expect(drawer).toContain("noAccount ? { value: CONTRACTOR_ASSIGNEE, text: \"No active portal account\" }");
    const shared = [read("../../../components/record-editor.tsx"), read("../../../components/data-list.tsx")];
    for (const src of shared) expect(src).toMatch(/flag/);
  });
});
