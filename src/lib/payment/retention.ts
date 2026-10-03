/**
 * Retention (6.13 Part A step 3: FR-PAY-011, 021; §8.5; blocker B3 as ruled).
 *
 * Whether retention applies, its percentage and its cap come from the certificate's pinned baseline version, never
 * from a literal. It does not apply only where the baseline says so from a configured terms band (DERIVED) or from a
 * recorded decision with its provenance (ENTERED); applies-unset, or a percentage or cap unset where it applies,
 * refuses the certificate naming the field. Never 0%.
 *
 * Held: each tier's percentage of its value to date (the main contractor's works with the materials allowance, the
 * nominated sub-contractors', the nominated suppliers'), half up to the sen. The cap is a percentage of the contract
 * sum the certificate pinned. Where the three together pass it, the cap is held and shared pro rata to what each
 * tier would hold (half up), the main contractor's tier taking the sen the rounding leaves, so the three always sum
 * to the cap exactly (an assumed reading: the sources state no split, BD-613-28). What is released (the first
 * release on as-built drawings, the balance on the Certificate of Making Good Defects) comes off what is held.
 *
 * Pure: sen as bigint, percentages as decimal strings, no float anywhere.
 */

import { decimalText } from "@/lib/format";
import type { Sen } from "@/lib/money";
import { pctOfSen, ratioOfSen } from "@/lib/securities/money";

import type { Finding, RetentionTier } from "./types";

export interface RetentionTerms {
  applies: boolean | null;
  percent: string | null;
  capPercent: string | null;
  /// Where the baseline took it from (BaselineSource): only DERIVED or ENTERED may say it does not apply.
  source: string | null;
}

export type RetentionReading =
  | { state: "NONE"; source: "DERIVED" | "ENTERED" }
  | { state: "APPLIES"; percent: string; capPercent: string }
  | { state: "NOT_SET"; field: "retentionApplies" | "retentionPercent" | "retentionCapPercent" }
  | { state: "NONE_UNSUPPORTED"; source: string | null };

/// Whether retention applies on a certificate, from its pinned baseline (B3 as ruled). Never 0.
export function retentionReading(t: RetentionTerms): RetentionReading {
  if (t.applies == null) return { state: "NOT_SET", field: "retentionApplies" };
  if (t.applies === false) return t.source === "DERIVED" || t.source === "ENTERED" ? { state: "NONE", source: t.source } : { state: "NONE_UNSUPPORTED", source: t.source };
  if (t.percent == null) return { state: "NOT_SET", field: "retentionPercent" };
  if (t.capPercent == null) return { state: "NOT_SET", field: "retentionCapPercent" };
  return { state: "APPLIES", percent: t.percent, capPercent: t.capPercent };
}

/// Why the certificate is refused on its retention (empty: it may proceed).
export function retentionFaults(r: RetentionReading): Finding[] {
  if (r.state === "NOT_SET") return [{ code: "RETENTION_NOT_SET", level: "block", data: { field: r.field } }];
  if (r.state === "NONE_UNSUPPORTED") return [{ code: "RETENTION_NONE_UNSUPPORTED", level: "block", data: { source: r.source } }];
  return [];
}

export type Tiers = Readonly<Record<RetentionTier, Sen>>;
export const ZERO_TIERS: Tiers = { MAIN: 0n, NSC: 0n, NS: 0n };
const sum = (t: Tiers) => t.MAIN + t.NSC + t.NS;

export interface Held {
  /// Each tier's retention before the cap.
  computed: Tiers;
  /// The cap in money (null where no retention applies).
  cap: Sen | null;
  /// Whether the cap was reached.
  capped: boolean;
  /// What is held to date, after the cap.
  held: Tiers;
  /// Released to date (from the release records).
  released: Tiers;
  /// What the certificate deducts: held less released.
  net: Tiers;
}

/**
 * Retention held to date on a certificate. `values` is each tier's value to date (the main tier with the
 * materials allowance). `released` is what has been released, per tier, on or before the valuation day.
 */
export function retentionHeld(reading: RetentionReading, contractSum: Sen, values: Tiers, released: Tiers = ZERO_TIERS): Held {
  if (reading.state !== "APPLIES") return { computed: ZERO_TIERS, cap: null, capped: false, held: ZERO_TIERS, released, net: { MAIN: -released.MAIN, NSC: -released.NSC, NS: -released.NS } };
  const computed: Tiers = { MAIN: pctOfSen(values.MAIN, reading.percent), NSC: pctOfSen(values.NSC, reading.percent), NS: pctOfSen(values.NS, reading.percent) };
  const cap = pctOfSen(contractSum, reading.capPercent);
  const total = sum(computed);
  let held = computed;
  if (total > cap) {
    const nsc = ratioOfSen(computed.NSC, cap, total);
    const ns = ratioOfSen(computed.NS, cap, total);
    held = { MAIN: cap - nsc - ns, NSC: nsc, NS: ns };
  }
  return { computed, cap, capped: total > cap, held, released, net: { MAIN: held.MAIN - released.MAIN, NSC: held.NSC - released.NSC, NS: held.NS - released.NS } };
}

/// Whether more has been released than is held (a release recorded against a figure later reduced): refused.
export function overReleased(h: Held): RetentionTier[] {
  return (["MAIN", "NSC", "NS"] as const).filter((t) => h.net[t] < 0n);
}

// ------------------------------------------------------------------ release (FR-PAY-021)

export interface ReleaseInput {
  kind: "RELEASED_FIRST" | "RELEASED_BALANCE";
  /// Held per tier on the latest issued interim certificate (as issued).
  held: Tiers | null;
  /// What has been released already, per kind.
  already: { first: boolean; balance: boolean };
  /// The first release's percentage (PostAwardPolicy.firstReleasePct), as read now. Null: not set.
  firstReleasePct: string | null;
  /// As-built drawings handed over (FR-SUP-009).
  asBuiltHandedOver: boolean;
  /// A Certificate of Making Good Defects issued (Part B). Always false in Part A.
  makingGoodIssued: boolean;
  /// What the first release took, per tier (for the balance).
  firstReleased: Tiers;
}

/**
 * A release of retention: the first (the policy's percentage of what is held, half up, per tier), once, on
 * as-built drawings handed over; the balance (what is held less the first release, so the two sum to what is held),
 * once, on the Certificate of Making Good Defects, which arrives with Part B: refused until then. Never twice.
 */
export function releaseOf(i: ReleaseInput): { faults: Finding[]; amounts: Tiers | null } {
  const faults: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => faults.push({ code, level: "block", data });
  if (!i.held || sum(i.held) <= 0n) f("NOTHING_HELD");
  if (i.kind === "RELEASED_FIRST") {
    if (i.already.first) f("ALREADY_RELEASED", { kind: "first" });
    if (!i.asBuiltHandedOver) f("AS_BUILT_NOT_HANDED_OVER");
    if (i.firstReleasePct == null) f("FIRST_RELEASE_PCT_NOT_SET");
    if (faults.length) return { faults, amounts: null };
    const pct = i.firstReleasePct!;
    return { faults, amounts: { MAIN: pctOfSen(i.held!.MAIN, pct), NSC: pctOfSen(i.held!.NSC, pct), NS: pctOfSen(i.held!.NS, pct) } };
  }
  if (i.already.balance) f("ALREADY_RELEASED", { kind: "balance" });
  if (!i.makingGoodIssued) f("MAKING_GOOD_NOT_ISSUED");
  if (faults.length) return { faults, amounts: null };
  return { faults, amounts: { MAIN: i.held!.MAIN - i.firstReleased.MAIN, NSC: i.held!.NSC - i.firstReleased.NSC, NS: i.held!.NS - i.firstReleased.NS } };
}

/// The first release's share as the release act and the Payments tab both read it from the stored Decimal(9,4)
/// (50.0000 → "50"); null where Configuration › Post-award has not set it.
export const firstReleaseShare = (stored: { toString(): string } | null | undefined): string | null => decimalText(stored);
