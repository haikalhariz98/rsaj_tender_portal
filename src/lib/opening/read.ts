/**
 * The Bids and opening tab's Opening and Schedule sections, as read (6.7 plan §5). Every act's
 * availability is judged by the same pure rule its action re-runs under its locks, on the same
 * context (`openingContext`), so a disabled control and a refused act give the same reason. Words
 * only: codes never reach the screen. A price as read is returned under the registered SULIT key
 * `openingPrice` and shown with its chip (C-4); the company estimate's figure is never read here —
 * before finalising it is "Sealed until the schedule is finalised", and after, only the frozen
 * schedule carries it (ADR 0012, OD-2 A).
 */

import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { ENVELOPE_KIND_LABEL, receiptTime, SOURCE_LABEL } from "@/lib/bids/labels";
import { toSecond } from "@/lib/bids/lateness";
import { dayIn, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadExercise } from "@/lib/method/repo";
import { formatMoney, parseSen, type Sen } from "@/lib/money";
import { leadTime } from "@/lib/scope/estimate";

import { lockGapFinding } from "./box";
import { checklistFromSnapshot, unansweredItems } from "./checklist";
import { copyFindingFault } from "./estimate-copy";
import { finaliseFaults, markFaults, recordFaults, scheduleScanFault } from "./finalise";
import { summaryFromSnapshot, type GrandSummary } from "./grand-summary";
import { ALTERNATIVE_LABEL, CHECKLIST_ANSWER_LABEL, COPY_CHECK_LABEL, GROUND_LABEL, INVITED_READING_LABEL, OPENING_KIND_LABEL, OPENING_PHASE_LABEL, OPENING_PHASE_TONE, openingFindingText, periodText, REPORTED_LABEL, RESTRICTION_FINDING_LABEL, SALE_FINDING_LABEL, SEALED_UNTIL_FINALISED, UNPURCHASED_LABEL, VERDICT_LABEL, VERDICT_TONE } from "./labels";
import { alternativeInsideFaults, openFaults } from "./open";
import { invitedCounts, liveScans, openingContext, panelOf, policyOf, presentOf, stateOf, type OpeningContext, type OpeningRow } from "./repo";
import { INVITED_READING_TEXT, jadualTawaran, lateCount, scheduleFromSnapshot, type ScheduleSnapshot } from "./schedule";
import { estimateLeadFaults, startFaults, supplementaryFaults } from "./start";
import { actFaults, openingPhase, sittingAuthorisers } from "./state";
import { blocking, type Finding } from "./types";
import { adjournFaults, authorisationFaults } from "./unseal";
import { judgeBid } from "./verdict";
import { matchFaults } from "./withdrawals";

export type Allowed = { allowed: true } | { allowed: false; reason: string };
export const allowedOf = (fs: readonly Finding[]): Allowed => (blocking(fs).length ? { allowed: false, reason: [...new Set(blocking(fs).map(openingFindingText))].join(" ") } : { allowed: true });
type Option = { value: string; label: string };

const time = (d: Date | null | undefined, tz: string | null) => (d ? receiptTime(d, tz) : "Not recorded");
const PROVENANCE_WORD: Record<string, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const titleOf = (o: Pick<OpeningRow, "kind" | "sequenceNo">) => (o.kind === "MAIN" ? OPENING_KIND_LABEL.MAIN : `${OPENING_KIND_LABEL.SUPPLEMENTARY} ${o.sequenceNo - 1}`);
const money = (v: { toString(): string }) => formatMoney(parseSen(v.toString()));

async function load(exerciseId: string) {
  const l = await loadExercise(exerciseId);
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

export async function openingSection(exerciseId: string) {
  const r = await load(exerciseId);
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
  const start = {
    allowed: allowedOf([...sf, ...config, ...(est.ok || estimateLate ? [] : est.faults)]),
    committee: c.committee?.nameEn ?? null,
    panelSize: c.committee?.panelSize ?? null,
    independence: c.committee?.panelExclusionRule == null ? openingFindingText({ code: "EXCLUSION_RULE_NOT_SET", level: "warn" }) : c.committee.panelExclusionRule ? "Each member is checked against the committee's independence rule." : "The committee excludes no unit from its panel.",
    seats: c.seats.map((s) => ({ value: s.personId, label: `${people.find((p) => p.value === s.personId)?.label ?? c.roster.people.find((p) => p.id === s.personId)?.name ?? "A person not on record"} · ${s.seatLabel}` })),
    estimateLate: estimateLate ? openingFindingText(est.faults[0]) : null,
  };

  // ---- the late envelopes, and the supplementary openings their admissions call for (OD-5).
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
        startSupplementary: canStart ? allowedOf([...supplementaryFaults({ status: l.ex.status, mainFinalised: !!c.main?.finalisedAt, decision: { matterKind: "LATE_TENDER", outcome: a!.outcome, bidEnvelopeId: e.id }, alreadyOpened: false, envelope: { status: e.status, late: e.late }, personActive: true }), ...config]) : null,
      };
    });

  // ---- the company estimate: never its figure.
  const estimate = !c.estimate
    ? { text: c.method?.requiresCompanyEstimate === true ? "The method needs a company estimate, and none is lodged." : "None is lodged. The method does not need one, or it is not set.", tone: c.method?.requiresCompanyEstimate === true ? ("warn" as const) : ("neutral" as const) }
    : c.estimate.state === "LODGED"
      ? { text: `${SEALED_UNTIL_FINALISED}. Lodged into the box; it is disclosed, and its paper copy compared, only when the opening is finalised.`, tone: "neutral" as const }
      : c.estimate.state === "DISCLOSED"
        ? { text: "Disclosed when the opening was finalised. Its row is on the frozen schedule.", tone: "ok" as const }
        : { text: "Not lodged into the box yet.", tone: "warn" as const };

  const openings = c.openings.map((o) => openingView(o, c, { now, tz, closing, people }));

  return {
    exerciseId: l.ex.id,
    reference: l.ex.reference,
    status: l.ex.status,
    applies,
    people,
    start,
    startNeeded: c.main == null,
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

function openingView(o: OpeningRow, c: OpeningContext, x: { now: Date; tz: string | null; closing: Date | null; people: Option[] }) {
  const { tz, closing } = x;
  const state = stateOf(o);
  const phase = openingPhase(state);
  const panel = panelOf(o);
  const present = presentOf(o);
  const snap = policyOf(o.policySnapshot);
  const checklist = checklistFromSnapshot(o.checklistSnapshot);
  const act = allowedOf(actFaults(state));
  const authorisers = sittingAuthorisers(state.sittingNo, o.authorisations, panel);
  const boxLocked = lockedAtOrAfterClosing(c.events, closing);
  const unpurchased = snap.unpurchased.consequence ?? c.method?.unpurchasedBidConsequence ?? null;
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
      source: e.receivedSource === "BOX_AT_OPENING" ? SOURCE_LABEL.BOX_AT_OPENING : `Received ${time(e.receivedAt, tz)}`,
      markings: e.markings,
      state: e.status === "OPENED" ? `Opened as No. ${bid?.listingNo ?? "—"}` : e.status === "WITHDRAWN" || withdrawnIds.has(e.id) ? "Withdrawn, not opened" : "Sealed",
      tone: (e.status === "OPENED" ? "ok" : e.status === "WITHDRAWN" ? "neutral" : "warn") as "ok" | "neutral" | "warn",
      open: e.status === "RECEIVED" && !withdrawnIds.has(e.id) ? allowedOf(openFaults({ state, envelope: { id: e.id, kind: e.kind, status: e.status, late: e.late }, withdrawn: withdrawnIds.has(e.id), admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null, bidder: { partyId: "-", name: "", registrationNo: "", registrationTaken: false }, price: 1n as Sen, period: { value: null, unit: null }, isAlternative: e.kind === "ALTERNATIVE", alternativesPermitted: snap.alternativesPermitted, parent: null })) : null,
    };
  });

  // ---- the offers as read.
  const offers = o.bids.map((b) => {
    const fresh = b.initials.filter((i) => !b.asReadCorrectedAt || i.recordedAt >= b.asReadCorrectedAt);
    const answers = new Map(b.answers.map((a) => [a.itemKey, a.answer]));
    const j = judgeBid({ saleFinding: b.saleFinding, restrictionFinding: b.restrictionFinding, isAlternative: b.isAlternative, alternativeStatus: b.alternativeStatus }, checklist, answers, { completenessEliminates: snap.completeness.eliminates, unpurchased });
    const period = b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null;
    const verdictBlock = [...actFaults(state), ...j.notSet];
    return {
      id: b.id,
      listingNo: b.listingNo,
      envelope: `Envelope ${b.envelope.sequence}`,
      bidder: b.bidderNameAsRead,
      registration: [b.party.registrationNo, b.registrationClassAsRead, b.registrationStatusAsRead].filter(Boolean).join(" · "),
      /// SULIT (C-4): shown with its chip, never on a broadcast surface.
      openingPrice: money(b.priceAsRead),
      period: periodText(period),
      validity: b.validityDaysStated == null ? "Not stated" : `${b.validityDaysStated} days`,
      alternative: b.isAlternative ? `${b.alternativeStatus ? ALTERNATIVE_LABEL[b.alternativeStatus] : "Alternative"}${b.parentOpenedBid ? ` to No. ${b.parentOpenedBid.listingNo}` : ""}` : null,
      sale: SALE_FINDING_LABEL[b.saleFinding],
      saleTone: (b.saleFinding === "LIVE_SALE" ? "ok" : "warn") as "ok" | "warn",
      restriction: b.restrictionFinding === "NOT_RESTRICTED" ? null : RESTRICTION_FINDING_LABEL[b.restrictionFinding],
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
  const ff = finaliseFaults({
    state,
    bids: o.bids.map((b) => ({ listingNo: b.listingNo, initials: b.initials.filter((i) => !b.asReadCorrectedAt || i.recordedAt >= b.asReadCorrectedAt).map((i) => i.personId), unanswered: unansweredItems(checklist.items, new Map(b.answers.map((a) => [a.itemKey, a.answer]))).length, verdict: b.verdict, unpurchased: b.saleFinding !== "LIVE_SALE" })),
    present,
    signed: o.signatures.map((s) => s.personId),
    pages: o.schedulePages,
    checklist,
    withdrawals: o.kind === "MAIN" ? facts : [],
    unopened,
    admittedOpened: admitted?.status === "OPENED",
    completenessEliminates: snap.completeness.eliminates,
    unpurchased,
    invitedReading: c.openingPolicy?.invitedCountReading ?? null,
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
    started: `${time(o.startedAt, tz)} · recorded by ${o.startedBy.name}, on their behalf, not signed`,
    admittedBy: o.admissionDecision ? `Admitted at ${o.admissionDecision.meeting.reference}` : null,
    sittingNo: state.sittingNo,
    sittings: o.sittings.map((s) => ({
      no: s.sittingNo,
      text: [`Sitting ${s.sittingNo}: from ${time(s.startedAt, tz)}`, s.resumeReason ? `resumed because ${s.resumeReason}` : null, s.adjournedAt ? `adjourned ${time(s.adjournedAt, tz)} because ${s.adjournReason}` : null, `recorded by ${s.recordedBy.name}`].filter(Boolean).join(" · "),
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
      authorise: p.present ? allowedOf(authorisationFaults({ state, panel, auths: o.authorisations, personId: p.personId, now: x.now, closing, boxLocked })) : null,
    })),
    authorisations: o.authorisations.map((a) => `Sitting ${a.sittingNo}: ${a.person.name}, ${time(a.recordedAt, tz)}${a.lapsedAt ? " · lapsed when the sitting was adjourned" : ""}`),
    adjourn: state.adjourned || state.finalised ? null : allowedOf(adjournFaults({ state, reason: "-", personActive: true, resume: false })),
    resume: state.adjourned && !state.finalised ? allowedOf(adjournFaults({ state, reason: "-", personActive: true, resume: true })) : null,
    registerBox: o.kind === "MAIN" && !state.finalised ? allowedOf([...actFaults(state), ...(o.bids.length ? [{ code: "BOX_EMPTIED", level: "block" as const }] : [])]) : null,
    record: act,
    envelopes,
    offers,
    parentOptions: allBids.filter((b) => !b.isAlternative).map((b) => ({ value: b.id, label: `No. ${b.listingNo}, ${b.bidderNameAsRead}` })),
    parties: c.parties.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})` })),
    alternativesPermitted: snap.alternativesPermitted,
    withdrawals,
    matchOptions: boxEnvelopes.map((e) => ({ value: e.id, label: `Envelope ${e.sequence}: ${e.markings}` })),
    checklist: { items: checklist.items.map((i) => i.label), notJudged: checklist.notJudged, notReturned: checklist.notReturned },
    rules: [
      { label: "An incomplete bid", value: snap.completeness.eliminates == null ? "Not set when the window was published" : snap.completeness.eliminates ? "Is eliminated" : "Is reported to the committee" },
      { label: "A bid with no live purchase", value: unpurchased ? `${UNPURCHASED_LABEL[unpurchased]}${snap.unpurchased.consequence ? "" : " (set since the opening started)"}` : "Not set" },
      { label: "Alternatives", value: snap.alternativesPermitted == null ? "Not stated on the window" : snap.alternativesPermitted ? "Permitted" : "Not permitted: recorded, never considered" },
    ],
    signatures: o.signatures.map((s) => `${s.person.name}, signed on ${formatDate(storedDay(s.signedOn))}`),
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

// ------------------------------------------------------------------ the Schedule section

/**
 * Each opening's schedule: once finalised, its frozen copy and Grand Summary (never recomputed);
 * before, a draft built from the record with the estimate's row sealed and no Grand Summary
 * (FR-OPN-010: after finalising only). The copy finding and its explanation, and the signed scan.
 */
export async function scheduleSection(exerciseId: string) {
  const r = await load(exerciseId);
  if (!r) return null;
  const { l, c, people } = r;
  const tz = l.org.timeZone;
  const counts = invitedCounts(c);
  const openings = c.openings.map((o) => {
    const frozen = scheduleFromSnapshot(o.scheduleSnapshot) as (ScheduleSnapshot & { invitedReadingProvenance?: string | null }) | null;
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
        invited: { reading: c.openingPolicy?.invitedCountReading ?? null, ...counts },
        lateCount: lateCount(c.envelopes),
        pages: o.schedulePages,
        rows,
        benchmark: estimateHeld ? { sealed: true } : { notRequired: true },
        lockGap: o.kind === "MAIN" && o.boxLockedAt && l.ex.closingAt ? { seconds: o.lockGapSeconds ?? 0, text: openingFindingText(lockGapFinding(l.ex.closingAt, o.boxLockedAt)) } : null,
      }).schedule;
    }
    const s = schedule!;
    const scan = scheduleScanFault({ finalised: o.finalisedAt != null, liveScans: liveScans(o) });
    const copy = copyFindingFault(o.estimateCopyCheck, o.copyExplanation != null);
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
        { label: "Tenderers invited", value: s.header.invitedReading ? `${s.header.invitedCount} · ${INVITED_READING_TEXT[s.header.invitedReading]}${frozen?.invitedReadingProvenance ? ` (${PROVENANCE_WORD[frozen.invitedReadingProvenance] ?? "provenance not recorded"})` : ""}` : `Not set: ${openingFindingText({ code: "READING_NOT_SET", level: "block" })}` },
        { label: "Late envelopes on the register", value: String(s.header.lateCount) },
        { label: "Pages of the signed schedule", value: s.header.pages == null ? "Not recorded yet" : String(s.header.pages) },
        ...(s.lockGap ? [{ label: "Closing to the box's lock", value: s.lockGap.text }] : []),
      ],
      rows: s.rows.map((row) => ({ ...row, openingPrice: formatMoney(parseSen(row.openingPrice)), period: periodText(row.period), alternative: row.isAlternative ? `Alternative${row.parentListingNo != null ? ` to No. ${row.parentListingNo}` : ""}` : null })),
      benchmark: "notRequired" in s.benchmark ? null : s.benchmark.sealed ? { sealed: true as const, text: SEALED_UNTIL_FINALISED } : { sealed: false as const, label: s.benchmark.label ?? "Company estimate", companyEstimate: formatMoney(parseSen(s.benchmark.companyEstimate)) },
      summary: summary ? { labels: summary.labels, rows: summary.rows.map((x) => ({ ...x, openingPrice: formatMoney(parseSen(x.openingPrice)) })) } : null,
      copy: o.estimateCopyCheck ? { check: o.estimateCopyCheck, text: COPY_CHECK_LABEL[o.estimateCopyCheck], tone: (o.estimateCopyCheck === "MATCH" ? "ok" : "warn") as "ok" | "warn", fault: copy ? openingFindingText(copy) : null } : null,
      explanation: o.copyExplanation ? { text: o.copyExplanation.explanation, by: o.copyExplanation.recordedBy.name, at: time(o.copyExplanation.recordedAt, tz) } : null,
      explain: copy && o.finalisedAt ? ({ allowed: true } as Allowed) : null,
      scan: scan ? openingFindingText(scan) : null,
      reading: c.openingPolicy?.invitedCountReading ? INVITED_READING_LABEL[c.openingPolicy.invitedCountReading] : null,
    };
  });
  return { exerciseId: l.ex.id, reference: l.ex.reference, timeZone: tz, people, openings };
}

export type ScheduleSectionView = NonNullable<Awaited<ReturnType<typeof scheduleSection>>>;
