/**
 * Unfixed materials and goods on site (6.13 Part A step 3: FR-PAY-005, 007; §8.3; the 75% ruling).
 *
 * A line is valued only where all three answers are yes (adequately protected, not delivered too early, forms part
 * of the completed works) and it is not formwork or other temporary works; the answers are recorded per line and a
 * line that fails one is shown, not valued. The allowance is a percentage of the eligible value: the contract's own
 * figure where its baseline states one (B8), else the organisation's default (PostAwardPolicy), as read when the
 * certificate is raised. The product ships neither: unset is NOT_SET and refuses the materials line, never 0%.
 * Pure.
 */

import type { Sen } from "@/lib/money";
import { pctOfSen } from "@/lib/securities/money";

import type { Day, Finding } from "./types";

export interface MaterialLine {
  value: Sen;
  /// The three answers (null: not answered) and the temporary-works flag.
  protectedOnSite: boolean | null;
  notTooEarly: boolean | null;
  formsPartOfWorks: boolean | null;
  temporary: boolean;
  /// The day the contractor's list carrying it was submitted (FR-PAY-005 cut-off).
  submittedOn: Day;
}

export type MaterialVerdict = "ELIGIBLE" | "NOT_ANSWERED" | "NOT_PROTECTED" | "TOO_EARLY" | "NOT_PART_OF_WORKS" | "TEMPORARY";

/// Why a line is (or is not) valued. The first reason that excludes it.
export function materialVerdict(m: MaterialLine): MaterialVerdict {
  if (m.temporary) return "TEMPORARY";
  if (m.protectedOnSite == null || m.notTooEarly == null || m.formsPartOfWorks == null) return "NOT_ANSWERED";
  if (!m.protectedOnSite) return "NOT_PROTECTED";
  if (!m.notTooEarly) return "TOO_EARLY";
  if (!m.formsPartOfWorks) return "NOT_PART_OF_WORKS";
  return "ELIGIBLE";
}

export type MaterialsPct = { state: "SET"; pct: string; source: "CONTRACT" | "POLICY" } | { state: "NOT_SET" };

/// The percentage the allowance takes: the contract's own (baseline), else the organisation's default.
export function materialsPct(baselinePct: string | null, policyPct: string | null): MaterialsPct {
  if (baselinePct != null) return { state: "SET", pct: baselinePct, source: "CONTRACT" };
  if (policyPct != null) return { state: "SET", pct: policyPct, source: "POLICY" };
  return { state: "NOT_SET" };
}

export interface MaterialsResult {
  eligibleValue: Sen;
  /// Null: lines are eligible and the percentage is not set (refused, never 0%).
  allowance: Sen | null;
  faults: Finding[];
}

/// The allowance: the percentage of the eligible lines' value, half up to the sen. No eligible line: nothing.
export function materialsAllowance(lines: readonly MaterialLine[], pct: MaterialsPct): MaterialsResult {
  const eligibleValue = lines.filter((m) => materialVerdict(m) === "ELIGIBLE").reduce((a, m) => a + m.value, 0n);
  if (eligibleValue === 0n) return { eligibleValue, allowance: 0n, faults: [] };
  if (pct.state === "NOT_SET") return { eligibleValue, allowance: null, faults: [{ code: "MATERIALS_PCT_NOT_SET", level: "block" }] };
  return { eligibleValue, allowance: pctOfSen(eligibleValue, pct.pct), faults: [] };
}

/// FR-PAY-005: a submission after the valuation day goes to the next cycle (the cut-off is hard; the day itself is in).
export const afterCutOff = (submittedOn: Day, valuationDate: Day): boolean => submittedOn > valuationDate;
