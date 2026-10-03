/**
 * The contract sum's position as a screen reads it (run 3 residual M1): the issued adjustments, the revised sum and
 * the sum a variation's percentage is taken over, or, where an issued adjustment's net cannot be read, a refusal
 * naming its certificate. A refusal reads nothing over the issued adjustments (no revised sum, and no base where the
 * base is the revised sum), never a figure that silently leaves one out. Pure.
 */

import { readIssuedAdjustments, type IssuedAdjustment, type IssuedAdjustmentRow, type IssuedAdjustmentsRead } from "@/lib/adjustment/ppjhk";
import type { Sen } from "@/lib/money";

import type { VariationBase } from "./types";

export interface PositionInput {
  /// The baseline's contract sum in force, or null where none is.
  original: Sen | null;
  adjustments: readonly IssuedAdjustmentRow[];
  /// The organisation's base for a variation's percentage, as set (null: not set).
  variationBase: VariationBase | null;
}

export interface Position {
  issued: IssuedAdjustment[];
  revised: Sen | null;
  base: Sen | null;
  refused: Extract<IssuedAdjustmentsRead, { ok: false }>["refused"] | null;
}

export function positionOf(i: PositionInput): Position {
  const read = readIssuedAdjustments(i.adjustments);
  if (!read.ok) return { issued: [], revised: null, base: i.variationBase === "ORIGINAL" ? i.original : null, refused: read.refused };
  const revised = i.original == null ? null : read.issued.reduce((a, x) => a + x.net, i.original);
  const base = i.variationBase === "REVISED" ? revised : i.variationBase === "ORIGINAL" ? i.original : null;
  return { issued: read.issued, revised, base, refused: null };
}
