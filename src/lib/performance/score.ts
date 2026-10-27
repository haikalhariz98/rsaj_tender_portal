/**
 * A report's total and grade (Phase 2 close-out stage D; FR-CPR-002, 003). Pure, in `evaluation/fixed.ts`'s four-place arithmetic.
 *
 * The total is Σ score × weight, exactly, then × 100 ÷ the scale's top, rounded once, half up, to four places. The grade is the band that holds
 * the stored total (`placeInBands`): a total no band holds is refused by name, never given the nearest band.
 */

import { placeInBands } from "@/lib/evaluation/bands";
import { divRound, parseFixed, sumFixed, type Fixed } from "@/lib/evaluation/fixed";

import { gradeBands, type FormSnapshot, type Finding } from "./form";

export type ScoreFault = "SCORE_MISSING" | "OUT_OF_SCALE" | "NOT_GRADED";

export function scoreFaults(form: Pick<FormSnapshot, "criteria" | "scaleMax">, scores: ReadonlyMap<number, number>): Finding<ScoreFault>[] {
  const out: Finding<ScoreFault>[] = [];
  for (const c of form.criteria) {
    const s = scores.get(c.order);
    if (s == null) out.push({ code: "SCORE_MISSING", level: "block", data: { criterion: c.label } });
    else if (!Number.isInteger(s) || s < 1 || s > form.scaleMax) out.push({ code: "OUT_OF_SCALE", level: "block", data: { criterion: c.label, top: form.scaleMax } });
  }
  return out;
}

/// The total, as a percentage to four places. Every criterion is scored and in scale (`scoreFaults` first).
export function reportTotal(form: Pick<FormSnapshot, "criteria" | "scaleMax">, scores: ReadonlyMap<number, number>): Fixed {
  // Σ score × weight is exact in ten-thousandths (a whole score times a four-place weight); the one rounding is the division.
  const weighted = sumFixed(...form.criteria.map((c) => BigInt(scores.get(c.order)!) * parseFixed(c.weight)));
  return divRound(weighted * 100n, BigInt(form.scaleMax));
}

/// The grade that holds the total, or the refusal naming it.
export function gradeOf(total: Fixed, bands: FormSnapshot["bands"]): { label: string } | Finding<ScoreFault> {
  const p = placeInBands(total, gradeBands(bands));
  return p.placed ? { label: p.band.labelEn } : { code: "NOT_GRADED", level: "block" };
}
