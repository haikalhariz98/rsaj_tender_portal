/**
 * What the evaluation's audit rows say, in words (AGENTS.md rules 4 and 5): instants on the
 * organisation's clock, days as the screens write them, money through `formatMoney`, every enum by
 * its label, never a code or an id. A score, a price, a balance, a CPR, a communication's content, an
 * aspect's narrative, a meeting's minutes or the recommended tenderer is written under a registered
 * SULIT key (`sulit-fields.ts`), so the History chips it and the audit
 * export withholds its value (E-3). Every row's label starts with the exercise's reference, so its
 * History finds it. Pure.
 */

import { receiptTime } from "@/lib/bids/labels";
import { formatMoney, type Sen } from "@/lib/money";

import { formatFixed, type Fixed } from "./fixed";
import { ASPECT_KIND_LABEL, CHANNEL_LABEL, DIRECTION_LABEL, MEETING_KIND_LABEL, SIDE_LABEL, TRIGGER_LABEL, VERDICT_LABEL } from "./labels";
import type { AspectKind, AspectVerdict, CommunicationChannel, CommunicationDirection, EvaluationTrigger, MeetingKind, Side } from "./types";

/// The entity names the evaluation's rows are audited under.
export const EVALUATION_ENTITY = {
  evaluation: "Evaluation",
  team: "EvaluationTeamMember",
  bidder: "EvaluationBidder",
  score: "EvaluationScore",
  submission: "StageSubmission",
  aspect: "AspectAssessment",
  negotiation: "NegotiationRequest",
  meeting: "EvaluationMeeting",
  communication: "TendererCommunication",
  recommendation: "Recommendation",
  proposal: "ProposalPaper",
  model: "EvaluationModel",
  stage: "EvaluationStage",
  criterion: "EvaluationCriterion",
  factor: "EvaluationFactorOption",
  bandSet: "EvaluationBandSet",
  band: "EvaluationBand",
  aspectConfig: "EvaluationAspect",
  policy: "EvaluationPolicy",
} as const;

export const EVALUATION_ENTITIES: readonly string[] = Object.values(EVALUATION_ENTITY);

/// How the History names each entity.
export const EVALUATION_ENTITY_LABEL: Readonly<Record<string, string>> = {
  Evaluation: "Evaluation",
  EvaluationTeamMember: "Evaluation team",
  EvaluationBidder: "Bid under evaluation",
  EvaluationScore: "Score",
  StageSubmission: "Stage submitted",
  AspectAssessment: "Aspect assessed",
  NegotiationRequest: "Negotiation asked for",
  EvaluationMeeting: "Evaluation meeting",
  TendererCommunication: "Communication with a tenderer",
  Recommendation: "Recommendation",
  ProposalPaper: "Kertas Cadangan",
  EvaluationModel: "Evaluation model",
  EvaluationStage: "Model stage",
  EvaluationCriterion: "Model criterion",
  EvaluationFactorOption: "Factor option",
  EvaluationBandSet: "Band set",
  EvaluationBand: "Band",
  EvaluationAspect: "Aspect",
  EvaluationPolicy: "Evaluation policy",
};

const stamp = (d: Date, tz: string | null) => receiptTime(d, tz);

export function startFields(i: { version: number; trigger: EvaluationTrigger; model: string; at: Date; by: string | null; bidders: number; excluded: number; decimals: number | null }, tz: string | null) {
  return {
    version: i.version,
    opened: TRIGGER_LABEL[i.trigger],
    model: i.model,
    started: stamp(i.at, tz),
    startedBy: i.by ? i.by : "The committee's decision",
    bidsCarried: i.bidders,
    excludedAboveCeiling: i.excluded || null,
    scoresShownAt: i.decimals == null ? "Not set" : `${i.decimals} decimal places`,
  };
}

export const teamFields = (m: { name: string; side: Side; unit: string | null; on: string }) => ({ member: m.name, side: SIDE_LABEL[m.side], unit: m.unit ?? "Not recorded", appointedOn: m.on });

/// A score: its figure under the SULIT key `score`.
export const scoreFields = (s: { criterion: string; marks: Fixed | null; passed: boolean | null; note: string; by: string; carried?: boolean }) => ({
  criterion: s.criterion,
  score: s.marks != null ? formatFixed(s.marks) : s.passed == null ? null : s.passed ? "Pass" : "Fail",
  note: s.note || null,
  scoredBy: s.by,
  carriedFromEarlierVersion: s.carried ? "yes" : null,
});

export const inputFields = (i: { factor: string | null; balances: readonly (Sen | null)[]; cpr: Fixed | null; by: string }) => ({
  factor: i.factor,
  monthlyBalances: i.balances.some((b) => b != null) ? i.balances.map((b) => (b == null ? "Not entered" : formatMoney(b))).join(" / ") : null,
  cprPercent: i.cpr != null ? `${formatFixed(i.cpr, 2)}%` : null,
  recordedBy: i.by,
});

export const correctionFields = (c: { price: Sen; reason: string; by: string; excluded: string }) => ({ correctedPrice: formatMoney(c.price), why: c.reason, correctedBy: c.by, ceiling: c.excluded || "Within the exercise's ceiling" });

/// An aspect's verdict: its narrative under the SULIT key `narrative` (fix R-5: it judges the price against the estimate).
export const aspectFields = (a: { aspect: string; kind: AspectKind; verdict: AspectVerdict; narrative: string; by: string }) => ({ aspect: `${a.aspect} (${ASPECT_KIND_LABEL[a.kind]})`, verdict: VERDICT_LABEL[a.verdict], narrative: a.narrative, assessedBy: a.by });

export const communicationFields = (c: { direction: CommunicationDirection; channel: CommunicationChannel; on: string | null; subject: string; content: string; by: string }) => ({ direction: DIRECTION_LABEL[c.direction], channel: CHANNEL_LABEL[c.channel], on: c.on, subject: c.subject, communicationContent: c.content, recordedBy: c.by });

export const meetingFields = (m: { kind: MeetingKind; round: number; heldOn: string; place: string; by: string }) => ({ meeting: `${MEETING_KIND_LABEL[m.kind]}, round ${m.round}`, heldOn: m.heldOn, place: m.place, recordedBy: m.by });

/// A meeting closed: its minutes under the SULIT key `meetingMinutes` (fix R-5: they may quote a price), never the bare `minutes` a sitting's rows use.
export const closeFields = (m: { minutes: string; priceBefore: Sen | null; priceAfter: Sen | null; by: string; at: Date }, tz: string | null) => ({
  meetingMinutes: m.minutes,
  priceBeforeRound: m.priceBefore != null ? formatMoney(m.priceBefore) : null,
  priceAfterRound: m.priceAfter != null ? formatMoney(m.priceAfter) : null,
  closed: stamp(m.at, tz),
  closedBy: m.by,
});

/// The recommendation: the tenderer under the SULIT key `recommendedTenderer` (Q2, NFR-SEC-002: selected-tender information before the Board decides).
export const recommendationFields = (r: { bidder: string; price: Sen; period: string; topRanked: boolean; justification: string; by: string }) => ({
  recommendedTenderer: r.bidder,
  recommendedPrice: formatMoney(r.price),
  completionPeriod: r.period,
  topRanked: r.topRanked ? "yes" : "no",
  // 6.8 re-review 3: why another than the top-ranked is recommended, SULIT (Q2 reasoning) under a specific key.
  rankingJustification: r.justification || null,
  formedBy: r.by,
});

export const signerFields = (s: { role: "CHECKER" | "RECOMMENDER"; name: string; office: string; day: string }) => ({ [s.role === "CHECKER" ? "checkedBy" : "recommendedBy"]: `${s.name}, ${s.office}`, signedOn: s.day });
