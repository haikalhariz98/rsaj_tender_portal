/**
 * The certificate of making good defects (FR-CMP-015, 018; plan closeout-plan.md §4.4; rulings 4, 6; ADR 0047 D3). Pure.
 *
 * Raised once the defects liability period has ended and every line is made good or withdrawn (third-party rectification is not built, so an
 * officer withdraws a line the contractor never rectifies, with its reason). The final defects inspection's day is recorded on it, which the
 * retention balance needs. Its snapshot carries the performance bond's value, the retention balance and the securities' numbers (ruling 6).
 */

import { senToDecimalString, type Sen } from "@/lib/money";

import { SECURITY_KIND_WORDS, withdrawnWords } from "./labels";
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
  // Code review of close-out stage B: every performance bond held, not the first only (their values summed, their numbers listed).
  const bonds = i.securities.filter((s) => s.kind === "PERFORMANCE_BOND");
  return {
    performanceBond: bonds.length ? { value: senToDecimalString(bonds.reduce((a, b) => a + b.value, 0n)), reference: bonds.map((b) => b.reference).join("; ") } : null,
    retentionBalance: senToDecimalString(i.retentionBalance),
    securities: i.securities.map((s) => ({ kind: s.kind, form: s.form, reference: s.reference, value: senToDecimalString(s.value) })),
  };
}

/**
 * The figures the CMGD prints (ruling 6), by line key, as the raise writes them and the issue checks them (code review of close-out stage B, F5):
 * a figure that moved between the raise and the issue (an interim issued, a security returned, a line withdrawn) refuses the issue by name.
 * A security's kind is always a label, never its code.
 */
export function cmgdFigureLines(snap: CmgdSnapshot, defects: { total: number; withdrawn: number }): Readonly<Record<"cmgdDefects" | "cmgdPerformanceBond" | "cmgdRetentionBalance" | "cmgdSecurities", string | null>> {
  const withdrawn = withdrawnWords(defects.withdrawn);
  return {
    cmgdDefects: `${defects.total - defects.withdrawn} made good${withdrawn ? `, ${withdrawn}` : ""}`,
    cmgdPerformanceBond: snap.performanceBond?.value ?? null,
    cmgdRetentionBalance: snap.retentionBalance,
    cmgdSecurities: snap.securities.map((s) => `${SECURITY_KIND_WORDS[s.kind] ?? "Security"}: ${s.reference || "no number"}`).join("; ") || "None",
  };
}

export const CMGD_FIGURE_WORDS: Readonly<Record<string, string>> = { cmgdDefects: "the defects", cmgdPerformanceBond: "the performance bond", cmgdRetentionBalance: "the retention balance held", cmgdSecurities: "the securities held" };

/// The printed figures that differ from what is held now, named (empty: none moved).
export function cmgdFiguresMoved(printed: ReadonlyMap<string, string | null>, now: ReturnType<typeof cmgdFigureLines>): Finding[] {
  const moved = (Object.keys(now) as (keyof typeof now)[]).filter((k) => (printed.get(k) ?? null) !== now[k]);
  return moved.length ? [{ code: "CMGD_FIGURES_MOVED", level: "block", data: { items: moved.map((k) => CMGD_FIGURE_WORDS[k]).join(", ") } }] : [];
}

