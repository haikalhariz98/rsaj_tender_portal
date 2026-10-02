import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// 6.15a (flagged against accepted 6.11, new test only): a cancellation recommending blacklisting
// offers the request on the supplier's record (FR-AWD-009), and the award shows its register link (OD-9).
describe("the award and the supplier register", () => {
  const page = readFileSync("src/app/awards/[id]/page.tsx", "utf8");
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
    expect(page).toMatch(/label: "On the supplier register"/);
  });
});
