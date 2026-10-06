import { describe, expect, it } from "vitest";

import { autoCheck, budgetCheckRefusal, CHECKABLE } from "./auto-check";
import type { RequisitionStatus } from "./types";

const TODAY = "2026-10-06";
const ALL: RequisitionStatus[] = [
  "DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL",
  "RECALLED", "REJECTED", "APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED", "CANCELLED",
];

describe("budgetCheckRefusal", () => {
  it("lets a check run in each checkable status with a code and a time zone", () => {
    for (const s of CHECKABLE) expect(budgetCheckRefusal(s, "b1", TODAY)).toBeNull();
  });

  it("refuses every status that is not checkable", () => {
    for (const s of ALL.filter((x) => !CHECKABLE.includes(x))) expect(budgetCheckRefusal(s, "b1", TODAY)).toEqual({ code: "NOT_CHECKABLE" });
  });

  it("says what to do about a missing budget code, by status", () => {
    expect(budgetCheckRefusal("ENDORSED", null, TODAY)).toEqual({ code: "NO_BUDGET_CODE", missing: "RETURN_TO_ADD" });
    expect(budgetCheckRefusal("BUDGET_CHECKED", "  ", TODAY)).toEqual({ code: "NO_BUDGET_CODE", missing: "RAISE_AGAIN" });
  });

  it("refuses without a time zone, after the status and the code", () => {
    expect(budgetCheckRefusal("ENDORSED", "b1", null)).toEqual({ code: "TIME_ZONE_UNSET" });
    expect(budgetCheckRefusal("DRAFT", "b1", null)).toEqual({ code: "NOT_CHECKABLE" });
    expect(budgetCheckRefusal("ENDORSED", null, null)).toEqual({ code: "NO_BUDGET_CODE", missing: "RETURN_TO_ADD" });
  });
});

describe("autoCheck (founder, 2026-10-06: the budget is checked on endorsement and on a funding change)", () => {
  it("runs on the portal ledger in every checkable status", () => {
    for (const s of CHECKABLE) expect(autoCheck("PORTAL_LEDGER", s, "b1", TODAY)).toEqual({ run: true });
  });

  it("never runs in a status that is not checkable, including a draft and one awaiting approval", () => {
    for (const s of ALL.filter((x) => !CHECKABLE.includes(x))) {
      expect(autoCheck("PORTAL_LEDGER", s, "b1", TODAY)).toEqual({ run: false, reason: { code: "NOT_CHECKABLE" } });
    }
  });

  it("leaves typed figures to the Check budget button", () => {
    expect(autoCheck("MANUAL_ERP_ENTRY", "ENDORSED", "b1", TODAY)).toEqual({ run: false, reason: { code: "TYPED_FIGURES_NEEDED" } });
  });

  it("does not run with no source set", () => {
    expect(autoCheck(null, "ENDORSED", "b1", TODAY)).toEqual({ run: false, reason: { code: "SOURCE_NOT_SET" } });
  });

  it("does not run without a budget code or a time zone", () => {
    expect(autoCheck("PORTAL_LEDGER", "ENDORSED", null, TODAY)).toEqual({ run: false, reason: { code: "NO_BUDGET_CODE", missing: "RETURN_TO_ADD" } });
    expect(autoCheck("PORTAL_LEDGER", "ENDORSED", "", TODAY).run).toBe(false);
    expect(autoCheck("PORTAL_LEDGER", "ENDORSED", "b1", null)).toEqual({ run: false, reason: { code: "TIME_ZONE_UNSET" } });
  });
});
