/**
 * The Bids and opening tab's Opening and Schedule sections, as read (6.7 plan §5). Every act's
 * availability is judged by the same pure rule its action re-runs under its locks, on the same
 * context (`openingContext`), so a disabled control and a refused act give the same reason. Words
 * only: codes never reach the screen. A price as read is returned as a `Sulit<string>` under the registered SULIT key
 * `openingPrice` (C-4, Phase 3b): the caller asks once whether the reader may read the exercise's opening prices
 * and holds every price to the answer; the company estimate's figure is never read here —
 * before finalising it is "Sealed until the schedule is finalised", and after, only the frozen
 * schedule carries it (ADR 0012, OD-2 A).
 */

import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { ENVELOPE_KIND_LABEL, receiptTime, SOURCE_LABEL } from "@/lib/bids/labels";
import { toSecond } from "@/lib/bids/lateness";
import { dayIn, storedDay } from "@/lib/dates";
import { loadAttributions, type AttributionIndex } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadExercise } from "@/lib/method/repo";
import { formatMoney, parseSen, type Sen } from "@/lib/money";
import { leadTime } from "@/lib/scope/estimate";
import { loggedEstimateAccess } from "@/lib/scope/estimate-access";
import { applyDecision, sulitWithheld, through, type Sulit } from "@/lib/auth/sulit-access";
import type { Reader } from "@/lib/auth/sulit-store";

import { lockGapFinding } from "./box";
import { checklistFromSnapshot, openingChecklist, unansweredItems } from "./checklist";
import { COPY_NOT_COMPARED_LABEL, COPY_NOT_COMPARED_TEXT, copyFindingFault, copyReading, estimateCardText } from "./estimate-copy";
import { finaliseFaults, markFaults, recordFaults, scheduleScanFault } from "./finalise";
import { summaryFromSnapshot, type GrandSummary } from "./grand-summary";
import { freshInitials } from "./initials";
import { consequenceFor, eligibilityFindingOf, ineligibleOf, registerClassOf } from "@/lib/suppliers/opening-hook";
import { isRestrictionReading, restrictionReadingWords } from "@/lib/suppliers/restriction-register";
import { ALTERNATIVE_LABEL, CHECKLIST_ANSWER_LABEL, COPY_CHECK_LABEL, GROUND_LABEL, INVITED_READING_LABEL, OPENING_KIND_LABEL, OPENING_PHASE_LABEL, OPENING_PHASE_TONE, openingFindingText, periodText, REPORTED_LABEL, restrictionLabel, SALE_FINDING_LABEL, SEALED_UNTIL_FINALISED, seatWords, VERDICT_LABEL, VERDICT_TONE } from "./labels";
import { unpurchasedRuleText } from "./unpurchased";
import { alternativeInsideFaults, openFaults } from "./open";
import { supplementaryPanel } from "./panel";
import { rosterFaults } from "./roster";
import { loadOpeningRoster } from "./roster-store";
import { invitedCounts, liveScans, openingContext, panelOf, policyOf, presentOf, stateOf, type OpeningContext, type OpeningRow } from "./repo";
import { INVITED_READING_TEXT, jadualTawaran, lateCount, scheduleFromSnapshot, type ScheduleSnapshot } from "./schedule";
import { estimateLeadFaults, frozenRuleFaults, startFaults, supplementaryFaults } from "./start";
import { actFaults, openingPhase, sittingAuthorisers } from "./state";
import { blocking, type Finding } from "./types";
import { adjournFaults, authorisationFaults } from "./unseal";
import { judgeBid } from "./verdict";
import { verdictDrift } from "./verdict-drift";
import { matchFaults } from "./withdrawals";

export type Allowed = { allowed: true } | { allowed: false; reason: string };
export const allowedOf = (fs: readonly Finding[]): Allowed => (blocking(fs).length ? { allowed: false, reason: [...new Set(blocking(fs).map(openingFindingText))].join(" ") } : { allowed: true });
type Option = { value: string; label: string };

const time = (d: Date | null | undefined, tz: string | null) => (d ? receiptTime(d, tz) : "Not recorded");
const PROVENANCE_WORD: Record<string, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const titleOf = (o: Pick<OpeningRow, "kind" | "sequenceNo">) => (o.kind === "MAIN" ? OPENING_KIND_LABEL.MAIN : `${OPENING_KIND_LABEL.SUPPLEMENTARY} ${o.sequenceNo - 1}`);
const money = (v: { toString(): string }) => formatMoney(parseSen(v.toString()));

async function load(organisationId: string, exerciseId: string) {
  const l = await loadExercise(organisationId, exerciseId);
  if (!l) return null;
  // The same clock the acts read: to the second (6.6 CR-3).
  const now = toSecond(new Date());
  const c = await openingContext({ org: l.org, ex: l.ex }, db, now);
  const people = await db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return { l, c, now, people: people.map((p) => ({ value: p.id, label: p.name })) };
}

/// The admission of a late envelope as the register reads it: the latest live matter's outcome.
function admissionOf(c: OpeningContext, envelopeId: string) {
  const m = c.lateMatters.filter((x) => x.bidEnvelopeId === envelopeId && !x.withdrawn).at(-1) ?? null;
  return m ? { id: m.id, outcome: m.outcome, sitting: m.sittingReference } : null;
}

// ------------------------------------------------------------------ the Opening section

/// The caller's one answer, asked and logged, for the exercise's opening prices (`openingPrice`, `correctedPrice`): every price this read returns is held to it.
export async function openingSection(organisationId: string, exerciseId: string, prices: Sulit<true>) {
  const r = await load(organisationId, exerciseId);
  if (!r) return null;
  const { l, c, now, people } = r;
  const tz = l.org.timeZone;
  const closing = l.ex.closingAt;
  const applies = c.window?.publishedAt != null && (l.ex.packKindSnapshot === "TENDER" || l.ex.packKindSnapshot === "QUOTATION");

  // ---- starting the main opening: everything but the panel picked and who records it.
  const sf = startFaults({ status: l.ex.status, packKind: l.ex.packKindSnapshot, publishedThroughWindow: c.window?.publishedAt != null, timeZone: tz, phase: c.gate.phase, boxLocked: c.boxLocked, changePending: c.gate.changePending, mainExists: c.main != null, personActive: true });
  const config: Finding[] = [];
  if (!c.method?.openingCommitteeCode) config.push({ code: "COMMITTEE_NOT_SET", level: "block" });
  else if (!c.committee) config.push({ code: "COMMITTEE_NOT_FOUND", level: "block" });
  else if (c.committee.panelSize == null) config.push({ code: "PANEL_SIZE_NOT_SET", level: "block" });
  else if (c.committee.panelExclusionRule === true && !c.committee.panelExcludesUnitCode) config.push({ code: "EXCLUDED_UNIT_NOT_SET", level: "block" });
  const current = c.estimate?.versions.find((v) => v.versionNo === c.estimate!.currentVersionNo) ?? null;
  const lead = leadTime(current ? storedDay(current.preparedOn) : null, closing, c.scopePolicy, tz);
  const est = estimateLeadFaults({ requires: c.method?.requiresCompanyEstimate ?? null, estimateState: c.estimate?.state ?? null, lead, override: null, overrideRoleCode: c.scopePolicy.estimateOverrideRoleCode });
  // A late estimate is not a refusal here: the drawer asks for 6.2's override.
  const estimateLate = !est.ok && est.faults.length === 1 && est.faults[0].code === "ESTIMATE_LATE";
  // Review M-4: what the start would freeze unset, making finalising impossible.
  const rf = frozenRuleFaults({ completenessEliminates: c.bidRule.rule?.completenessEliminates ?? null, invitedReading: c.openingPolicy?.invitedCountReading ?? null, checklist: openingChecklist({ parts: (c.pack?.parts ?? []).map((p) => ({ partCode: p.partCode, label: p.labelSnapshot, role: p.role, mandatory: p.mandatory, returnedByBidder: p.returnedByBidder, sortOrder: p.sortOrder })), addenda: c.addenda }) });
  // SR-07 (ruling 11): where the exercise names its opening officers they are the panel. What can have changed since they were named stops the start here, in words;
  // the size and the presence are the table's (an officer's absence, a panel of another size on an override), judged by the start itself.
  const rosterCtx = l.ex.openingRosterRequired ? await loadOpeningRoster(l.ex, l.org) : null;
  const rosterBlocks: Finding[] = rosterCtx ? rosterFaults(rosterCtx.input).filter((f) => f.level === "block" && f.code !== "OFFICERS_SHORT" && f.code !== "OFFICERS_TOO_MANY") : [];
  const rosterOptions = rosterCtx ? rosterCtx.rows.map((r) => ({ value: r.personId, label: `${r.name} · ${r.seatLabel}` })) : null;
  const start = {
    roster: rosterOptions,
    allowed: allowedOf([...sf, ...rf, ...config, ...rosterBlocks, ...(est.ok || estimateLate ? [] : est.faults)]),
    committee: c.committee?.nameEn ?? null,
    panelSize: c.committee?.panelSize ?? null,
    independence: c.committee?.panelExclusionRule == null ? openingFindingText({ code: "EXCLUSION_RULE_NOT_SET", level: "warn" }) : c.committee.panelExclusionRule ? "Each member is checked against the committee's independence rule." : "The committee excludes no unit from its panel.",
    seats: c.seats.map((s) => ({ value: s.personId, label: `${people.find((p) => p.value === s.personId)?.label ?? c.roster.people.find((p) => p.id === s.personId)?.name ?? "A person not on record"} · ${s.seatLabel}` })),
    estimateLate: estimateLate ? openingFindingText(est.faults[0]) : null,
  };

  // ---- the late envelopes, and the supplementary openings their admissions call for (OD-5).
  // R-3: a supplementary opening is the main opening's committee, its panel rules as they stand now.
  const sup = c.main ? supplementaryPanel({ mainCommittee: c.mainCommittee, frozenCode: policyOf(c.main.policySnapshot).committee.code, seats: c.mainSeats, unitPath: c.unitPath }) : null;
  const supConfig: Finding[] = !sup ? [] : "fault" in sup ? [sup.fault] : sup.policy.panelSize == null ? [{ code: "PANEL_SIZE_NOT_SET", level: "block" }] : sup.policy.exclusionRule === true && !sup.policy.excludedUnitCode ? [{ code: "EXCLUDED_UNIT_NOT_SET", level: "block" }] : [];
  const late = c.envelopes
    .filter((e) => e.late && e.kind !== "COMPANY_ESTIMATE")
    .map((e) => {
      const a = admissionOf(c, e.id);
      const opening = c.openings.find((o) => o.admissionDecision?.bidEnvelopeId === e.id) ?? null;
      const state = opening ? (opening.finalisedAt ? "Opened at its supplementary opening" : "Its supplementary opening is under way") : !a ? "Not tabled for admission" : a.outcome == null ? `Tabled at ${a.sitting}: not decided` : a.outcome === "CARRIED" ? `Admitted at ${a.sitting}` : `Not admitted at ${a.sitting}: returned unopened`;
      const canStart = a?.outcome === "CARRIED" && !opening;
      return {
        id: e.id,
        sequence: e.sequence,
        received: time(e.receivedAt, tz),
        markings: e.markings,
        state,
        tone: (opening ? "ok" : a?.outcome === "CARRIED" ? "brand" : a?.outcome == null ? "warn" : "neutral") as "ok" | "brand" | "warn" | "neutral",
        decisionId: canStart ? a!.id : null,
        startSupplementary: canStart ? allowedOf([...supplementaryFaults({ status: l.ex.status, mainFinalised: !!c.main?.finalisedAt, decision: { matterKind: "LATE_TENDER", outcome: a!.outcome, bidEnvelopeId: e.id }, alreadyOpened: false, envelope: { status: e.status, late: e.late }, personActive: true, timeZone: tz }), ...supConfig]) : null,
      };
    });

  // ---- the company estimate: never its figure.
  // S-5: "not needed" and "not set" read differently; a voluntary copy left unanswered says it was not compared.
  const estimate = estimateCardText({ requires: c.main ? policyOf(c.main.policySnapshot).estimate.requires : (c.method?.requiresCompanyEstimate ?? null), state: c.estimate?.state ?? null, copyCheck: c.main?.estimateCopyCheck ?? null, sealedText: SEALED_UNTIL_FINALISED });

  // Who started each opening, signed or recorded from paper, is read from its attribution (Phase 2b).
  const startedBy = await loadAttributions(db, organisationId, [{ entity: "Opening", slot: "startedBy", ids: c.openings.map((o) => o.id) }]);
  const authorisedBy = await loadAttributions(db, organisationId, [{ entity: "OpeningAuthorisation", slot: "person", ids: c.openings.flatMap((o) => o.authorisations.map((a) => a.id)) }]);
  const openings = c.openings.map((o) => openingView(o, c, { now, tz, closing, people, startedBy, authorisedBy, prices }));

  return {
    exerciseId: l.ex.id,
    reference: l.ex.reference,
    status: l.ex.status,
    applies,
    people,
    start,
    startNeeded: c.main == null,
    /// R-3: the supplementary opening's panel is picked from the main opening's committee.
    supplementary: { roster: rosterOptions, seats: c.mainSeats.map((s) => ({ value: s.personId, label: `${people.find((p) => p.value === s.personId)?.label ?? c.roster.people.find((p) => p.id === s.personId)?.name ?? "A person not on record"} · ${s.seatLabel}` })), panelSize: c.mainCommittee?.panelSize ?? null },
    late,
    estimate,
    estimateOverride: estimateLate ? { roleConfigured: c.scopePolicy.estimateOverrideRoleCode != null } : null,
    openings,
    box: {
      lockedAt: c.lockEvent ? time(c.lockEvent.occurredAt, tz) : null,
      gap: c.lockEvent && closing ? openingFindingText(lockGapFinding(closing, c.lockEvent.occurredAt)) : null,
    },
  };
}

function openingView(o: OpeningRow, c: OpeningContext, x: { now: Date; tz: string | null; closing: Date | null; people: Option[]; startedBy: AttributionIndex; authorisedBy: AttributionIndex; prices: Sulit<true> }) {
  const { prices } = x;
  const { tz, closing } = x;
  const state = stateOf(o, c.ex.status);
  const phase = openingPhase(state);
  const panel = panelOf(o);
  const present = presentOf(o);
  const snap = policyOf(o.policySnapshot);
  const checklist = checklistFromSnapshot(o.checklistSnapshot);
  const act = allowedOf(actFaults(state));
  const authorisers = sittingAuthorisers(state.sittingNo, o.authorisations, panel);
  const boxLocked = lockedAtOrAfterClosing(c.events, closing);
  const unpurchased = snap.unpurchased.consequence ?? c.method?.unpurchasedBidConsequence ?? null;
  const ineligibleConsequence = consequenceFor(o.policySnapshot, c.supplierPolicy?.ineligibleBidConsequence ?? null);
  const allBids = c.openings.flatMap((y) => y.bids);

  // ---- the envelopes this opening opens.
  const toOpen = c.envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && (o.kind === "MAIN" ? !e.late : e.id === o.admissionDecision?.bidEnvelopeId));
  const withdrawnIds = new Set(c.withdrawals.map((w) => w.envelopeId).filter(Boolean));
  const envelopes = toOpen.map((e) => {
    const bid = allBids.find((b) => b.envelopeId === e.id && !b.isAlternative) ?? null;
    return {
      id: e.id,
      sequence: e.sequence,
      kind: ENVELOPE_KIND_LABEL[e.kind],
      isAlternative: e.kind === "ALTERNATIVE",
      // C-3 (b): a box envelope's time is the lock's, never a receipt time.
      source: e.receivedSource === "BOX_AT_OPENING" ? `${SOURCE_LABEL.BOX_AT_OPENING} at ${time(e.receivedAt, tz)}` : `Received ${time(e.receivedAt, tz)}`,
      markings: e.markings,
      state: e.status === "OPENED" ? `Opened as No. ${bid?.listingNo ?? "—"}` : e.status === "WITHDRAWN" || withdrawnIds.has(e.id) ? "Withdrawn, not opened" : "Sealed",
      tone: (e.status === "OPENED" ? "ok" : e.status === "WITHDRAWN" ? "neutral" : "warn") as "ok" | "neutral" | "warn",
      open: e.status === "RECEIVED" && !withdrawnIds.has(e.id) ? allowedOf(openFaults({ state, envelope: { id: e.id, kind: e.kind, status: e.status, late: e.late }, withdrawn: withdrawnIds.has(e.id), admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null, bidder: { partyId: "-", name: "", registrationNo: "", registrationTaken: false }, price: 1n as Sen, period: { value: null, unit: null }, isAlternative: e.kind === "ALTERNATIVE", alternativesPermitted: snap.alternativesPermitted, parent: null, timeZone: tz })) : null,
    };
  });

  // ---- the offers as read.
  const offers = o.bids.map((b) => {
    const fresh = freshInitials(b, b.initials);
    const answers = new Map(b.answers.map((a) => [a.itemKey, a.answer]));
    const j = judgeBid({ saleFinding: b.saleFinding, restrictionFinding: b.restrictionFinding, isAlternative: b.isAlternative, alternativeStatus: b.alternativeStatus, ineligible: ineligibleOf(b.eligibilityFinding) }, checklist, answers, { completenessEliminates: snap.completeness.eliminates, unpurchased, ineligible: ineligibleConsequence });
    const period = b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null;
    const verdictBlock = [...actFaults(state), ...j.notSet];
    return {
      id: b.id,
      listingNo: b.listingNo,
      envelope: `Envelope ${b.envelope.sequence}`,
      bidder: b.bidderNameAsRead,
      registration: [b.party.registrationNo, b.registrationClassAsRead, b.registrationStatusAsRead].filter(Boolean).join(" · "),
      /// SULIT (C-4): held to the reader's answer, so a refused reader is sent no figure.
      openingPrice: through(prices, () => money(b.priceAsRead)),
      period: periodText(period),
      validity: b.validityDaysStated == null ? "Not stated" : `${b.validityDaysStated} days`,
      alternative: b.isAlternative ? `${b.alternativeStatus ? ALTERNATIVE_LABEL[b.alternativeStatus] : "Alternative"}${b.parentOpenedBid ? ` to No. ${b.parentOpenedBid.listingNo}` : ""}` : null,
      sale: SALE_FINDING_LABEL[b.saleFinding],
      saleTone: (b.saleFinding === "LIVE_SALE" ? "ok" : "warn") as "ok" | "warn",
      restriction: b.restrictionFinding === "NOT_RESTRICTED" ? null : restrictionLabel(b.restrictionFinding, b.restrictionReading),
      restrictionTone: (b.restrictionFinding === "NOT_EVIDENCED" ? "err" : b.restrictionFinding === "NOT_ASSESSED" ? "warn" : "ok") as "ok" | "warn" | "err",
      /// Ruling 17a: for a sale from an online purchase, what the supplier register said and when, in words.
      restrictionWhy: isRestrictionReading(b.restrictionReading) ? restrictionReadingWords(b.restrictionReading) : null,
      /// 6.15a: the supplier register's finding, frozen when the envelope was opened. Null: the bidder was not linked.
      eligibility: (() => {
        const f = eligibilityFindingOf(b.eligibilityFinding);
        return f ? { text: `Supplier register: ${f.verdict === "ELIGIBLE" ? "eligible" : f.verdict === "NOT_ELIGIBLE" ? "not eligible" : "not assessed"}`, tone: (f.verdict === "ELIGIBLE" ? "ok" : f.verdict === "NOT_ELIGIBLE" ? "err" : "warn") as "ok" | "err" | "warn" } : null;
      })(),
      corrected: b.asReadCorrectedAt ? `Corrected ${time(b.asReadCorrectedAt, tz)}` : null,
      initialled: fresh.map((i) => i.person.name),
      initialMissing: present.filter((p) => !fresh.some((i) => i.personId === p.personId)).map((p) => p.name),
      initialFor: present.map((p) => ({ personId: p.personId, name: p.name, allowed: allowedOf(markFaults({ state, panel, personId: p.personId, already: fresh.some((i) => i.personId === p.personId), sameOpening: true })) })),
      checklist: checklist.items.map((it) => ({ key: it.key, label: it.label, answer: answers.get(it.key) ?? null, answerLabel: answers.has(it.key) ? CHECKLIST_ANSWER_LABEL[answers.get(it.key)!] : "Not answered" })),
      unanswered: unansweredItems(checklist.items, answers).length,
      verdict: b.verdict ? { label: VERDICT_LABEL[b.verdict], tone: VERDICT_TONE[b.verdict], reason: b.verdictReason || null } : null,
      grounds: j.grounds.map((g) => GROUND_LABEL[g]),
      reported: j.reported.map((g) => REPORTED_LABEL[g]),
      /// Which verdict the rules leave open: carried only without a ground, not carried only with one.
      verdictOptions: [
        { value: "PASS", label: j.grounds.length ? `${VERDICT_LABEL.PASS} (not open: ${GROUND_LABEL[j.grounds[0]].toLowerCase()})` : VERDICT_LABEL.PASS, disabled: j.grounds.length > 0 },
        { value: "REJECT", label: j.grounds.length ? VERDICT_LABEL.REJECT : `${VERDICT_LABEL.REJECT} (not open: nothing eliminatory stands against it)`, disabled: j.grounds.length === 0 },
      ],
      record: allowedOf(actFaults(state)),
      verdictAllowed: allowedOf(verdictBlock),
      correctValues: { bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, periodValue: b.completionPeriod == null ? "" : String(b.completionPeriod), periodUnit: b.completionUnit ?? "", validityDays: b.validityDaysStated == null ? "" : String(b.validityDaysStated) },
      alternativeInside: b.isAlternative ? null : allowedOf(alternativeInsideFaults({ state, main: { openingMatches: true, isAlternative: false }, alternativesPermitted: snap.alternativesPermitted, price: 1n as Sen, period: { value: null, unit: null } })),
    };
  });

  // ---- withdrawals at the main opening (X-11).
  const boxEnvelopes = c.envelopes.filter((e) => e.receivedSource === "BOX_AT_OPENING" && e.status === "RECEIVED" && e.kind !== "COMPANY_ESTIMATE");
  const facts = c.withdrawals.map((w) => ({ id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding }));
  const withdrawals =
    o.kind !== "MAIN"
      ? []
      : c.withdrawals.map((w) => {
          const fact = facts.find((f) => f.id === w.id)!;
          const resolved = !!w.envelopeId || !!w.unmatchedFinding.trim();
          return {
            id: w.id,
            received: time(w.receivedAt, tz),
            state: w.envelope ? `Matched to envelope ${w.envelope.sequence}: withdrawn, not opened` : w.unmatchedFinding.trim() ? `No envelope matched. The panel found: ${w.unmatchedFinding}` : "Not matched yet",
            resolved,
            match: resolved ? null : allowedOf(boxEnvelopes.length ? matchFaults({ state, withdrawal: fact, envelope: { id: boxEnvelopes[0].id, kind: boxEnvelopes[0].kind, status: boxEnvelopes[0].status, late: boxEnvelopes[0].late, receivedSource: boxEnvelopes[0].receivedSource }, withdrawals: facts }) : [...actFaults(state), { code: "ENVELOPE_NOT_RECEIVED", level: "block" }]),
            find: resolved ? null : allowedOf(actFaults(state)),
          };
        });

  // ---- finalising: everything but who records it and the paper's figure, which the drawer asks.
  const estimateLodged = o.kind === "MAIN" && c.estimate?.state === "LODGED";
  const unopened = c.envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && !e.late && e.status === "RECEIVED").length;
  const admitted = o.admissionDecision?.bidEnvelopeId ? c.envelopes.find((e) => e.id === o.admissionDecision!.bidEnvelopeId) : null;
  const drift = verdictDrift(o.bids, { checklist, completenessEliminates: snap.completeness.eliminates, unpurchased, ineligible: ineligibleConsequence });
  const ff = finaliseFaults({
    state,
    bids: o.bids.map((b) => ({ listingNo: b.listingNo, initials: freshInitials(b, b.initials).map((i) => i.personId), unanswered: unansweredItems(checklist.items, new Map(b.answers.map((a) => [a.itemKey, a.answer]))).length, verdict: b.verdict, unpurchased: b.saleFinding !== "LIVE_SALE" })),
    present,
    signed: o.signatures.map((s) => s.personId),
    pages: o.schedulePages,
    checklist,
    withdrawals: o.kind === "MAIN" ? facts : [],
    unopened,
    admittedOpened: admitted?.status === "OPENED",
    completenessEliminates: snap.completeness.eliminates,
    unpurchased,
    // fix R-6, residual 5: the same judgement finalising runs (verdictDrift), said before it is asked.
    ineligible: { consequence: ineligibleConsequence, anyFound: o.bids.some((b) => ineligibleOf(b.eligibilityFinding)), disagreements: drift.setting },
    noLongerStands: drift.noLongerStands,
    invitedReading: snap.invited.reading,
    estimate: { required: snap.estimate.requires === true, lodged: estimateLodged, paperAnswered: true },
    personActive: true,
  });
  const startDay = tz ? dayIn(o.startedAt, tz) : null;

  return {
    id: o.id,
    title: titleOf(o),
    kind: o.kind,
    phase: OPENING_PHASE_LABEL[phase],
    phaseTone: OPENING_PHASE_TONE[phase],
    finalised: state.finalised,
    finalisedAt: o.finalisedAt ? time(o.finalisedAt, tz) : null,
    committee: o.committeeNameSnapshot,
    started: `${time(o.startedAt, tz)} · ${x.startedBy.read({ entity: "Opening", id: o.id, slot: "startedBy" }, o.startedBy.name).en}`,
    admittedBy: o.admissionDecision ? `Admitted at ${o.admissionDecision.meeting.reference}` : null,
    sittingNo: state.sittingNo,
    sittings: o.sittings.map((s) => ({
      no: s.sittingNo,
      text: [`Sitting ${s.sittingNo}: from ${time(s.startedAt, tz)}`, s.resumeReason ? `resumed: ${s.resumeReason}` : null, s.adjournedAt ? `adjourned ${time(s.adjournedAt, tz)}: ${s.adjournReason}` : null, `recorded by ${s.recordedBy.name}`].filter(Boolean).join(" · "),
    })),
    panelSize: o.panelSizeRequired,
    panelOverride: o.panelOverrideAuthority ? `A panel of ${o.panel.length}, not ${o.panelSizeRequired}, under ${o.panelOverrideAuthority}: ${o.panelOverrideReason}${o.panelOverrideBy ? ` (recorded by ${o.panelOverrideBy.name})` : ""}` : null,
    independence: snap.panel.exclusionRule == null ? openingFindingText({ code: "EXCLUSION_RULE_NOT_SET", level: "warn" }) : snap.panel.exclusionRule ? `Checked against the committee's independence rule (${PROVENANCE_WORD[snap.panel.exclusionProvenance ?? ""] ?? "provenance not recorded"}).` : "The committee excludes no unit from its panel.",
    panel: o.panel.map((p) => ({
      personId: p.personId,
      name: p.person.name,
      seat: p.seatLabelSnapshot,
      present: p.present,
      authorised: authorisers.includes(p.personId),
      authorise: p.present ? allowedOf(authorisationFaults({ state, panel, auths: o.authorisations, personId: p.personId, recorderId: null, now: x.now, closing, boxLocked })) : null,
    })),
    authorisations: o.authorisations.map((a) => `Sitting ${a.sittingNo}: ${x.authorisedBy.read({ entity: "OpeningAuthorisation", id: a.id, slot: "person" }, a.person.name).en}, ${seatWords(a.panelMember?.seatLabelSnapshot)}, ${time(a.recordedAt, tz)}${a.lapsedAt ? " · lapsed when the sitting was adjourned" : ""}`),
    adjourn: state.adjourned || state.finalised ? null : allowedOf(adjournFaults({ state, reason: "-", personActive: true, resume: false })),
    resume: state.adjourned && !state.finalised ? allowedOf(adjournFaults({ state, reason: "-", personActive: true, resume: true })) : null,
    registerBox: o.kind === "MAIN" && !state.finalised ? allowedOf([...actFaults(state), ...(o.bids.length ? [{ code: "BOX_EMPTIED", level: "block" as const }] : [])]) : null,
    record: act,
    /// What holds every act on the record back while the opening is not finalised (adjourned, the box not opened, the sitting not authorised): said once.
    held: !state.finalised && !act.allowed ? act.reason : null,
    envelopes,
    offers,
    parentOptions: allBids.filter((b) => !b.isAlternative).map((b) => ({ value: b.id, label: `No. ${b.listingNo}, ${b.bidderNameAsRead}` })),
    parties: c.parties.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})` })),
    alternativesPermitted: snap.alternativesPermitted,
    /// Who may be named as recording an act (the verdict's recorder, S-3).
    people: x.people,
    withdrawals,
    matchOptions: boxEnvelopes.map((e) => ({ value: e.id, label: `Envelope ${e.sequence}: ${e.markings}` })),
    checklist: { items: checklist.items.map((i) => i.label), notJudged: checklist.notJudged, notReturned: checklist.notReturned },
    rules: [
      { label: "An incomplete bid", value: snap.completeness.eliminates == null ? "Not set when the window was published" : snap.completeness.eliminates ? "Is eliminated" : "Is reported to the committee" },
      // S-3: "set since the opening started" stays, with when and by whom, read from recordedLater.
      { label: "A bid with no live purchase", value: unpurchasedRuleText(snap, c.method?.unpurchasedBidConsequence ?? null, tz) },
      { label: "Alternatives", value: snap.alternativesPermitted == null ? "Not stated on the window" : snap.alternativesPermitted ? "Permitted" : "Not permitted: recorded, never considered" },
    ],
    signatures: o.signatures.map((s) => `${s.person.name}, ${seatWords(s.panelMember?.seatLabelSnapshot)}, signed on ${formatDate(storedDay(s.signedOn))}`),
    signFor: present.filter((p) => !o.signatures.some((s) => s.personId === p.personId)).map((p) => ({ personId: p.personId, name: p.name, allowed: allowedOf(markFaults({ state, panel, personId: p.personId, already: false, sameOpening: true })) })),
    startDay,
    pages: o.schedulePages,
    minutes: o.minutes,
    details: allowedOf(recordFaults({ state })),
    finalise: {
      allowed: allowedOf(ff),
      outstanding: [...new Set(blocking(ff).map(openingFindingText))],
      paper: estimateLodged ? { required: snap.estimate.requires === true } : null,
    },
  };
}

export type OpeningSectionView = NonNullable<Awaited<ReturnType<typeof openingSection>>>;
export type OpeningView = OpeningSectionView["openings"][number];

/**
 * The reader's standing with the disclosed company estimate, for the exercise's History (FR-EST-008): finalising an opening writes the figure into the trail, so
 * the History judges it by the same custody as the schedule, through the same logged access. A `Sulit<string>` with no value: the screen puts the row's text in
 * when it is granted. An estimate that is void, or none, is in no one's custody.
 */
export async function estimateCustodyForHistory(reader: Reader & { organisationTimeZone: string | null }, exerciseId: string): Promise<Sulit<string>> {
  const access = await loggedEstimateAccess(db, reader, exerciseId);
  return access ? applyDecision(access.decision, "exercise", "") : sulitWithheld<string>("NOT_IN_CUSTODY", "exercise");
}

// ------------------------------------------------------------------ the Schedule section

/**
 * Each opening's schedule: once finalised, its frozen copy and Grand Summary (never recomputed);
 * before, a draft built from the record with the estimate's row sealed and no Grand Summary
 * (FR-OPN-010: after finalising only). The copy finding and its explanation, and the signed scan.
 */
export async function scheduleSection(reader: Reader & { organisationTimeZone: string | null }, exerciseId: string, prices: Sulit<true>) {
  const r = await load(reader.organisationId, exerciseId);
  if (!r) return null;
  // FR-EST-008: the disclosed company estimate's figure is read by its preparer and the offices that hold its copies and audit it, and by nobody else. Judged
  // once for the page, and the access logged, whether it is shown or refused. Before disclosure the schedule shows the estimate sealed and nobody is asked.
  const estimate = await loggedEstimateAccess(db, reader, exerciseId);
  const { l, c, people } = r;
  const tz = l.org.timeZone;
  const counts = invitedCounts(c);
  // SR-15 (ruling 24): the class the register held, frozen on each offer when it was read.
  const registerClassByListing = new Map(c.openings.flatMap((x) => x.bids.map((b) => [b.listingNo, registerClassOf(b.eligibilityFinding)] as const)));
  const openings = c.openings.map((o) => {
    const frozen = scheduleFromSnapshot(o.scheduleSnapshot) as (ScheduleSnapshot & { invitedReadingProvenance?: string | null }) | null;
    const snap = policyOf(o.policySnapshot);
    const readingProvenance = frozen ? (frozen.invitedReadingProvenance ?? null) : snap.invited.provenance;
    const summary: GrandSummary | null = o.finalisedAt ? summaryFromSnapshot(o.grandSummarySnapshot) : null;
    let schedule: ScheduleSnapshot | null = frozen;
    if (!frozen) {
      const rows = c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, price: parseSen(b.priceAsRead.toString()), period: b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null, isAlternative: b.isAlternative, parentListingNo: b.parentOpenedBid?.listingNo ?? null, openingSequence: x.sequenceNo })));
      const estimateHeld = c.estimate && c.estimate.state !== "VOID";
      schedule = jadualTawaran({
        version: o.sequenceNo,
        title: l.ex.title,
        reference: l.ex.reference,
        startDay: l.ex.tenderingStartOn ? storedDay(l.ex.tenderingStartOn) : null,
        closing: l.ex.closingAt,
        // R-4: the reading frozen at the start.
        invited: { reading: snap.invited.reading, ...counts },
        lateCount: lateCount(c.envelopes),
        pages: o.schedulePages,
        rows,
        benchmark: estimateHeld ? { sealed: true } : { notRequired: true },
        lockGap: o.kind === "MAIN" && o.boxLockedAt && l.ex.closingAt ? { seconds: o.lockGapSeconds ?? 0, text: openingFindingText(lockGapFinding(l.ex.closingAt, o.boxLockedAt)) } : null,
      }).schedule;
    }
    const s = schedule!;
    const bm = s.benchmark;
    const scan = scheduleScanFault({ finalised: o.finalisedAt != null, liveScans: liveScans(o) });
    const copy = copyFindingFault(o.estimateCopyCheck, o.copyExplanation != null);
    // S-5: disclosed at this (main) opening with no comparison: "Paper copy not compared".
    const reading = copyReading(o.estimateCopyCheck, o.kind === "MAIN" && o.finalisedAt != null && !("notRequired" in s.benchmark) && !s.benchmark.sealed);
    const copyView = !reading ? null : reading === "NOT_COMPARED" ? { check: null, text: COPY_NOT_COMPARED_LABEL, tone: "neutral" as const, fault: null, body: COPY_NOT_COMPARED_TEXT } : { check: reading, text: COPY_CHECK_LABEL[reading], tone: (reading === "MATCH" ? "ok" : "warn") as "ok" | "warn" | "neutral", fault: copy ? openingFindingText(copy) : null, body: reading === "MATCH" ? "The paper copy in the box and the lodged version agree." : null };
    return {
      id: o.id,
      title: titleOf(o),
      finalised: o.finalisedAt != null,
      finalisedAt: o.finalisedAt ? time(o.finalisedAt, tz) : null,
      header: [
        { label: "Title", value: s.header.title },
        { label: "Reference", value: s.header.reference },
        { label: "Tendering started", value: s.header.startDay ? formatDate(s.header.startDay) : "Not recorded" },
        { label: "Closed", value: s.header.closes ? receiptTime(new Date(s.header.closes), tz) : "Not recorded" },
        { label: "Tenderers invited", value: s.header.invitedReading ? `${s.header.invitedCount} · ${INVITED_READING_TEXT[s.header.invitedReading]}${readingProvenance ? ` (${PROVENANCE_WORD[readingProvenance] ?? "provenance not recorded"})` : ""}` : `Not set: ${openingFindingText({ code: "READING_NOT_SET", level: "block" })}` },
        { label: "Late envelopes on the register", value: String(s.header.lateCount) },
        { label: "Pages of the signed schedule", value: s.header.pages == null ? "Not recorded yet" : String(s.header.pages) },
        ...(s.lockGap ? [{ label: "Closing to the box's lock", value: s.lockGap.text }] : []),
        // S-3: a rule recorded on the opening after it started says so, with when and by whom.
        ...(snap.unpurchased.recordedLater ? [{ label: "A bid with no live purchase", value: unpurchasedRuleText(snap, null, tz) }] : []),
      ],
      rows: s.rows.map((row) => ({ ...row, registerClass: registerClassByListing.get(row.listingNo) ?? null, openingPrice: through(prices, () => formatMoney(parseSen(row.openingPrice))), period: periodText(row.period), alternative: row.isAlternative ? `Alternative${row.parentListingNo != null ? ` to No. ${row.parentListingNo}` : ""}` : null })),
      benchmark: "notRequired" in bm ? null : bm.sealed ? { sealed: true as const, text: SEALED_UNTIL_FINALISED } : { sealed: false as const, label: bm.label ?? "Company estimate", companyEstimate: applyDecision<string>(estimate?.decision ?? { state: "WITHHELD", basis: "SEALED" }, "estimate", () => formatMoney(parseSen(bm.companyEstimate))) },
      // The lowest qualifying offer is marked by comparing the prices: for a reader who may not read them the mark is left off, or it would say which is lowest.
      summary: summary ? { labels: summary.labels, rows: summary.rows.map((x) => ({ ...x, openingPrice: through(prices, () => formatMoney(parseSen(x.openingPrice))), lowest: prices.state === "GRANTED" && x.lowest, label: prices.state === "GRANTED" || !x.lowest ? x.label : x.qualified ? summary.labels.qualified : summary.labels.notQualified })) } : null,
      copy: copyView,
      explanation: o.copyExplanation ? { text: o.copyExplanation.explanation, by: o.copyExplanation.recordedBy.name, at: time(o.copyExplanation.recordedAt, tz) } : null,
      explain: copy && o.finalisedAt ? allowedOf(l.ex.status === "CANCELLED" ? [{ code: "CANCELLED", level: "block" }] : []) : null,
      scan: scan ? openingFindingText(scan) : null,
      reading: snap.invited.reading ? INVITED_READING_LABEL[snap.invited.reading] : null,
    };
  });
  return { exerciseId: l.ex.id, reference: l.ex.reference, timeZone: tz, people, openings };
}

export type ScheduleSectionView = NonNullable<Awaited<ReturnType<typeof scheduleSection>>>;
