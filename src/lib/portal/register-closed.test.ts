import { describe, expect, it } from "vitest";

import { APPLY, NOT_SET_UP, RESULTS, bidStep, takePartSteps } from "./labels";

describe("what the public sees while the register is closed", () => {
  const shown = [APPLY.closedTitle.en, APPLY.closedBody(null).en, APPLY.closedBody("help@example.org or 03-0000").en, NOT_SET_UP.body.en, RESULTS.notSetUp.body.en, APPLY.notOpenOnSubmit.en, ...takePartSteps(false).map((s) => s.text.en)].join(" ");

  it("names no item of the missing list", () => {
    for (const m of Object.values(APPLY.missing)) expect(shown).not.toContain(m.en);
    expect(shown).not.toMatch(/not set up|still to be set up/i);
  });
  it("says who to ask", () => {
    expect(APPLY.closedBody("help@example.org").en).toBe("Contact help@example.org.");
    expect(APPLY.closedBody(null).en).toBe("Contact the procurement office.");
  });
  it("sends nobody to apply while closed", () => expect(takePartSteps(false)[0].text.en).not.toMatch(/apply/i));
  it("follows the configured bid channel, and leaves the step out while unset", () => {
    expect(bidStep("PAPER")?.title.en).toBe("Submit your bid on paper");
    expect(bidStep("ONLINE")?.title.en).toBe("Submit your bid online");
    expect(bidStep(null)).toBeNull();
  });
});
