import { describe, expect, it } from "vitest";

import type { Matrix } from "@/lib/authority/types";

import { AWARD_MATRIX } from "./fixture";
import { resolveSignatory, resolveSignatoryFor } from "./signatory";

/**
 * 6.12 OD-4 A (flagged against 6.11, new tests only): the contract agreement's signatory is resolved by the
 * same resolver on `award_signatory`, by the customer's condition for the contract agreement. A fixture
 * condition, never seeded.
 */

const AGREEMENT = "TEST_CONTRACT_AGREEMENT";
const withAgreementRow: Matrix = {
  ...AWARD_MATRIX,
  rules: [...AWARD_MATRIX.rules, { ...AWARD_MATRIX.rules.find((r) => r.ruleKey === "SIG_LOA_3M")!, ruleKey: "SIG_CA", cond: AGREEMENT, minValue: 0, maxValue: null, approverCode: "CEO", followsBoundarySwitch: false }],
};

describe("the one signatory resolver, by condition (6.12 OD-4 A)", () => {
  it("the award's instrument kinds read exactly as before", () => {
    for (const value of [500_000, 2_100_000, 5_000_000]) {
      expect(resolveSignatoryFor(AWARD_MATRIX, { cond: "LETTER_OF_ACCEPTANCE", value })).toEqual(resolveSignatory(AWARD_MATRIX, { kind: "LETTER_OF_ACCEPTANCE", value }));
    }
  });
  it("the contract agreement's condition resolves its own row", () => {
    const s = resolveSignatoryFor(withAgreementRow, { cond: AGREEMENT, value: 2_700_000 });
    expect(s.ok && [s.roleCode, s.ruleKey]).toEqual(["CEO", "SIG_CA"]);
  });
  it("no row on that condition refuses, never borrowing the instrument's row", () => {
    const s = resolveSignatoryFor(AWARD_MATRIX, { cond: AGREEMENT, value: 2_700_000 });
    expect(s.ok ? s.ruleKey : s.fault).not.toBe("SIG_LOA_3M");
    expect(s.ok).toBe(false);
  });
});
