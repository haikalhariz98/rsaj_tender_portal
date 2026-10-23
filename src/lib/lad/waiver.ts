/**
 * The LAD waiver (6.13 Part B run 1b: FR-LAD-008, 009; OD-B7 as ruled, BD-613-75; ADR 0030 §4, §5). Pure.
 *
 * - The LAD amount is the decision's damages charged and chargeable to the stated day, less what extensions of time
 *   return: each day of the decision's window up to `asOf` (and to the window's close, and to the new date where an
 *   extension superseded the decision) that is after its scope's date for completion, at the rate it was charged (an
 *   issued line) or the rate its segment would charge. The rounding is never part of it.
 * - The route is resolved at the exact ratio waived ÷ LAD amount, never the contract sum (FR-LAD-009).
 * - When it reaches the money is the switch (OD-B7): NEXT_CERTIFICATE applies it on the next interim's raise;
 *   FINAL_ACCOUNT holds it for the final account; unset, it is approved and not applied (said, never applied).
 * - Applying it on a basis that moved since it was sent (a credit, a supersession, an occupation's rate) is refused
 *   LAD_BASIS_MOVED, naming what moved: it is sent again at the new amount, because the ratio picks the approver.
 */

import { dayPlus } from "@/lib/dates";
import { senToDecimalString, type Sen } from "@/lib/money";
import type { Finding } from "@/lib/method/types";
import type { ExactRatio } from "@/lib/percent-band";

import { rateSegments, type RateSegment } from "./segments";

type Day = string;

export interface LadAmountInput {
  /// The decision's accrual window: its first day charged, and the first day not charged (null: still running).
  window: { from: Day; until: Day | null };
  asOf: Day;
  /// The scope's date for completion now (extensions included): no day on or before it is damages.
  scopeDate: Day | null;
  /// Superseded by an extension: no day after its new date is chargeable on this decision.
  superseded: { newDate: Day } | null;
  /// The days issued lines charged (their segments), each with its rate.
  charged: readonly { from: Day; until: Day; rate: Sen }[];
  segments: readonly RateSegment[];
}

const rateOn = (d: Day, segs: readonly RateSegment[]): Sen | null => segs.find((s) => (!s.from || s.from <= d) && (!s.until || d < s.until))?.rate ?? null;

export function ladAmountAt(i: LadAmountInput): Sen {
  let end = dayPlus(i.asOf, 1);
  if (i.window.until && i.window.until < end) end = i.window.until;
  if (i.superseded) {
    const cap = dayPlus(i.superseded.newDate, 1);
    if (cap < end) end = cap;
  }
  let total = 0n;
  for (let d = i.window.from; d < end; d = dayPlus(d, 1)) {
    if (i.scopeDate && d <= i.scopeDate) continue;
    const charged = i.charged.find((c) => c.from <= d && d < c.until);
    total += charged ? charged.rate : (rateOn(d, i.segments) ?? 0n);
  }
  return total;
}

export const waiverRatio = (waived: Sen, ladAmount: Sen): ExactRatio => ({ num: waived, den: ladAmount });

export function waiverRecordFaults(i: { decision: { charging: boolean; label: string } | null; waived: Sen | null; ladAmount: Sen; reason: string; asOf: Day; today: Day }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.decision?.charging) f("DECISION_NOT_CHARGING", { decision: i.decision?.label ?? null });
  if (i.ladAmount <= 0n) f("NO_LAD_AMOUNT", { day: i.asOf });
  else if (i.waived == null || i.waived <= 0n || i.waived > i.ladAmount) f("WAIVED_REQUIRED", { amount: senToDecimalString(i.ladAmount) });
  if (!i.reason.trim()) f("WAIVER_REASON_REQUIRED");
  if (i.asOf > i.today) f("FUTURE_DATE", { day: i.asOf });
  return out;
}

/// What a waiver's LAD amount was read from (frozen at send) or is read from now.
export interface WaiverBasis {
  amount: Sen;
  extensions: readonly { id: string; number: string | null }[];
  supersededBy: string | null;
  segments: string;
}

export type Application = { state: "APPLY" } | { state: "NOT_SET" } | { state: "AT_FINAL" } | { state: "NOT_APPROVED" } | { state: "APPLIED" } | { state: "MOVED"; fault: Finding };

export function applicationOf(i: { setting: "NEXT_CERTIFICATE" | "FINAL_ACCOUNT" | null; approved: boolean; applied: boolean; frozen: WaiverBasis; now: WaiverBasis }): Application {
  if (!i.approved) return { state: "NOT_APPROVED" };
  if (i.applied) return { state: "APPLIED" };
  if (i.setting == null) return { state: "NOT_SET" };
  if (i.setting === "FINAL_ACCOUNT") return { state: "AT_FINAL" };
  const moved: string[] = [];
  const then = new Set(i.frozen.extensions.map((e) => e.id));
  for (const e of i.now.extensions) if (!then.has(e.id)) moved.push(`the extension of time ${e.number ?? "(not yet numbered)"} issued`);
  if (i.now.supersededBy && i.now.supersededBy !== i.frozen.supersededBy) moved.push(`the decision was superseded by ${i.now.supersededBy}`);
  if (i.now.segments !== i.frozen.segments) moved.push("an occupation's confirmed rate changed the rate segments");
  if (!moved.length && i.now.amount !== i.frozen.amount) moved.push("the damages charged moved");
  if (!moved.length) return { state: "APPLY" };
  return { state: "MOVED", fault: { code: "LAD_BASIS_MOVED", level: "block", data: { then: senToDecimalString(i.frozen.amount), now: senToDecimalString(i.now.amount), moved: moved.join("; ") } } };
}

export { rateSegments };
