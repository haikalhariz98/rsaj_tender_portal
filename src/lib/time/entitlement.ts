/**
 * The extension-of-time claim's rules (6.13 Part B run 1b: FR-EOT-001–006; the carry-in FR-AWD-014, Phase 1 carry 9;
 * BD-613-116's act-side readings of `ContractType.eotInstrumentKind` and `PostAwardPolicy.weatherGuidance`). Pure.
 *
 * - A delay notice comes by either path (the contractor's notice, or the S.O.'s direction to give reasons), with its
 *   cause, never received before the delay occurred nor after today. "Immediately" has no day count: no clock.
 * - A claim rests on one or more notices of its contract, names its scope (the whole works or a section of the
 *   baseline), its ground clause and cause, and the approved programme revision the actual delay is assessed against.
 *   The contract type must offer an extension of time (EXTENSION_OF_TIME or BOTH); unset refuses, naming the setting.
 * - The determination: entitled or not, with the reason. NOT_ENTITLED closes the claim and its matter and opens the
 *   damages path (FR-EOT-002). ENTITLED needs best endeavours answered (NONE is no extension; PARTIAL a partial one,
 *   whose un-extended period the certificate states), the five pack items, the actual delay, at least one reason, and
 *   for a weather claim the meteorological record and an exceptional answer (FR-EOT-005). An unmet condition of the
 *   award that excludes an EOT, where the delay is put down to it, pre-answers "not a ground": ENTITLED then needs the
 *   override's reason, which the act audits.
 */

import type { Provenance } from "@/lib/reference/types";

import { EOT_PACK_ITEMS, type BestEndeavours, type Concurrency, type Day, type EotInstrumentKind, type Entitlement, type Finding, type PackAnswer, type Scope } from "./types";

type Data = Record<string, string | number | null>;
const collect = () => {
  const out: Finding[] = [];
  return { out, f: (code: string, data: Data = {}) => out.push({ code, level: "block", data }) };
};

export function noticeFaults(i: { cause: string; occurredOn: Day; receivedOn: Day; today: Day }): Finding[] {
  const { out, f } = collect();
  if (!i.cause.trim()) f("NOTICE_CAUSE_REQUIRED");
  if (i.receivedOn < i.occurredOn) f("RECEIVED_BEFORE_OCCURRED");
  for (const d of [i.occurredOn, i.receivedOn]) if (d > i.today) f("FUTURE_DATE", { day: d });
  return out.filter((x, n) => x.code !== "FUTURE_DATE" || out.findIndex((y) => y.code === "FUTURE_DATE") === n);
}

/// Whether the contract type offers the instrument: an extension of time ("EOT") or of the contract period ("PERIOD").
export function instrumentFaults(kind: EotInstrumentKind | null, want: "EOT" | "PERIOD", typeName: string): Finding[] {
  if (kind == null) return [{ code: "EOT_INSTRUMENT_NOT_SET", level: "block", data: { type: typeName } }];
  if (want === "EOT" && kind === "CONTRACT_PERIOD") return [{ code: "EOT_NOT_OFFERED", level: "block", data: { type: typeName } }];
  if (want === "PERIOD" && kind === "EXTENSION_OF_TIME") return [{ code: "PERIOD_NOT_OFFERED", level: "block", data: { type: typeName } }];
  return [];
}

export interface OpenInput {
  notices: readonly { onContract: boolean }[];
  scope: Scope;
  /// SECTION: whether the section is one of the baseline in force (null for WHOLE).
  sectionKnown: boolean | null;
  groundClause: string;
  cause: string;
  /// The programme revision named: null where none is.
  programme: { approved: boolean } | null;
  proposedDays: number;
  /// instrumentFaults(…, "EOT", …), carried.
  instrument: readonly Finding[];
}

export function openFaults(i: OpenInput): Finding[] {
  const { out, f } = collect();
  out.push(...i.instrument);
  if (i.notices.length === 0) f("NOTICE_REQUIRED");
  else if (i.notices.some((n) => !n.onContract)) f("NOTICE_NOT_ON_CONTRACT");
  if (i.scope === "SECTION" && !i.sectionKnown) f("SECTION_REQUIRED");
  if (!i.groundClause.trim()) f("GROUND_CLAUSE_REQUIRED");
  if (!i.cause.trim()) f("CAUSE_REQUIRED");
  if (!i.programme?.approved) f("PROGRAMME_NOT_APPROVED");
  if (!Number.isInteger(i.proposedDays) || i.proposedDays < 0) f("PROPOSED_DAYS_REQUIRED");
  return out;
}

const frozen = (i: { closed: { reason: string } | null; determined: boolean }): Finding[] =>
  i.closed ? [{ code: "CLAIM_CLOSED", level: "block", data: { reason: i.closed.reason } }] : i.determined ? [{ code: "CLAIM_DETERMINED", level: "block" }] : [];

export function answerFaults(i: { closed: { reason: string } | null; determined: boolean; canComplete: boolean | null; estimatedCompletion: Day | null; actualDelayDays: number | null; earthworksDays: number | null }): Finding[] {
  const fz = frozen(i);
  if (fz.length) return fz;
  const { out, f } = collect();
  if (i.canComplete === false && !i.estimatedCompletion) f("ESTIMATED_COMPLETION_REQUIRED");
  for (const n of [i.actualDelayDays, i.earthworksDays]) if (n != null && (!Number.isInteger(n) || n < 0)) f("DAYS_BELOW_NOTHING");
  return out;
}

export function reasonFaults(i: { closed: { reason: string } | null; determined: boolean; clause: string; reason: string; delayFrom: Day; delayUntil: Day; extensionDays: number; concurrency: Concurrency; group: string | null }): Finding[] {
  const fz = frozen(i);
  if (fz.length) return fz;
  const { out, f } = collect();
  if (!i.clause.trim() || !i.reason.trim()) f("REASON_FIELDS_REQUIRED");
  if (i.delayUntil <= i.delayFrom) f("UNTIL_NOT_AFTER_FROM");
  if (!Number.isInteger(i.extensionDays) || i.extensionDays < 0) f("DAYS_BELOW_NOTHING");
  if (i.concurrency === "CONCURRENT" && !i.group?.trim()) f("GROUP_REQUIRED");
  return out;
}

export interface ConditionFact {
  id: string;
  name: string;
  excludesEot: boolean;
  satisfiedOn: Day | null;
}

/// The condition the delay is put down to, where it excludes an EOT and is not met: the pre-answer "not a ground".
export function exclusionOf(conditions: readonly ConditionFact[], attributedId: string | null): ConditionFact | null {
  const c = attributedId ? conditions.find((x) => x.id === attributedId) : undefined;
  return c && c.excludesEot && !c.satisfiedOn ? c : null;
}

export interface DeterminationInput {
  closed: { reason: string } | null;
  determined: boolean;
  entitlement: Entitlement | null;
  reason: string;
  bestEndeavours: BestEndeavours | null;
  isWeather: boolean;
  exceptional: boolean | null;
  /// A live METEOROLOGICAL_RECORD attachment on the claim.
  meteorologicalAttached: boolean;
  pack: readonly PackAnswer[];
  actualDelayDays: number | null;
  /// How many reasons the claim has.
  reasons: number;
  exclusion: ConditionFact | null;
  overrideReason: string;
}

export function determinationFaults(i: DeterminationInput): Finding[] {
  const fz = frozen(i);
  if (fz.length) return fz;
  const { out, f } = collect();
  if (!i.entitlement) {
    f("ENTITLEMENT_REQUIRED");
    return out;
  }
  if (!i.reason.trim()) f("ENTITLEMENT_REASON_REQUIRED");
  if (i.isWeather && i.exceptional == null) f("WEATHER_EXCEPTIONAL_REQUIRED");
  if (i.entitlement === "NOT_ENTITLED") return out;
  if (!i.bestEndeavours) f("BEST_ENDEAVOURS_REQUIRED");
  else if (i.bestEndeavours === "NONE") f("BEST_ENDEAVOURS_NONE");
  if (i.isWeather && i.exceptional === false) f("WEATHER_NOT_EXCEPTIONAL");
  if (i.isWeather && i.exceptional !== false && !i.meteorologicalAttached) f("WEATHER_EVIDENCE_REQUIRED");
  for (const item of EOT_PACK_ITEMS) {
    const a = i.pack.find((p) => p.item === item);
    if (!a || !a.text.trim()) f(a?.notRequired ? "PACK_NOT_REQUIRED_REASON" : "PACK_ITEM_REQUIRED", { item });
  }
  if (i.actualDelayDays == null) f("ACTUAL_DELAY_REQUIRED");
  if (i.reasons === 0) f("REASONS_REQUIRED");
  if (i.exclusion && !i.overrideReason.trim()) f("EXCLUDED_BY_CONDITION", { condition: i.exclusion.name });
  return out;
}

/// FR-EOT-002: a failed entitlement test closes the claim's matter with the determination's reason and opens the
/// damages path; an entitled claim goes on to its route.
export function determinationEffect(i: Pick<DeterminationInput, "entitlement" | "reason">): { closeMatter: string | null; opensDamages: boolean } {
  return i.entitlement === "NOT_ENTITLED" ? { closeMatter: `Not entitled: ${i.reason.trim()}`, opensDamages: true } : { closeMatter: null, opensDamages: false };
}

export type WeatherGuidance = { state: "SET"; text: string; provenance: Provenance | null } | { state: "NOT_SET" };

/// FR-EOT-005: the guidance a weather claim shows, from the policy (ships empty). Never a refusal.
export function weatherGuidanceOf(p: { guidance: string | null; provenance: Provenance | null }): WeatherGuidance {
  return p.guidance?.trim() ? { state: "SET", text: p.guidance.trim(), provenance: p.provenance } : { state: "NOT_SET" };
}
