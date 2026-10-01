/**
 * Money on the requisition screen, as words (62-C3). The trail stores figures as decimal
 * strings and the lines total is sen; both are read through `parseSen` and written with
 * `formatMoney`, never through a JavaScript number: a `Decimal(18, 2)` column holds 16
 * digits before the point, past what a float keeps exactly, so `Number()` would show a
 * figure nobody entered. Pure.
 */

import { formatMoney, parseSen, type Sen } from "@/lib/money";

/// Figures the trail stores as decimal strings, read back as ringgit.
export const MONEY_FIELDS: ReadonlySet<string> = new Set([
  "estimatedValue",
  "estimatedAmount",
  "unitPrice",
  "value",
  "amount",
  "balanceAsAt",
  "actualBudget",
  "approvedAccount",
  "projectedBalance",
  "combinedValue",
  "boundaryValue",
  "requested",
  "requestedAmount",
]);

/// A History value in ringgit where the field is money and the value an amount; else null,
/// so the caller reads it some other way.
export function historyMoneyText(field: string, value: string): string | null {
  if (!MONEY_FIELDS.has(field) || !/^-?\d+(\.\d{1,2})?$/.test(value)) return null;
  return formatMoney(parseSen(value));
}

/// The Line items card's subtitle: how many lines, and what they come to.
export const linesSubtitle = (count: number, total: Sen) => `${count} ${count === 1 ? "line" : "lines"}, coming to ${formatMoney(total)}.`;
