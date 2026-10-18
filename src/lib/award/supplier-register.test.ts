import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// 6.15a (flagged against accepted 6.11, new test only): a cancellation recommending blacklisting
// offers the request on the supplier's record (FR-AWD-009), and the award shows its register link (OD-9).
describe("the award and the supplier register", () => {
  // C-2 (wave C step C5): the award page's composition moved to award-view.tsx, shared with the case page.
  const page = readFileSync("src/app/projects/[id]/award/award-view.tsx", "utf8");
  const standing = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");

  it("no longer says blacklisting waits for the register", () => {
    expect(page).not.toMatch(/waits for the supplier register/);
  });

  it("a cancelled award recommending blacklisting links to the request, pre-filled with the award", () => {
    expect(page).toMatch(/award\.cancelConsequence === "CANCEL_AND_BLACKLIST"/);
    expect(page).toMatch(/\/suppliers\/\$\{award\.vendor\.id\}\?tab=standing&fromAward=\$\{award\.id\}/);
    expect(standing).toMatch(/cancelledForBlacklisting: award\?\.status === "CANCELLED" && award\.cancelConsequence === "CANCEL_AND_BLACKLIST"/);
  });

  it("shows the award's link to the register, or says it is not linked", () => {
    // C-3: OverviewPanel moved out of the award page (wave C step C4).
    expect(readFileSync("src/app/projects/[id]/award/overview-panel.tsx", "utf8")).toMatch(/label: "On the supplier register"/);
  });
});
