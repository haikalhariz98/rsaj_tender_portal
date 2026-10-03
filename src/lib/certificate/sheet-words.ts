/**
 * A routing sheet's target and verdict in words (FR-CRT-008, ADR 0023, ADR 0024). Pure.
 *
 * One wording for a percentage band, by the frozen type's edge switch (BD-614-4), shared by the type's own
 * page under Configuration › Routing sheets and the sheet drawn on a certificate or an award, so the two can
 * never word an edge apart:
 * - `upperEdgeInclusive` true, the band is (min, max]: "above 20% and up to and including 40%";
 * - false, the band is [min, max): "from 20% and below 40%";
 * - null (not decided): neither side is claimed, "from 20% to 40%", and the words say the edge is undecided.
 * The screens say "received" and "approved" for the two days the printed sheet numbers; the printed labels
 * are the form's own (increment 2's label pairs), never the product's.
 */

import { CERT_WORDS, w, type Words } from "./labels";
import type { Sheet } from "./routing-sheet";

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/// A band in words. `phrase`: lower-case, for use inside a sentence.
export function bandWords(lo: string | null, hi: string | null, upperEdgeInclusive: boolean | null, form: "sentence" | "phrase" = "sentence"): Words {
  const u = upperEdgeInclusive;
  if (lo == null && hi == null) return form === "sentence" ? w("Whatever the percentage", "Apa jua peratusnya") : w("whatever the percentage", "apa jua peratusnya");
  const fromEn = lo == null ? null : u === true ? `above ${lo}%` : `from ${lo}%`;
  const fromMs = lo == null ? null : u === true ? `melebihi ${lo}%` : `dari ${lo}%`;
  const toEn = hi == null ? null : u === true ? `up to and including ${hi}%` : u === false ? `below ${hi}%` : `to ${hi}%`;
  const toMs = hi == null ? null : u === true ? `hingga dan termasuk ${hi}%` : u === false ? `kurang daripada ${hi}%` : `hingga ${hi}%`;
  const join = (a: string | null, b: string | null, and: string) => [a, b].filter(Boolean).join(u == null ? " " : and);
  const en = join(fromEn, toEn, " and ");
  const ms = join(fromMs, toMs, " dan ");
  if (form === "phrase") return w(`${en}${u == null ? ", which side of an edge counts is not decided" : ""}`, `${ms}${u == null ? ", pihak sempadan yang dikira belum diputuskan" : ""}`);
  return w(`${cap(en)}${u == null ? " (which side of an edge counts is not decided)" : ""}`, `${cap(ms)}${u == null ? " (pihak sempadan yang dikira belum diputuskan)" : ""}`);
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/// The sheet's target, worded by the band it was chosen from and the frozen type's edge switch.
export function targetText(sheet: Pick<Sheet, "target" | "type">): string {
  const t = sheet.target;
  if (t.state === "SET") {
    if (!t.band) return days(t.days);
    return `${days(t.days)} (${bandWords(t.band.pctMin, t.band.pctMax, sheet.type.upperEdgeInclusive, "phrase").en}, for this percentage)`;
  }
  if (t.state === "EDGE_UNDECIDED") return CERT_WORDS.edgeUndecided.en;
  if (t.state === "NO_RATIO") return "Target not set: the type's targets are banded and no percentage was handed in with the figures";
  if (t.state === "NO_BAND") return "Target not set: no band of the type covers this percentage";
  if (t.state === "OVERLAP") return "Target not set: two of the type's targets overlap";
  return CERT_WORDS.targetNotSet.en;
}

/// The time from the received day to the approved day against the target, never "met" without one.
export function verdictText(sheet: Pick<Sheet, "target" | "type" | "verdict">): string {
  const v = sheet.verdict;
  const target = targetText(sheet);
  switch (v.state) {
    case "NOT_STARTED":
      return `Not started: the day it was received is not recorded. Target: ${target}.`;
    case "MET":
      return `${days(v.elapsed)} against ${target}: met.`;
    case "OVER":
      return `${days(v.elapsed)} against ${target}: ${days(v.by)} over.`;
    case "OPEN":
      return `Open: ${days(v.soFar)} so far against ${target}${v.overBy ? `, ${days(v.overBy)} over` : ""}.`;
    case "NOT_MEASURED":
      return `${v.elapsed == null ? "Open" : days(v.elapsed)}. ${target}, so it is not judged met or over.`;
  }
}
