/**
 * The words in a date (NFR-LNG-001, ADR 0040 Q4): month abbreviations and the note on a day read in UTC
 * because the organisation's time zone is not set. Interface words, not data. The Malay is drafted in the
 * N1 slice and not yet reviewed by the customer.
 */

import { w } from "@/lib/contract/labels";


/** January first. Three letters in both languages, so a column of dates stays one width. */
export const MONTH_WORDS = [
  w("Jan"),
  w("Feb"),
  w("Mar"),
  w("Apr"),
  w("May"),
  w("Jun"),
  w("Jul"),
  w("Aug"),
  w("Sep"),
  w("Oct"),
  w("Nov"),
  w("Dec"),
] as const;

/** Appended to a day or time read in UTC because no zone is set (ruling BD-32). */
export const ZONE_UNSET_WORDS = w("(UTC — time zone not set)");

