/**
 * Damages by rate segment (6.13 Part B run 1b; plan B5 `lad/segments.ts`; FR-LAD-010). Pure.
 *
 * The decision's rate (frozen with it and its Certificate of Non-Completion) runs to the day before a partial
 * occupation whose reduced rate is confirmed on the issued Certificate of Partial Occupation; the confirmed rate runs
 * from the occupation day. An unconfirmed (advisory) rate changes nothing. The CPO is run 2's record: until then the
 * acts pass no occupation, and every charge is one segment.
 */

import { daysFrom } from "@/lib/dates";
import { senToDecimalString, type Sen } from "@/lib/money";

type Day = string;

/// A rate over days: from (inclusive; null from the start) until (exclusive; null without end).
export interface RateSegment {
  from: Day | null;
  until: Day | null;
  rate: Sen;
}

export function rateSegments(rate: Sen, occupation: { occupiedOn: Day; confirmedRate: Sen | null } | null): RateSegment[] {
  if (!occupation || occupation.confirmedRate == null) return [{ from: null, until: null, rate }];
  return [
    { from: null, until: occupation.occupiedOn, rate },
    { from: occupation.occupiedOn, until: null, rate: occupation.confirmedRate },
  ];
}

export interface ChargedSegment {
  from: Day;
  until: Day;
  rate: Sen;
  days: number;
}

/// The days `[start, end)` cut at each segment's edges, with each part's rate.
export function splitBySegments(start: Day, end: Day, segments: readonly RateSegment[]): ChargedSegment[] {
  const out: ChargedSegment[] = [];
  for (const s of segments) {
    const from = s.from && s.from > start ? s.from : start;
    const until = s.until && s.until < end ? s.until : end;
    if (until > from) out.push({ from, until, rate: s.rate, days: daysFrom(from, until) });
  }
  return out;
}

/// The segments as a key a frozen basis compares (never shown).
export const segmentsKey = (segments: readonly RateSegment[]): string => segments.map((s) => `${senToDecimalString(s.rate)}${s.from ? ` from ${s.from}` : ""}${s.until ? ` until ${s.until}` : ""}`).join("; ");
