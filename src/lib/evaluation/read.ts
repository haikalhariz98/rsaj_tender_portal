/**
 * The Evaluation tab, read (6.8 plan §5): everything its six sections show, judged with the rules the
 * acts run (`loadEvaluationContext` and the pure rules beside it), so a disabled act and a refused one
 * give the same reason. Figures are formatted here, in words and ringgit; codes go out only as the
 * forms' keys (a stage's, a criterion's, an aspect's), never as text. Nothing here is a broadcast
 * surface: every figure is SULIT and the screens chip it (E-3).
 */

import { loadAttributions } from "@/lib/auth/attribution-read";
import { sulitGranted, through, type Sulit } from "@/lib/auth/sulit-access";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { loadExercise } from "@/lib/method/repo";
import { formatMoney, senFromDecimal, senToDecimalString } from "@/lib/money";

import { anonymousBidder, bidIdentityAtStage, faultsForBid, identityHeld, pseudonymNumbers, stageAnonymity, stageReveals, type AnonymisedStage } from "./anonymise";
import { aspectPrefill } from "./aspects";
import { recommendedCeilingFault } from "./ceiling";
import { ceilingOf } from "./repo";
import { evaluatedPrice, recommendedPriceOf, scoreKey, type BidderFacts, type EvaluationFacts } from "./facts";
import { formatFixed, formatMark, parseFixed, pctText } from "./fixed";
import { evaluationFindingText, pendingSentences, pendingText, MEETING_KIND_LABEL, PHASE_LABEL, PHASE_TONE, ROUTE_LABEL, RUNNING_LABEL, SIDE_LABEL, STAGE_KIND_LABEL, STATE_LABEL, STATE_TONE, TRIGGER_LABEL, VERDICT_LABEL, VERDICT_TONE, DIRECTION_LABEL, CHANNEL_LABEL, SCALE_LABEL } from "./labels";
import { LOOP_KEY_LABEL, isLoopKey } from "./loop";
import { scoredCriteria, type StageSnap } from "./model";
import { incompleteStages, ranking } from "./recommend";
import { appointmentOutcome, loadEvaluationContext } from "./repo";
import { periodWords, reportFaults, reportFromSnapshot, reportStale } from "./report";
import { saving } from "./saving";
import { inputsAccess, inRunningAt, isSubmitted, liveStanding, resultOf, runningAt, stageAccess, stageResult } from "./stages";
import { startFaults } from "./start";
import { evaluationPhase, issuedActFaults, openActFaults } from "./state";
import { blocking, type Finding, type Side } from "./types";

export type Allowed = { allowed: true } | { allowed: false; reason: string };
/// The first blocking reason, ignoring what the form itself supplies (who records it).
const FORM_SUPPLIES = new Set(["PERSON_REQUIRED", "REASON_REQUIRED", "NARRATIVE_REQUIRED", "VERDICT_REQUIRED", "JUSTIFICATION_REQUIRED", "PLACE_REQUIRED", "DAY_REQUIRED"]);
const allowedOf = (fs: readonly Finding[]): Allowed => {
  const b = blocking(fs).filter((f) => !FORM_SUPPLIES.has(f.code));
  return b.length ? { allowed: false, reason: [...new Set(b.map(evaluationFindingText))].join(" ") } : { allowed: true };
};
const money = (s: bigint | null | undefined) => (s == null ? null : formatMoney(s));
const fig = (v: bigint | null | undefined, dp: number | null) => (v == null ? null : formatFixed(v, dp ?? 4));

/**
 * What the tab is told about who may read the evaluation (Phase 3b, FR-EVL-014): `evaluation` is one answer for the whole version, asked and logged by the
 * caller; `estimate` is asked only when there is a disclosed company estimate to compare with, and judges the saving and the estimate by its custody.
 * Nothing that the evaluation's figures could be read from (scores, prices, who is ahead, what was said to a tenderer) is built unless `evaluation` is
 * granted, so a reader who is refused is sent none of it, not even in a payload the page does not draw.
 */
export interface EvaluationGates {
  evaluation: Sulit<true>;
  estimate: () => Promise<Sulit<true> | null>;
  /// FR-EVL-020: asked (and logged) only when an anonymised technical scoring stage has a criterion that names the bidder. Granted: the name is in the view for that criterion; otherwise it is not.
  identity: () => Promise<Sulit<true>>;
}

export async function evaluationTabView(organisationId: string, exerciseId: string, gates: EvaluationGates) {
  const x = await loadExercise(organisationId, exerciseId);
  if (!x) return null;
  const { org, ex } = x;
  const tz = org.timeZone;
  const c = await loadEvaluationContext({ org, ex });
  const people = (await db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  const e = c.current;
  const f = c.facts;
  // Who recorded each communication and who formed the recommendation, signed or recorded from paper, is read from the attributions (Phase 2b).
  const attributed = await loadAttributions(db, org.id, [
    { entity: "TendererCommunication", slot: "recordedBy", ids: (e?.communications ?? []).map((m) => m.id) },
    { entity: "Recommendation", slot: "formedBy", ids: e?.recommendation ? [e.recommendation.id] : [] },
  ]);
  const ceiling = ceilingOf(ex);
  const boundaryMissing = ceiling.regime === "quotation" && (ceiling.boundary == null || ceiling.operator == null);
  const start = startFaults({ status: ex.status, throughWindow: c.throughWindow, pinned: c.model != null, openings: c.openingGate, decimals: c.policy?.scoreDecimals ?? null, boundaryMissing, carried: c.carried.length, started: c.evaluations.length > 0, timeZone: tz, personActive: true });
  const phase = evaluationPhase({ exerciseStatus: ex.status, state: e?.state ?? null, openMeetings: (e?.meetings ?? []).filter((m) => !m.closedAt).map((m) => m.kind), appointment: appointmentOutcome(c) });
  const openAct = allowedOf(openActFaults({ exerciseStatus: ex.status, state: e?.state ?? null }));
  const issuedAct = allowedOf(issuedActFaults({ exerciseStatus: ex.status, state: e?.state ?? null }));
  const dp = f?.decimals ?? null;

  const model = c.model
    ? { name: `${c.model.nameEn}, version ${c.model.version}`, route: ROUTE_LABEL[c.model.route], provenance: c.model.provenance, pinnedAt: ex.evaluationModelPinnedAt ? formatOrgDateTime(ex.evaluationModelPinnedAt, tz) : null, stages: c.model.stages.length }
    : null;

  const header = {
    applies: c.throughWindow,
    model,
    neverPinned: c.throughWindow && !c.model,
    phase: { label: PHASE_LABEL[phase], tone: PHASE_TONE[phase] },
    start: c.evaluations.length ? null : { allowed: allowedOf(start), carried: c.carried.length },
    versions: c.evaluations.map((v) => ({ id: v.id, version: v.version, state: STATE_LABEL[v.state], tone: STATE_TONE[v.state], trigger: TRIGGER_LABEL[v.trigger], loop: v.loopStageKey && isLoopKey(v.loopStageKey) ? LOOP_KEY_LABEL[v.loopStageKey] : null, startedAt: formatOrgDateTime(v.startedAt, tz), startedBy: v.startedBy?.name ?? "A committee's decision", report: v.reportReference, current: v.id === e?.id })),
    people,
    today: org.today,
  };
  if (!e || !f) return { exerciseId, reference: ex.reference, header, current: null };

  // ---- the team and the bidders (Overview)
  const sides: Side[] = ["IMPLEMENTING_DEPARTMENT", "CONTRACT_PROCUREMENT"];
  const team = sides.map((s) => ({ side: s, label: SIDE_LABEL[s], members: e.team.filter((t) => t.side === s).map((t) => ({ id: t.id, name: t.person.name, appointedOn: formatDate(storedDay(t.appointedOn)), unit: t.orgUnitCodeSnapshot ? "Unit recorded" : "Unit not recorded" })) }));
  // The report's reference, who issued it and its annexes' names say nothing of a figure: they are the surface, and the rest is held back (the detail).
  const report = reportFromSnapshot(e.reportSnapshot);
  const p = e.proposalPaper;
  const office = (code: string | null | undefined) => (code ? (c.roster.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null);
  const reportSurface = {
    issued: e.state !== "OPEN" && e.reportReference ? { reference: e.reportReference, issuedAt: e.issuedAt ? formatOrgDateTime(e.issuedAt, tz) : null, issuedBy: e.issuedBy?.name ?? null, stale: e.state === "ISSUED" && reportStale(e.bidders.map((b) => b.openedBidId), c.carried.map((b) => b.id)), annexes: report?.annexes.map((a) => ({ key: a.key, label: a.label })) ?? [], template: report?.text.template.name ?? null } : null,
    proposal: p
      ? { frozenAt: formatOrgDateTime(p.frozenAt, tz), checker: office(p.checkerRoleCode), recommender: office(p.recommenderRoleCode), checkedBy: p.checkedBy ? `${p.checkedBy.name}, ${p.checkedOn ? formatDate(storedDay(p.checkedOn)) : ""}` : null, recommendedBy: p.recommendedBy ? `${p.recommendedBy.name}, ${p.recommendedOn ? formatDate(storedDay(p.recommendedOn)) : ""}` : null }
      : null,
  };

  const detailOf = async () => {
  // FR-EVL-020: each bid's pseudonym, from the version and the bid's own id and not from the opening's listing number, and whether the version still holds identities back.
  const pseudo = pseudonymNumbers(e.id, f.bidders.map((b) => b.id));
  const held = identityHeld(f.anonymised, f.model.stages.map((s) => ({ kind: s.kind, capitalBase: s.capitalBase, criteria: s.criteria, submitted: isSubmitted(f, s.code) })));
  const firstStage = f.model.stages[0] ?? null;
  const capitalStages = f.model.stages.filter((s) => s.criteria.some((cr) => cr.scale === "BANDED" && cr.computedInput === "MIN_CAPITAL_RATIO"));
  const cprStages = f.model.stages.filter((s) => s.criteria.some((cr) => cr.scale === "BANDED" && cr.computedInput === "CPR_PERCENT"));
  const bidders = f.bidders.map((b) => {
    const run = firstStage ? runningAt(f, firstStage, b) : { state: "IN" as const, at: null };
    const finalRun = f.model.stages.find((s) => s.kind === "RECOMMENDATION");
    const after = finalRun ? runningAt(f, finalRun, b) : run;
    return {
      id: b.id,
      listingNo: b.listingNo,
      bidder: b.bidderName,
      registrationNo: b.registrationNo,
      asRead: formatMoney(b.priceAsRead),
      evaluatedPrice: formatMoney(evaluatedPrice(b)),
      corrected: b.correctedPrice != null,
      period: periodWords(b.period),
      running: RUNNING_LABEL[after.state] + (after.at ? `: ${after.at}` : ""),
      runningTone: after.state === "IN" ? ("ok" as const) : after.state === "AWAITING_STAGE_ONE" ? ("warn" as const) : ("err" as const),
      excluded: b.excludedReason || null,
      carried: b.carried,
      factor: b.factorOptionCode ? (capitalStages.flatMap((s) => s.factors).find((x) => x.code === b.factorOptionCode)?.labelEn ?? "A factor no longer offered") : null,
      monthlyBalances: b.balances.some((v) => v != null) ? b.balances.map((v) => money(v) ?? "—").join(" · ") : null,
      cprPercent: b.cprPercent != null ? `${formatFixed(b.cprPercent, 2)}%` : null,
      cprReports: b.cprReports,
      // S-2: judged by the rule recordInputs runs: some stage reading them still takes them.
      inputs: e.state === "OPEN" ? allowedOf(inputsAccess(f, b)) : ({ allowed: false, reason: "This version is not open." } as Allowed),
      raw: { factorOptionCode: b.factorOptionCode ?? "", balanceMonth1: b.balances[0] != null ? senToDecimalString(b.balances[0]) : "", balanceMonth2: b.balances[1] != null ? senToDecimalString(b.balances[1]) : "", balanceMonth3: b.balances[2] != null ? senToDecimalString(b.balances[2]) : "", cprPercent: b.cprPercent != null ? formatFixed(b.cprPercent) : "" },
    };
  });
  const factors = capitalStages.flatMap((s) => s.factors).map((x) => ({ value: x.code, label: `${x.labelEn} (${formatFixed(parseFixed(x.factorPct), 2)}%)` }));

  // ---- the stages
  // FR-EVL-020: the identity of a bidder on an anonymised technical scoring stage is revealed only for a criterion that needs it, and the reveal is asked of the gate (which logs it)
  // before any name is put in the view.
  const revealing = f.model.stages.some((s) => stageReveals(stageAnonymity(s, f.anonymised)));
  const reveal = revealing ? (await gates.identity()).state === "GRANTED" : false;
  const stages = f.model.stages.map((s) => stageView(f, s, dp, e.submissions.find((x) => x.stageCode === s.code) ?? null, tz, reveal, pseudo));
  // A two-stage tender's first stage is tabled at a sitting of its committee not yet minuted.
  const committeeCodes = [...new Set(f.model.stages.filter((s) => s.kind === "COMMITTEE_DECISION" && s.committeeCode).map((s) => s.committeeCode!))];
  const sittings = committeeCodes.length
    ? (await db.meeting.findMany({ where: { committee: { organisationId: org.id, code: { in: committeeCodes } }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: { meetingDate: "asc" }, select: { id: true, reference: true, meetingDate: true, committee: { select: { code: true, nameEn: true } } } })).map((m) => ({ committeeCode: m.committee.code, value: m.id, label: `${m.reference}, ${m.committee.nameEn}, ${formatDate(storedDay(m.meetingDate))}` }))
    : [];

  // ---- aspects
  const aspectStage = f.model.stages.find((s) => s.kind === "ASPECTS") ?? null;
  const aspects = aspectStage
    ? {
        stage: aspectStage.labelEn,
        submitted: isSubmitted(f, aspectStage.code),
        list: f.model.aspects.map((a) => ({ code: a.code, label: a.labelEn, required: a.required })),
        bidders: f.bidders.map((b) => {
          const run = runningAt(f, aspectStage, b);
          return {
            id: b.id,
            listingNo: b.listingNo,
            bidder: b.bidderName,
            inRunning: run.state === "IN",
            running: RUNNING_LABEL[run.state],
            verdicts: f.model.aspects.map((a) => {
              const v = b.aspects.get(a.code) ?? null;
              const suggestion = aspectPrefill(a.kind, b, f.estimate);
              return { code: a.code, label: a.labelEn, verdict: v ? VERDICT_LABEL[v.verdict] : null, tone: v ? VERDICT_TONE[v.verdict] : null, narrative: v?.narrative ?? null, suggestion: { verdict: v?.verdict ?? suggestion.verdict, narrative: v?.narrative ?? suggestion.narrative, guide: suggestion.guide ?? null } };
            }),
          };
        }),
      }
    : null;

  // ---- meetings, negotiations, communications
  // FR-EVL-020: while the version holds its bidders' identities back, the records beside the scoring call a bid by its pseudonym (never its listing number or name), so the
  // scoring is not undone one tab over. Otherwise by its listing number and name, as always.
  const shownAs = (id: string) => {
    const b = f.bidders.find((x) => x.id === id);
    if (!b) return { no: 0, ref: "A bid", name: "" };
    const n = pseudo.get(b.id) ?? 0;
    return held ? { no: n, ref: anonymousBidder(n), name: anonymousBidder(n) } : { no: b.listingNo, ref: `No. ${b.listingNo}`, name: b.bidderName };
  };
  const listing = (id: string) => shownAs(id).no;
  const meetings = e.meetings.map((m) => ({
    id: m.id,
    kind: MEETING_KIND_LABEL[m.kind],
    isNegotiation: m.kind === "NEGOTIATION",
    round: m.round,
    listingNo: listing(m.bidderId),
    ref: shownAs(m.bidderId).ref,
    bidder: shownAs(m.bidderId).name,
    heldOn: formatDate(storedDay(m.heldOn)),
    place: m.place,
    closed: m.closedAt ? `Closed ${formatOrgDateTime(m.closedAt, tz)}${m.closedBy ? ` by ${m.closedBy.name}` : ""}` : null,
    meetingMinutes: m.minutes || null,
    priceBeforeRound: m.priceBefore != null ? formatMoney(senFromDecimal(m.priceBefore)) : null,
    priceAfterRound: m.priceAfter != null ? formatMoney(senFromDecimal(m.priceAfter)) : null,
    confirmations: m.attachments.filter((a) => a.purpose === "TENDERER_CONFIRMATION" && isLive(a)).length,
  }));
  const negotiations = e.negotiations.map((n) => ({
    id: n.id,
    listingNo: listing(n.bidderId),
    ref: shownAs(n.bidderId).ref,
    reason: n.reason,
    requestedBy: n.requestedBy.name,
    requestedAt: formatOrgDateTime(n.requestedAt, tz),
    status: n.approvalInstance.status,
    statusLabel: n.approvalInstance.status === "PENDING" ? "With approval" : n.approvalInstance.status === "APPROVED" ? "Approved: may be held" : n.approvalInstance.status === "RECALLED" ? "Withdrawn: not held" : "Refused: not held",
    steps: n.approvalInstance.steps.map((s) => ({ id: s.id, sequence: s.sequence, office: s.roleLabel, decision: s.decision, pending: s.decision === "PENDING", committee: s.committeeCode != null })),
  }));
  const communications = e.communications.map((m) => ({
    id: m.id,
    listingNo: listing(m.bidderId),
    ref: shownAs(m.bidderId).ref,
    direction: DIRECTION_LABEL[m.direction],
    channel: CHANNEL_LABEL[m.channel],
    on: formatDate(storedDay((m.sentOn ?? m.receivedOn)!)),
    subject: m.subject,
    communicationContent: m.content,
    recordedBy: m.recordedBy.name,
    acted: attributed.read({ entity: "TendererCommunication", id: m.id, slot: "recordedBy" }, m.recordedBy.name).en,
  }));
  const running = f.model.stages.find((s) => s.kind === "RECOMMENDATION");
  /// A picker's option for a bid: by number and name, or (held) by pseudonym alone; held, in pseudonym order, since the order they are listed in is the opening's.
  const bidderOption = (b: BidderFacts) => ({ value: b.id, label: held ? shownAs(b.id).ref : `No. ${b.listingNo}, ${b.bidderName}`, order: held ? shownAs(b.id).no : b.listingNo });
  const byPseudonym = (a: { order: number }, z: { order: number }) => a.order - z.order;
  const runningBidders = (running ? inRunningAt(f, running) : f.bidders.filter((b) => !b.excludedReason)).map((b) => bidderOption(b)).sort(byPseudonym).map(({ value, label }) => ({ value, label }));

  // ---- the recommendation
  const ranked = ranking(f);
  const comp = f.model.stages.find((s) => s.kind === "COMPOSITE") ?? null;
  const rec = e.recommendation;
  const rb = rec ? (f.bidders.find((b) => b.id === rec.bidderId) ?? null) : null;
  const estimateGate = "value" in f.estimate ? ((await gates.estimate()) ?? ({ state: "WITHHELD", basis: "CUSTODY_NOT_SET", scope: "estimate", words: { en: "The company estimate has no one in its custody to ask.", ms: "Anggaran syarikat tiada yang memegangnya untuk ditanya." } } as Sulit<true>)) : null;
  const sv = rb ? saving(f.estimate, recommendedPriceOf(rb)) : null;
  const incomplete = incompleteStages(f);
  const recommendation = {
    composite: comp ? comp.labelEn : null,
    ranked: ranked.map((r) => ({ id: r.bidder.id, rank: r.rank, listingNo: r.bidder.listingNo, bidder: r.bidder.bidderName, compositeScore: r.composite != null ? fig(r.composite, dp) : null, evaluatedPrice: formatMoney(r.price), recommendedPrice: formatMoney(recommendedPriceOf(r.bidder)), negotiated: r.bidder.negotiatedPrice != null, period: periodWords(r.bidder.period), ceiling: ((x) => (x ? evaluationFindingText(x) : null))(recommendedCeilingFault(recommendedPriceOf(r.bidder), ceiling)) })),
    incomplete,
    formed: rec && rb ? { listingNo: rb.listingNo, bidder: rb.bidderName, recommendedPrice: formatMoney(senFromDecimal(rec.price)), period: rec.completionPeriod != null && rec.completionUnit ? periodWords({ value: rec.completionPeriod, unit: rec.completionUnit }) : "Not stated", topRanked: rec.topRanked, justification: rec.justification || null, formedBy: rec.formedBy.name, formedActed: attributed.read({ entity: "Recommendation", id: rec.id, slot: "formedBy" }, rec.formedBy.name).en, formedAt: formatOrgDateTime(rec.formedAt, tz) } : null,
    // The saving is the estimate less the price: a reader who may not read the estimate may not read it either (the review of Phase 3a).
    savingAmount: (sv == null ? null : "sealed" in sv ? "The company estimate is still sealed" : "noEstimate" in sv ? "No company estimate" : through(estimateGate!, `${formatMoney(sv.amount)}${sv.pct != null ? ` (${pctText(sv.pct, 2)})` : ""}`)) as Sulit<string> | string | null,
    estimate: ("value" in f.estimate ? { label: f.estimate.label ?? "Company estimate", value: through(estimateGate!, formatMoney(f.estimate.value)) } : null) as { label: string; value: Sulit<string> } | null,
    form: rec ? { allowed: false as const, reason: "The recommendation is formed." } : allowedOf([...openActFaults({ exerciseStatus: ex.status, state: e.state }), ...incomplete.map((stage): Finding => ({ code: "STAGES_NOT_COMPLETE", level: "block", data: { stage } })), ...(e.meetings.some((m) => !m.closedAt) ? [{ code: "NEGOTIATION_OPEN", level: "block", data: { count: e.meetings.filter((m) => !m.closedAt).length } } as Finding] : []), ...(e.negotiations.some((n) => n.approvalInstance.status === "PENDING") ? [{ code: "NEGOTIATION_PENDING", level: "block" } as Finding] : [])]),
    topId: ranked.find((r) => r.rank === 1)?.bidder.id ?? null,
  };

  // ---- the report and the Kertas Cadangan
  const issueFaults = reportFaults({
    stagesIncomplete: incomplete,
    recommended: !!rec,
    openMeetings: e.meetings.filter((m) => !m.closedAt).length,
    pendingNegotiations: e.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length,
    seriesKey: c.policy?.reportSeriesKey ?? null,
    template: c.policy?.reportTemplate ? { state: "OK", missing: [], unknown: [] } : { state: "NOT_SET", missing: [], unknown: [] },
    admittedUnopened: c.admittedUnopened,
    supplementaryInProgress: c.supplementaryInProgress,
    consent: [],
    stale: reportStale(e.bidders.map((b) => b.openedBidId), c.carried.map((b) => b.id)),
    personActive: true,
    today: org.today,
    ceiling: rec ? { price: senFromDecimal(rec.price), snapshot: ceiling } : null,
  });
  // What may be done with the report, judged by findings that name stages and ceilings: held back with the figures.
  const reportActs = {
    issue: e.state === "OPEN" ? allowedOf([...openActFaults({ exerciseStatus: ex.status, state: e.state }), ...issueFaults]) : { allowed: false as const, reason: "The report is issued." },
    render: p ? { allowed: false as const, reason: "The Kertas Cadangan is produced." } : allowedOf([...issuedActFaults({ exerciseStatus: ex.status, state: e.state }), ...(c.policy?.proposalTemplate ? [] : [{ code: "TEMPLATE_NOT_SET", level: "block" as const }]), ...(c.policy?.checkerRoleCode ? [] : [{ code: "CHECKER_NOT_SET", level: "block" as const }]), ...(c.policy?.recommenderRoleCode ? [] : [{ code: "RECOMMENDER_NOT_SET", level: "block" as const }])]),
    sign: issuedAct,
  };

  return {
    bidders,
    factors,
    capitalInputs: capitalStages.length > 0,
    cprInputs: cprStages.length > 0,
    correct: e.submissions.length ? { allowed: false as const, reason: evaluationFindingText({ code: "CORRECTION_AFTER_SUBMISSION", level: "block" }) } : openAct,
    stages,
    sittings,
    aspects,
    meetings,
    negotiations,
    communications,
    runningBidders,
    allBidders: f.bidders.map((b) => bidderOption(b)).sort(byPseudonym).map(({ value, label }) => ({ value, label })),
    recommendation,
    reportActs,
  };
  };

  const gate = gates.evaluation;
  return {
    exerciseId,
    reference: ex.reference,
    header,
    current: {
      id: e.id,
      version: e.version,
      state: STATE_LABEL[e.state],
      open: e.state === "OPEN",
      decimals: dp,
      act: openAct,
      team,
      report: reportSurface,
      /// Everything that is read from scores and prices, or that says what was said to a tenderer: built only for a reader the evaluation is open to.
      detail: gate.state === "GRANTED" ? sulitGranted(await detailOf(), gate.basis) : gate,
    },
  };
}

/// One stage as its card shows it: who it is for, whether open, and each bidder's figure.
function stageView(f: EvaluationFacts, s: StageSnap, dp: number | null, sub: { submittedAt: Date; submittedBy: { name: string } } | null, tz: string | null, reveal: boolean, pseudo: ReadonlyMap<string, number>) {
  const anon = stageAnonymity(s, f.anonymised);
  const submitted = !!sub;
  const access = stageAccess(f, s, null);
  const criteria = scoredCriteria(s).map((cr) => ({ code: cr.code, label: cr.labelEn, scale: cr.scale, scaleLabel: SCALE_LABEL[cr.scale], max: cr.maxMarks ? formatFixed(parseFixed(cr.maxMarks), 2) : null }));
  // An anonymous stage lists its bids in pseudonym order: the bids' order is the opening's listing order, which is the key to the names.
  const rows = f.bidders.map((b) => bidderAtStage(f, s, b, dp, submitted, anon, reveal, pseudo.get(b.id) ?? 0)).sort((a, z) => (anon.anonymous ? a.listingNo - z.listingNo : 0));
  const notBanded = submitted ? [] : rows.flatMap((r) => r.notBanded.map((n) => ({ key: `${r.id}/${n.code}`, label: `${r.ref}: ${n.label} is in no band` })));
  const blockers = submitted || s.kind === "SHORTLIST" || s.kind === "COMMITTEE_DECISION" || s.kind === "RECOMMENDATION" ? [] : rows.flatMap((r) => r.faults);
  return {
    code: s.code,
    order: s.order,
    label: s.labelEn,
    kind: s.kind,
    kindLabel: STAGE_KIND_LABEL[s.kind],
    side: s.side,
    sideLabel: SIDE_LABEL[s.side],
    submitted: sub ? `Submitted ${formatOrgDateTime(sub.submittedAt, tz)} by ${sub.submittedBy.name}` : null,
    locked: access.length && !submitted ? evaluationFindingText(access[0]) : null,
    criteria,
    hasFigure: s.kind === "SCORED" || s.kind === "FINANCIAL_TEST" || s.kind === "COMPOSITE",
    passMark: s.passMark ? `${formatFixed(parseFixed(s.passMark), dp ?? 2)}%` : null,
    shortlist: s.kind === "SHORTLIST" ? { rule: s.shortlistRule, min: s.shortlistMin, max: s.shortlistMax } : null,
    committee: s.kind === "COMMITTEE_DECISION" ? s.committeeCode : null,
    rows,
    notBanded,
    // Re-review 8: per bid, gathered (pendingText), then each sentence once.
    pending: [...new Set(blockers.length ? rows.flatMap((r) => pendingSentences(blocking(r.faults))) : [])].slice(0, 6),
  };
}

function bidderAtStage(f: EvaluationFacts, s: StageSnap, b: BidderFacts, dp: number | null, submitted: boolean, anon: AnonymisedStage, reveal: boolean, pseudonym: number) {
  const run = runningAt(f, s, b);
  const r = resultOf(f, b.id, s.code);
  const computed = !submitted && run.state === "IN" ? stageResult(f, s, b) : null;
  // S-1: while a blocking fault stands the stage has not judged the bid: "not yet", with the reason.
  const live = computed ? liveStanding(computed) : null;
  const shown = submitted ? (r?.shown ?? null) : (live?.shown ?? null);
  const passed = submitted ? (r?.passed ?? null) : (live?.passed ?? null);
  const band = submitted ? (r?.bandLabel ?? null) : (live?.bandLabel ?? null);
  // Re-review 8: one sentence per bid for the items it lacks, each reason once.
  const notYet = live && live.pending.length ? pendingText(live.pending) : null;
  const scoreRows = scoredCriteria(s).map((cr) => {
    const sc = b.scores.get(scoreKey(s.code, cr.code)) ?? null;
    return { code: cr.code, label: cr.labelEn, value: sc ? (sc.marks != null ? formatMark(sc.marks, dp) : sc.passed ? "Pass" : "Fail") : null, by: sc?.scoredBy ?? null, carried: sc?.carried ?? false, /// FR-EVL-020: the bidder is named for a criterion that needs the named contractor, once the reveal has been asked and logged.
      named: anon.namedFor.has(cr.code) && reveal ? b.bidderName : null };
  });
  return {
    id: b.id,
    // The number the stage shows the bid by, how a sentence calls it, and its name: on an anonymous stage the pseudonym, never the listing number or the name.
    ...bidIdentityAtStage(anon.anonymous, b, pseudonym),
    running: RUNNING_LABEL[run.state],
    inRunning: run.state === "IN",
    stageFigure: shown != null ? `${formatFixed(shown, dp ?? 4)}%` : null,
    outcome: notYet ? "Not yet" : passed == null ? null : passed ? "Passes" : "Fails",
    notYet,
    band,
    out: submitted ? (r?.outOfRunning ?? false) : (live?.outOfRunning ?? false),
    scoreRows,
    stageOne: s.kind === "COMMITTEE_DECISION" ? (b.stageOne ?? "NOT_TABLED") : null,
    shortlisted: s.kind === "SHORTLIST" ? b.shortlisted : null,
    notBanded: (computed?.notBanded ?? []).map((code) => ({ code, label: s.criteria.find((x) => x.code === code)?.labelEn ?? "A criterion" })),
    faults: faultsForBid(anon.anonymous, (computed?.faults ?? []) as Finding[], pseudonym),
  };
}

export type EvaluationTabView = NonNullable<Awaited<ReturnType<typeof evaluationTabView>>>;
/// The surface of a version, which says nothing of a figure, and its detail, which is the evaluation's SULIT content (FR-EVL-014): a `Sulit` of everything the
/// scores, prices and letters could be read from.
export type EvaluationSurface = NonNullable<EvaluationTabView["current"]>;
export type EvaluationDetail = Extract<EvaluationSurface["detail"], { state: "GRANTED" }>["value"];
/// A version whose detail is open to the reader: what the lists and drawers are drawn from.
export type EvaluationCurrent = Omit<EvaluationSurface, "detail" | "report"> & Omit<EvaluationDetail, "reportActs"> & { report: EvaluationSurface["report"] & EvaluationDetail["reportActs"] };
export type StageView = EvaluationCurrent["stages"][number];

/// The version's surface and detail as one, where the detail is open; null where it is withheld.
export function openDetail(c: EvaluationSurface): EvaluationCurrent | null {
  if (c.detail.state === "WITHHELD") return null;
  const { detail, report, ...surface } = c;
  const { reportActs, ...rest } = c.detail.value;
  void detail;
  return { ...surface, ...rest, report: { ...report, ...reportActs } };
}
