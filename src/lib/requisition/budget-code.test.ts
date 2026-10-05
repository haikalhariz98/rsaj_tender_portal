import { describe, expect, it } from "vitest";

import { MISSING_BUDGET_CODE_TEXT, missingBudgetCode } from "./budget-code";

describe("a requisition past Draft without a budget code (founder, 2026-10-05)", () => {
  it("sends an endorsed one back to draft to add it", () => {
    expect(missingBudgetCode("ENDORSED", null)).toBe("RETURN_TO_ADD");
    expect(MISSING_BUDGET_CODE_TEXT.RETURN_TO_ADD).toMatch(/Return it to draft/);
  });

  it("asks one past endorsement to be raised again, since it cannot be edited", () => {
    for (const s of ["REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"] as const) expect(missingBudgetCode(s, null)).toBe("RAISE_AGAIN");
    expect(missingBudgetCode("BUDGET_CHECKED", "  ")).toBe("RAISE_AGAIN");
  });

  it("says nothing when the code is there, for a draft (the field rule speaks), or after submission", () => {
    expect(missingBudgetCode("BUDGET_CHECKED", "b1")).toBeNull();
    expect(missingBudgetCode("DRAFT", null)).toBeNull();
    expect(missingBudgetCode("PENDING_APPROVAL", null)).toBeNull();
    expect(missingBudgetCode("APPROVED", null)).toBeNull();
  });
});
