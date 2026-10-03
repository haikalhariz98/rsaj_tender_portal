/**
 * Correcting the award's recorded terms after issue (carry 612-C1, ruled at 6.13 planning; ADR 0021
 * Amendment 1). A term the baseline takes from the Letter of Acceptance (AWARD) that was recorded wrongly from
 * the signed letter is corrected at its source: the award's recorded term, with a reason, and a CORRECTION
 * version whose source stays AWARD, shown "corrected from …". The issued letter, earlier versions and the
 * certificates pinned to them are never touched. A change to the terms themselves is a variation, not this.
 *
 * Which terms: the ones a baseline reads from the award: liquidated damages (an amount a day), the defects
 * liability period (none recorded as 0 months, BD-64-40), retention and its cap, and the completion period.
 * Not the contract sum: it is the sum the appointment was approved at, and a wrong one is not a record to fix
 * (BD-613-3). Pure: money is sen, percentages exact decimal strings.
 */

import { formatMoney, type Sen } from "@/lib/money";
import { isPct } from "@/lib/tender-docs/percent";

import { PER_DAY, type BaselineValues } from "./baseline";
import { BASELINE_FIELD_WORDS, type Words } from "./labels";
import type { BaselineSource, Finding, PeriodUnit } from "./types";

export const AWARD_TERMS = ["LAD", "DLP", "RETENTION", "COMPLETION"] as const;
export type AwardTerm = (typeof AWARD_TERMS)[number];

/// The baseline row each term is (the Baseline tab's keys).
export const TERM_FIELD: Readonly<Record<AwardTerm, string>> = { LAD: "lad", DLP: "dlp", RETENTION: "retention", COMPLETION: "completion" };

/// Each term in words (exhaustive): the Baseline tab's own label for its row.
export const AWARD_TERM_WORDS: Readonly<Record<AwardTerm, Words>> = {
  LAD: BASELINE_FIELD_WORDS.lad,
  DLP: BASELINE_FIELD_WORDS.dlp,
  RETENTION: BASELINE_FIELD_WORDS.retention,
  COMPLETION: BASELINE_FIELD_WORDS.completion,
};

export type TermInput =
  | { term: "LAD"; amount: Sen }
  | { term: "DLP"; months: number }
  | { term: "RETENTION"; percent: string; cap: string }
  | { term: "COMPLETION"; period: number; unit: PeriodUnit };

/// The award's recorded columns a term is, as decimal strings (what the award row holds).
export interface AwardTermColumns {
  ladAmount: string | null;
  ladUnit: string;
  dlpMonths: number | null;
  retentionPercent: string | null;
  retentionCapPercent: string | null;
  completionPeriod: number;
  completionUnit: PeriodUnit;
}

const UNIT_WORDS: Readonly<Record<PeriodUnit, [string, string]>> = { DAYS: ["day", "days"], WEEKS: ["week", "weeks"], MONTHS: ["month", "months"] };
const period = (n: number, u: PeriodUnit) => `${n} ${UNIT_WORDS[u][n === 1 ? 0 : 1]}`;
const pctText = (v: string) => `${v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;

/// The term as the award records it, in words ("Not set" where it records nothing).
export function termText(term: AwardTerm, c: AwardTermColumns, sen: (v: string) => Sen): string {
  switch (term) {
    case "LAD":
      return c.ladAmount == null ? "Not set" : `${formatMoney(sen(c.ladAmount))} ${c.ladUnit || "(no unit)"}`;
    case "DLP":
      return c.dlpMonths == null ? "Not set" : c.dlpMonths === 0 ? "None" : period(c.dlpMonths, "MONTHS");
    case "RETENTION":
      return c.retentionPercent == null && c.retentionCapPercent == null ? "Not set" : `${c.retentionPercent ? pctText(c.retentionPercent) : "not set"}, capped at ${c.retentionCapPercent ? pctText(c.retentionCapPercent) : "not set"} of the contract sum`;
    case "COMPLETION":
      return period(c.completionPeriod, c.completionUnit);
  }
}

/// The award's columns after the correction (only the term's own change).
export function correctedColumns(c: AwardTermColumns, i: TermInput, decimal: (s: Sen) => string): AwardTermColumns {
  switch (i.term) {
    case "LAD":
      return { ...c, ladAmount: decimal(i.amount), ladUnit: PER_DAY };
    case "DLP":
      return { ...c, dlpMonths: i.months };
    case "RETENTION":
      return { ...c, retentionPercent: i.percent, retentionCapPercent: i.cap };
    case "COMPLETION":
      return { ...c, completionPeriod: i.period, completionUnit: i.unit };
  }
}

/// Where a version's value for the term came from; the completion period is always the award's.
export function termSource(term: AwardTerm, v: BaselineValues): BaselineSource | null {
  switch (term) {
    case "LAD":
      return v.ladSource;
    case "DLP":
      return v.dlpSource;
    case "RETENTION":
      return v.retentionSource;
    case "COMPLETION":
      return "AWARD";
  }
}

/// The version's values with the term corrected, still sourced AWARD (derive afterwards).
export function applyTerm(v: BaselineValues, i: TermInput): BaselineValues {
  switch (i.term) {
    case "LAD":
      return { ...v, ladKind: "AMOUNT_PER_DAY", ladAmount: i.amount, ladPct: null, ladUnit: PER_DAY, ladSource: "AWARD" };
    case "DLP":
      return { ...v, dlpApplies: i.months > 0, dlpMonths: i.months > 0 ? i.months : null, dlpSource: "AWARD" };
    case "RETENTION":
      return { ...v, retentionApplies: true, retentionPercent: i.percent, retentionCapPercent: i.cap, retentionSource: "AWARD" };
    case "COMPLETION":
      return { ...v, completionPeriod: i.period, completionUnit: i.unit };
  }
}

/// A percentage as Decimal(9,4) holds it, at most 100.
const pctUpTo100 = (v: string) => isPct(v) && /^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v.split(".")[0]) <= 100 && !(Number(v.split(".")[0]) === 100 && /[1-9]/.test(v.split(".")[1] ?? ""));

export type AwardCorrectionFault = "AWARD_NOT_ISSUED" | "AWARD_CANCELLED" | "NO_BASELINE_VERSION" | "NOT_AWARD_SOURCED" | "REASON_REQUIRED" | "NOTHING_CHANGED" | "VALUE_NOT_VALID" | "BASELINE_INCOMPLETE";

/**
 * Why a correction of the award's recorded term is refused, each naming the way out: before issue the terms
 * are edited on the award; a cancelled award keeps its record; with no version there is nothing to correct
 * (the draft is built from the award as it stands); a term the baseline does not take from the award is not
 * the award's to correct (an entered value has its own correction, a stated one its own source).
 */
export function awardCorrectionFaults(i: {
  awardStatus: string;
  awardIssued: boolean;
  versions: number;
  source: BaselineSource | null;
  term: AwardTerm;
  input: TermInput;
  reason: string;
  changed: boolean;
  blocks: number;
}): Finding<AwardCorrectionFault>[] {
  const out: Finding<AwardCorrectionFault>[] = [];
  const f = (code: AwardCorrectionFault, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.awardStatus === "CANCELLED") f("AWARD_CANCELLED");
  else if (!i.awardIssued) f("AWARD_NOT_ISSUED");
  if (i.versions === 0) f("NO_BASELINE_VERSION");
  else if (i.source !== "AWARD") f("NOT_AWARD_SOURCED", { term: i.term, source: i.source });
  const bad =
    (i.input.term === "LAD" && i.input.amount <= 0n) ||
    (i.input.term === "DLP" && (!Number.isInteger(i.input.months) || i.input.months < 0)) ||
    (i.input.term === "RETENTION" && (!pctUpTo100(i.input.percent) || !pctUpTo100(i.input.cap))) ||
    (i.input.term === "COMPLETION" && (!Number.isInteger(i.input.period) || i.input.period < 1));
  if (bad) f("VALUE_NOT_VALID", { term: i.term });
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (out.length === 0 && !i.changed) f("NOTHING_CHANGED");
  if (out.length === 0 && i.blocks > 0) f("BASELINE_INCOMPLETE", { count: i.blocks });
  return out;
}

/// What a version written by such a correction records in its snapshot (read back for "corrected from …").
export interface AwardCorrectionMark {
  term: AwardTerm;
  from: string;
  to: string;
}

export function readCorrectionMark(snapshot: unknown): AwardCorrectionMark | null {
  const m = (snapshot as { awardCorrection?: unknown } | null)?.awardCorrection as Partial<AwardCorrectionMark> | undefined;
  if (!m || typeof m.from !== "string" || typeof m.to !== "string" || !(AWARD_TERMS as readonly string[]).includes(String(m.term))) return null;
  return { term: m.term as AwardTerm, from: m.from, to: m.to };
}

/**
 * Whether a certificate pinned to version `pinned` reads a baseline the award's terms were corrected after
 * (the certificate keeps the version it read and says so): the later correction versions' marks, in order.
 */
export function correctedAfter(pinned: number, versions: readonly { version: number | null; snapshot: unknown }[]): (AwardCorrectionMark & { version: number })[] {
  return versions
    .filter((v) => v.version != null && v.version > pinned)
    .map((v) => ({ v, m: readCorrectionMark(v.snapshot) }))
    .filter((x): x is { v: (typeof versions)[number]; m: AwardCorrectionMark } => x.m != null)
    .sort((a, b) => a.v.version! - b.v.version!)
    .map((x) => ({ ...x.m, version: x.v.version! }));
}
