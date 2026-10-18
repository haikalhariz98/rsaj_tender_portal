/**
 * The words in a date (NFR-LNG-001, ADR 0040 Q4): month abbreviations and the note on a day read in UTC
 * because the organisation's time zone is not set. Interface words, not data. The Malay is drafted in the
 * N1 slice and not yet reviewed by the customer.
 */

import { w } from "@/lib/contract/labels";

import type { Catalogue } from "../registry";

/** January first. Three letters in both languages, so a column of dates stays one width. */
export const MONTH_WORDS = [
  w("Jan", "Jan"),
  w("Feb", "Feb"),
  w("Mar", "Mac"),
  w("Apr", "Apr"),
  w("May", "Mei"),
  w("Jun", "Jun"),
  w("Jul", "Jul"),
  w("Aug", "Ogo"),
  w("Sep", "Sep"),
  w("Oct", "Okt"),
  w("Nov", "Nov"),
  w("Dec", "Dis"),
] as const;

/** Appended to a day or time read in UTC because no zone is set (ruling BD-32). */
export const ZONE_UNSET_WORDS = w("(UTC — time zone not set)", "(UTC — zon waktu belum ditetapkan)");

export const DATES: Catalogue = {
  name: "dates",
  review: "DRAFTED_NOT_REVIEWED",
  words: {
    monthJan: MONTH_WORDS[0],
    monthFeb: MONTH_WORDS[1],
    monthMar: MONTH_WORDS[2],
    monthApr: MONTH_WORDS[3],
    monthMay: MONTH_WORDS[4],
    monthJun: MONTH_WORDS[5],
    monthJul: MONTH_WORDS[6],
    monthAug: MONTH_WORDS[7],
    monthSep: MONTH_WORDS[8],
    monthOct: MONTH_WORDS[9],
    monthNov: MONTH_WORDS[10],
    monthDec: MONTH_WORDS[11],
    zoneUnset: ZONE_UNSET_WORDS,
  },
};
