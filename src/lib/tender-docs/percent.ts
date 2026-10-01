/**
 * Percentages of money, exactly, to six places (the Appendix's LAD rate is a Decimal(9,6),
 * "0.025" per cent a day). A percentage is read from its decimal string as whole
 * millionths of a per cent, so nothing passes through a float, and a figure is rounded
 * once, half up to the sen, at the point it is stated.
 */

import type { Sen } from "@/lib/money";

export class PercentError extends Error {}

const PLACES = 6;
const SCALE = 10n ** BigInt(PLACES);

/// A percentage string as millionths of a per cent: "0.025" → 25000n, "10" → 10000000n.
export function parsePct(pct: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(pct.trim());
  if (!m) throw new PercentError(`Not a percentage to six places: ${pct}`);
  return BigInt(m[1]) * SCALE + BigInt((m[2] ?? "").padEnd(PLACES, "0"));
}

/**
 * The column a percentage is stored in, as Postgres declares it: Decimal(precision, scale).
 * A value with more places than the scale would be rounded on save without a word, and one
 * with more whole digits than precision − scale would overflow it; both are refused here,
 * by the field's name, before anything is written.
 */
export interface PctColumn {
  /// Decimal places the column keeps (its scale).
  places: number;
  /// Digits before the point (precision − scale): the value stays below 10^this.
  wholeDigits: number;
}

/// Each percentage 6.4 stores, and its column (prisma/schema.prisma).
export const PCT_COLUMN = {
  /// ConditionsAppendix.ladPct, Decimal(9,6).
  ladPct: { places: 6, wholeDigits: 3 },
  /// AppendixSection.ladPct, Decimal(9,6).
  sectionLadPct: { places: 6, wholeDigits: 3 },
  /// ConditionsAppendix.worksInsuranceUpliftPct, Decimal(9,4).
  worksInsuranceUpliftPct: { places: 4, wholeDigits: 5 },
  /// TenderDocumentPolicy.ladDailyPct, Decimal(9,6).
  ladDailyPct: { places: 6, wholeDigits: 3 },
  /// TenderDocumentPolicy.firstCertificatePct, Decimal(9,4).
  firstCertificatePct: { places: 4, wholeDigits: 5 },
} as const satisfies Record<string, PctColumn>;
export type PctField = keyof typeof PCT_COLUMN;

export type PctFault = "NOT_A_PERCENTAGE" | "TOO_MANY_PLACES" | "TOO_LARGE";

/// Why a string is not a percentage this column holds, or null where it is.
export function pctFault(pct: string, column: PctColumn): PctFault | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(pct.trim());
  if (!m) return "NOT_A_PERCENTAGE";
  if ((m[2] ?? "").length > column.places) return "TOO_MANY_PLACES";
  if (m[1].replace(/^0+(?=\d)/, "").length > column.wholeDigits) return "TOO_LARGE";
  return null;
}

/**
 * Whether a string is a percentage: not negative, read exactly. Given its column, also
 * within the column's places and below its upper bound (10^wholeDigits); without one, up
 * to six places, as every stored percentage reads back.
 */
export function isPct(pct: string, column?: PctColumn): boolean {
  if (column) return pctFault(pct, column) == null;
  try {
    parsePct(pct);
    return true;
  } catch {
    return false;
  }
}

/// The upper bound of a column, as printed: "1,000" for three whole digits.
const boundText = (column: PctColumn) => (10n ** BigInt(column.wholeDigits)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const PLACES_WORD = ["no", "one", "two", "three", "four", "five", "six"];

/// The form's hint for a percentage field, from its column: "Up to six decimal places, below 1,000."
export function pctHint(column: PctColumn): string {
  return `Up to ${PLACES_WORD[column.places] ?? column.places} decimal places, below ${boundText(column)}.`;
}

/// The one refusal text for a percentage field: what it must be, by its label and its column.
export function pctRefusal(label: string, column: PctColumn): string {
  return `${label} must be a percentage below ${boundText(column)}, with at most ${column.places} decimal places.`;
}

/// `pct` per cent of `sen`, rounded half up to the sen. Money is never negative here.
export function pctOf(sen: Sen, pct: string): Sen {
  const n = sen * parsePct(pct);
  const d = 100n * SCALE;
  if (n < 0n) throw new PercentError("A negative amount has no percentage here.");
  return (n + d / 2n) / d;
}

/// A percentage as the screens print it: trailing zeros dropped, "0.025%".
export function formatPct(pct: string): string {
  const v = parsePct(pct);
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(PLACES, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}
