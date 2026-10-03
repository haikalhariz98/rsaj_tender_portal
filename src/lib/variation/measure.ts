/**
 * Measuring and valuing a variation (6.13 Part A step 4: FR-VAR-017, 018, 019).
 *
 * - Every item is measured under a heading identical to the instruction's description, one item each: an item
 *   reference measured once under an instruction while it stands, never merged with another (FR-VAR-017).
 * - Work that will be covered up is measured during execution with detailed records (FR-VAR-017).
 * - A rate is the contract's (citing the bill or schedule item, with the contract's percentage adjustment applied
 *   where it has one), or an agreed rate, used only once its own approval route is approved (FR-VAR-018).
 * - The amount is the quantity × the rate × (100% + the adjustment), rounded half up to the sen once, at the end:
 *   the applied rate is never rounded first. Quantities are thousandths, rates sen, percentages ten-thousandths.
 * - Lines are frozen once a Variation Order Certificate is raised from them (until it is void).
 * - Daywork (FR-VAR-019): checked and agreed with the contractor the same day it is worked (otherwise flagged), its
 *   substantiation due within the DAYWORK_SUBSTANTIATION clock, frozen when the record is made (late is flagged; an
 *   unset clock reads "not set").
 * Pure.
 */

import type { Sen } from "@/lib/money";

import type { Day, Finding, RateSource } from "./types";

/// A Decimal(18,3) quantity as thousandths: "12.5" → 12500n.
export function parseQuantity(q: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(q.trim());
  if (!m) throw new Error(`Not a quantity: ${q}`);
  return BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0"));
}

/// A signed Decimal(9,4) percentage as ten-thousandths: "-2.5" → -25000n.
export function parseSignedPercent(p: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,4}))?$/.exec(p.trim());
  if (!m) throw new Error(`Not a percentage: ${p}`);
  const v = BigInt(m[2]) * 10_000n + BigInt((m[3] ?? "").padEnd(4, "0"));
  return m[1] ? -v : v;
}

/// The amount: quantity × rate × (1,000,000 + adjustment) ÷ (1,000 × 1,000,000), half up to the sen, once.
export function measuredAmount(quantityMilli: bigint, baseRate: Sen, adjustmentTt: bigint | null): Sen {
  const factor = 1_000_000n + (adjustmentTt ?? 0n);
  const n = quantityMilli * baseRate * factor;
  const d = 1000n * 1_000_000n;
  if (n < 0n) return -((-n + d / 2n) / d);
  return (n + d / 2n) / d;
}

export interface MeasureInput {
  instruction: { description: string; issued: boolean };
  /// An order (VO-663) raised from this instruction and not void: its lines are frozen.
  orderLive: boolean;
  heading: string;
  itemRef: string;
  /// The item references already measured under the instruction (not removed).
  measuredRefs: readonly string[];
  rateSource: RateSource | null;
  bqItemRef: string;
  /// An approved agreed-rate route on the variation.
  agreedRateApproved: boolean;
  quantity: bigint | null;
  baseRate: Sen | null;
  adjustmentTt: bigint | null;
  coveredUp: boolean | null;
  recordsNote: string;
  measuredOn: Day;
  today: Day;
}

/// FR-VAR-017, 018: why the item cannot be recorded.
export function measurementFaults(i: MeasureInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.instruction.issued) return [{ code: "INSTRUCTION_NOT_ISSUED", level: "block" }];
  if (i.orderLive) return [{ code: "ORDER_RAISED", level: "block" }];
  if (i.heading !== i.instruction.description) f("HEADING_NOT_INSTRUCTION", { heading: i.instruction.description });
  if (!i.itemRef.trim()) f("FIELD_REQUIRED", { field: "itemRef" });
  else if (i.measuredRefs.includes(i.itemRef.trim())) f("ITEM_ALREADY_MEASURED", { item: i.itemRef.trim() });
  if (!i.rateSource) f("FIELD_REQUIRED", { field: "rateSource" });
  if (i.rateSource === "CONTRACT_RATE" && !i.bqItemRef.trim()) f("CONTRACT_ITEM_REQUIRED");
  if (i.rateSource === "AGREED_RATE" && !i.agreedRateApproved) f("AGREED_RATE_NOT_APPROVED");
  if (i.rateSource === "AGREED_RATE" && i.adjustmentTt != null) f("ADJUSTMENT_CONTRACT_RATE_ONLY");
  if (i.quantity == null || i.quantity <= 0n) f("QUANTITY_NOT_POSITIVE");
  if (i.baseRate == null || i.baseRate < 0n) f("RATE_REQUIRED");
  if (i.adjustmentTt != null && i.adjustmentTt <= -1_000_000n) f("ADJUSTMENT_OUT_OF_RANGE");
  if (i.coveredUp == null) f("FIELD_REQUIRED", { field: "coveredUp" });
  if (i.coveredUp && !i.recordsNote.trim()) f("RECORDS_REQUIRED");
  if (i.measuredOn > i.today) f("FUTURE_DATE", { day: i.measuredOn });
  return out;
}

/// Removing an item: only while no order is raised from the instruction, with a reason.
export function removeMeasurementFaults(i: { orderLive: boolean; removed: boolean; reason: string }): Finding[] {
  if (i.removed) return [{ code: "ALREADY_REMOVED", level: "block" }];
  const out: Finding[] = [];
  if (i.orderLive) out.push({ code: "ORDER_RAISED", level: "block" });
  if (!i.reason.trim()) out.push({ code: "FIELD_REQUIRED", level: "block", data: { field: "removedReason" } });
  return out;
}

export interface DayworkFacts {
  workedOn: Day;
  agreedOn: Day | null;
  substantiationDueOn: Day | null;
  substantiationReceivedOn: Day | null;
}

export interface DayworkFlags {
  /// FR-VAR-019: not checked and agreed with the contractor on the day worked.
  notAgreedSameDay: boolean;
  /// The substantiation against its frozen clock: not set, still open (overdue after the due day), or received (late after it).
  substantiation: { state: "NOT_SET" } | { state: "OPEN"; due: Day; overdue: boolean } | { state: "RECEIVED"; due: Day; late: boolean };
}

export function dayworkFlags(d: DayworkFacts, today: Day): DayworkFlags {
  const notAgreedSameDay = d.agreedOn !== d.workedOn;
  if (!d.substantiationDueOn) return { notAgreedSameDay, substantiation: { state: "NOT_SET" } };
  if (!d.substantiationReceivedOn) return { notAgreedSameDay, substantiation: { state: "OPEN", due: d.substantiationDueOn, overdue: today > d.substantiationDueOn } };
  return { notAgreedSameDay, substantiation: { state: "RECEIVED", due: d.substantiationDueOn, late: d.substantiationReceivedOn > d.substantiationDueOn } };
}

/// A daywork record's days: none in the future, none before the day worked; an agreement names who.
export function dayworkFaults(i: { workedOn: Day; agreedOn: Day | null; agreedWith: string; receivedOn: Day | null; description: string; today: Day; instructed: boolean }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.instructed) return [{ code: "INSTRUCTION_NOT_ISSUED", level: "block" }];
  if (!i.description.trim()) f("FIELD_REQUIRED", { field: "description" });
  for (const d of [i.workedOn, i.agreedOn, i.receivedOn]) if (d && d > i.today) f("FUTURE_DATE", { day: d });
  for (const d of [i.agreedOn, i.receivedOn]) if (d && d < i.workedOn) f("BEFORE_WORKED", { day: i.workedOn });
  if (i.agreedOn && !i.agreedWith.trim()) f("FIELD_REQUIRED", { field: "agreedWith" });
  return out;
}
