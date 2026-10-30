import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/\r\n/g, "\n");

describe("the staff assignee select and a contractor with no portal account (0008 section 5.8)", () => {
  it("the item panel asks the loader and the select shows the warn chip only for the contractor", () => {
    const panel = read("work-item-panel.tsx");
    expect(panel).toContain("contractorHasActiveAccount(db, l)");
    expect(panel).toContain("noAccount={noAccount}");
    const controls = read("work-controls.tsx");
    expect(controls).toContain("noAccount && (picked === CONTRACTOR_ASSIGNEE");
    expect(controls).toContain("No active portal account");
  });
});
