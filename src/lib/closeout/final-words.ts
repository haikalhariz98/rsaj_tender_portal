/**
 * The final account's words (Phase 2 close-out stage C). A code never reaches a screen. English only. Pure.
 */

import type { FinalBasis, FinalLineKind, KeyedFinalKind } from "./types";

export const FINAL_LINE_WORDS: Readonly<Record<FinalLineKind, string>> = {
  PREVIOUS_INTERIM: "Previous interim payments",
  RETENTION_RELEASED_MAIN: "Retention released: main contractor",
  RETENTION_RELEASED_NSC: "Retention released: nominated sub-contractors",
  RETENTION_RELEASED_NS: "Retention released: nominated suppliers",
  ADVANCE_REPAID_MAIN: "Advance repaid: main contractor",
  ADVANCE_REPAID_NSC: "Advance repaid: nominated sub-contractors",
  LAD: "Liquidated damages",
  LAD_WAIVED: "Liquidated damages waived",
  LAD_CREDIT: "Damages returned on extension of time",
  LAD_ROUNDING: "Liquidated damages: rounding",
  PREMIUMS_PERKESO: "Insurance premiums and PERKESO paid by the employer",
  WAGES: "Workers' wages paid by the employer",
  NON_COMPLIANCE: "Cost of non-compliance",
  MAKING_GOOD_COST: "Cost of making good defects",
  DIMINUTION: "Diminution in value",
  OTHER: "Other deduction",
};

/// The keyed deductions, for the Select (rounding last).
export const KEYED_FINAL_OPTIONS: readonly { value: KeyedFinalKind; label: string }[] = (["PREMIUMS_PERKESO", "WAGES", "NON_COMPLIANCE", "MAKING_GOOD_COST", "DIMINUTION", "OTHER", "LAD_ROUNDING"] as const).map((value) => ({ value, label: FINAL_LINE_WORDS[value] }));

export const FINAL_BASIS_WORDS: Readonly<Record<FinalBasis, string>> = { BEFORE_DEDUCTIONS: "Before their deductions", AS_PAID: "As paid" };
