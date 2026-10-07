/**
 * Everything an evaluation is judged with, loaded and mapped to the facts the pure rules read
 * (`facts.ts`). Reads only; every rule is beside this file. The actions read through
 * `loadEvaluationContext` inside their transaction, after locking requisition → exercise → window →
 * openings → evaluations (`lock.ts`); the screens read through the same function, so a disabled act
 * and a refused one give the same reason.
 *
 * The model is the exercise's pinned snapshot (FR-EVL-007): `EvaluationModel` rows are never read
 * here. The company estimate is read only from the latest finalised opening schedule's benchmark
 * (6.2 ADR 0012; `estimateFromSchedule`), never from its sealed store.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { loadLateMatters } from "@/lib/bids/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import type { ExerciseRow } from "@/lib/method/repo";
import { senFromDecimal, parseSen } from "@/lib/money";
import { evaluationSet } from "@/lib/opening/carry";
import type { OpeningForGate } from "@/lib/opening/award-gate";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadRoster } from "@/lib/people/load";
import { holdersOf } from "@/lib/people/roster";

import { latestNegotiatedPrice, type BidderFacts, type EvaluationFacts, type ResultFacts, type ScoreFacts, type StageOneOutcome, type SubmissionFacts, type TeamFacts } from "./facts";
import { fixedOf } from "./fixed";
import { modelFromSnapshot, type ModelSnapshot } from "./model";
import { estimateFromSchedule } from "./saving";
import { stageOneOutcome, type StageMatterFacts } from "./stage-one";
import { policyFromSnapshot } from "./start";
import { appointmentOutcomeOn } from "./state";
import { EVALUATION_STAGE_DOMAIN, NEGOTIATION_DOMAIN, type AspectVerdict, type EvaluationState, type PeriodUnit, type Side } from "./types";

export const EVALUATION_INCLUDE = {
  startedBy: { select: { id: true, name: true } },
  issuedBy: { select: { id: true, name: true } },
  team: { orderBy: { recordedAt: "asc" as const }, include: { person: { select: { id: true, name: true, isActive: true } } } },
  bidders: {
    orderBy: { openedBid: { listingNo: "asc" as const } },
    include: {
      openedBid: { select: { id: true, listingNo: true, partyId: true, bidderNameAsRead: true, priceAsRead: true, completionPeriod: true, completionUnit: true, completeness: true, party: { select: { id: true, name: true, registrationNo: true, address: true } } } },
      scores: { orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }], include: { scoredBy: { select: { name: true } }, supersededBy: { select: { id: true } } } },
      aspects: { orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }], include: { assessedBy: { select: { name: true } }, supersededBy: { select: { id: true } } } },
      attachments: { where: { purpose: { in: ["CPR_REPORT" as const, "COMMUNICATION" as const] } }, select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true, versionNo: true, document: { select: { title: true } } } } } },
      carriedFrom: { select: { id: true, attachments: { where: { purpose: "CPR_REPORT" as const }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } },
      correctedBy: { select: { name: true } },
      inputsRecordedBy: { select: { name: true } },
      shortlistedBy: { select: { name: true } },
      stageMatters: { orderBy: [{ tabledAt: "asc" as const }, { sequence: "asc" as const }, { id: "asc" as const }], select: { id: true, outcome: true, withdrawnAt: true, decisionDate: true, tabledAt: true, sequence: true, meeting: { select: { id: true, reference: true, meetingDate: true, committee: { select: { code: true, nameEn: true } } } } } },
    },
  },
  submissions: { orderBy: { submittedAt: "asc" as const }, include: { submittedBy: { select: { name: true } } } },
  results: true,
  meetings: {
    orderBy: [{ openedAt: "asc" as const }, { id: "asc" as const }],
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      attachments: { where: { purpose: { in: ["MEETING_MINUTES" as const, "TENDERER_CONFIRMATION" as const] } }, select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
  },
  communications: { orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }], include: { recordedBy: { select: { name: true } } } },
  negotiations: { orderBy: { requestedAt: "asc" as const }, include: { requestedBy: { select: { name: true } }, approvalInstance: { include: { steps: { orderBy: { sequence: "asc" as const } } } } } },
  recommendation: { include: { formedBy: { select: { name: true } } } },
  proposalPaper: { include: { checkedBy: { select: { name: true } }, recommendedBy: { select: { name: true } }, renderedBy: { select: { name: true } } } },
  attachments: { where: { purpose: { in: ["REPORT_DRAWINGS" as const, "SIGNED_REPORT" as const, "SIGNED_PROPOSAL_PAPER" as const] } }, select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true, versionNo: true, document: { select: { title: true } } } } } },
} satisfies Prisma.EvaluationInclude;

export async function loadEvaluations(exerciseId: string, client: Tx = db) {
  return client.evaluation.findMany({ where: { exerciseId }, orderBy: { version: "asc" }, include: EVALUATION_INCLUDE });
}
export type EvaluationRow = Awaited<ReturnType<typeof loadEvaluations>>[number];
export type EvaluationBidderRow = EvaluationRow["bidders"][number];

/// The version in force: open or issued (one at most, a partial unique index).
export const inForce = (evs: readonly EvaluationRow[]) => evs.find((e) => e.state === "OPEN" || e.state === "ISSUED") ?? null;

const liveCount = (as: readonly { detachedAt: Date | null; version: { withdrawnAt: Date | null } }[]) => as.filter(isLive).length;

/// A bidder's current scores (the latest of their append-only rows).
function currentScores(b: EvaluationBidderRow): Map<string, ScoreFacts> {
  const m = new Map<string, ScoreFacts>();
  for (const s of b.scores) {
    if (s.supersededBy) continue;
    m.set(`${s.stageCode}/${s.criterionCode}`, { marks: fixedOf(s.marks), passed: s.passed, note: s.note, scoredByPersonId: s.scoredByPersonId, scoredBy: s.scoredBy.name, recordedAt: s.recordedAt, carried: s.carriedFromScoreId != null });
  }
  return m;
}

function currentAspects(b: EvaluationBidderRow): Map<string, { verdict: AspectVerdict; narrative: string; by: string; at: Date }> {
  const m = new Map<string, { verdict: AspectVerdict; narrative: string; by: string; at: Date }>();
  for (const a of b.aspects) if (!a.supersededBy) m.set(a.aspectCode, { verdict: a.verdict, narrative: a.narrative, by: a.assessedBy.name, at: a.recordedAt });
  return m;
}

/// A row's first-stage matters as the rule reads them.
const matterFacts = (b: Pick<EvaluationBidderRow, "stageMatters">): StageMatterFacts[] =>
  b.stageMatters.map((m) => ({ id: m.id, outcome: m.outcome, withdrawn: m.withdrawnAt != null, tabledAt: m.tabledAt, sittingDay: m.meeting.meetingDate, sequence: m.sequence }));

/**
 * A bidder's first-stage matters across its rows in every version (fix R-1): its own, then those of
 * the row it was carried from, and so on back. `rows` holds every version's bidder rows by id.
 */
export function stageMattersAcross(b: EvaluationBidderRow, rows: ReadonlyMap<string, EvaluationBidderRow>): StageMatterFacts[] {
  const out: StageMatterFacts[] = [];
  const seen = new Set<string>();
  for (let r: EvaluationBidderRow | undefined = b; r && !seen.has(r.id); r = r.carriedFromId ? rows.get(r.carriedFromId) : undefined) {
    seen.add(r.id);
    out.push(...matterFacts(r));
  }
  return out;
}

/// Every version's bidder rows, by id (to follow `carriedFromId`).
export const bidderRowsOf = (evs: readonly EvaluationRow[]) => new Map(evs.flatMap((e) => e.bidders.map((b) => [b.id, b] as const)));

/// The committee's decision on a bidder's first stage, across the versions it was carried through (R-1, R-2).
const stageOneOf = (b: EvaluationBidderRow, rows: ReadonlyMap<string, EvaluationBidderRow>): StageOneOutcome => stageOneOutcome(stageMattersAcross(b, rows));

const missingOf = (completeness: unknown): string[] => {
  const c = completeness && typeof completeness === "object" ? (completeness as { missing?: { label?: unknown }[] }) : null;
  return (c?.missing ?? []).map((x) => (typeof x.label === "string" ? x.label : "")).filter(Boolean);
};

/// A bidder row as the rules read it.
export function bidderFacts(b: EvaluationBidderRow, meetings: EvaluationRow["meetings"], twoStage: boolean, rows: ReadonlyMap<string, EvaluationBidderRow> = new Map([[b.id, b]])): BidderFacts {
  // R-10: the latest round by its number, never by when it was recorded.
  const negotiated = latestNegotiatedPrice(meetings, b.id);
  return {
    id: b.id,
    openedBidId: b.openedBidId,
    partyId: b.openedBid.partyId,
    listingNo: b.openedBid.listingNo,
    bidderName: b.openedBid.bidderNameAsRead,
    registrationNo: b.openedBid.party.registrationNo,
    priceAsRead: senFromDecimal(b.openedBid.priceAsRead),
    correctedPrice: b.correctedPrice != null ? senFromDecimal(b.correctedPrice) : null,
    period: b.openedBid.completionPeriod != null && b.openedBid.completionUnit ? { value: b.openedBid.completionPeriod, unit: b.openedBid.completionUnit as PeriodUnit } : null,
    excludedReason: b.excludedReason,
    shortlisted: b.shortlisted,
    factorOptionCode: b.factorOptionCode,
    balances: [b.balanceMonth1 != null ? senFromDecimal(b.balanceMonth1) : null, b.balanceMonth2 != null ? senFromDecimal(b.balanceMonth2) : null, b.balanceMonth3 != null ? senFromDecimal(b.balanceMonth3) : null],
    cprPercent: fixedOf(b.cprPercent),
    cprReports: liveCount(b.attachments.filter((a) => a.purpose === "CPR_REPORT")) + (b.carriedFrom ? liveCount(b.carriedFrom.attachments) : 0),
    scores: currentScores(b),
    aspects: currentAspects(b),
    missingAtOpening: missingOf(b.openedBid.completeness),
    stageOne: twoStage ? stageOneOf(b, rows) : null,
    negotiatedPrice: negotiated != null ? senFromDecimal(negotiated) : null,
    carried: b.carriedFromId != null,
  };
}

/// One version as the rules read it, on the exercise's pinned model.
export function factsOf(e: EvaluationRow, ex: { status: string }, model: ModelSnapshot, estimate: EvaluationFacts["estimate"], rows: ReadonlyMap<string, EvaluationBidderRow> = bidderRowsOf([e])): EvaluationFacts {
  const twoStage = model.route === "TWO_STAGE";
  const policy = policyFromSnapshot(e.policySnapshot);
  return {
    state: e.state as EvaluationState,
    exerciseStatus: ex.status,
    route: model.route,
    model,
    decimals: policy.scoreDecimals,
    bidders: e.bidders.map((b) => bidderFacts(b, e.meetings, twoStage, rows)),
    submissions: e.submissions.map((s): SubmissionFacts => ({ stageCode: s.stageCode, side: s.side as Side, personId: s.submittedByPersonId, person: s.submittedBy.name, at: s.submittedAt })),
    results: e.results.map((r): ResultFacts => ({ bidderId: r.bidderId, stageCode: r.stageCode, percent: fixedOf(r.percent), shown: fixedOf(r.shown), passed: r.passed, bandLabel: r.bandLabel, outOfRunning: r.outOfRunning })),
    team: e.team.map((t): TeamFacts => ({ personId: t.personId, name: t.person.name, side: t.side as Side, unitCode: t.orgUnitCodeSnapshot })),
    estimate,
  };
}

/**
 * Everything an evaluation act or the Evaluation tab reads, for one exercise. `client` is the
 * transaction holding the locks, or the plain client for a screen.
 */
export async function loadEvaluationContext(l: { org: { id: string; code: string; timeZone: string | null; today: string | null }; ex: ExerciseRow }, client: Tx = db) {
  const { org, ex } = l;
  // One after the other: inside a transaction the client is one connection.
  const window = await client.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { id: true, publishedAt: true, path: true, events: { where: { kind: "SITE_VISIT" }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, place: true, heldOn: true, cancelledAt: true, attendance: { orderBy: { recordedAt: "asc" }, select: { representative: true, party: { select: { name: true } } } } } } } });
  const openings = await client.opening.findMany({
    where: { exerciseId: ex.id },
    orderBy: { sequenceNo: "asc" },
    select: {
      id: true,
      kind: true,
      sequenceNo: true,
      finalisedAt: true,
      scheduleSnapshot: true,
      estimateCopyCheck: true,
      copyExplanation: { select: { id: true } },
      admissionDecision: { select: { bidEnvelopeId: true } },
      attachments: { where: { purpose: "SIGNED_SCHEDULE" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } },
      bids: { orderBy: { listingNo: "asc" }, select: { id: true, verdict: true, listingNo: true, partyId: true, priceAsRead: true, bidderNameAsRead: true } },
    },
  });
  const late = await client.bidEnvelope.findMany({ where: { exerciseId: ex.id, late: true, kind: { not: "COMPANY_ESTIMATE" } }, select: { id: true } });
  const lateMatters = await loadLateMatters(ex.id, client);
  const evaluations = await loadEvaluations(ex.id, client);
  const policy = await client.evaluationPolicy.findUnique({ where: { organisationId: org.id }, include: { reportTemplate: true, proposalTemplate: true } });
  const extensions = await client.validityExtension.findMany({ where: { exerciseId: ex.id }, orderBy: { recordedAt: "asc" }, select: { id: true, consentPartyId: true, appliedAt: true, toExpiry: true, consentParty: { select: { name: true } } } });
  const appointmentMatters = await client.committeeDecision.findMany({ where: { exerciseId: ex.id, domain: "appointment", withdrawnAt: null }, orderBy: [{ tabledAt: "asc" }, { id: "asc" }], select: { id: true, outcome: true, evaluationVersion: true, notApprovedOutcomeKind: true, notApprovedOutcome: { select: { returnsToStage: true } }, meeting: { select: { reference: true, committee: { select: { nameEn: true } } } } } });
  const units = (await client.orgUnit.findMany({ where: { organisationId: org.id } })) as unknown as OrgUnit[];
  const roster = await loadRoster(org.code, client);

  const model = modelFromSnapshot(ex.evaluationModelSnapshot);
  const finalised = openings.filter((o) => o.finalisedAt);
  const latestSchedule = finalised.at(-1)?.scheduleSnapshot ?? null;
  const estimate = estimateFromSchedule(latestSchedule);
  const carried = evaluationSet(openings.map((o) => ({ kind: o.kind, finalised: o.finalisedAt != null, bids: o.bids })));
  const current = inForce(evaluations);
  const facts = current && model ? factsOf(current, ex, model, estimate, bidderRowsOf(evaluations)) : null;
  const on = org.today ? dayToDate(org.today) : null;
  const openingGate: OpeningForGate[] = openings.map((o) => ({ kind: o.kind, sequenceNo: o.sequenceNo, finalised: o.finalisedAt != null, liveScans: o.attachments.filter(isLive).length, copyCheck: o.estimateCopyCheck, explained: o.copyExplanation != null, admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null }));
  const admitted = late.filter((e) => lateMatters.some((m) => m.bidEnvelopeId === e.id && !m.withdrawn && m.outcome === "CARRIED")).map((e) => e.id);
  const openedAdmitted = new Set(openings.filter((o) => o.kind === "SUPPLEMENTARY" && o.finalisedAt).map((o) => o.admissionDecision?.bidEnvelopeId));
  return {
    org,
    ex,
    window,
    throughWindow: window?.publishedAt != null && (ex.packKindSnapshot === "TENDER" || ex.packKindSnapshot === "QUOTATION"),
    model,
    openings,
    openingGate,
    latestSchedule,
    estimate,
    carried,
    admittedUnopened: admitted.filter((id) => !openedAdmitted.has(id)).length,
    supplementaryInProgress: openings.some((o) => o.kind === "SUPPLEMENTARY" && !o.finalisedAt),
    evaluations,
    /// Every version's bidder rows by id, to follow `carriedFromId` (fix R-1).
    bidderRows: bidderRowsOf(evaluations),
    current,
    facts,
    policy,
    extensions,
    appointmentMatters,
    roster,
    on,
    unitPath: (code: string) => (on ? pathTo(units, code, on).map((u) => u.code) : []),
    holdsOffice: (personId: string, roleCode: string | null, day: Date | null = on) => !!roleCode && !!day && holdersOf(roster, roleCode, day).some((p) => p.id === personId),
    siteVisits: (window?.events ?? []).filter((e) => !e.cancelledAt).map((e) => ({ label: `Site visit, ${e.place}`, day: e.heldOn ? storedDay(e.heldOn) : null, attendees: e.attendance.map((a) => `${a.party.name} (${a.representative})`) })),
  };
}
export type EvaluationContext = Awaited<ReturnType<typeof loadEvaluationContext>>;

/// The latest appointment matter's outcome on the version in force, for the derived phase (OD-3 A;
/// fix M-3: a decision on a superseded version's report is not this version's).
export const appointmentOutcome = (c: Pick<EvaluationContext, "appointmentMatters"> & { current: { version: number } | null }) => appointmentOutcomeOn(c.appointmentMatters, c.current?.version ?? null);

/// The negotiation route's domain, for the screens' route lists (X-5's one splitter carries it).
export { NEGOTIATION_DOMAIN, EVALUATION_STAGE_DOMAIN };

/// The quotation ceiling as frozen on the exercise (FR-EVL-019).
export const ceilingOf = (ex: Pick<ExerciseRow, "regime" | "boundaryValue" | "boundaryOperator">) => ({ regime: ex.regime, boundary: ex.boundaryValue != null ? parseSen(ex.boundaryValue.toString()) : null, operator: ex.boundaryOperator });
