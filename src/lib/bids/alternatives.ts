/**
 * FR-BID-006: an alternative bid. Whether the documents permit alternatives is the window's
 * `alternativesPermitted` (null: not stated). Permitted, an alternative is considered; not
 * permitted, it is recorded and not considered, never discarded; not stated, 6.7 cannot mark any
 * alternative until it is. Most alternatives are found inside an envelope at opening, so marking
 * is mostly 6.7's; an envelope marked "alternative" on its face is recorded as one here. Pure.
 */

export type AlternativeStatus = "CONSIDERED" | "NOT_CONSIDERED" | "NOT_STATED";

export function alternativeStatus(permitted: boolean | null): AlternativeStatus {
  return permitted == null ? "NOT_STATED" : permitted ? "CONSIDERED" : "NOT_CONSIDERED";
}
