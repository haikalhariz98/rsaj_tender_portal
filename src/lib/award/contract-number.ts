/**
 * Where the contract number comes from (FR-CON-002, OQ-11; 6.11 rulings).
 *
 * A tender award draws the next number from its contract type's series. A quotation
 * award follows `AwardPolicy.quotationContractKey`: the indent's own number, or the
 * series. Unset refuses: a contract is never numbered on an assumption. The number is
 * drawn in the issue transaction, dated the issue day ("the year the contract starts":
 * an assumed reading, shown).
 */

import type { QuotationContractKey } from "./types";

export type NumberSource = { source: "SERIES"; seriesKey: string } | { source: "INDENT_NUMBER" } | { fault: "CONTRACT_SERIES_NOT_SET" | "QUOTATION_KEY_NOT_SET" };

export function contractNumberSource(regime: string | null, quotationKey: QuotationContractKey | null, seriesKey: string | null): NumberSource {
  if (regime === "quotation") {
    if (!quotationKey) return { fault: "QUOTATION_KEY_NOT_SET" };
    if (quotationKey === "INDENT_NUMBER") return { source: "INDENT_NUMBER" };
  }
  return seriesKey ? { source: "SERIES", seriesKey } : { fault: "CONTRACT_SERIES_NOT_SET" };
}

export const CONTRACT_YEAR_READING = "Numbered in the year of issue, read as the year the contract starts: an assumed reading, to be confirmed.";
