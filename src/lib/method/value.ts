/**
 * An exercise's value against its requisition's approval (FR-MTD-001, ruling R-16).
 *
 * The requisition's approval covered its value and nothing more: live exercises on it
 * may not together exceed the value approved on its route. The fault names the exits.
 * Sibling exercises that split across a regime warn and show the combined value (B7).
 * The requisition band an exercise shows is the rule on the approved route; where the
 * exercise's own value would have gone to a different requisition band, that warns.
 */

import { regimeFor } from "@/lib/authority/resolve";
import type { Policy } from "@/lib/authority/types";
import { addSen, formatMoney as formatSen, type Sen } from "@/lib/money";

import { bandingNumber } from "./bands";
import type { ExerciseStatus, Finding } from "./types";

export type ValueFault = "NO_APPROVED_ROUTE" | "EXCEEDS_APPROVED_VALUE" | "SPLIT_ACROSS_REGIME" | "REQUISITION_BAND_CHANGED" | "REQUISITION_BAND_NOT_CHECKED";

export interface ApprovedRoute {
  value: Sen;
  /// Null on a route received from outside, which the engine never routed.
  ruleKey: string | null;
  ruleLabel: string | null;
  checkedAgainstMatrix: boolean;
}

export function exerciseValueFaults(
  approved: ApprovedRoute | null,
  siblings: readonly { id: string; value: Sen; status: ExerciseStatus }[],
  draft: { id: string | null; value: Sen; requisitionRuleKey: string | null; requisitionRuleLabel: string | null },
  policy: Policy,
): Finding<ValueFault>[] {
  if (!approved) return [{ code: "NO_APPROVED_ROUTE", level: "block" }];
  const out: Finding<ValueFault>[] = [];
  const live = siblings.filter((s) => s.id !== draft.id && s.status !== "CANCELLED");
  const combined = addSen(draft.value, ...live.map((s) => s.value));
  if (combined > approved.value) {
    out.push({
      code: "EXCEEDS_APPROVED_VALUE",
      level: "block",
      data: { approved: formatSen(approved.value), combined: formatSen(combined), others: live.length },
    });
  }
  if (live.length > 0) {
    const own = regimeFor(bandingNumber(draft.value), policy);
    const together = regimeFor(bandingNumber(combined), policy);
    if (own !== together) out.push({ code: "SPLIT_ACROSS_REGIME", level: "warn", data: { combined: formatSen(combined), own, together } });
  }
  if (!approved.checkedAgainstMatrix || !approved.ruleKey) {
    out.push({ code: "REQUISITION_BAND_NOT_CHECKED", level: "info" });
  } else if (draft.requisitionRuleKey && draft.requisitionRuleKey !== approved.ruleKey) {
    out.push({ code: "REQUISITION_BAND_CHANGED", level: "warn", data: { approvedRule: approved.ruleLabel, ownRule: draft.requisitionRuleLabel } });
  }
  return out;
}

/// The approved value not yet held by a live exercise, excluding one exercise (being
/// edited). Null where there is no approved route.
export function remainingOf(approved: ApprovedRoute | null, exercises: readonly { id: string; value: Sen; status: ExerciseStatus }[], except: string | null = null): Sen | null {
  if (!approved) return null;
  return approved.value - addSen(...exercises.filter((x) => x.id !== except && x.status !== "CANCELLED").map((x) => x.value));
}
