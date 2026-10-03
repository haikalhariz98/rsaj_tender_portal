/**
 * Overriding a computed figure (FR-CRT-003; rulings 6.14 condition: overrides only in DRAFT, refused from
 * IN_ROUTING on, totals never overridable).
 *
 * An override is an exception: it needs a justification and a named Person, it is audited, and the
 * certificate shows "overridden" beside the field with both figures. Totals are recomputed from the lines
 * after any override, so the certificate always balances. Pure.
 */

import { parseSen, senToDecimalString } from "@/lib/money";
import type { ExactRatio } from "@/lib/percent-band";

import { isTotal, totalsFrom, valueFault, type ComputedSnapshot, type FigureLine, type FigureType } from "./snapshot";
import type { CertificateStatus, Finding } from "./types";

export interface OverrideRow {
  fieldKey: string;
  computed: string;
  overridden: string;
  justification: string;
  personName: string;
  /// When it was recorded: the latest per field applies.
  recordedAt: Date;
}

export interface EffectiveLine extends FigureLine {
  /// The figure as the module computed it.
  computed: string | null;
  /// The override in force on this line, if any.
  override: OverrideRow | null;
}

export interface EffectiveTotal {
  key: string;
  labelEn: string;
  labelMs: string;
  /// Recomputed from the lines as they now stand. Null: a line it needs is not computed.
  value: string | null;
  /// Recomputed from the lines as computed; differs from `value` only where a line was overridden.
  computed: string | null;
}

export interface Effective {
  lines: EffectiveLine[];
  totals: EffectiveTotal[];
  /// Whether any figure differs from what was computed.
  overridden: boolean;
}

/// The latest override of each field, by when it was recorded.
export function latestOverrides(rows: readonly OverrideRow[]): Map<string, OverrideRow> {
  const out = new Map<string, OverrideRow>();
  for (const r of [...rows].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) out.set(r.fieldKey, r);
  return out;
}

/// The figures as they stand: every line with its override (if any), every total recomputed from them.
export function applyOverrides(s: ComputedSnapshot, rows: readonly OverrideRow[]): Effective {
  const latest = latestOverrides(rows);
  const lines: EffectiveLine[] = s.lines.map((l) => {
    const o = latest.get(l.key) ?? null;
    // An override that names a total or a line no longer overridable is never applied (it cannot be recorded either).
    const applies = o != null && l.overridable && o.overridden !== l.value;
    return { ...l, computed: l.value, value: applies ? o!.overridden : l.value, override: applies ? o : null };
  });
  const now = totalsFrom(s, new Map(lines.map((l) => [l.key, l.value])));
  const before = totalsFrom(s, new Map(s.lines.map((l) => [l.key, l.value])));
  const totals = s.totals.map((t) => ({ key: t.key, labelEn: t.labelEn, labelMs: t.labelMs, value: now.get(t.key) ?? null, computed: before.get(t.key) ?? null }));
  return { lines, totals, overridden: lines.some((l) => l.override != null) };
}

/**
 * The ratio a banded routing target is judged on (614-C5, ADR 0024): where the snapshot's ratio names its lines
 * (or totals), from the figures as they stand, overrides included; otherwise as handed in. Null: no ratio, or a
 * denominator not above zero as the figures stand (the target then reads "no ratio", never a band).
 */
export function routingRatioOf(s: ComputedSnapshot, e: Effective | null): ExactRatio | null {
  const r = s.routingRatio;
  if (!r) return null;
  const now = (key: string | undefined, handedIn: string): string | null => {
    if (key === undefined) return handedIn;
    const line = e?.lines.find((l) => l.key === key);
    if (line) return line.value;
    const total = e?.totals.find((t) => t.key === key);
    return total ? total.value : null;
  };
  const num = now(r.numKey, r.num);
  const den = now(r.denKey, r.den);
  if (num == null || den == null) return null;
  const ratio = { num: parseSen(num), den: parseSen(den) };
  return ratio.den > 0n ? ratio : null;
}

/// A value as typed, in the form the snapshot holds it ("1,234.5" → "1234.50"). Null where it is not one.
export function normaliseValue(type: FigureType, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    if (type === "MONEY") return senToDecimalString(parseSen(v));
  } catch {
    return null;
  }
  return valueFault(type, v) ? null : v;
}

export interface OverrideInput {
  status: CertificateStatus;
  snapshot: ComputedSnapshot | null;
  current: Effective | null;
  fieldKey: string;
  /// As typed; normalised by the rule.
  value: string;
  justification: string;
  /// The named Person is on record and active.
  personKnown: boolean;
}

/// Why an override is refused. Empty: it may be recorded. `normalised` is the value to store.
export function overrideFaults(i: OverrideInput): { faults: Finding[]; normalised: string | null; computed: string | null } {
  const faults: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => faults.push({ code, level: "block", data });
  if (i.status !== "DRAFT") {
    f("OVERRIDE_NOT_IN_DRAFT", { status: i.status });
    return { faults, normalised: null, computed: null };
  }
  if (!i.snapshot || !i.current) {
    f("NO_FIGURES");
    return { faults, normalised: null, computed: null };
  }
  if (isTotal(i.snapshot, i.fieldKey)) {
    f("TOTAL_NOT_OVERRIDABLE", { key: i.fieldKey });
    return { faults, normalised: null, computed: null };
  }
  const line = i.current.lines.find((l) => l.key === i.fieldKey);
  if (!line) {
    f("UNKNOWN_FIELD");
    return { faults, normalised: null, computed: null };
  }
  if (!line.overridable) f("NOT_OVERRIDABLE", { key: line.key });
  const normalised = normaliseValue(line.type, i.value);
  if (normalised == null) f("OVERRIDE_VALUE", { type: line.type });
  else if (normalised === line.value) f("SAME_AS_NOW");
  if (!i.justification.trim()) f("JUSTIFICATION_REQUIRED");
  if (!i.personKnown) f("PERSON_REQUIRED");
  return { faults, normalised, computed: line.computed };
}
