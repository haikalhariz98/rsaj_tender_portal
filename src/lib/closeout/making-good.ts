/**
 * The certificate of making good defects (FR-CMP-015, 018; plan closeout-plan.md §4.4; rulings 4, 6; ADR 0047 D3). Pure.
 *
 * Raised once the defects liability period has ended and every line is made good or withdrawn (third-party rectification is not built, so an
 * officer withdraws a line the contractor never rectifies, with its reason). The final defects inspection's day is recorded on it, which the
 * retention balance needs. Its snapshot carries the performance bond's value, the retention balance and the securities' numbers (ruling 6).
 */

import { senToDecimalString, type Sen } from "@/lib/money";

import type { Day, Dlp, Finding } from "./types";

export interface CmgdRaiseInput {
  cpcIssued: boolean;
  dlp: Dlp | null;
  today: Day;
  /// Lines neither made good nor withdrawn (a reported line not yet accepted counts).
  open: number;
  live: { number: string | null } | null;
  madeGoodOn: Day;
  finalInspectionOn: Day;
}

export function cmgdRaiseFaults(i: CmgdRaiseInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.cpcIssued) f("CPC_NOT_ISSUED");
  else if (!i.dlp || i.dlp.applies !== true) f("DLP_NOT_APPLICABLE");
  else if (i.today < i.dlp.endExclusive) f("DLP_NOT_ENDED", { day: i.dlp.endExclusive });
  if (i.open > 0) f("DEFECTS_OPEN", { n: i.open });
  if (i.live) f("CMGD_LIVE", { number: i.live.number });
  if (i.madeGoodOn > i.today) f("DAY_IN_FUTURE", { day: i.madeGoodOn });
  if (i.finalInspectionOn > i.today) f("DAY_IN_FUTURE", { day: i.finalInspectionOn });
  return out;
}

/// What the CMGD records of the securities and the retention balance (ruling 6, FR-CMP-015).
export interface CmgdSnapshot {
  performanceBond: { value: string; reference: string } | null;
  retentionBalance: string;
  /// Each security held, with its guarantee or official receipt number.
  securities: readonly { kind: string; form: string; reference: string; value: string }[];
}

export function cmgdSnapshotOf(i: { securities: readonly { kind: string; form: string; reference: string; value: Sen }[]; retentionBalance: Sen }): CmgdSnapshot {
  const bond = i.securities.find((s) => s.kind === "PERFORMANCE_BOND") ?? null;
  return {
    performanceBond: bond ? { value: senToDecimalString(bond.value), reference: bond.reference } : null,
    retentionBalance: senToDecimalString(i.retentionBalance),
    securities: i.securities.map((s) => ({ kind: s.kind, form: s.form, reference: s.reference, value: senToDecimalString(s.value) })),
  };
}
