/**
 * How a reference is formed, and when the serial starts again.
 *
 * Pure. A reference is the primary business key of a matter — it appears on the
 * contract, the certificates and the payment — so it is formed from configuration
 * and never improvised. Allocated numbers are never reused: a gap is recorded rather
 * than closed up, because a missing reference is evidence and a renumbered one is
 * not.
 */

export type NumberingReset = "NEVER" | "CALENDAR_YEAR" | "FINANCIAL_YEAR";

export interface Series {
  key: string;
  nameEn: string;
  /// Tokens: {SERIAL}, {YEAR}, {SHORTYEAR}, {MONTH}. Everything else is literal.
  pattern: string;
  padding: number;
  resetOn: NumberingReset;
  /// The month a financial year starts, 1 being January.
  financialYearStartMonth: number;
  nextSerial: number;
  /// The period `nextSerial` belongs to.
  serialPeriod: string;
}

export const TOKENS = ["SERIAL", "YEAR", "SHORTYEAR", "MONTH"] as const;
export type Token = (typeof TOKENS)[number];

const TOKEN_RE = /\{([A-Z]+)\}/g;

/// Tokens the pattern uses, in the order they appear.
export function tokensIn(pattern: string): string[] {
  return [...pattern.matchAll(TOKEN_RE)].map((m) => m[1]);
}

export type PatternFault =
  | { kind: "NO_SERIAL" }
  | { kind: "UNKNOWN_TOKEN"; token: string }
  | { kind: "RESET_WITHOUT_PERIOD" };

/**
 * What is wrong with a pattern.
 *
 * A pattern without {SERIAL} would give every matter the same reference. A pattern
 * that resets yearly but shows no year would give two matters in different years the
 * same reference — the more dangerous of the two, because it only collides later.
 */
export function patternFaults(series: Pick<Series, "pattern" | "resetOn">): PatternFault[] {
  const faults: PatternFault[] = [];
  const used = tokensIn(series.pattern);

  if (!used.includes("SERIAL")) faults.push({ kind: "NO_SERIAL" });

  for (const token of used) {
    if (!(TOKENS as readonly string[]).includes(token)) {
      faults.push({ kind: "UNKNOWN_TOKEN", token });
    }
  }

  const showsPeriod = used.includes("YEAR") || used.includes("SHORTYEAR");
  if (series.resetOn !== "NEVER" && !showsPeriod) {
    faults.push({ kind: "RESET_WITHOUT_PERIOD" });
  }

  return faults;
}

/**
 * The period a date falls in, for reset purposes.
 *
 * A financial year is labelled by the calendar year it starts in, so a year beginning
 * in April runs 2026 from April 2026 to March 2027.
 */
export function periodFor(series: Series, on: Date): string {
  if (series.resetOn === "NEVER") return "";

  const year = on.getUTCFullYear();
  if (series.resetOn === "CALENDAR_YEAR") return String(year);

  const month = on.getUTCMonth() + 1;
  return String(month >= series.financialYearStartMonth ? year : year - 1);
}

/// Whether the serial starts again for this date.
export function needsReset(series: Series, on: Date): boolean {
  if (series.resetOn === "NEVER") return false;
  return periodFor(series, on) !== series.serialPeriod;
}

/// The serial a matter raised on this date would take.
export function serialFor(series: Series, on: Date): number {
  return needsReset(series, on) ? 1 : series.nextSerial;
}

/**
 * Render a reference.
 *
 * The year rendered is the reset period where the series resets, so a financial-year
 * series shows the year it belongs to rather than the calendar year of the day.
 */
export function formatReference(series: Series, on: Date, serial: number): string {
  const period = periodFor(series, on);
  const year = series.resetOn === "FINANCIAL_YEAR" && period ? Number(period) : on.getUTCFullYear();

  return series.pattern.replace(TOKEN_RE, (whole, token: string) => {
    switch (token) {
      case "SERIAL":
        return String(serial).padStart(Math.max(1, series.padding), "0");
      case "YEAR":
        return String(year);
      case "SHORTYEAR":
        return String(year).slice(-2);
      case "MONTH":
        return String(on.getUTCMonth() + 1).padStart(2, "0");
      default:
        // An unknown token is left as written rather than blanked, so the fault is
        // visible in the reference instead of producing a plausible wrong one.
        return whole;
    }
  });
}

/// What the next reference would look like, for the preview on the screen.
export function previewNext(series: Series, on: Date): string {
  return formatReference(series, on, serialFor(series, on));
}

/**
 * The series after issuing one reference.
 *
 * Returned rather than mutated, so the caller writes it in the same transaction as
 * the record it numbered. The serial only ever moves forward.
 */
export function afterIssuing(series: Series, on: Date): Series {
  const period = periodFor(series, on);
  const serial = serialFor(series, on);
  return { ...series, nextSerial: serial + 1, serialPeriod: period };
}
