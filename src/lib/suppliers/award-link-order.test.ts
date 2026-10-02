import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Residual 7 (against accepted 6.11): an award gone for approval says it is fixed before any link refusal. */

describe("updateAwardDetails asks whether the award may be edited first (residual 7)", () => {
  it("the editable check comes before the register link's refusal", () => {
    const acts = readFileSync("src/app/awards/actions.ts", "utf8");
    const body = acts.slice(acts.indexOf("export async function updateAwardDetails"), acts.indexOf("export async function updateAwardTerms"));
    const editable = body.indexOf("if (!editable(l.award.status as AwardStatus).details)");
    expect(editable).toBeGreaterThan(0);
    expect(editable).toBeLessThan(body.indexOf("awardVendorOnParty("));
    expect(editable).toBeLessThan(body.indexOf("if (link?.fault)"));
  });
});
