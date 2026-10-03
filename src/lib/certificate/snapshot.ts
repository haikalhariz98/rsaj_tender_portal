/**
 * A certificate's computed figures, as frozen (FR-CRT-002, 003; rulings 6.14 condition: snapshots hold money
 * as decimal strings).
 *
 * The owning 6.13 module computes a certificate's figures with its own pure function and hands them here as
 * lines and totals. A line is a figure (money, a percentage, days, a day or words); a total is never a figure
 * of its own: it names the lines (or earlier totals) it adds or takes away, and is recomputed from them every
 * time it is read, in sen, so it always balances and is never overridden (the workbooks' two broken totals
 * are not ported). Pure; nothing here reads a clock or the database.
 */

import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { isDay } from "@/lib/dates";
import { parsePercent } from "@/lib/securities/money";

import type { Finding } from "./types";

export type FigureType = "MONEY" | "PERCENT" | "DAYS" | "TEXT" | "DATE";
export const FIGURE_TYPES: readonly FigureType[] = ["MONEY", "PERCENT", "DAYS", "TEXT", "DATE"];

export interface FigureLine {
  key: string;
  labelEn: string;
  labelMs: string;
  type: FigureType;
  /// As a string: money "1234.50", a percentage "5.0000", days "28", a day "2026-09-30". Null: not computed.
  value: string | null;
  /// Whether the owning module allows an officer to override it (with a justification) in DRAFT.
  overridable: boolean;
  /// A TEXT line's value in Malay, beside `value` in English (6.13 Part A: a sentence the owning module writes is
  /// stored in both languages, as its labels are). Absent: the value is not a sentence (a reference, a clause).
  valueMs?: string;
  /// The lowest an override may set it to, and why (a money line only): the part of the figure the owning module
  /// does not let an officer correct (6.13 Part A, code review run 2 item 3: the premiums the employer paid that
  /// this certificate recovers). Absent: no floor.
  floor?: { value: string; en: string; ms: string };
}

export interface FigureTotal {
  key: string;
  labelEn: string;
  labelMs: string;
  /// What it adds (1) and takes away (−1): money lines, or totals listed before it.
  terms: { key: string; sign: 1 | -1 }[];
}

export interface ComputedSnapshot {
  version: 1;
  /// The organisation's day the figures were computed on.
  computedOn: string;
  /// Which calculation made them, in words (the owning module's).
  rule: { en: string; ms: string };
  lines: FigureLine[];
  totals: FigureTotal[];
  /// The ratio a banded routing target is judged on (a variation's sum over the contract sum), as two money
  /// strings, where the owning module states one (ADR 0024). Null: none.
  ///
  /// 614-C5 (6.13 Part A step 3): where `numKey` (and `denKey`) name a money line or a total of these figures,
  /// the ratio is worked out from the figures as they stand, overrides included, never from the strings handed
  /// in; so a draft override that moves the figure moves the target it is judged against. The strings are the
  /// ratio as computed. A ratio with no keys is read as handed in (a figure no line carries).
  routingRatio: { num: string; den: string; labelEn: string; labelMs: string; numKey?: string; denKey?: string } | null;
}

const KEY = /^[a-z][A-Za-z0-9]*$/;

/// What is wrong with a snapshot handed in. Empty: sound. Checked when a certificate is opened.
export function snapshotFaults(s: ComputedSnapshot): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (s.version !== 1) f("SNAPSHOT_VERSION");
  if (!isDay(s.computedOn)) f("SNAPSHOT_DAY");
  const seen = new Set<string>();
  for (const k of [...s.lines.map((l) => l.key), ...s.totals.map((t) => t.key)]) {
    if (!KEY.test(k)) f("FIELD_KEY", { key: k });
    if (seen.has(k)) f("FIELD_REPEATED", { key: k });
    seen.add(k);
  }
  for (const l of s.lines) if (l.value != null && valueFault(l.type, l.value)) f("FIELD_VALUE", { key: l.key, type: l.type });
  // Malay words beside a value only on a TEXT line.
  for (const l of s.lines) if (l.valueMs !== undefined && l.type !== "TEXT") f("FIELD_VALUE", { key: l.key, type: l.type });
  // A floor is on an overridable money line, a money string, never above the line itself.
  for (const l of s.lines) if (l.floor && (l.type !== "MONEY" || !l.overridable || valueFault("MONEY", l.floor.value) || l.value == null || parseSen(l.floor.value) > parseSen(l.value))) f("FIELD_VALUE", { key: l.key, type: l.type });
  const money = new Set(s.lines.filter((l) => l.type === "MONEY").map((l) => l.key));
  const before = new Set<string>();
  for (const t of s.totals) {
    if (t.terms.length === 0) f("TOTAL_EMPTY", { key: t.key });
    for (const term of t.terms) if (!money.has(term.key) && !before.has(term.key)) f("TOTAL_TERM", { key: t.key, term: term.key });
    before.add(t.key);
  }
  if (s.routingRatio) {
    const r = s.routingRatio;
    if (valueFault("MONEY", r.num) || valueFault("MONEY", r.den) || parseSen(r.den) <= 0n) f("RATIO");
    // 614-C5: a key names a money line or a total of these figures, and the strings are that figure as computed.
    else {
      const computed = totalsFrom(s, new Map(s.lines.map((l) => [l.key, l.value])));
      const as = (key: string) => {
        const line = s.lines.find((l) => l.key === key);
        if (line) return line.type === "MONEY" ? line.value : undefined;
        return computed.has(key) ? computed.get(key)! : undefined;
      };
      for (const [key, value] of [[r.numKey, r.num], [r.denKey, r.den]] as const) {
        if (key === undefined) continue;
        const v = as(key);
        if (v === undefined || v == null || parseSen(v) !== parseSen(value)) f("RATIO");
      }
    }
  }
  return out;
}

/// Whether a value is not written as its type is.
export function valueFault(type: FigureType, value: string): boolean {
  try {
    switch (type) {
      case "MONEY":
        // Exactly as stored: "1234.50", never a float, never a separator.
        return !/^-?\d+\.\d{2}$/.test(value) || senToDecimalString(parseSen(value)) !== value;
      case "PERCENT":
        parsePercent(value);
        return false;
      case "DAYS":
        return !/^-?\d+$/.test(value);
      case "DATE":
        return !isDay(value);
      case "TEXT":
        return value.trim() === "";
    }
  } catch {
    return true;
  }
}

/// A snapshot read back from JSON, or null where it is not one (never guessed at).
export function readComputedSnapshot(json: unknown): ComputedSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<ComputedSnapshot>;
  if (s.version !== 1 || typeof s.computedOn !== "string" || !Array.isArray(s.lines) || !Array.isArray(s.totals) || !s.rule) return null;
  return { version: 1, computedOn: s.computedOn, rule: s.rule, lines: s.lines, totals: s.totals, routingRatio: s.routingRatio ?? null };
}

/**
 * Every total, recomputed from the values given, in order (a total may use an earlier total). A total any
 * of whose terms has no value is itself null ("not computed"), never a sum that counted the gap as nothing.
 */
export function totalsFrom(s: ComputedSnapshot, values: ReadonlyMap<string, string | null>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const t of s.totals) {
    let sum: Sen | null = 0n;
    for (const term of t.terms) {
      const v = out.has(term.key) ? out.get(term.key)! : (values.get(term.key) ?? null);
      if (v == null || sum == null) {
        sum = null;
        continue;
      }
      sum += BigInt(term.sign) * parseSen(v);
    }
    out.set(t.key, sum == null ? null : senToDecimalString(sum));
  }
  return out;
}

/// Whether a key names a total.
export const isTotal = (s: ComputedSnapshot, key: string): boolean => s.totals.some((t) => t.key === key);
