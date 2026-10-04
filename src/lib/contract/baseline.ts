/**
 * The contract baseline (FR-CON-014, ADR 0021): what every post-award calculation reads, built once
 * from the records that state it, never re-keyed afterwards.
 *
 * Where each value comes from, in order (the first that states it wins):
 * - the Letter of Acceptance's terms on the award (AWARD): the contract sum, the completion period,
 *   liquidated damages as an amount a day, the defects liability period (none is stored as 0 months
 *   on the award, BD-64-40, and reads here as "does not apply"), retention and its cap;
 * - the frozen tender Appendix (APPENDIX): liquidated damages as an amount or a percentage of the sum a
 *   day (a percentage resolved here against the contract sum, half up to the sen, §8.6 Q-6), the
 *   defects liability period, sectional completion and each section's damages, the interim minimums
 *   and the days to honour a certificate;
 * - the bill of quantities pinned to the approved pack (BQ): prime cost and provisional sums;
 * - a configured rule recorded in the snapshot (DERIVED): retention and the defects liability period
 *   from the exercise's frozen terms band ("below RM50,000: no retention" is such a band, a fixture
 *   here and never seeded), the builders' works value (§8.3), and the first interim minimum as the
 *   lesser of the policy's floor and percentage of that value;
 * - an officer at baseline (ENTERED, OD-5 A), only where nothing above states the value, with the
 *   provenance the officer chose (no default), shown "entered at baseline, not from a tender Appendix".
 *
 * Nothing stated reads "Not set", never 0 (B3: retention that applies with no percentage or cap is not
 * set, never 0%). Money is sen (bigint); percentages are exact decimal strings; each figure is rounded
 * once, half up to the sen, where it is stated. Pure: no clock, no database, no configuration it is not
 * given.
 */

import { dayPlus } from "@/lib/dates";
import { LAD_PER_DAY } from "@/lib/award/appendix-baseline";
import type { Sen } from "@/lib/money";
import { completionDay } from "@/lib/securities/period";
import { firstInterimMinimum, ladDaily } from "@/lib/tender-docs/appendix";
import { isPct } from "@/lib/tender-docs/percent";

import type { BaselineReason, BaselineSource, Finding, LadKind, PeriodUnit, Provenance } from "./types";

export type Day = string;

/// The award's word for a daily rate (6.11's own constant): the only unit a daily figure is read from.
export const PER_DAY = LAD_PER_DAY;

export interface SectionValue {
  ref: string;
  description: string;
  ladKind: LadKind | null;
  ladAmount: Sen | null;
  ladPct: string | null;
  /// Resolved against the contract sum; null where the section's damages are not stated.
  ladDaily: Sen | null;
  /// 6.13 Part B run 1b (ADR 0030): the days an extension of time on this section alone added (absent: none).
  extensionDays?: number;
}

export interface BaselineValues {
  contractSum: Sen;
  contractDate: Day | null;
  possessionDate: Day | null;
  completionPeriod: number;
  completionUnit: PeriodUnit;
  dateForCompletion: Day | null;
  dlpApplies: boolean | null;
  dlpMonths: number | null;
  dlpSource: BaselineSource | null;
  ladKind: LadKind | null;
  ladAmount: Sen | null;
  ladPct: string | null;
  ladUnit: string;
  ladDaily: Sen | null;
  ladSource: BaselineSource | null;
  retentionApplies: boolean | null;
  retentionPercent: string | null;
  retentionCapPercent: string | null;
  retentionSource: BaselineSource | null;
  pcSums: Sen | null;
  provisionalSums: Sen | null;
  sumsSource: BaselineSource | null;
  buildersWorksValue: Sen | null;
  firstInterimMinimum: Sen | null;
  firstInterimSource: BaselineSource | null;
  subsequentInterimMinimum: Sen | null;
  subsequentInterimSource: BaselineSource | null;
  honourCertificateDays: number | null;
  honourSource: BaselineSource | null;
  unfixedMaterialsPct: string | null;
  onCostPct: string | null;
  designWorkValue: Sen | null;
  sectionalCompletion: boolean | null;
  sectionalSource: BaselineSource | null;
  sections: SectionValue[];
  /// 6.13 Part B run 1b (ADR 0030): the days extensions have added to the whole works' date for completion (absent:
  /// none), so a correction deriving the date from possession and the period keeps them.
  extensionDays?: number;
}

/// What a baseline is built from, as frozen when preparation starts (the snapshot keeps it).
export interface BaselineInputs {
  contractSum: Sen;
  award: {
    completionPeriod: number;
    completionUnit: PeriodUnit;
    ladAmount: Sen | null;
    ladUnit: string;
    retentionPercent: string | null;
    retentionCapPercent: string | null;
    dlpMonths: number | null;
    termsProvenance: Provenance | null;
  };
  /// The frozen tender Appendix; null where the exercise froze none (pre-6.4, OD-5).
  appendix: {
    packVersion: number;
    ladKind: LadKind | null;
    ladAmount: Sen | null;
    ladPct: string | null;
    dlpApplies: boolean | null;
    dlpMonths: number | null;
    sectionalCompletion: boolean | null;
    sections: readonly { description: string; ladKind: LadKind | null; ladAmount: Sen | null; ladPct: string | null }[];
    firstInterimMinimum: Sen | null;
    subsequentInterimMinimum: Sen | null;
    honourCertificateDays: number | null;
  } | null;
  /// The prime cost and provisional sums of the pack's pinned bill; null where none was pinned.
  bq: { versionNo: number; primeCostSums: Sen; provisionalSums: Sen; incompleteLines: number } | null;
  /// The exercise's terms band as frozen at its determination; null where none was recorded.
  band: { label: string | null; retentionApplies: boolean | null; defectsLiabilityApplies: boolean | null; provenance: Provenance | null } | null;
  /// The contract type's DLP behaviour as frozen at the move into preparation (FR-MTD-012).
  type: { name: string | null; defectsLiabilityApplies: boolean | null };
  /// §8.3: the first interim minimum's floor and percentage of the builders' works value.
  interimPolicy: { floor: Sen | null; pct: string | null; provenance: Provenance | null };
}

/// What an officer may key at baseline, by group.
export const ENTERED_GROUPS = ["lad", "dlp", "retention", "sums", "firstInterim", "subsequentInterim", "honourDays", "sectional", "unfixedMaterials", "onCost", "designWork"] as const;
export type EnteredGroup = (typeof ENTERED_GROUPS)[number];

export interface EnteredValues {
  lad?: { kind: LadKind; amount: Sen | null; pct: string | null };
  dlp?: { applies: boolean; months: number | null };
  retention?: { applies: boolean; percent: string | null; cap: string | null };
  sums?: { pc: Sen; ps: Sen };
  firstInterim?: Sen;
  subsequentInterim?: Sen;
  honourDays?: number;
  sectional?: { applies: boolean; sections: readonly { ref: string; description: string; ladKind: LadKind | null; ladAmount: Sen | null; ladPct: string | null }[] };
  unfixedMaterials?: string;
  onCost?: string;
  designWork?: Sen;
}

/// The day the works are due, from possession (§8.10's adding rule: months clamped, then days). Null until possession.
export function dateForCompletion(possession: Day | null, period: number, unit: PeriodUnit): Day | null {
  return possession ? completionDay(possession, period, unit) : null;
}

/**
 * The LAD a day (§8.6, 6.4 Q-6). A percentage is resolved only against the contract sum: with none it is
 * "fixed at award", never computed on an estimate or the exercise's value. 0.025% of RM1,077,508.60 is
 * RM269.377…, stated as RM269.38 (half up to the sen).
 */
export function ladDailyOf(kind: LadKind | null, amount: Sen | null, pct: string | null, contractSum: Sen | null): Sen | "FIXED_AT_AWARD" | "NOT_SET" {
  const d = ladDaily({ ladKind: kind, ladAmount: amount, ladPct: pct }, contractSum);
  if (d.kind === "AMOUNT") return d.sen;
  if (d.kind === "PERCENT") return d.sen ?? "FIXED_AT_AWARD";
  return "NOT_SET";
}

const resolveLad = (kind: LadKind | null, amount: Sen | null, pct: string | null, sum: Sen): Sen | null => {
  const d = ladDailyOf(kind, amount, pct, sum);
  return typeof d === "bigint" ? d : null;
};

/// The source each group takes from the inputs alone; null where nothing states it (it may be entered).
export function sourceOf(group: EnteredGroup, i: BaselineInputs): BaselineSource | null {
  const a = i.appendix;
  switch (group) {
    case "lad":
      return i.award.ladAmount != null ? "AWARD" : a?.ladKind != null ? "APPENDIX" : null;
    case "dlp":
      return i.award.dlpMonths != null ? "AWARD" : a?.dlpApplies != null ? "APPENDIX" : i.band?.defectsLiabilityApplies === false ? "DERIVED" : null;
    case "retention":
      if (i.band?.retentionApplies === false) return "DERIVED";
      return i.award.retentionPercent != null && i.award.retentionCapPercent != null ? "AWARD" : null;
    case "sums":
      return i.bq && i.bq.incompleteLines === 0 ? "BQ" : null;
    case "firstInterim":
      return a?.firstInterimMinimum != null ? "APPENDIX" : null;
    case "subsequentInterim":
      return a?.subsequentInterimMinimum != null ? "APPENDIX" : null;
    case "honourDays":
      return a?.honourCertificateDays != null ? "APPENDIX" : null;
    case "sectional":
      return a?.sectionalCompletion != null ? "APPENDIX" : null;
    case "unfixedMaterials":
    case "onCost":
    case "designWork":
      return null;
  }
}

/// Why a group may not be keyed at baseline: something already states it.
export function enterFault(group: EnteredGroup, i: BaselineInputs): "STATED_ELSEWHERE" | "DERIVED_BY_POLICY" | null {
  if (sourceOf(group, i) != null) return "STATED_ELSEWHERE";
  // The first interim minimum is derived wherever the policy states both halves (§8.3): it is not keyed over.
  if (group === "firstInterim" && i.interimPolicy.floor != null && i.interimPolicy.pct != null) return "DERIVED_BY_POLICY";
  return null;
}

/**
 * The derived values, from the rest: the LAD a day (and each section's) against the contract sum, the
 * builders' works value (§8.3: the sum less prime cost and provisional sums), the first interim minimum
 * where nothing states it and the policy can derive it, and the date for completion from possession.
 */
export function derive(v: BaselineValues, policy: BaselineInputs["interimPolicy"]): BaselineValues {
  const ladDailyValue = v.ladKind === "AMOUNT_PER_DAY" && v.ladUnit !== PER_DAY ? null : resolveLad(v.ladKind, v.ladAmount, v.ladPct, v.contractSum);
  const bwv = v.pcSums != null && v.provisionalSums != null ? v.contractSum - v.pcSums - v.provisionalSums : null;
  let first = v.firstInterimMinimum;
  let firstSource = v.firstInterimSource;
  if (firstSource == null || firstSource === "DERIVED") {
    const d = bwv == null ? "NOT_SET" : firstInterimMinimum(bwv, policy);
    first = d === "NOT_SET" ? null : d;
    firstSource = d === "NOT_SET" ? null : "DERIVED";
  }
  return {
    ...v,
    ladDaily: ladDailyValue,
    buildersWorksValue: bwv,
    firstInterimMinimum: first,
    firstInterimSource: firstSource,
    sections: v.sections.map((s) => ({ ...s, ladDaily: resolveLad(s.ladKind, s.ladAmount, s.ladPct, v.contractSum) })),
    // 6.13 Part B run 1b (ADR 0030, flagged against 6.12): an extension's days stay added.
    dateForCompletion: plusExtension(dateForCompletion(v.possessionDate, v.completionPeriod, v.completionUnit), v.extensionDays ?? 0),
  };
}

const plusExtension = (d: Day | null, days: number): Day | null => (d && days ? dayPlus(d, days) : d);

/// Write keyed values over a baseline, each group marked ENTERED. The caller decides which groups may be keyed.
export function applyEntered(v: BaselineValues, e: EnteredValues): BaselineValues {
  const out: BaselineValues = { ...v };
  if (e.lad) Object.assign(out, { ladKind: e.lad.kind, ladAmount: e.lad.kind === "AMOUNT_PER_DAY" ? e.lad.amount : null, ladPct: e.lad.kind === "PERCENT_OF_SUM_PER_DAY" ? e.lad.pct : null, ladUnit: PER_DAY, ladSource: "ENTERED" });
  if (e.dlp) Object.assign(out, { dlpApplies: e.dlp.applies, dlpMonths: e.dlp.applies ? e.dlp.months : null, dlpSource: "ENTERED" });
  if (e.retention) Object.assign(out, { retentionApplies: e.retention.applies, retentionPercent: e.retention.applies ? e.retention.percent : null, retentionCapPercent: e.retention.applies ? e.retention.cap : null, retentionSource: "ENTERED" });
  if (e.sums) Object.assign(out, { pcSums: e.sums.pc, provisionalSums: e.sums.ps, sumsSource: "ENTERED" });
  if (e.firstInterim != null) Object.assign(out, { firstInterimMinimum: e.firstInterim, firstInterimSource: "ENTERED" });
  if (e.subsequentInterim != null) Object.assign(out, { subsequentInterimMinimum: e.subsequentInterim, subsequentInterimSource: "ENTERED" });
  if (e.honourDays != null) Object.assign(out, { honourCertificateDays: e.honourDays, honourSource: "ENTERED" });
  if (e.sectional) Object.assign(out, { sectionalCompletion: e.sectional.applies, sectionalSource: "ENTERED", sections: e.sectional.applies ? e.sectional.sections.map((s) => ({ ...s, ladDaily: null })) : [] });
  if (e.unfixedMaterials != null) out.unfixedMaterialsPct = e.unfixedMaterials;
  if (e.onCost != null) out.onCostPct = e.onCost;
  if (e.designWork != null) out.designWorkValue = e.designWork;
  return out;
}

/// What the officer said about each keyed group (OD-5 A): the provenance they chose, with no default, and a note.
export type EnteredProvenance = Partial<Record<EnteredGroup, { provenance: Provenance | null; note: string }>>;

export type EnteredFault = "PROVENANCE_NOT_CHOSEN" | "STATED_ELSEWHERE" | "DERIVED_BY_POLICY";

/**
 * Why keyed values may not be saved, each naming its group: a group something else states (or the policy
 * derives) is not keyed over, and a keyed group without the provenance the officer chose is refused.
 * There is no default provenance: "entered at baseline, not from a tender Appendix" says where it came
 * from, the officer says how far it can be relied on.
 */
export function enteredFaults(i: BaselineInputs, entered: EnteredValues, provenance: EnteredProvenance): Finding<EnteredFault>[] {
  const out: Finding<EnteredFault>[] = [];
  for (const g of ENTERED_GROUPS) {
    if (entered[g] === undefined) continue;
    const stated = enterFault(g, i);
    if (stated) out.push({ code: stated, level: "block", data: { group: g } });
    else if (!provenance[g]?.provenance) out.push({ code: "PROVENANCE_NOT_CHOSEN", level: "block", data: { group: g } });
  }
  return out;
}

/// The draft built from the inputs, with any values keyed where nothing else states them.
export function buildBaseline(i: BaselineInputs, entered: EnteredValues = {}): BaselineValues {
  const a = i.appendix;
  const lad = sourceOf("lad", i);
  const dlp = sourceOf("dlp", i);
  const ret = sourceOf("retention", i);
  const sums = sourceOf("sums", i);
  const v: BaselineValues = {
    contractSum: i.contractSum,
    contractDate: null,
    possessionDate: null,
    completionPeriod: i.award.completionPeriod,
    completionUnit: i.award.completionUnit,
    dateForCompletion: null,
    ...(lad === "AWARD"
      ? { ladKind: "AMOUNT_PER_DAY" as const, ladAmount: i.award.ladAmount, ladPct: null, ladUnit: i.award.ladUnit, ladSource: lad }
      : lad === "APPENDIX"
        ? { ladKind: a!.ladKind, ladAmount: a!.ladKind === "AMOUNT_PER_DAY" ? a!.ladAmount : null, ladPct: a!.ladKind === "PERCENT_OF_SUM_PER_DAY" ? a!.ladPct : null, ladUnit: PER_DAY, ladSource: lad }
        : { ladKind: null, ladAmount: null, ladPct: null, ladUnit: "", ladSource: null }),
    ladDaily: null,
    // BD-64-40: the award stores "no defects liability period" as 0 months.
    ...(dlp === "AWARD"
      ? { dlpApplies: i.award.dlpMonths! > 0, dlpMonths: i.award.dlpMonths! > 0 ? i.award.dlpMonths : null, dlpSource: dlp }
      : dlp === "APPENDIX"
        ? { dlpApplies: a!.dlpApplies, dlpMonths: a!.dlpApplies ? a!.dlpMonths : null, dlpSource: dlp }
        : dlp === "DERIVED"
          ? { dlpApplies: false, dlpMonths: null, dlpSource: dlp }
          : { dlpApplies: null, dlpMonths: null, dlpSource: null }),
    ...(ret === "DERIVED"
      ? { retentionApplies: false, retentionPercent: null, retentionCapPercent: null, retentionSource: ret }
      : ret === "AWARD"
        ? { retentionApplies: true, retentionPercent: i.award.retentionPercent, retentionCapPercent: i.award.retentionCapPercent, retentionSource: ret }
        : // A band that says it applies, or a letter stating only one of the two figures: what is stated is
          // carried and the rest reads "Not set" until keyed (B3: never 0%).
          { retentionApplies: i.band?.retentionApplies ?? null, retentionPercent: i.award.retentionPercent, retentionCapPercent: i.award.retentionCapPercent, retentionSource: i.band?.retentionApplies === true ? ("DERIVED" as const) : i.award.retentionPercent != null || i.award.retentionCapPercent != null ? ("AWARD" as const) : null }),
    ...(sums === "BQ" ? { pcSums: i.bq!.primeCostSums, provisionalSums: i.bq!.provisionalSums, sumsSource: sums } : { pcSums: null, provisionalSums: null, sumsSource: null }),
    buildersWorksValue: null,
    firstInterimMinimum: a?.firstInterimMinimum ?? null,
    firstInterimSource: sourceOf("firstInterim", i),
    subsequentInterimMinimum: a?.subsequentInterimMinimum ?? null,
    subsequentInterimSource: sourceOf("subsequentInterim", i),
    honourCertificateDays: a?.honourCertificateDays ?? null,
    honourSource: sourceOf("honourDays", i),
    unfixedMaterialsPct: null,
    onCostPct: null,
    designWorkValue: null,
    sectionalCompletion: a?.sectionalCompletion ?? null,
    sectionalSource: sourceOf("sectional", i),
    sections: a?.sectionalCompletion ? a.sections.map((s, n) => ({ ref: String(n + 1), description: s.description, ladKind: s.ladKind, ladAmount: s.ladAmount, ladPct: s.ladPct, ladDaily: null })) : [],
  };
  // Only what nothing else states is keyed (OD-5); a value stated elsewhere is never overwritten here.
  const allowed: EnteredValues = {};
  for (const g of ENTERED_GROUPS) if (entered[g] !== undefined && enterFault(g, i) == null) Object.assign(allowed, { [g]: entered[g] });
  return derive(applyEntered(v, allowed), i.interimPolicy);
}

export const BASELINE_FIELD_KEYS = ["contractSum", "completion", "dlp", "lad", "retention", "sums", "buildersWorksValue", "firstInterim", "subsequentInterim", "honourDays", "sectional", "unfixedMaterials", "onCost", "designWork", "contractDate", "possession", "dateForCompletion"] as const;
export type BaselineFieldKey = (typeof BASELINE_FIELD_KEYS)[number];

export type BaselineFault =
  | "NOT_SET"
  | "DLP_MONTHS_NOT_EXPECTED"
  | "DLP_NOT_FOR_TYPE"
  | "DLP_REQUIRED_BY_TYPE"
  | "DLP_BEHAVIOUR_NOT_SET"
  | "LAD_UNIT_NOT_DAILY"
  | "LAD_PCT_NOT_VALID"
  | "RETENTION_PCT_NOT_VALID"
  | "SECTIONS_REQUIRED"
  | "SECTION_LAD_NOT_SET"
  | "BUILDERS_WORKS_NOT_POSITIVE"
  | "RETENTION_STATED_BUT_BAND_SAYS_NONE";

const notSet = (field: BaselineFieldKey, part?: string): Finding<BaselineFault> => ({ code: "NOT_SET", level: "block", data: { field, part: part ?? null } });

/**
 * Every value the baseline still needs, each named (FR-CON-014's minimum list), and its conflicts with
 * the contract type's behaviour (FR-MTD-012: a type with no defects liability period cannot carry one;
 * one that has it cannot go without). Blocks confirming and executing; the optional values (unfixed
 * materials, on-cost, design work, the days to honour a certificate) are noted, never blocking: the
 * module that reads one refuses its own act when it is unset.
 */
export function baselineFaults(b: BaselineValues, behaviour: { defectsLiabilityApplies: boolean | null }, band?: { retentionApplies: boolean | null } | null, award?: { retentionPercent: string | null }): Finding<BaselineFault>[] {
  const out: Finding<BaselineFault>[] = [];
  if (b.dlpApplies == null) out.push(notSet("dlp"));
  else if (b.dlpApplies && b.dlpMonths == null) out.push(notSet("dlp", "months"));
  else if (!b.dlpApplies && b.dlpMonths != null) out.push({ code: "DLP_MONTHS_NOT_EXPECTED", level: "block" });
  if (b.dlpApplies === true && behaviour.defectsLiabilityApplies === false) out.push({ code: "DLP_NOT_FOR_TYPE", level: "block" });
  if (b.dlpApplies === false && behaviour.defectsLiabilityApplies === true) out.push({ code: "DLP_REQUIRED_BY_TYPE", level: "block" });
  if (behaviour.defectsLiabilityApplies == null) out.push({ code: "DLP_BEHAVIOUR_NOT_SET", level: "warn" });

  if (b.ladKind == null) out.push(notSet("lad"));
  else if (b.ladKind === "AMOUNT_PER_DAY" && b.ladAmount == null) out.push(notSet("lad", "amount"));
  else if (b.ladKind === "PERCENT_OF_SUM_PER_DAY" && b.ladPct == null) out.push(notSet("lad", "percentage"));
  else if (b.ladKind === "PERCENT_OF_SUM_PER_DAY" && b.ladPct != null && !isPct(b.ladPct)) out.push({ code: "LAD_PCT_NOT_VALID", level: "block" });
  else if (b.ladKind === "AMOUNT_PER_DAY" && b.ladUnit !== PER_DAY) out.push({ code: "LAD_UNIT_NOT_DAILY", level: "block", data: { unit: b.ladUnit || null } });

  if (b.retentionApplies == null) out.push(notSet("retention"));
  else if (b.retentionApplies) {
    if (b.retentionPercent == null) out.push(notSet("retention", "percentage"));
    else if (!isPct(b.retentionPercent)) out.push({ code: "RETENTION_PCT_NOT_VALID", level: "block", data: { part: "percentage" } });
    if (b.retentionCapPercent == null) out.push(notSet("retention", "cap"));
    else if (!isPct(b.retentionCapPercent)) out.push({ code: "RETENTION_PCT_NOT_VALID", level: "block", data: { part: "cap" } });
  }
  if (band?.retentionApplies === false && award?.retentionPercent != null) out.push({ code: "RETENTION_STATED_BUT_BAND_SAYS_NONE", level: "warn" });

  if (b.pcSums == null || b.provisionalSums == null) out.push(notSet("sums"));
  else if (b.buildersWorksValue != null && b.buildersWorksValue <= 0n) out.push({ code: "BUILDERS_WORKS_NOT_POSITIVE", level: "block" });
  if (b.firstInterimMinimum == null) out.push(notSet("firstInterim"));
  if (b.subsequentInterimMinimum == null) out.push(notSet("subsequentInterim"));

  if (b.sectionalCompletion == null) out.push(notSet("sectional"));
  else if (b.sectionalCompletion && b.sections.length === 0) out.push({ code: "SECTIONS_REQUIRED", level: "block" });
  else if (b.sectionalCompletion) for (const s of b.sections) if (s.ladDaily == null) out.push({ code: "SECTION_LAD_NOT_SET", level: "block", data: { section: s.description || s.ref } });

  for (const f of ["honourDays", "unfixedMaterials", "onCost", "designWork"] as const) {
    const val = f === "honourDays" ? b.honourCertificateDays : f === "unfixedMaterials" ? b.unfixedMaterialsPct : f === "onCost" ? b.onCostPct : b.designWorkValue;
    if (val == null) out.push({ code: "NOT_SET", level: "info", data: { field: f, part: null } });
  }
  return out;
}

export interface VersionRow {
  version: number | null;
  reason: BaselineReason | null;
  /// The organisation's day the version was recorded.
  recordedOn: Day | null;
}

/**
 * The baseline in force on a day: the highest version recorded on or before it. The draft (no version)
 * is never in force. Null: none recorded by then. The one accessor 6.13, 6.14, 6.16 and 6.17 read.
 */
export function baselineFor<T extends VersionRow>(versions: readonly T[], on: Day): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.version == null || v.recordedOn == null || v.recordedOn > on) continue;
    if (!best || v.version > best.version!) best = v;
  }
  return best;
}

/// The latest version recorded, whatever its day (what the next version is built on). With baselineFor, the
/// only reader of "which version" (a scan keeps hand-written reads out).
export function latestVersion<T extends { version: number | null }>(versions: readonly T[]): T | null {
  return versions.filter((v) => v.version != null).reduce<T | null>((m, v) => (!m || v.version! > m.version! ? v : m), null);
}

/// The next version number.
export const nextVersionNo = (versions: readonly VersionRow[]) => (latestVersion(versions)?.version ?? 0) + 1;

/// Every value of two baselines that differs, by field key (what a version changed, for the trail and the screen).
export function changedFields(a: BaselineValues, b: BaselineValues): BaselineFieldKey[] {
  const same = (x: unknown, y: unknown) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)) === JSON.stringify(y, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const pick: Record<BaselineFieldKey, (v: BaselineValues) => unknown> = {
    contractSum: (v) => v.contractSum,
    completion: (v) => [v.completionPeriod, v.completionUnit],
    dlp: (v) => [v.dlpApplies, v.dlpMonths],
    lad: (v) => [v.ladKind, v.ladAmount, v.ladPct, v.ladUnit, v.ladDaily],
    retention: (v) => [v.retentionApplies, v.retentionPercent, v.retentionCapPercent],
    sums: (v) => [v.pcSums, v.provisionalSums],
    buildersWorksValue: (v) => v.buildersWorksValue,
    firstInterim: (v) => v.firstInterimMinimum,
    subsequentInterim: (v) => v.subsequentInterimMinimum,
    honourDays: (v) => v.honourCertificateDays,
    sectional: (v) => [v.sectionalCompletion, v.sections],
    unfixedMaterials: (v) => v.unfixedMaterialsPct,
    onCost: (v) => v.onCostPct,
    designWork: (v) => v.designWorkValue,
    contractDate: (v) => v.contractDate,
    possession: (v) => v.possessionDate,
    dateForCompletion: (v) => v.dateForCompletion,
  };
  return BASELINE_FIELD_KEYS.filter((k) => !same(pick[k](a), pick[k](b)));
}
