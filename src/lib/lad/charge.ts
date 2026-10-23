/**
 * Liquidated damages on an interim certificate (6.13 Part A step 3: FR-LAD-001, 002, 007, 008; §8.6; OD-A1 A).
 *
 * A certificate whose valuation day is past the date for completion of its pinned baseline needs the non-completion
 * decision first: none recorded refuses it ("record the non-completion decision"), never issued silently without
 * damages. The decision either applies damages (a Certificate of Non-Completion, which must be issued before any
 * damages line exists, FR-LAD-007) or records the delay as excusable or its entitlement pending (the certificate
 * proceeds without a damages line, the reasons shown on it).
 *
 * The rate and the date for completion are those frozen on the non-completion decision and its Certificate of
 * Non-Completion (BD-613-48, FREEZE), never the baseline read today: an interim certificate never charges a rate the
 * issued certificate does not state. A decision applying damages with no rate refuses (RATE_NOT_SET); where the
 * baseline has since been revised, the certificate warns that the CNC's rate applies until a new decision and CNC are
 * recorded (`frozenRateWarnings`). Damages accrue over the window entered with the decision (FR-LAD-008, ASSUMED: from the first day
 * after the date for completion to actual completion, shown as such): `from` is the first day charged, `until` the
 * first day not charged (the day of completion; null while it runs). Each certificate charges the window's days not
 * charged before, up to and including its valuation day. Amount = rate × days − waived (Part B's waiver; none
 * here), with the signed rounding kept apart. Pure: sen as bigint, days as integers.
 */

import { dayPlus, daysFrom } from "@/lib/dates";
import type { Sen } from "@/lib/money";
import type { Day, Finding, NonCompletionOutcome } from "@/lib/payment/types";

export interface Decision {
  outcome: NonCompletionOutcome;
  /// The reasons, in words (shown on the certificate where the delay is excused or pending).
  reason: string;
  /// The Certificate of Non-Completion is issued (LAD_APPLIES only).
  certificateIssued: boolean;
  /// The accrual window: first day charged, and the first day not charged (null: still running).
  from: Day | null;
  until: Day | null;
  /// The rate the decision charges at, as recorded with it (and printed on its CNC). Null: not recorded.
  rate: Sen | null;
  /// The date for completion as recorded with the decision (BD-613-48). Absent: read from the baseline.
  dateForCompletion?: Day | null;
}

export type LadLine =
  | { state: "NOT_DUE" }
  | { state: "DECISION_REQUIRED"; dateForCompletion: Day }
  | { state: "CNC_NOT_ISSUED" }
  | { state: "RATE_NOT_SET" }
  | { state: "EXCUSED"; reason: string }
  | { state: "NOTHING_TO_CHARGE"; chargedUntil: Day | null }
  | { state: "CHARGED"; rate: Sen; from: Day; to: Day; until: Day; days: number; gross: Sen; waived: Sen; amount: Sen };

export interface LadInput {
  dateForCompletion: Day | null;
  valuationDate: Day;
  /// The decision in force (the latest recorded); null: none.
  decision: Decision | null;
  /// The first day not yet charged on an earlier issued certificate (exclusive end of what was charged). Null: none charged.
  chargedUntil: Day | null;
  /// Waived (Part B); zero in Part A.
  waived?: Sen;
}

export function ladLine(i: LadInput): LadLine {
  // A decision freezes the date for completion it was taken on (BD-613-48).
  const due = i.decision?.dateForCompletion ?? i.dateForCompletion;
  if (!due || i.valuationDate <= due) return { state: "NOT_DUE" };
  const d = i.decision;
  if (!d) return { state: "DECISION_REQUIRED", dateForCompletion: due };
  if (d.outcome === "EXCUSED_OR_PENDING") return { state: "EXCUSED", reason: d.reason };
  if (!d.certificateIssued) return { state: "CNC_NOT_ISSUED" };
  if (d.rate == null) return { state: "RATE_NOT_SET" };
  if (!d.from) return { state: "NOTHING_TO_CHARGE", chargedUntil: i.chargedUntil };
  const start = i.chargedUntil && i.chargedUntil > d.from ? i.chargedUntil : d.from;
  const throughValuation = dayPlus(i.valuationDate, 1);
  const end = d.until && d.until < throughValuation ? d.until : throughValuation;
  const days = end > start ? daysFrom(start, end) : 0;
  if (days <= 0) return { state: "NOTHING_TO_CHARGE", chargedUntil: i.chargedUntil };
  const gross = d.rate * BigInt(days);
  const waived = i.waived ?? 0n;
  return { state: "CHARGED", rate: d.rate, from: start, to: dayPlus(end, -1), until: end, days, gross, waived, amount: gross - waived };
}

/// Why a certificate cannot be raised on its damages (empty: it may).
export function ladFaults(l: LadLine): Finding[] {
  switch (l.state) {
    case "DECISION_REQUIRED":
      return [{ code: "NON_COMPLETION_DECISION_REQUIRED", level: "block", data: { day: l.dateForCompletion } }];
    case "CNC_NOT_ISSUED":
      return [{ code: "CNC_NOT_ISSUED", level: "block" }];
    case "RATE_NOT_SET":
      return [{ code: "LAD_RATE_NOT_SET", level: "block" }];
    default:
      return [];
  }
}

/// BD-613-48: where the baseline the certificate pins now states another rate or date for completion than the
/// decision in force recorded, the certificate says the CNC's rate still applies until a new decision and CNC are
/// recorded; it never re-rates silently.
export function frozenRateWarnings(d: Decision | null, baseline: { rate: Sen | null; dateForCompletion: Day | null }): Finding[] {
  if (!d || d.outcome !== "LAD_APPLIES") return [];
  const rateMoved = d.rate != null && baseline.rate != null && baseline.rate !== d.rate;
  const dateMoved = d.dateForCompletion != null && baseline.dateForCompletion != null && baseline.dateForCompletion !== d.dateForCompletion;
  if (!rateMoved && !dateMoved) return [];
  return [{ code: "LAD_BASELINE_REVISED", level: "warn", data: { rate: d.rate?.toString() ?? null, baselineRate: rateMoved ? baseline.rate!.toString() : null, date: d.dateForCompletion ?? null, baselineDate: dateMoved ? baseline.dateForCompletion : null } }];
}
