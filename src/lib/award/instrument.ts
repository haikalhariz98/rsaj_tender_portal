/**
 * Which instrument awards an exercise, and whether the awarded value may be awarded
 * (spec §6.11, 6.11 rulings on the instrument and on the awarded value).
 *
 * The instrument follows the exercise's regime as its snapshot recorded it — with the
 * boundary operator it was determined under — and the customer's policy for that
 * regime, shipped unset: an unset regime refuses, never assumes. The awarded value is
 * re-judged at award: the requisition's live awards together may not exceed the value
 * approved on it; a value in another regime, or one another appointment rule would
 * approve, is refused until the exercise is reclassified; above the estimate within the
 * approval warns, and the difference is not posted to the budget ledger (INT-05).
 */

import type { Regime } from "@/lib/authority/types";
import { addSen, formatMoney, type Sen } from "@/lib/money";

import type { AwardPolicy, Finding, InstrumentKind } from "./types";

export type InstrumentFault = "INSTRUMENT_NOT_SET" | "NO_AWARD_IN_REGIME" | "REGIME_NOT_DETERMINED";

export function instrumentFor(regime: Regime | string | null, policy: Pick<AwardPolicy, "tenderInstrument" | "quotationInstrument">): { kind: InstrumentKind } | { fault: InstrumentFault; regime: string | null } {
  if (!regime) return { fault: "REGIME_NOT_DETERMINED", regime: null };
  if (regime === "below") return { fault: "NO_AWARD_IN_REGIME", regime };
  const kind = regime === "tender" ? policy.tenderInstrument : policy.quotationInstrument;
  return kind ? { kind } : { fault: "INSTRUMENT_NOT_SET", regime };
}

/**
 * The instrument an award was opened with, against the one the policy names now. A
 * change of policy never re-reads an open award: its text, its return and its checks
 * follow what it was opened as, and it is refused until cancelled and opened again.
 */
export function instrumentChange(stored: InstrumentKind, now: { kind: InstrumentKind } | { fault: InstrumentFault }): Finding<"INSTRUMENT_CHANGED">[] {
  if (!("kind" in now) || now.kind === stored) return [];
  return [{ code: "INSTRUMENT_CHANGED", level: "block", data: { opened: stored, now: now.kind } }];
}

export type ValueFault = "NO_APPROVED_ROUTE" | "EXCEEDS_APPROVED_VALUE" | "VALUE_OUTSIDE_EXERCISE_REGIME" | "APPOINTMENT_BAND_CHANGED" | "ABOVE_ESTIMATE" | "VALUE_NOT_POSITIVE";

export interface ValueInput {
  value: Sen;
  /// The exercise's estimate, and its regime and appointment rule as snapshotted.
  estimate: Sen;
  exerciseRegime: string | null;
  exerciseRuleKey: string | null;
  exerciseRuleLabel: string | null;
  /// The same, judged now for the awarded value under the issue in force.
  freshRegime: string | null;
  freshRuleKey: string | null;
  freshRuleLabel: string | null;
  /// The value approved on the requisition's route; null where none is approved.
  approvedValue: Sen | null;
  /// Every other non-cancelled award on the requisition's exercises.
  otherAwards: readonly Sen[];
}

export function awardValueFaults(i: ValueInput): Finding<ValueFault>[] {
  const out: Finding<ValueFault>[] = [];
  if (i.value <= 0n) return [{ code: "VALUE_NOT_POSITIVE", level: "block" }];
  if (i.approvedValue == null) out.push({ code: "NO_APPROVED_ROUTE", level: "block" });
  else {
    const together = addSen(i.value, ...i.otherAwards);
    if (together > i.approvedValue) {
      out.push({ code: "EXCEEDS_APPROVED_VALUE", level: "block", data: { approved: formatMoney(i.approvedValue), together: formatMoney(together), others: i.otherAwards.length } });
    }
  }
  if (i.freshRegime !== i.exerciseRegime) out.push({ code: "VALUE_OUTSIDE_EXERCISE_REGIME", level: "block", data: { exercise: i.exerciseRegime, fresh: i.freshRegime } });
  else if ((i.freshRuleKey ?? null) !== (i.exerciseRuleKey ?? null)) {
    out.push({ code: "APPOINTMENT_BAND_CHANGED", level: "block", data: { exercise: i.exerciseRuleLabel, fresh: i.freshRuleLabel } });
  }
  if (i.value > i.estimate) out.push({ code: "ABOVE_ESTIMATE", level: "warn", data: { estimate: formatMoney(i.estimate), difference: formatMoney(i.value - i.estimate) } });
  return out;
}

/// How much more may be awarded on the requisition: its approved value less its other
/// live awards. Null where nothing is approved; never below nothing.
export function awardHeadroom(approvedValue: Sen | null, otherAwards: readonly Sen[]): Sen | null {
  if (approvedValue == null) return null;
  const left = approvedValue - addSen(0n, ...otherAwards);
  return left > 0n ? left : 0n;
}
