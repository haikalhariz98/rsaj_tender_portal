import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isProjectTab, PROJECT_TABS } from "@/lib/portal/projects/types";

// Workspace 3b-ii step 11 (WS-5): the portal's Defects tab folded into Work as its Defects view; the old address is aliased in the page.
const page = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("the portal's Defects tab folded into Work", () => {
  it("the strip has no Defects tab", () => {
    expect(PROJECT_TABS).not.toContain("defects");
    expect(isProjectTab("defects")).toBe(false);
    expect(page).not.toMatch(/id: "defects"/);
  });
  it("?tab=defects is aliased to Work's Defects view, and only once the CPC is issued", () => {
    expect(page).toContain('asked === "defects" ? "work"');
    expect(page).toMatch(/const defectsView = tab === "work" && completed && \(asked === "defects" \|\| askedView === "defects"\)/);
  });
  it("the view renders DefectsPanel unchanged and loads the items only in the other view", () => {
    expect(page).toContain("<DefectsPanel actor={actor} ctx={ctx} token={token} />");
    expect(page).toMatch(/tab === "work" && !defectsView \? await loadPortalWork/);
  });
});
