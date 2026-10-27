import type { Sen } from "@/lib/money";

import { eligibilityOf, inForce } from "./eligibility";
import type { Share, SourceRef } from "./types";

/**
 * SF-05: a contract's split across sources, by percentage (FS-7), and its arithmetic to the sen (FS-9). Pure.
 */

/// A technical ceiling for the drawer, not policy.
export const MAX_SPLIT_SOURCES = 5;

/// "60", "60.5", "33.33" to basis points. More than 2 decimals, 0 or less, over 100, or not a number: null.
export function percentToBp(pct: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(pct.trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp > 0 && bp <= 10000 ? bp : null;
}

/// Basis points as a percentage for a screen: 6000 is "60", 3333 is "33.33", 6050 is "60.5".
export const bpToPercent = (bp: number): string => (bp / 100).toFixed(2).replace(/\.?0+$/, "");

/**
 * FS-9: each source first gets floor(amount × bp / 10000); the sen left over go one each to the largest fractional remainders, ties by
 * source sortOrder, then code. So the parts always sum exactly to the whole, and the same inputs always give the same parts. A negative
 * amount is split by its magnitude and negated. The shares must sum to 10000.
 */
export function splitSen(amount: Sen, shares: readonly Share[], order: readonly Pick<SourceRef, "id" | "code" | "sortOrder">[]): Map<string, Sen> {
  if (shares.reduce((a, s) => a + s.bp, 0) !== 10000) throw new Error("A split's shares must sum to 100%.");
  const negative = amount < 0n;
  const whole = negative ? -amount : amount;
  const rank = new Map(order.map((s) => [s.id, s]));
  const parts = shares.map((s) => {
    const q = whole * BigInt(s.bp);
    return { sourceId: s.sourceId, sen: q / 10000n, rem: q % 10000n };
  });
  let left = whole - parts.reduce((a, p) => a + p.sen, 0n);
  const byRemainder = [...parts].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
    const x = rank.get(a.sourceId);
    const y = rank.get(b.sourceId);
    return (x?.sortOrder ?? 0) - (y?.sortOrder ?? 0) || (x?.code ?? a.sourceId).localeCompare(y?.code ?? b.sourceId);
  });
  for (const p of byRemainder) {
    if (left === 0n) break;
    p.sen += 1n;
    left -= 1n;
  }
  return new Map(parts.map((p) => [p.sourceId, negative ? -p.sen : p.sen]));
}

export type SplitFault = "EMPTY" | "TOO_MANY" | "BAD_PERCENT" | "DUPLICATE_SOURCE" | "NOT_100" | "NOT_IN_FORCE" | "NOT_ELIGIBLE" | "CATEGORY_MISSING" | "LOCKED";

/// FS-7: one to five sources, each a percentage greater than 0 with at most 2 decimals, summing to exactly 100, none repeated, each in force and eligible for the category, and not locked.
export function splitFaults(i: { rows: readonly { sourceId: string; pct: string }[]; sources: readonly SourceRef[]; categoryCode: string | null; locked: boolean; on: Date }): SplitFault[] {
  const out = new Set<SplitFault>();
  if (i.locked) out.add("LOCKED");
  if (i.rows.length === 0) out.add("EMPTY");
  if (i.rows.length > MAX_SPLIT_SOURCES) out.add("TOO_MANY");
  const bps = i.rows.map((r) => percentToBp(r.pct));
  if (bps.some((b) => b == null)) out.add("BAD_PERCENT");
  else if (i.rows.length > 0 && bps.reduce((a: number, b) => a + b!, 0) !== 10000) out.add("NOT_100");
  if (new Set(i.rows.map((r) => r.sourceId)).size !== i.rows.length) out.add("DUPLICATE_SOURCE");
  for (const r of i.rows) {
    const s = i.sources.find((x) => x.id === r.sourceId);
    if (!s || !inForce(s, i.on)) {
      out.add("NOT_IN_FORCE");
      continue;
    }
    const e = eligibilityOf(s, i.categoryCode);
    if (e.state === "NOT_ELIGIBLE") out.add("NOT_ELIGIBLE");
    if (e.state === "CATEGORY_MISSING") out.add("CATEGORY_MISSING");
  }
  return [...out];
}
