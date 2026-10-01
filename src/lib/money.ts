/**
 * Money, as an exact integer number of sen.
 *
 * The database holds Decimal and the forms hold strings; nothing in between may be a
 * float. `0.1 + 0.2` is the reason: a budget balance that drifts by a fraction of a
 * sen per commitment eventually disagrees with the finance system, and the finance
 * system is the one that is right.
 *
 * A bigint of sen is exact, orders faster than a decimal library, and converts to the
 * two-decimal string Prisma wants without rounding.
 */

/// Sen. 100 to the ringgit.
export type Sen = bigint;

export class MoneyFormatError extends Error {}

/**
 * Parse an amount written as a decimal string.
 *
 * Accepts thousands separators and at most two decimal places. Rejects anything else
 * rather than rounding it: silently turning 10.005 into 10.01 is how a figure nobody
 * typed reaches a certificate.
 */
export function parseSen(value: string): Sen {
  const cleaned = value.trim().replace(/,/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) throw new MoneyFormatError(`Not an amount: ${value}`);

  const [, sign, whole, frac = ""] = m;
  const sen = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  return sign === "-" ? -sen : sen;
}

/**
 * The largest amount a money column holds. Every money column is `Decimal(18, 2)`: 18
 * digits, 2 after the point, so 16 before it. A larger figure would be refused by
 * Postgres as a numeric overflow, after every check had passed. This is the column's
 * precision, not a policy threshold, so it is a constant here rather than configuration.
 */
export const MONEY_COLUMN_MAX_SEN: Sen = 10n ** 18n - 1n;

/// Whether an amount fits a `Decimal(18, 2)` column, either sign.
export const fitsMoneyColumn = (sen: Sen): boolean => (sen < 0n ? -sen : sen) <= MONEY_COLUMN_MAX_SEN;

/// Read a Decimal from the database. Prisma renders it as a plain decimal string.
export function senFromDecimal(value: { toString(): string } | null | undefined): Sen {
  if (value == null) return 0n;
  return parseSen(value.toString());
}

/// Render for the database, always with two decimal places.
export function senToDecimalString(sen: Sen): string {
  const negative = sen < 0n;
  const abs = negative ? -sen : sen;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Bridge from a number already known to be a two-decimal amount — a band edge read
 * from a Decimal column — to exact sen, for comparing. Never for arithmetic on money:
 * that starts and stays in sen.
 */
export function senFromAmount(value: number): Sen {
  return BigInt(Math.round(value * 100));
}

/**
 * A Decimal read from the database, as the number the approval engine compares a band
 * with. The one bridge from a stored amount to the engine (ruling C6): the engine
 * turns it straight back into sen (`senFromAmount`) before comparing, so a value one
 * sen either side of a threshold lands where the threshold says. Never for arithmetic.
 */
export function amountOf(value: { toString(): string }): number {
  return Number(value.toString());
}

/// Two amounts written as decimal strings, compared exactly.
export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  return compareSen(parseSen(a), parseSen(b));
}

export function addSen(...values: Sen[]): Sen {
  return values.reduce((a, b) => a + b, 0n);
}

export function subtractSen(a: Sen, b: Sen): Sen {
  return a - b;
}

/**
 * A percentage of an amount, rounded half up to the sen.
 *
 * Retention, delay damages and variation limits are all percentages of a contract
 * sum, and the rounding rule has to be stated once rather than per caller.
 */
export function percentOfSen(sen: Sen, percent: number): Sen {
  if (!Number.isFinite(percent)) throw new MoneyFormatError(`Not a percentage: ${percent}`);
  // Percent carries up to four decimal places, matching the Decimal(9,4) columns.
  const scaled = BigInt(Math.round(percent * 10_000));
  const numerator = sen * scaled;
  const denominator = 1_000_000n;

  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

export function compareSen(a: Sen, b: Sen): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/// For display. The currency itself is configuration, held on the matrix policy.
export function formatSen(sen: Sen, currency = "RM"): string {
  const negative = sen < 0n;
  const abs = negative ? -sen : sen;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${currency}${whole}.${frac}`;
}

/**
 * For display, as the portal writes money everywhere: whole ringgit without sen
 * ("RM300,000"), sen only where there are some ("RM300,000.01"). One format, so a
 * figure reads the same on every screen.
 */
export function formatMoney(sen: Sen, currency = "RM"): string {
  const full = formatSen(sen, currency);
  return sen % 100n === 0n ? full.slice(0, -3) : full;
}
