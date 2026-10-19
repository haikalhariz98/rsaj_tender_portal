/**
 * Where the contract number comes from (FR-CON-002, OQ-11; 6.11 rulings).
 *
 * A tender award draws the next number from its contract type's series. A quotation
 * award follows `AwardPolicy.quotationContractKey`: the indent's own number, or the
 * series. Unset refuses: a contract is never numbered on an assumption. The number is
 * drawn in the issue transaction, dated the issue day ("the year the contract starts":
 * an assumed reading, shown).
 */

import type { InstrumentKind, QuotationContractKey } from "./types";

export type NumberFault = "CONTRACT_SERIES_NOT_SET" | "QUOTATION_KEY_NOT_SET" | "INDENT_NUMBER_NOT_AN_INDENT" | "INDENT_NUMBER_NOT_RECORDED";
export type NumberSource = { source: "SERIES"; seriesKey: string } | { source: "INDENT_NUMBER"; number: string } | { fault: NumberFault };

/**
 * The indent's own number serves only an award issued as a work indent whose indent
 * number is recorded: never a purchase order's number, never nothing.
 */
export function contractNumberSource(
  regime: string | null,
  quotationKey: QuotationContractKey | null,
  seriesKey: string | null,
  award: { kind: InstrumentKind; commitmentNo: string | null; commitmentKind: "INDENT" | "PURCHASE_ORDER" | null },
): NumberSource {
  if (regime === "quotation") {
    if (!quotationKey) return { fault: "QUOTATION_KEY_NOT_SET" };
    if (quotationKey === "INDENT_NUMBER") {
      if (award.kind !== "WORK_INDENT") return { fault: "INDENT_NUMBER_NOT_AN_INDENT" };
      const n = award.commitmentNo?.trim();
      if (!n || award.commitmentKind !== "INDENT") return { fault: "INDENT_NUMBER_NOT_RECORDED" };
      return { source: "INDENT_NUMBER", number: n };
    }
  }
  return seriesKey ? { source: "SERIES", seriesKey } : { fault: "CONTRACT_SERIES_NOT_SET" };
}

export const CONTRACT_YEAR_READING = "Year of issue. Assumed to be the start year.";
