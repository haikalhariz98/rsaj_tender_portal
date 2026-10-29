/**
 * A contractor performance form (Phase 2 close-out stage D; ADR 0047 D6; FR-CPR-002, 003; ruling 10). Pure.
 *
 * A form belongs to exactly one contract type, with no general fallback. Its weights total exactly 100% (held as fractions totalling 1.0000); scores run from 1 to the scale's top
 * (2 to 10). Its grades are bands by their lower bound, each up to the next one's, graded through `evaluation/bands.ts` and nothing of its own.
 */

import { bandSetFaults, type Band } from "@/lib/evaluation/bands";
import { compareFixed, fixedFromWhole, fixedToDecimalString, formatMark, isFixed, parseFixed, sumFixed } from "@/lib/evaluation/fixed";
import type { Finding } from "@/lib/method/types";

export type { Finding };

export const SCALE_TOPS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/// What a report pins at opening: the form as issued (decimals as four-place strings).
export interface FormSnapshot {
  formId: string;
  name: string;
  version: number;
  contractTypeCode: string;
  scaleMax: number;
  criteria: readonly { order: number; label: string; guide: string; weight: string }[];
  bands: readonly { label: string; lowerPct: string; sortOrder: number }[];
}

export type FormFault = "NO_CRITERIA" | "CRITERION_ORDER_REPEATED" | "WEIGHTS_NOT_ONE" | "SCALE_OUT_OF_RANGE" | "NO_BANDS" | "BANDS_NOT_FROM_ZERO" | "BAND_REPEATED" | "TYPE_HAS_ISSUED_FORM" | "BANDS_OVERLAP" | "BANDS_GAP" | "BANDS_EMPTY" | "BAND_EDGES_REVERSED";

/// The form's grade bands as `evaluation/bands.ts` reads them: each from its lower bound (in) to the next band's (out); the top one open.
export function gradeBands(bands: FormSnapshot["bands"]): Band[] {
  const sorted = [...bands].sort((a, b) => compareFixed(parseFixed(a.lowerPct), parseFixed(b.lowerPct)));
  return sorted.map((b, i) => ({
    labelEn: b.label,
    labelMs: null,
    lower: parseFixed(b.lowerPct),
    lowerInclusive: true,
    lowerIsFloor: false,
    upper: i + 1 < sorted.length ? parseFixed(sorted[i + 1].lowerPct) : null,
    upperInclusive: false,
    upperIsFloor: false,
    outcome: "PASS",
    sortOrder: i,
  }));
}

/// A weight entered as a percentage ("25", "12.5") as the fraction a form holds ("0.2500"); null when it is not 0 to 100 (0 excluded) or has more than two places.
export function weightFromPercent(raw: string): string | null {
  const t = raw.trim().replace(/%$/, "").trim();
  if (!isFixed(t)) return null;
  const v = parseFixed(t);
  return v <= 0n || v > fixedFromWhole(100) || v % 100n !== 0n ? null : fixedToDecimalString(v / 100n);
}

/// Why a draft may not be issued. `otherIssued`: the contract type already has an issued form (one per type, ruling 10).
export function formIssueFaults(f: { name: string; scaleMax: number; criteria: FormSnapshot["criteria"]; bands: FormSnapshot["bands"]; otherIssued: boolean }): Finding<FormFault>[] {
  const out: Finding<FormFault>[] = [];
  if (f.otherIssued) out.push({ code: "TYPE_HAS_ISSUED_FORM", level: "block" });
  if (!(SCALE_TOPS as readonly number[]).includes(f.scaleMax)) out.push({ code: "SCALE_OUT_OF_RANGE", level: "block", data: { top: f.scaleMax } });
  if (f.criteria.length === 0) out.push({ code: "NO_CRITERIA", level: "block" });
  else {
    if (new Set(f.criteria.map((c) => c.order)).size !== f.criteria.length) out.push({ code: "CRITERION_ORDER_REPEATED", level: "block" });
    const total = sumFixed(...f.criteria.map((c) => parseFixed(c.weight)));
    if (total !== fixedFromWhole(1)) out.push({ code: "WEIGHTS_NOT_ONE", level: "block", data: { total: formatMark(total * 100n, 0) } });
  }
  if (f.bands.length === 0) return [...out, { code: "NO_BANDS", level: "block" }];
  const lowers = f.bands.map((b) => parseFixed(b.lowerPct));
  if (!lowers.some((x) => x === 0n)) out.push({ code: "BANDS_NOT_FROM_ZERO", level: "block" });
  if (new Set(lowers).size !== lowers.length) out.push({ code: "BAND_REPEATED", level: "block" });
  // Whatever the shared band rules refuse; a gap only warns there, and cannot arise here, as each band runs up to the next.
  for (const x of bandSetFaults({ code: "grades", nameEn: f.name, bands: gradeBands(f.bands) })) if (x.level === "block") out.push(x);
  return out;
}
