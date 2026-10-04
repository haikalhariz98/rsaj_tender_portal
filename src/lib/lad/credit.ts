/**
 * The damages returned on an extension of time (6.13 Part B run 1b: 613A-C2 (a)(3) as amended, BD-613-89; the cap,
 * BD-613-75; ADR 0030 §3, §4). Pure.
 *
 * Damages accrue only after the date for completion, so every day an issued line charged that is now on or before its
 * scope's date for completion (extensions included) is returned: per issued line, per rate segment, at the rate that
 * segment charged (a line straddling a segment edge is credited part by part). The line's rounding is never returned;
 * a credit is never keyed; a segment's days are returned once (what earlier credits returned of it is taken off). For
 * a single extension this is the days of `[from, until)` inside `[old date + 1, new date + 1)`: 14 × 269.38 = 3,771.32.
 *
 * The cap: on a damages line (one per scope, FR-LAD-011), the credits plus the waivers applied never exceed the
 * damages it charged; at exactly equal it passes, one sen over refuses, naming the line and the three figures, and by
 * what passes it (the credit, or the waiver being applied).
 */

import { dayPlus, daysFrom } from "@/lib/dates";
import { senToDecimalString, type Sen } from "@/lib/money";
import type { Finding } from "@/lib/method/types";

import type { ChargedSegment } from "./segments";

type Day = string;

export type LineSegment = ChargedSegment;

/// A damages line on an issued certificate: its scope, its segments as charged, its gross (rate × days, waivers
/// before), and its keyed rounding (never returned).
export interface IssuedLine {
  certificateId: string;
  number: string | null;
  scopeKey: string;
  segments: readonly LineSegment[];
  gross: Sen;
  rounding: Sen;
}

/// A credit returned (or due) on a certificate, naming the line and segment it returns.
export interface CreditRow {
  lineCertificateId: string;
  lineNumber: string | null;
  scopeKey: string;
  segmentFrom: Day;
  days: number;
  rate: Sen;
  amount: Sen;
}

export function creditsDue(i: { lines: readonly IssuedLine[]; scopeDates: Readonly<Record<string, Day | null>>; returned: readonly CreditRow[] }): CreditRow[] {
  const out: CreditRow[] = [];
  for (const l of i.lines) {
    const date = i.scopeDates[l.scopeKey] ?? null;
    if (!date) continue;
    const through = dayPlus(date, 1);
    for (const s of l.segments) {
      const end = s.until < through ? s.until : through;
      const creditable = end > s.from ? daysFrom(s.from, end) : 0;
      const already = i.returned.filter((r) => r.lineCertificateId === l.certificateId && r.scopeKey === l.scopeKey && r.segmentFrom === s.from).reduce((a, r) => a + r.days, 0);
      const days = creditable - already;
      if (days > 0) out.push({ lineCertificateId: l.certificateId, lineNumber: l.number, scopeKey: l.scopeKey, segmentFrom: s.from, days, rate: s.rate, amount: s.rate * BigInt(days) });
    }
  }
  return out;
}

export interface CapRow {
  scopeKey: string;
  /// The line in words (its scope).
  label: string;
  charged: Sen;
  credited: Sen;
  waived: Sen;
  /// What passes the cap here: a credit due, or a waiver being applied.
  by: "CREDIT" | "WAIVER";
}

export function capFaults(rows: readonly CapRow[]): Finding[] {
  return rows
    .filter((r) => r.credited + r.waived > r.charged)
    .map((r) => ({ code: r.by === "WAIVER" ? "LAD_WAIVER_OVER_CHARGED" : "LAD_CREDIT_OVER_CHARGED", level: "block" as const, data: { line: r.label, charged: senToDecimalString(r.charged), credited: senToDecimalString(r.credited), waived: senToDecimalString(r.waived) } }));
}
