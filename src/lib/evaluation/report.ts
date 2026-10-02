/**
 * The evaluation report (FR-EVL-017, 018; FR-BID-010 via `consent.ts`; ADR 0008). One per evaluation
 * version, issued once and frozen: its reference from the configured series (§9.5), its text from the
 * configured template, and annexes A to F in order — A the scores, B the comparison of offers, C the
 * opening's frozen schedule as 6.7 froze it, D contractor performance, E the site visit's attendance
 * (6.5), F the drawings attached (listed: they are SULIT and not downloadable until sign-in, E-11). A
 * later version supersedes it; nothing edits it. Everything it needs is asked first (`reportFaults`),
 * so a refusal names each gap. Strings only in the snapshot: no float, no code. Pure.
 */

import { formatMoney, type Sen } from "@/lib/money";

import { evaluatedPrice, recommendedPriceOf, type BidderFacts, type EvaluationFacts } from "./facts";
import { formatFixed, formatMark, pctText } from "./fixed";
import { variance, lowestPrice } from "./commercial";
import { ranking } from "./recommend";
import { saving as savingOf } from "./saving";
import { resultOf } from "./stages";
import { CPR_SOURCE_TEXT } from "./cpr";
import { placeInBands } from "./bands";
import { bandSetOf, bandsOf, scoredCriteria } from "./model";
import type { Finding, PeriodUnit } from "./types";

export type AnnexKey = "A" | "B" | "C" | "D" | "E" | "F";
export const ANNEX_KEYS: readonly AnnexKey[] = ["A", "B", "C", "D", "E", "F"];

/// The product's English labels, used where the organisation sets none (FR-EVL-017).
export const PRODUCT_ANNEX_LABELS: Readonly<Record<AnnexKey, string>> = {
  A: "Scores",
  B: "Comparison of offers",
  C: "Schedule of tenders",
  D: "Contractor performance",
  E: "Site visit attendance",
  F: "Drawings",
};

/// The configured labels (EN, MS) or the product's; each annex on its own.
export function annexLabels(json: unknown): Record<AnnexKey, { en: string; ms: string | null; configured: boolean }> {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, { en?: unknown; ms?: unknown }>) : {};
  return Object.fromEntries(
    ANNEX_KEYS.map((k) => {
      const en = typeof o[k]?.en === "string" && (o[k].en as string).trim() ? (o[k].en as string) : null;
      const ms = typeof o[k]?.ms === "string" && (o[k].ms as string).trim() ? (o[k].ms as string) : null;
      return [k, { en: en ?? PRODUCT_ANNEX_LABELS[k], ms, configured: en != null }];
    }),
  ) as Record<AnnexKey, { en: string; ms: string | null; configured: boolean }>;
}

export type ReportFault =
  | "STAGES_NOT_COMPLETE"
  | "RECOMMENDATION_MISSING"
  | "MEETING_OPEN"
  | "NEGOTIATION_PENDING"
  | "SERIES_NOT_SET"
  | "TEMPLATE_NOT_SET"
  | "TEMPLATE_TEXT_NOT_SET"
  | "TEMPLATE_LANGUAGE_NOT_SET"
  | "TEMPLATE_INCOMPLETE"
  | "TEMPLATE_UNKNOWN_FIELD"
  | "ADMITTED_UNOPENED"
  | "SUPPLEMENTARY_IN_PROGRESS"
  | "CONSENT_NOT_FROM_RECOMMENDED"
  | "REPORT_STALE"
  | "PERSON_REQUIRED"
  | "TIME_ZONE_NOT_SET";

export function reportFaults(i: {
  stagesIncomplete: readonly string[];
  recommended: boolean;
  openMeetings: number;
  pendingNegotiations: number;
  seriesKey: string | null;
  template: { state: "OK" | "NOT_SET" | "NO_TEXT" | "NO_LANGUAGE"; missing: readonly string[]; unknown: readonly string[] };
  admittedUnopened: number;
  supplementaryInProgress: boolean;
  consent: readonly Finding[];
  /// The bidders evaluated are not 6.7's carried offers now (a late tender admitted since).
  stale: boolean;
  personActive: boolean;
  today: string | null;
}): Finding<ReportFault>[] {
  const out: Finding<ReportFault>[] = [];
  const f = (code: ReportFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.today) f("TIME_ZONE_NOT_SET");
  for (const s of i.stagesIncomplete) f("STAGES_NOT_COMPLETE", { stage: s });
  if (!i.recommended) f("RECOMMENDATION_MISSING");
  if (i.openMeetings) f("MEETING_OPEN", { count: i.openMeetings });
  if (i.pendingNegotiations) f("NEGOTIATION_PENDING", { count: i.pendingNegotiations });
  if (!i.seriesKey) f("SERIES_NOT_SET");
  if (i.template.state === "NOT_SET") f("TEMPLATE_NOT_SET");
  else if (i.template.state === "NO_TEXT") f("TEMPLATE_TEXT_NOT_SET");
  else if (i.template.state === "NO_LANGUAGE") f("TEMPLATE_LANGUAGE_NOT_SET");
  else {
    if (i.template.unknown.length) f("TEMPLATE_UNKNOWN_FIELD", { fields: i.template.unknown.join(", ") });
    if (i.template.missing.length) f("TEMPLATE_INCOMPLETE", { fields: i.template.missing.join(", ") });
  }
  if (i.admittedUnopened) f("ADMITTED_UNOPENED", { count: i.admittedUnopened });
  if (i.supplementaryInProgress) f("SUPPLEMENTARY_IN_PROGRESS");
  for (const c of i.consent) out.push({ ...(c as Finding<ReportFault>), code: "CONSENT_NOT_FROM_RECOMMENDED" });
  if (i.stale) f("REPORT_STALE");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

/// Whether the bidders evaluated are exactly 6.7's carried offers now (`evaluationSet`), by opened bid.
export const reportStale = (evaluated: readonly string[], carried: readonly string[]) => evaluated.length !== carried.length || evaluated.some((x) => !carried.includes(x));

// ------------------------------------------------------------------ the frozen report

const PERIOD: Record<PeriodUnit, string> = { DAYS: "days", WEEKS: "weeks", MONTHS: "months" };
export const periodWords = (p: { value: number; unit: PeriodUnit } | null) => (p ? `${p.value} ${PERIOD[p.unit]}` : "Not stated");

export interface ReportInput {
  facts: EvaluationFacts;
  /// Stage result details as frozen with each submission, by `${bidderId}/${stageCode}`.
  details: ReadonlyMap<string, unknown>;
  exercise: { reference: string; title: string };
  version: number;
  reference: string;
  issuedOn: string;
  issuedBy: string;
  schedule: unknown;
  siteVisits: readonly { label: string; day: string | null; attendees: readonly string[] }[];
  drawings: readonly { title: string; versionNo: number }[];
  recommendation: { bidderId: string; price: Sen; period: { value: number; unit: PeriodUnit } | null; topRanked: boolean; justification: string; formedBy: string; formedOn: string };
  meetings: readonly { kind: "CLARIFICATION" | "NEGOTIATION"; round: number; listingNo: number; heldOn: string; place: string; minutes: string; priceBefore: Sen | null; priceAfter: Sen | null }[];
  consent: readonly { consentPartyName: string; toExpiry: string; outcome: string }[];
  annexLabels: unknown;
  text: { language: "EN" | "MS"; body: string; template: { code: string; name: string; bodyVersion: number } };
}

export interface ReportSnapshot {
  v: 1;
  reference: string;
  issuedOn: string;
  issuedBy: string;
  version: number;
  exercise: { reference: string; title: string };
  model: { name: string; version: number; route: string; provenance: string };
  decimals: number | null;
  team: { name: string; side: string }[];
  text: ReportInput["text"];
  annexes: { key: AnnexKey; label: string; labelMs: string | null; body: unknown }[];
  recommendation: { listingNo: number; bidder: string; registrationNo: string; price: string; period: string; topRanked: boolean; justification: string; formedBy: string; formedOn: string };
  saving: { state: "SEALED" | "NO_ESTIMATE" | "STATED"; amount: string | null; percent: string | null };
  meetings: { kind: string; round: number; listingNo: number; heldOn: string; place: string; minutes: string; priceBefore: string | null; priceAfter: string | null }[];
  consent: ReportInput["consent"];
  bidders: { listingNo: number; openedBidId: string; bidder: string }[];
}

const bidderLine = (b: BidderFacts) => ({ listingNo: b.listingNo, bidder: b.bidderName });

/// Builds the frozen report from the facts, ready to store and print.
export function buildReport(i: ReportInput): ReportSnapshot {
  const f = i.facts;
  const labels = annexLabels(i.annexLabels);
  const dp = f.decimals ?? 4;
  const fig = (v: bigint | null) => (v == null ? null : formatFixed(v, dp));
  // A: every stage, every bidder, every criterion, and the result frozen with its submission.
  const annexA = f.model.stages
    .filter((s) => s.kind !== "RECOMMENDATION")
    .map((s) => ({
      stage: s.labelEn,
      kind: s.kind,
      bidders: f.bidders.map((b) => {
        const r = resultOf(f, b.id, s.code);
        return {
          ...bidderLine(b),
          criteria: scoredCriteria(s).map((c) => {
            const sc = b.scores.get(`${s.code}/${c.code}`) ?? null;
            return { criterion: c.labelEn, max: c.maxMarks, marks: sc?.marks != null ? formatMark(sc.marks, dp) : null, passed: sc?.passed ?? null, scoredBy: sc?.scoredBy ?? null, carried: sc?.carried ?? false, note: sc?.note ?? "" };
          }),
          figure: fig(r?.shown ?? null),
          passed: r?.passed ?? null,
          band: r?.bandLabel ?? null,
          outOfRunning: r?.outOfRunning ?? false,
          detail: i.details.get(`${b.id}/${s.code}`) ?? null,
          stageOne: s.kind === "COMMITTEE_DECISION" ? b.stageOne : undefined,
          excluded: b.excludedReason || null,
        };
      }),
    }));
  // B: the offers side by side: as read, corrected, evaluated, against the estimate and the lowest, ranked.
  const ranked = ranking(f);
  const lowest = lowestPrice(f.bidders.filter((b) => !b.excludedReason).map(evaluatedPrice));
  const annexB = f.bidders.map((b) => {
    const p = evaluatedPrice(b);
    const vsEst = "value" in f.estimate ? variance(p, f.estimate.value) : null;
    const vsLow = lowest != null ? variance(p, lowest) : null;
    return {
      ...bidderLine(b),
      asRead: formatMoney(b.priceAsRead),
      corrected: b.correctedPrice != null ? formatMoney(b.correctedPrice) : null,
      evaluated: formatMoney(p),
      negotiated: b.negotiatedPrice != null ? formatMoney(b.negotiatedPrice) : null,
      vsEstimate: vsEst ? { difference: formatMoney(vsEst.difference), percent: vsEst.pct == null ? null : pctText(vsEst.pct, 4, true) } : "sealed" in f.estimate ? "Sealed" : "No company estimate",
      vsLowest: vsLow ? { difference: formatMoney(vsLow.difference), percent: vsLow.pct == null ? null : pctText(vsLow.pct, 4, true) } : null,
      rank: ranked.find((r) => r.bidder.id === b.id)?.rank ?? null,
      period: periodWords(b.period),
      excluded: b.excludedReason || null,
    };
  });
  // D: CPR as entered, banded where the model bands it.
  const cprCriterion = f.model.stages.flatMap((s) => s.criteria).find((c) => c.computedInput === "CPR_PERCENT") ?? null;
  const cprBands = cprCriterion ? bandSetOf(f.model, cprCriterion.bandSetCode) : null;
  const annexD = {
    source: CPR_SOURCE_TEXT,
    bidders: f.bidders.map((b) => ({ ...bidderLine(b), cpr: b.cprPercent == null ? null : formatFixed(b.cprPercent), band: b.cprPercent != null && cprBands ? ((p) => (p.placed ? p.band.labelEn : "Not banded"))(placeInBands(b.cprPercent, bandsOf(cprBands))) : null, reports: b.cprReports })),
  };
  const rb = f.bidders.find((b) => b.id === i.recommendation.bidderId)!;
  const s = savingOf(f.estimate, i.recommendation.price);
  const bodies: Record<AnnexKey, unknown> = { A: annexA, B: annexB, C: i.schedule, D: annexD, E: i.siteVisits, F: i.drawings };
  return {
    v: 1,
    reference: i.reference,
    issuedOn: i.issuedOn,
    issuedBy: i.issuedBy,
    version: i.version,
    exercise: i.exercise,
    model: { name: f.model.nameEn, version: f.model.version, route: f.model.route, provenance: f.model.provenance },
    decimals: f.decimals,
    team: f.team.map((t) => ({ name: t.name, side: t.side })),
    text: i.text,
    annexes: ANNEX_KEYS.map((k) => ({ key: k, label: labels[k].en, labelMs: labels[k].ms, body: bodies[k] })),
    recommendation: { listingNo: rb.listingNo, bidder: rb.bidderName, registrationNo: rb.registrationNo, price: formatMoney(i.recommendation.price), period: periodWords(i.recommendation.period), topRanked: i.recommendation.topRanked, justification: i.recommendation.justification, formedBy: i.recommendation.formedBy, formedOn: i.recommendation.formedOn },
    saving: "sealed" in s ? { state: "SEALED", amount: null, percent: null } : "noEstimate" in s ? { state: "NO_ESTIMATE", amount: null, percent: null } : { state: "STATED", amount: formatMoney(s.amount), percent: s.pct == null ? null : pctText(s.pct, 4) },
    meetings: i.meetings.map((m) => ({ ...m, priceBefore: m.priceBefore != null ? formatMoney(m.priceBefore) : null, priceAfter: m.priceAfter != null ? formatMoney(m.priceAfter) : null })),
    consent: i.consent,
    bidders: f.bidders.map((b) => ({ listingNo: b.listingNo, openedBidId: b.openedBidId, bidder: b.bidderName })),
  };
}

/// The report's merge-field values, in the template's language (words; figures formatted).
export function reportFields(i: Pick<ReportInput, "facts" | "exercise" | "version" | "reference" | "issuedOn"> & { recommendation: Pick<ReportInput["recommendation"], "bidderId" | "price" | "period" | "topRanked" | "justification"> }, organisationName: string, extra: Record<string, string> = {}): Record<string, string> {
  const f = i.facts;
  const rb = f.bidders.find((b) => b.id === i.recommendation.bidderId);
  const s = savingOf(f.estimate, i.recommendation.price);
  return {
    "organisation.name": organisationName,
    "exercise.reference": i.exercise.reference,
    "exercise.title": i.exercise.title,
    "evaluation.reference": i.reference,
    "evaluation.version": String(i.version),
    "evaluation.model": `${f.model.nameEn}, version ${f.model.version}`,
    "evaluation.issuedOn": i.issuedOn,
    "evaluation.bidCount": String(f.bidders.length),
    "recommendation.bidder": rb?.bidderName ?? "",
    "recommendation.registrationNo": rb?.registrationNo ?? "",
    "recommendation.price": formatMoney(i.recommendation.price),
    "recommendation.period": periodWords(i.recommendation.period),
    "recommendation.justification": i.recommendation.topRanked ? "The recommended tenderer is the top-ranked." : i.recommendation.justification,
    "saving.amount": "amount" in s ? formatMoney(s.amount) : "sealed" in s ? "Sealed" : "No company estimate",
    "saving.percent": "amount" in s && s.pct != null ? pctText(s.pct, 2) : "Not stated",
    ...extra,
  };
}

/// A stored report read back; null where it is not one.
export function reportFromSnapshot(json: unknown): ReportSnapshot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Partial<ReportSnapshot>;
  return r.v === 1 && Array.isArray(r.annexes) && r.recommendation ? (r as ReportSnapshot) : null;
}

/// The recommended price a report stands on, for the award's comparison (E-9).
export const recommendedPrice = (b: BidderFacts) => recommendedPriceOf(b);
