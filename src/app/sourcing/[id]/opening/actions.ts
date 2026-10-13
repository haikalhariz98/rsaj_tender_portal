"use server";

import { sulitWriteRefusal, type Reader } from "@/lib/auth/sulit-store";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { BID_ENTITY, envelopeFields, statusField } from "@/lib/bids/audit-view";
import { lockBoxRows, lockEnvelopeRows, lockWithdrawalRows } from "@/lib/bids/lock";
import { toSecond } from "@/lib/bids/lateness";
import { ENVELOPE_KIND_LABEL } from "@/lib/bids/labels";
import { dayIn, dayToDate, isDay, storedDay } from "@/lib/dates";
import { moveExercise } from "@/lib/method/move";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { estimateEventAudit, ENTITY as SCOPE_ENTITY } from "@/lib/scope/audit-view";
import { leadTime } from "@/lib/scope/estimate";
import { lockLiveEstimateRows } from "@/lib/scope/lock";
import { FormReader } from "@/lib/validate";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { ceilingOf } from "@/lib/evaluation/repo";
import { openNewVersion } from "@/lib/evaluation/versions";
import { splitValues } from "@/lib/ui/select-logic";
import { answerFields, asReadFields, authorisationFields, finaliseFields, initialFields, openedBidFields, OPENING_ENTITY, openingStartFields, signatureFields, sittingFields, verdictFields, withdrawalMatchFields } from "@/lib/opening/audit-view";
import { boxEnvelopeJudgement, lockGap, registerBoxFaults } from "@/lib/opening/box";
import { answerFaults, checklistFromSnapshot, openingChecklist, unansweredItems } from "@/lib/opening/checklist";
import { DisclosureRefused, discloseAtFinalising } from "@/lib/opening/estimate";
import { explanationFaults, refuseIfCancelled, type PaperCopy } from "@/lib/opening/estimate-copy";
import { finaliseFaults, markFaults, recordFaults } from "@/lib/opening/finalise";
import { liveSaleOf, restrictionFinding, saleFinding } from "@/lib/opening/findings";
import { grandSummary } from "@/lib/opening/grand-summary";
import { freshInitials, initialStale } from "@/lib/opening/initials";
import { openingFindingText, restrictionLabel } from "@/lib/opening/labels";
import { isRestrictionReading, restrictionReadingWords } from "@/lib/suppliers/restriction-register";
import { lockOpenedBidRows, lockOpeningRows } from "@/lib/opening/lock";
import { alternativeInsideFaults, alternativeOf, correctionFaults, nextListingNo, openFaults } from "@/lib/opening/open";
import { panelFaults, supplementaryPanel } from "@/lib/opening/panel";
import { loadOpeningRoster } from "@/lib/opening/roster-store";
import { rosterFaults } from "@/lib/opening/roster";
import { actFaults } from "@/lib/opening/state";
import { invitedCounts, openingContext, openingPolicyFrozen, panelOf, panelSnapshot, policyOf, presentOf, stateOf, summaryLabelsOf, type OpeningContext, type OpeningPolicySnapshot, type OpeningRow } from "@/lib/opening/repo";
import { unpurchasedRecordAudit, unpurchasedRule, type LiveUnpurchased } from "@/lib/opening/unpurchased";
import { jadualTawaran, lateCount, type ScheduleRowInput } from "@/lib/opening/schedule";
import { estimateLeadFaults, frozenRuleFaults, startFaults, supplementaryFaults } from "@/lib/opening/start";
import { blocking, CHECKLIST_ANSWERS, PERIOD_UNITS, type Finding, type OpeningVerdict, type PeriodUnit } from "@/lib/opening/types";
import { adjournFaults, authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "@/lib/opening/unseal";
import { judgeBid, verdictFaults, verdictRecord } from "@/lib/opening/verdict";
import { verdictDrift } from "@/lib/opening/verdict-drift";
import { consequenceFor, ineligibleOf } from "@/lib/suppliers/opening-hook";
import { eligibilityAtOpening } from "@/lib/suppliers/standing-repo";
import { findingFaults, matchFaults, openFault } from "@/lib/opening/withdrawals";

import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { frozenRuleOf, readingJson, retakeRestriction } from "./restriction";
import { activePerson, audit, exerciseIdOf, inWindow, label, Refusal, type LockedWindow } from "../window/shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct, type PreparedAct } from "@/app/_auth/act";
import { loadRecorders, recorderKey } from "@/lib/auth/attribution-recorders";
import type { StaffActor } from "@/lib/auth/types";
import { priceRead } from "@/lib/opening/price";

/**
 * Writes for 6.7's opening (plan §4, as ruled C-1..C-13). Each runs in one transaction that locks the
 * exercise's requisition, the exercise and its window (`inWindow`), then the exercise's openings, (for
 * finalising) its live estimate, its envelopes, withdrawals and box events, and its opened bids, in
 * that order (`src/lib/opening/lock.ts`); re-reads everything the rules judge under those locks
 * (`openingContext`) and re-runs the pure rule on the locked data. The server's clock is read once,
 * at the act's entry, before any lock, truncated to the second (6.6 CR-3). Every write is audited
 * before and after in the same transaction. Every act is the signed-in officer's own, attributed in the same
 * transaction (`beginAct`, Phase 2b): a panel member signs their own authorisation and signature with the password, and a paper one is recorded for them (ADR
 * 0017). Codes go back, never figures: no refusal names a price or the estimate.
 */

const stampNow = () => toSecond(new Date());

const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${blocking(fs).map(openingFindingText).join(" ")}` });
const warnings = (fs: readonly Finding[]) => fs.filter((f) => f.level !== "block").map(openingFindingText).join(" ");
const GONE_OPENING: FormState = { ok: false, message: "That opening is not on this exercise." };
const GONE_BID: FormState = { ok: false, message: "That offer is not on this exercise." };
const ENVELOPE_CHANGED: FormState = { ok: false, message: "The envelope changed while this was being saved. Nothing was saved. Reload and try again." };

/// Run an opening write with every lock its order asks for, and the context read under them.
async function inOpening(scope: Reader, exerciseId: string, now: Date, fn: (tx: Tx, l: LockedWindow, c: OpeningContext) => Promise<FormState>, opts: { estimate?: boolean; prices?: StaffActor } = {}): Promise<FormState> {
  return inWindow(scope, exerciseId, async (tx, l) => {
    // Phase 3b: an act that writes a price as read is done by someone the prices are open to; what they may not read they may not change, and are told why. Logged in this transaction.
    if (opts.prices) {
      const refusal = await sulitWriteRefusal(tx, opts.prices, { scope: "exercise", exerciseId: l.ex.id }, ["openingPrice", "correctedPrice"]);
      if (refusal) return { ok: false, message: `Nothing was saved: the prices read at the opening are SULIT and are closed to you. ${refusal}` };
    }
    await lockOpeningRows(tx, l.ex.id);
    if (opts.estimate) await lockLiveEstimateRows(tx, l.ex.id);
    await lockEnvelopeRows(tx, l.ex.id);
    await lockWithdrawalRows(tx, l.ex.id);
    await lockBoxRows(tx, l.ex.id);
    await lockOpenedBidRows(tx, l.ex.id);
    return fn(tx, l, await openingContext(l, tx, now));
  });
}

const openingOf = (c: OpeningContext, id: string) => c.openings.find((o) => o.id === id) ?? null;
const bidOf = (c: OpeningContext, id: string) => {
  for (const o of c.openings) {
    const b = o.bids.find((x) => x.id === id);
    if (b) return { opening: o, bid: b };
  }
  return null;
};
const openingLabel = (l: LockedWindow, o: Pick<OpeningRow, "kind" | "sequenceNo">) => label(l, o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`);
const nameOf = (tx: Tx, orgId: string, personId: string | null) => activePerson(tx, orgId, personId);

/// The panel as posted: each picked person, and whether present (the `present` choices, or a checkbox `present:<id>`). The shared multi-select posts its choices newline-joined.
function readPanel(data: FormData): { personId: string; present: boolean }[] {
  const ids = [...new Set(data.getAll("panel").flatMap((v) => splitValues(String(v))))];
  const present = new Set(data.getAll("present").flatMap((v) => splitValues(String(v))));
  return ids.map((personId) => ({ personId, present: present.has(personId) || data.get(`present:${personId}`) === "on" || data.get(`present:${personId}`) === "yes" }));
}

/// Who is marked present in the form, by id.
function readPresent(data: FormData): Set<string> {
  return new Set(data.getAll("present").flatMap((v) => splitValues(String(v))));
}

/**
 * The panel an opening starts with. Where the exercise names its opening officers (SR-07, ruling 11) it is those officers and nobody else:
 * the form asks only who is present, and the roster is judged again here for the one thing that can change after they were named, that an
 * officer has since come to hold an administrator account. Seats, size and independence are judged by the panel's own rules below. Where it
 * does not (made before officers were named on the exercise), the panel is the pick posted, as it always was.
 */
async function startingPicks(tx: Tx, l: { ex: { id: string; sourcingMethodCode: string; openingRosterRequired: boolean }; org: { id: string; code: string; today: string | null } }, data: FormData): Promise<{ picks: { personId: string; present: boolean }[]; faults: Finding[] }> {
  if (!l.ex.openingRosterRequired) return { picks: readPanel(data), faults: [] };
  const roster = await loadOpeningRoster(l.ex, l.org, tx);
  const present = readPresent(data);
  return { picks: roster.rows.map((r) => ({ personId: r.personId, present: present.has(r.personId) })), faults: rosterFaults(roster.input).filter((f) => f.code === "OFFICER_IS_ADMINISTRATOR") };
}

async function pickedPeople(tx: Tx, orgId: string, picks: readonly { personId: string; present: boolean }[]) {
  const people = await tx.person.findMany({ where: { organisationId: orgId, id: { in: picks.map((p) => p.personId) } }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
  return picks.map((p) => {
    const person = people.find((x) => x.id === p.personId);
    return { personId: p.personId, name: person?.name ?? "A person not on record", present: p.present, active: person?.isActive ?? false, orgUnitCode: person?.orgUnitCode ?? null };
  });
}

// ------------------------------------------------------------------ starting (plan §4.1, §4.10)

/**
 * Start the main opening (FR-OPN-001, 002, 004 preconditions, FR-EST-007): the panel from the
 * method's opening committee with each member's presence, the estimate's lead time (or 6.2's
 * override, which writes LATE_OVERRIDE), and the checklist and rules frozen.
 */
export async function startOpening(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const overrideAuthority = r.text("panelOverrideAuthority", "Authority", { max: 300 });
  const overrideReason = r.text("panelOverrideReason", "Reason", { max: 1000 });
  const lateOverrideReason = r.text("lateOverrideReason", "Why the late estimate is accepted", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  // The opening is started by the signed-in officer, who also records a panel of another size. The late estimate's override is the act of the holder of the
  // office that may override it: signed in as themselves, or recorded for them from paper (Phase 2b).
  const begun = await beginAct(actor, data, "Opening.startedBy", { personField: "startedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const startedByPersonId = act.subjectPersonId;
  const overridePersonId = overrideAuthority.trim() || overrideReason.trim() ? startedByPersonId : null;
  let lateAct: PreparedAct | null = null;
  if (lateOverrideReason.trim()) {
    const late = await beginAct(actor, data, "EstimateEvent.person", { personField: "lateOverridePersonId" });
    if (!late.ok) return late.state;
    lateAct = late.act;
  }
  const lateOverridePersonId = lateAct?.subjectPersonId ?? null;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const person = await nameOf(tx, l.org.id, startedByPersonId);
    const { picks, faults: rosterBlocks } = await startingPicks(tx, l, data);
    if (blocking(rosterBlocks).length) return refuse(rosterBlocks);
    const sf = startFaults({ status: l.ex.status, packKind: l.ex.packKindSnapshot, publishedThroughWindow: c.window?.publishedAt != null, timeZone: l.org.timeZone, phase: c.gate.phase, boxLocked: c.boxLocked, changePending: c.gate.changePending, mainExists: c.main != null, personActive: !!person });
    if (blocking(sf).length) return refuse(sf);
    // Review M-4: a rule frozen unset that would make finalising impossible refuses the start, naming it.
    const checklist = openingChecklist({ parts: (c.pack?.parts ?? []).map((p) => ({ partCode: p.partCode, label: p.labelSnapshot, role: p.role, mandatory: p.mandatory, returnedByBidder: p.returnedByBidder, sortOrder: p.sortOrder })), addenda: c.addenda });
    const rf = frozenRuleFaults({ completenessEliminates: c.bidRule.rule?.completenessEliminates ?? null, checklist, invitedReading: c.openingPolicy?.invitedCountReading ?? null });
    if (blocking(rf).length) return refuse(rf);
    const picked = await pickedPeople(tx, l.org.id, picks);
    const wantsOverride = !!(overrideAuthority.trim() || overrideReason.trim() || overridePersonId);
    const overrideBy = wantsOverride ? await nameOf(tx, l.org.id, overridePersonId) : null;
    const pf = panelFaults({
      committeeCode: c.method?.openingCommitteeCode ?? null,
      committee: c.committee ? { name: c.committee.nameEn } : null,
      seats: c.seats,
      picked,
      policy: { panelSize: c.committee?.panelSize ?? null, exclusionRule: c.committee?.panelExclusionRule ?? null, excludedUnitCode: c.committee?.panelExcludesUnitCode ?? null },
      override: wantsOverride ? { authority: overrideAuthority, reason: overrideReason, personId: overrideBy?.id ?? null, personActive: !!overrideBy } : null,
      unitPath: c.unitPath,
    });
    if (blocking(pf).length) return refuse(pf);
    // FR-EST-007: the estimate's lead time, or 6.2's override.
    const current = c.estimate?.versions.find((v) => v.versionNo === c.estimate!.currentVersionNo) ?? null;
    const lead = leadTime(current ? storedDay(current.preparedOn) : null, l.ex.closingAt, c.scopePolicy, l.org.timeZone);
    const overrider = lateOverridePersonId ? await nameOf(tx, l.org.id, lateOverridePersonId) : null;
    const est = estimateLeadFaults({
      requires: c.method?.requiresCompanyEstimate ?? null,
      estimateState: c.estimate?.state ?? null,
      lead,
      override: lateOverridePersonId || lateOverrideReason.trim() ? { personId: overrider?.id ?? null, holdsOverrideRole: !!overrider && c.holdsOffice(overrider.id, c.scopePolicy.estimateOverrideRoleCode), reason: lateOverrideReason } : null,
      overrideRoleCode: c.scopePolicy.estimateOverrideRoleCode,
    });
    if (!est.ok) return refuse(est.faults);
    const gap = c.lockEvent && l.ex.closingAt ? lockGap(l.ex.closingAt, c.lockEvent.occurredAt) : null;
    const policy: OpeningPolicySnapshot = {
      committee: { code: c.method?.openingCommitteeCode ?? null, name: c.committee?.nameEn ?? null, provenance: (c.method?.openingCommitteeProvenance as OpeningPolicySnapshot["committee"]["provenance"]) ?? null },
      panel: panelSnapshot(c.committee),
      completeness: { eliminates: c.bidRule.rule?.completenessEliminates ?? null, provenance: c.bidRule.rule?.completenessProvenance ?? null, source: c.bidRule.completeness },
      unpurchased: { consequence: c.method?.unpurchasedBidConsequence ?? null, provenance: (c.method?.unpurchasedProvenance as OpeningPolicySnapshot["unpurchased"]["provenance"]) ?? null },
      minimumBids: { value: c.bidRule.rule?.minimumBids ?? null, provenance: c.bidRule.rule?.minimumBidsProvenance ?? null },
      alternativesPermitted: c.window?.alternativesPermitted ?? null,
      restrictedTender: l.ex.restrictedTender,
      path: c.path,
      estimate: { requires: c.method?.requiresCompanyEstimate ?? null, provenance: (c.method?.requiresCompanyEstimateProvenance as OpeningPolicySnapshot["estimate"]["provenance"]) ?? null },
      // R-4: the invited-count reading and the Grand Summary's words, frozen with the other rules.
      ...openingPolicyFrozen(c.openingPolicy),
    };
    const estimateLead = { outcome: est.outcome, state: lead.state, lastPermittedDay: lead.lastPermittedDay ?? null, lastVersionDay: lead.lastVersionDay ?? null, leadDays: c.scopePolicy.estimateLeadDays, overrideBy: est.outcome === "OVERRIDDEN" ? overrider!.name : null, overrideReason: est.outcome === "OVERRIDDEN" ? lateOverrideReason : null };
    const panelOverride = pf.some((f) => f.code === "PANEL_SIZE_OVERRIDDEN") ? { authority: overrideAuthority, reason: overrideReason, by: overrideBy! } : null;
    const opening = await tx.opening.create({
      data: {
        organisationId: l.org.id,
        exerciseId: l.ex.id,
        kind: "MAIN",
        sequenceNo: 1,
        committeeId: c.committee!.id,
        committeeNameSnapshot: c.committee!.nameEn,
        startedAt: now,
        startedByPersonId: person!.id,
        boxLockedAt: c.lockEvent?.occurredAt ?? null,
        lockGapSeconds: gap?.seconds ?? null,
        panelSizeRequired: c.committee!.panelSize,
        panelOverrideAuthority: panelOverride?.authority ?? "",
        panelOverrideReason: panelOverride?.reason ?? "",
        panelOverrideByPersonId: panelOverride?.by.id ?? null,
        estimateLead: estimateLead as Prisma.InputJsonValue,
        checklistSnapshot: checklist as unknown as Prisma.InputJsonValue,
        policySnapshot: policy as unknown as Prisma.InputJsonValue,
      },
    });
    const firstSitting = await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: opening.id, sittingNo: 1, startedAt: now, recordedByPersonId: person!.id } });
    await act.write(tx, opening.id);
    await act.writeAlso(tx, "OpeningSitting.recordedBy", firstSitting.id);
    if (panelOverride) await act.writeAlso(tx, "Opening.panelOverrideBy", opening.id);
    for (const p of picked) {
      const seat = c.seats.find((s) => s.personId === p.personId)!;
      await tx.openingPanelMember.create({ data: { organisationId: l.org.id, openingId: opening.id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, opening.id, label(l, "Opening"), "CREATE",
      diffFields(null, openingStartFields({ kind: "MAIN", committee: c.committee!.nameEn, panel: picked, startedAt: now, startedBy: person!.name, panelOverride: panelOverride ? { authority: panelOverride.authority, reason: panelOverride.reason, by: panelOverride.by.name } : null, independence: pf.some((f) => f.code === "EXCLUSION_RULE_NOT_SET") ? "Independence rule not set; panel not checked" : c.committee!.panelExclusionRule ? "Checked against the committee's independence rule" : "No independence rule applies", estimateLead: est.outcome === "OVERRIDDEN" ? "Late, accepted on an override" : est.outcome === "READY" ? "In time" : est.outcome === "VOLUNTARY" ? "Not required; one was lodged" : "Not required", boxLockedAt: c.lockEvent?.occurredAt ?? null, lockGap: gap?.text ?? null }, l.org.timeZone)),
      panelOverride?.reason ?? "");
    // FR-EST-007: the override is 6.2's LATE_OVERRIDE custody event, frozen with the opening.
    if (est.outcome === "OVERRIDDEN" && c.estimate) {
      const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: c.estimate.id, kind: "LATE_OVERRIDE", personId: overrider!.id, capacity: "At the opening", note: lateOverrideReason, versionNo: c.estimate.currentVersionNo, at: now } });
      await lateAct!.write(tx, ev.id);
      await audit(tx, toAuditActor(actor), l.org.id, SCOPE_ENTITY.estimateEvent, ev.id, label(l, "Company estimate · late, overridden"), "CREATE", estimateEventAudit({ kind: "LATE_OVERRIDE", personName: overrider!.name, capacity: "At the opening", versionNo: c.estimate.currentVersionNo, reason: lateOverrideReason }), lateOverrideReason);
    }
    const said = warnings([...pf, ...(est.ok ? est.warnings : [])]);
    return { ok: true, message: `Opening started. Two panel members present now each authorise it.${said ? ` ${said}` : ""}` };
  });
}

/**
 * FR-CTE-008, OD-5: a supplementary opening of one late envelope its committee admitted, after the
 * main opening is finalised; the same panel rules; its checklist and rules are the main opening's.
 */
export async function startSupplementaryOpening(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const decisionId = r.text("decisionId", "Admission", { required: true });
  const overrideAuthority = r.text("panelOverrideAuthority", "Authority", { max: 300 });
  const overrideReason = r.text("panelOverrideReason", "Reason", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Opening.startedBy", { personField: "startedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const startedByPersonId = act.subjectPersonId;
  const overridePersonId = overrideAuthority.trim() || overrideReason.trim() ? startedByPersonId : null;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const person = await nameOf(tx, l.org.id, startedByPersonId);
    const { picks, faults: rosterBlocks } = await startingPicks(tx, l, data);
    if (blocking(rosterBlocks).length) return refuse(rosterBlocks);
    const decision = await tx.committeeDecision.findFirst({ where: { id: decisionId, bidEnvelope: { exerciseId: l.ex.id }, meeting: { committee: { organisationId: actor.organisationId } } }, select: { id: true, matterKind: true, outcome: true, bidEnvelopeId: true, withdrawnAt: true, meeting: { select: { reference: true } } } });
    const envelope = decision?.bidEnvelopeId ? (c.envelopes.find((e) => e.id === decision.bidEnvelopeId) ?? null) : null;
    const sf = supplementaryFaults({ status: l.ex.status, mainFinalised: !!c.main?.finalisedAt, decision: decision && !decision.withdrawnAt ? { matterKind: decision.matterKind ?? "", outcome: decision.outcome, bidEnvelopeId: decision.bidEnvelopeId } : null, alreadyOpened: c.openings.some((o) => o.admissionDecisionId === decisionId), envelope: envelope ? { status: envelope.status, late: envelope.late } : null, personActive: !!person, timeZone: l.org.timeZone });
    if (blocking(sf).length) return refuse(sf);
    const picked = await pickedPeople(tx, l.org.id, picks);
    const wantsOverride = !!(overrideAuthority.trim() || overrideReason.trim() || overridePersonId);
    const overrideBy = wantsOverride ? await nameOf(tx, l.org.id, overridePersonId) : null;
    const main = c.main!;
    const mainPolicy = policyOf(main.policySnapshot);
    // R-3: the main opening's committee (its id, as frozen), never the one the method names now; its panel rules as they stand now (BD-67-11).
    const committee = c.mainCommittee;
    const panelInput = supplementaryPanel({ mainCommittee: committee, frozenCode: mainPolicy.committee.code, seats: c.mainSeats, unitPath: c.unitPath });
    if ("fault" in panelInput) return refuse([panelInput.fault]);
    const pf = panelFaults({ ...panelInput, picked, override: wantsOverride ? { authority: overrideAuthority, reason: overrideReason, personId: overrideBy?.id ?? null, personActive: !!overrideBy } : null });
    if (blocking(pf).length) return refuse(pf);
    const sequenceNo = c.openings.reduce((n, o) => Math.max(n, o.sequenceNo), 0) + 1;
    const panelOverride = pf.some((f) => f.code === "PANEL_SIZE_OVERRIDDEN") ? { authority: overrideAuthority, reason: overrideReason, by: overrideBy! } : null;
    const opening = await tx.opening.create({
      data: {
        organisationId: l.org.id,
        exerciseId: l.ex.id,
        kind: "SUPPLEMENTARY",
        sequenceNo,
        committeeId: committee!.id,
        committeeNameSnapshot: committee!.nameEn,
        admissionDecisionId: decisionId,
        startedAt: now,
        startedByPersonId: person!.id,
        panelSizeRequired: committee!.panelSize,
        panelOverrideAuthority: panelOverride?.authority ?? "",
        panelOverrideReason: panelOverride?.reason ?? "",
        panelOverrideByPersonId: panelOverride?.by.id ?? null,
        // The admitted bid is checked against the main opening's checklist, under its rules; the panel's rules are read now.
        checklistSnapshot: main.checklistSnapshot as Prisma.InputJsonValue,
        policySnapshot: { ...mainPolicy, panel: panelSnapshot(committee) } as unknown as Prisma.InputJsonValue,
      },
    });
    const firstSitting = await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: opening.id, sittingNo: 1, startedAt: now, recordedByPersonId: person!.id } });
    await act.write(tx, opening.id);
    await act.writeAlso(tx, "OpeningSitting.recordedBy", firstSitting.id);
    if (panelOverride) await act.writeAlso(tx, "Opening.panelOverrideBy", opening.id);
    for (const p of picked) {
      const seat = c.mainSeats.find((s) => s.personId === p.personId)!;
      await tx.openingPanelMember.create({ data: { organisationId: l.org.id, openingId: opening.id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, opening.id, label(l, `Supplementary opening ${sequenceNo - 1}`), "CREATE",
      diffFields(null, { ...openingStartFields({ kind: "SUPPLEMENTARY", committee: committee!.nameEn, panel: picked, startedAt: now, startedBy: person!.name, panelOverride: panelOverride ? { authority: panelOverride.authority, reason: panelOverride.reason, by: panelOverride.by.name } : null, independence: pf.some((f) => f.code === "EXCLUSION_RULE_NOT_SET") ? "Independence rule not set; panel not checked" : "As the committee's rule", estimateLead: "Not judged: the estimate was disclosed at the main opening", boxLockedAt: null, lockGap: null }, l.org.timeZone), admittedBy: decision!.meeting.reference, envelope: envelope ? `Envelope ${envelope.sequence}` : null }),
      panelOverride?.reason ?? "");
    return { ok: true, message: `Supplementary opening started. Two panel members present now each authorise it.${warnings(pf) ? ` ${warnings(pf)}` : ""}` };
  });
}

// ------------------------------------------------------------------ authorisations, adjourning (plan §4.2, C-2)

/// One panel member's authorisation, stamped now. The second distinct present member's opens the box (MAIN) and the exercise is then Opening in progress.
export async function recordAuthorisation(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("UNSEAL");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  // The panel member authorises with their own password, signed in as themselves (FR-OPN-003, Phase 3d). A person a form names is not read: nobody authorises for a member.
  const begun = await beginAct(actor, data, "OpeningAuthorisation.person", { personField: "personId", document: { entity: "Opening", id: openingId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const state = stateOf(o, l.ex.status);
    const person = await nameOf(tx, l.org.id, personId);
    // Authorisations recorded before Phase 3d could be keyed from a member's paper, and whoever keyed one is a hand behind it as well: two people act, never one (Phase 2b
    // review). None is recorded that way now, so for a new one this finds nobody; it stays for the rows that exist.
    const keyedBy = await loadRecorders(tx, l.org.id, [{ entity: "OpeningAuthorisation", slot: "person", ids: o.authorisations.map((a) => a.id) }]);
    const auths = o.authorisations.map((a) => ({ ...a, recordedByPersonId: keyedBy.get(recorderKey({ entity: "OpeningAuthorisation", slot: "person", id: a.id })) ?? null }));
    const fs = authorisationFaults({ state, panel: panelOf(o), auths, personId, recorderId: act.recorderId, now, closing: l.ex.closingAt, boxLocked: lockedAtOrAfterClosing(c.events, l.ex.closingAt) });
    if (!person) fs.push({ code: "NOT_ON_PANEL", level: "block" });
    if (blocking(fs).length) return refuse(fs);
    // NFR-SIG-001: the seat the member authorised in is kept with the act (the opening's own panel row, never a code or a label chosen at the screen).
    const seat = o.panel.find((p) => p.personId === personId) ?? null;
    const row = await tx.openingAuthorisation.create({ data: { organisationId: l.org.id, openingId: o.id, personId, panelMemberId: seat?.id ?? null, sittingNo: state.sittingNo, recordedAt: now } });
    const after = unsealState(state.sittingNo, [...o.authorisations, { personId, sittingNo: state.sittingNo, recordedAt: now, lapsedAt: null }], panelOf(o));
    const opens = opensTheBox(state, after.count);
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.authorisation, row.id, openingLabel(l, o), "CREATE", diffFields(null, authorisationFields({ person: person!.name, at: now, sittingNo: state.sittingNo, opensTheBox: opens, seat: seat?.seatLabelSnapshot ?? null }, l.org.timeZone)));
    await act.write(tx, row.id, { document: { entity: "Opening", id: o.id } });
    if (!opens) return { ok: true, message: after.state === "AUTHORISED" ? "Recorded. The sitting is authorised: the opening may continue." : "Recorded. A second panel member present now authorises it." };
    await tx.opening.update({ where: { id: o.id, organisationId: actor.organisationId }, data: { unsealedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ opened: null }, { opened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at }));
    if (o.kind === "MAIN") {
      const ev = await tx.boxEvent.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, kind: "UNLOCKED_FOR_OPENING", occurredAt: now, personId, note: "Opened at the opening, on the second authorisation." } });
      await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.box, ev.id, label(l, "Tender box opened"), "CREATE", diffFields(null, { boxOpened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at, openedBy: person!.name }));
      await act.writeAlso(tx, "BoxEvent.person", ev.id);
      await moveExercise(tx, l.ex, "OPENING_IN_PROGRESS", { today: l.org.today, via: "UNSEAL", authorisations: after.count });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENING_IN_PROGRESS" }));
    }
    return { ok: true, message: o.kind === "MAIN" ? "Recorded. The box is opened: register the envelopes found in it, then open them." : "Recorded. The admitted envelope may now be opened." };
  });
}

/// FR-OPN-011, C-2: adjourn, with the reason; an unpaired authorisation of the sitting lapses (kept).
export async function adjournOpening(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  return sittingAct(actor, data, false);
}

/// Resume an adjourned opening: a new sitting, which needs two fresh authorisations.
export async function resumeOpening(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  return sittingAct(actor, data, true);
}

async function sittingAct(scope: StaffActor, data: FormData, resume: boolean): Promise<FormState> {
  const now = stampNow();
  const actor = toAuditActor(scope);
  const openingId = String(data.get("openingId") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 1000);
  const begun = await beginAct(scope, data, "OpeningSitting.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(scope, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const state = stateOf(o, l.ex.status);
    const person = await nameOf(tx, l.org.id, personId);
    const fs = adjournFaults({ state, reason, personActive: !!person, resume });
    if (fs.length) return fs.some((f) => f.code === "REASON_REQUIRED") && fs.length === 1 ? { ok: false, errors: { reason: openingFindingText(fs[0]) } } : refuse(fs);
    if (resume) {
      const row = await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: o.id, sittingNo: state.sittingNo + 1, startedAt: now, resumeReason: reason, recordedByPersonId: person!.id } });
      await audit(tx, actor, l.org.id, OPENING_ENTITY.sitting, row.id, openingLabel(l, o), "CREATE", diffFields(null, sittingFields({ sittingNo: state.sittingNo + 1, at: now, by: person!.name, adjourned: false, reason }, l.org.timeZone)), reason);
      await act.write(tx, row.id);
      return { ok: true, message: "Resumed. Two panel members present now each authorise the new sitting." };
    }
    const sitting = o.sittings.find((s) => s.sittingNo === state.sittingNo)!;
    await tx.openingSitting.update({ where: { id: sitting.id, organisationId: scope.organisationId }, data: { adjournedAt: now, adjournReason: reason } });
    await audit(tx, actor, l.org.id, OPENING_ENTITY.sitting, sitting.id, openingLabel(l, o), "UPDATE", diffFields({ adjourned: null }, sittingFields({ sittingNo: state.sittingNo, at: now, by: person!.name, adjourned: true, reason }, l.org.timeZone)), reason);
    for (const id of lapsedByAdjourning(state.sittingNo, o.authorisations, panelOf(o))) {
      await tx.openingAuthorisation.update({ where: { id, organisationId: scope.organisationId }, data: { lapsedAt: now } });
      await audit(tx, actor, l.org.id, OPENING_ENTITY.authorisation, id, openingLabel(l, o), "UPDATE", diffFields({ lapsed: null }, { lapsed: "Unpaired when the sitting was adjourned: kept, does not count again" }));
    }
    return { ok: true, message: "Adjourned. Nothing recorded is lost; resuming needs two fresh authorisations." };
  });
}

// ------------------------------------------------------------------ the box and withdrawals (plan §4.3)

/// OD-4, C-3: register an envelope found in the box, after it is opened and before any is opened; in time by the lock.
export async function registerBoxEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const kind = r.choice("kind", "Envelope", ["BID", "ALTERNATIVE"] as const, { required: true });
  const markings = r.text("markings", "Markings", { required: true, max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "BidEnvelope.receivedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await nameOf(tx, l.org.id, personId);
    const fs = registerBoxFaults({ state: stateOf(o, l.ex.status), anyOpened: o.bids.length > 0, kind: kind!, markings, personActive: !!person, closing: l.ex.closingAt, lockedAt: c.lockEvent?.occurredAt ?? null });
    if (blocking(fs).length) return refuse(fs);
    const j = boxEnvelopeJudgement(c.lockEvent!.occurredAt, l.ex.closingAt!);
    const sequence = c.envelopes.reduce((n, e) => Math.max(n, e.sequence), 0) + 1;
    const row = await tx.bidEnvelope.create({
      data: { organisationId: l.org.id, exerciseId: l.ex.id, sequence, kind: kind!, channel: "BOX", receivedAt: j.receivedAt, receivedSource: j.receivedSource, receivedByPersonId: person!.id, markings, late: j.late, closingAtJudged: j.closingAtJudged, recordedAfterClosing: j.recordedAfterClosing, registeredAtOpeningId: o.id },
    });
    await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.envelope, row.id, label(l, `Envelope ${sequence}`), "CREATE", diffFields(null, envelopeFields({ ...row, receivedBy: person!.name, parentSequence: null }, l.org.timeZone)));
    await act.write(tx, row.id);
    return { ok: true, message: `Envelope ${sequence} registered from the box (${ENVELOPE_KIND_LABEL[kind!].toLowerCase()}).` };
  });
}

/// X-11: match a withdrawal to the envelope in the box it withdraws; the envelope is then never opened.
export async function matchWithdrawal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const withdrawalId = String(data.get("withdrawalId") ?? "");
  const envelopeId = String(data.get("envelopeId") ?? "");
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const w = c.withdrawals.find((x) => x.id === withdrawalId);
    const e = c.envelopes.find((x) => x.id === envelopeId);
    if (!w || !e) return { ok: false, message: "That withdrawal or envelope is not on this exercise." };
    const facts = c.withdrawals.map((x) => ({ id: x.id, envelopeId: x.envelopeId, unmatchedFinding: x.unmatchedFinding }));
    const fs = matchFaults({ state: stateOf(o, l.ex.status), withdrawal: facts.find((x) => x.id === w.id)!, envelope: { id: e.id, kind: e.kind, status: e.status, late: e.late, receivedSource: e.receivedSource }, withdrawals: facts });
    if (blocking(fs).length) return refuse(fs);
    await tx.bidWithdrawal.update({ where: { id: w.id, organisationId: actor.organisationId }, data: { envelopeId: e.id } });
    await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.withdrawal, w.id, label(l, "Withdrawal of an envelope in the box"), "UPDATE", diffFields({ matchedTo: null }, withdrawalMatchFields({ envelope: `Envelope ${e.sequence}` })));
    const moved = await tx.bidEnvelope.updateMany({ where: { id: e.id, status: "RECEIVED" }, data: { status: "WITHDRAWN" } });
    // R-7: thrown, so the withdrawal's match written above rolls back with it.
    if (moved.count !== 1) throw new Refusal(ENVELOPE_CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.envelope, e.id, label(l, `Envelope ${e.sequence}`), "UPDATE", diffFields(statusField("RECEIVED"), statusField("WITHDRAWN")));
    return { ok: true, message: `Envelope ${e.sequence} is withdrawn and will not be opened.` };
  });
}

/// X-11: what the panel found of a withdrawal no envelope in the box matched.
export async function recordWithdrawalFinding(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const withdrawalId = r.text("withdrawalId", "Withdrawal", { required: true });
  const finding = r.text("finding", "What the panel found", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "BidWithdrawal.findingBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const w = c.withdrawals.find((x) => x.id === withdrawalId);
    if (!w) return { ok: false, message: "That withdrawal is not on this exercise." };
    const person = await nameOf(tx, l.org.id, personId);
    const fs = findingFaults({ state: stateOf(o, l.ex.status), withdrawal: { id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding }, finding, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    await tx.bidWithdrawal.update({ where: { id: w.id, organisationId: actor.organisationId }, data: { unmatchedFinding: finding, findingRecordedAt: now, findingByPersonId: person!.id } });
    await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.withdrawal, w.id, label(l, "Withdrawal of an envelope in the box"), "UPDATE", diffFields({ finding: null }, withdrawalMatchFields({ envelope: "", finding, by: person!.name })));
    await act.write(tx, w.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ opening an envelope (plan §4.4, OD-2)

function readOffer(r: FormReader) {
  const price = r.money("price", "Price as read", { required: true });
  const periodValue = r.int("periodValue", "Completion period", { min: 1 });
  const periodUnit = r.choice("periodUnit", "Unit", PERIOD_UNITS);
  const validityDays = r.int("validityDays", "Validity stated (days)", { min: 1 });
  return { price: price ? parseSen(price) : null, period: { value: periodValue, unit: periodUnit }, validityDays };
}
const periodOf = (p: { value: number | null; unit: PeriodUnit | null }) => (p.value != null && p.unit ? { value: p.value, unit: p.unit } : null);

/**
 * Open one envelope (FR-OPN-005): the next Bil., the bidder named (OD-2: the one writer of an
 * envelope's party), the offer as read, the sale and restriction findings computed (X-11,
 * FR-DOC-009), the envelope OPENED.
 */
export async function openEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const envelopeId = r.text("envelopeId", "Envelope", { required: true });
  const partyId = r.optionalText("partyId");
  const bidderName = r.text("bidderName", "Bidder's name as read", { max: 400 });
  const registrationNo = r.text("registrationNo", "Registration number as read", { max: 120 });
  const registrationClass = r.text("registrationClass", "Registration class as read", { max: 120 });
  const registrationStatus = r.text("registrationStatus", "Registration status as read", { max: 120 });
  const parentOpenedBidId = r.optionalText("parentOpenedBidId");
  const offer = readOffer(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const state = stateOf(o, l.ex.status);
    const e = c.envelopes.find((x) => x.id === envelopeId) ?? null;
    const party = partyId ? (c.parties.find((p) => p.id === partyId) ?? null) : null;
    if (partyId && !party) return { ok: false, errors: { partyId: "That bidder is not on this exercise." } };
    const parent = parentOpenedBidId ? (c.openings.flatMap((x) => x.bids).find((b) => b.id === parentOpenedBidId) ?? null) : null;
    const isAlternative = e?.kind === "ALTERNATIVE";
    const snap = policyOf(o.policySnapshot);
    const fs = openFaults({
      state,
      envelope: e ? { id: e.id, kind: e.kind, status: e.status, late: e.late } : null,
      withdrawn: !!(e && openFault(e.id, c.withdrawals)),
      admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null,
      bidder: { partyId: party?.id ?? null, name: bidderName, registrationNo, registrationTaken: !party && c.parties.some((p) => p.registrationNo.trim().toLowerCase() === registrationNo.trim().toLowerCase()) },
      price: offer.price,
      period: offer.period,
      isAlternative,
      alternativesPermitted: snap.alternativesPermitted,
      parent: parentOpenedBidId ? { opened: !!parent && !parent.isAlternative } : null,
      timeZone: l.org.timeZone,
    });
    if (blocking(fs).length) return refuse(fs);
    const bidder = party ?? (await tx.exerciseParty.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, source: "BIDDER_AT_OPENING", name: bidderName.trim(), registrationNo: registrationNo.trim() } }));
    if (!party) await audit(tx, toAuditActor(actor), l.org.id, "ExerciseParty", bidder.id, label(l, `Party · ${bidder.name}`), "CREATE", diffFields(null, { party: bidder.name, registrationNo: bidder.registrationNo, cameAs: "Named at opening, from its bid" }));
    const sale = saleFinding(bidder.id, c.sales, snap.path, c.invitedPartyIds);
    // R-5: judged on the closing day in the organisation's zone, never an empty day; a refusal after the party's write rolls back.
    // Ruling 17a: a sale made from an online purchase has no sighting, so a restricted tender is read from the supplier register for the closing day and the reading is frozen with the offer.
    const liveSale = liveSaleOf(bidder.id, c.sales);
    const fromRegister = snap.restrictedTender === true && liveSale?.purchaseSupplierId ? await registerRestrictionOf(tx, l.org, { day: c.closingDay, at: l.ex.closingAt }, liveSale.purchaseSupplierId, now, frozenRuleOf(o.bids)) : null;
    if (fromRegister && "fault" in fromRegister) throw new Refusal(refuse([fromRegister.fault]));
    const restriction = fromRegister ?? restrictionFinding(snap.restrictedTender, liveSale, c.closingDay);
    if ("fault" in restriction) throw new Refusal(refuse([restriction.fault]));
    const restrictionReading = fromRegister && "reading" in fromRegister ? fromRegister.reading : null;
    // 6.15a (FR-BID-008 on paper, OD-6 A): a bidder linked to the register is judged on its locked row (the supplier last), frozen with the offer.
    const eligibility = party?.vendorId ? await eligibilityAtOpening(tx, l.org, party.vendorId, l.ex.id) : null;
    const listingNo = nextListingNo(c.openings.flatMap((x) => x.bids.map((b) => b.listingNo)));
    const alternative = alternativeOf(isAlternative, snap.alternativesPermitted);
    const period = periodOf(offer.period);
    const bid = await tx.openedBid.create({
      data: {
        organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, envelopeId: e!.id, listingNo, partyId: bidder.id, openedAt: now,
        bidderNameAsRead: party ? (bidderName.trim() || party.name) : bidder.name, registrationClassAsRead: registrationClass, registrationStatusAsRead: registrationStatus,
        priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays,
        isAlternative, parentOpenedBidId: parent?.id ?? null, alternativeStatus: alternative, saleFinding: sale, restrictionFinding: restriction.finding,
        ...(restrictionReading ? { restrictionReading: readingJson(restrictionReading) } : {}),
        ...(eligibility ? { eligibilityFinding: eligibility as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    // OD-2, C-10: the one writer of an envelope's party, at its opening.
    const moved = await tx.bidEnvelope.updateMany({ where: { id: e!.id, status: "RECEIVED" }, data: { status: "OPENED", partyId: bidder.id } });
    // R-7: thrown, so the party and the offer written above roll back with it.
    if (moved.count !== 1) throw new Refusal(ENVELOPE_CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.envelope, e!.id, label(l, `Envelope ${e!.sequence}`), "UPDATE", diffFields({ ...statusField("RECEIVED"), bidder: null }, { ...statusField("OPENED"), bidder: bidder.name }));
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${listingNo}`), "CREATE",
      diffFields(null, { ...openedBidFields({ listingNo, envelope: `Envelope ${e!.sequence}`, bidder: bid.bidderNameAsRead, registrationClass, registrationStatus, price: offer.price!, period, validityDays: offer.validityDays, alternative, parentListingNo: parent?.listingNo ?? null, sale, restriction: restriction.finding, at: now }, l.org.timeZone), ...(restrictionReading ? { restriction: restrictionLabel(restriction.finding, restrictionReading), restrictionReading: restrictionReadingWords(restrictionReading) } : {}), ...(eligibility ? { supplierRegister: `${eligibility.supplierReference}: ${eligibility.verdict === "ELIGIBLE" ? "eligible" : eligibility.verdict === "NOT_ELIGIBLE" ? "not eligible" : "not assessed"}, judged ${eligibility.judgedOn}` } : {}) }));
    return { ok: true, message: `Opened as No. ${listingNo}. Each panel member present now initials it, and its checklist is answered.` };
  }, { prices: actor });
}

/// FR-BID-006: an alternative offer found inside an envelope already opened at this opening.
export async function recordAlternative(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const mainBidId = r.text("openedBidId", "Offer", { required: true });
  const offer = readOffer(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, mainBidId);
    if (!found) return GONE_BID;
    const { opening: o, bid: main } = found;
    const snap = policyOf(o.policySnapshot);
    const current = c.openings.find((x) => !x.finalisedAt && x.id === o.id);
    const fs = alternativeInsideFaults({ state: stateOf(o, l.ex.status), main: { openingMatches: !!current, isAlternative: main.isAlternative }, alternativesPermitted: snap.alternativesPermitted, price: offer.price, period: offer.period });
    if (blocking(fs).length) return refuse(fs);
    const listingNo = nextListingNo(c.openings.flatMap((x) => x.bids.map((b) => b.listingNo)));
    const alternative = alternativeOf(true, snap.alternativesPermitted);
    const period = periodOf(offer.period);
    const bid = await tx.openedBid.create({
      data: {
        organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, envelopeId: main.envelopeId, listingNo, partyId: main.partyId, openedAt: now,
        bidderNameAsRead: main.bidderNameAsRead, registrationClassAsRead: main.registrationClassAsRead, registrationStatusAsRead: main.registrationStatusAsRead,
        priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays,
        isAlternative: true, parentOpenedBidId: main.id, alternativeStatus: alternative, saleFinding: main.saleFinding, restrictionFinding: main.restrictionFinding,
        ...(main.restrictionReading != null ? { restrictionReading: main.restrictionReading as Prisma.InputJsonValue } : {}),
        // 6.15a: the bidder's register finding goes with its alternative, as its sale finding does.
        ...(main.eligibilityFinding != null ? { eligibilityFinding: main.eligibilityFinding as Prisma.InputJsonValue } : {}),
      },
    });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${listingNo}`), "CREATE",
      diffFields(null, { ...openedBidFields({ listingNo, envelope: `Envelope ${main.envelope.sequence}`, bidder: main.bidderNameAsRead, registrationClass: main.registrationClassAsRead, registrationStatus: main.registrationStatusAsRead, price: offer.price!, period, validityDays: offer.validityDays, alternative, parentListingNo: main.listingNo, sale: main.saleFinding, restriction: main.restrictionFinding, at: now }, l.org.timeZone), ...(isRestrictionReading(main.restrictionReading) ? { restriction: restrictionLabel(main.restrictionFinding, main.restrictionReading), restrictionReading: restrictionReadingWords(main.restrictionReading) } : {}) }));
    return { ok: true, message: `Recorded as No. ${listingNo}, an alternative to No. ${main.listingNo}.` };
  }, { prices: actor });
}

// ------------------------------------------------------------------ initials, checklist, verdicts, corrections (plan §4.5)

/// FR-OPN-006: a present member's initial on an offer as read (after its last correction).
export async function recordInitial(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const bidId = String(data.get("openedBidId") ?? "");
  // The panel member initials the offer themselves, or a paper initial is recorded for them (Phase 2b).
  const begun = await beginAct(actor, data, "OpenedBidInitial.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const existing = bid.initials.find((i) => i.personId === personId) ?? null;
    const stale = !!existing && initialStale(bid, existing);
    const fs = markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: !!existing && !stale, sameOpening: true });
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    const name = o.panel.find((p) => p.personId === personId)!.person.name;
    if (existing) {
      await tx.openedBidInitial.update({ where: { id: existing.id, organisationId: actor.organisationId }, data: { recordedAt: now, correctionNo: bid.asReadCorrections } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.initial, existing.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields({ initialled: "Before the correction" }, { initialled: initialFields({ person: name, listingNo: bid.listingNo, at: now }, l.org.timeZone).at }));
      await act.write(tx, existing.id);
    } else {
      const row = await tx.openedBidInitial.create({ data: { organisationId: l.org.id, openedBidId: bid.id, personId, recordedAt: now, correctionNo: bid.asReadCorrections } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.initial, row.id, label(l, `Offer ${bid.listingNo}`), "CREATE", diffFields(null, initialFields({ person: name, listingNo: bid.listingNo, at: now }, l.org.timeZone)));
      await act.write(tx, row.id);
    }
    return { ok: true };
  });
}

/// FR-OPN-008: one checklist item for one offer. A changed answer clears the offer's verdict, which is recorded again.
export async function recordChecklistAnswer(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const itemKey = r.text("itemKey", "Item", { required: true });
  const answer = r.choice("answer", "Answer", CHECKLIST_ANSWERS, { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const fs = [...actFaults(stateOf(o, l.ex.status)), ...answerFaults(checklist.items, itemKey, answer)];
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    const item = checklist.items.find((i) => i.key === itemKey)!;
    const before = bid.answers.find((a) => a.itemKey === itemKey) ?? null;
    if (before?.answer === answer) return { ok: true };
    const row = await tx.openingChecklistAnswer.upsert({ where: { openedBidId_itemKey: { openedBidId: bid.id, itemKey } }, create: { organisationId: l.org.id, openedBidId: bid.id, itemKey, itemLabelSnapshot: item.label, answer: answer!, recordedAt: now }, update: { answer: answer!, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.answer, row.id, label(l, `Offer ${bid.listingNo}`), before ? "UPDATE" : "CREATE", diffFields(before ? answerFields({ item: item.label, answer: before.answer }) : null, answerFields({ item: item.label, answer: answer! })));
    if (before && bid.verdict) {
      // R-7: the verdict's completeness record is cleared with it (database null), not left as it was.
      await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { verdict: null, verdictReason: "", verdictAt: null, completeness: Prisma.DbNull } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields(verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), { verdict: "Cleared: a checklist answer changed; record it again", reason: null }));
      return { ok: true, message: "Recorded. The answer changed, so the offer's verdict is cleared: record it again." };
    }
    return { ok: true };
  });
}

/// The method's unpurchased-bid rule as it stands now (OD-4), for an opening that froze it unset.
const liveUnpurchased = (c: OpeningContext): LiveUnpurchased => ({ consequence: c.method?.unpurchasedBidConsequence ?? null, provenance: (c.method?.unpurchasedProvenance as OpeningPolicySnapshot["unpurchased"]["provenance"]) ?? null });

/// FR-OPN-008, 009, R12, OD-4: the verdict on one offer, on the grounds the rules make eliminatory only.
export async function recordVerdict(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const verdict = r.choice("verdict", "Verdict", ["PASS", "REJECT"] as const, { required: true }) as OpeningVerdict | null;
  const reason = r.text("verdictReason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    // S-3: who records the verdict is named, so a rule recorded with it says by whom: the signed-in officer (Phase 2b).
    const person = { name: actor.personName };
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const answers = new Map(bid.answers.map((a) => [a.itemKey, a.answer]));
    const unpurchased = unpurchasedRule(snap, liveUnpurchased(c), now, person.name);
    const policy = { completenessEliminates: snap.completeness.eliminates, unpurchased: unpurchased.consequence, ineligible: consequenceFor(o.policySnapshot, c.supplierPolicy?.ineligibleBidConsequence ?? null) };
    // A verdict on an opening that cannot take one is refused before anything is read again or written (review of 17a, finding 2).
    const early = actFaults(stateOf(o, l.ex.status));
    if (blocking(early).length) return refuse(early);
    // Ruling 17a: a restriction not yet assessed is read again now, audited and frozen again, and the last reading taken decides. A configuration gap found now is a fault in words.
    const retaken = await retakeRestriction(tx, actor, l, c, o, bid, now);
    if ("fault" in retaken) return refuse([retaken.fault]);
    // The new reading is kept even when the verdict is then refused (it is audited on the offer), so a refusal after one says what was saved rather than "Nothing was saved".
    const SAVED_AGAIN = "The restriction was read again from the supplier register and the new reading is saved on the offer. The verdict was not recorded";
    const facts = { saleFinding: bid.saleFinding, restrictionFinding: retaken.finding, isAlternative: bid.isAlternative, alternativeStatus: bid.alternativeStatus, ineligible: ineligibleOf(bid.eligibilityFinding) };
    const fs = verdictFaults({ state: stateOf(o, l.ex.status), sameOpening: true, bid: facts, checklist, answers, policy, verdict, reason });
    if (blocking(fs).length) return fs.length === 1 && fs[0].code === "REASON_REQUIRED" ? { ok: false, errors: { verdictReason: openingFindingText(fs[0]) }, ...(retaken.wrote ? { message: `${SAVED_AGAIN}.` } : {}) } : refuse(fs, retaken.wrote ? `${SAVED_AGAIN}:` : "Nothing was saved:");
    const j = judgeBid(facts, checklist, answers, policy);
    // OD-4: an unset unpurchased rule, set since the opening started, is recorded on the opening once, the first time it is used.
    if (unpurchased.record && bid.saleFinding !== "LIVE_SALE") {
      await tx.opening.update({ where: { id: o.id, organisationId: actor.organisationId }, data: { policySnapshot: unpurchased.record as unknown as Prisma.InputJsonValue } });
      const a = unpurchasedRecordAudit(unpurchased.consequence!, now, person.name, l.org.timeZone);
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields(a.before, a.after));
    }
    await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { verdict, verdictReason: verdict === "REJECT" ? reason.trim() : "", verdictAt: now, completeness: verdictRecord(j) as unknown as Prisma.InputJsonValue } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE",
      diffFields(bid.verdict ? { ...verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), recordedBy: null } : { verdict: null, recordedBy: null }, { ...verdictFields({ verdict, reason: verdict === "REJECT" ? reason.trim() : "", grounds: j.grounds, reported: j.reported, missing: j.missing.map((m) => m.label) }), recordedBy: person.name }),
      verdict === "REJECT" ? reason.trim() : "");
    return { ok: true };
  });
}

/// OD-10: correct a keying slip in what was read, before finalising, with the reason, audited before and after. Initials are taken again.
export async function correctAsRead(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const bidderName = r.text("bidderName", "Bidder's name as read", { required: true, max: 400 });
  const registrationClass = r.text("registrationClass", "Registration class as read", { max: 120 });
  const registrationStatus = r.text("registrationStatus", "Registration status as read", { max: 120 });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  const offer = readOffer(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const period = periodOf(offer.period);
    const was = { bidder: bid.bidderNameAsRead, registrationClass: bid.registrationClassAsRead, registrationStatus: bid.registrationStatusAsRead, price: parseSen(priceRead(bid).toString()), period: bid.completionPeriod != null && bid.completionUnit ? { value: bid.completionPeriod, unit: bid.completionUnit } : null, validityDays: bid.validityDaysStated };
    const next = { bidder: bidderName.trim(), registrationClass, registrationStatus, price: offer.price ?? (0n as Sen), period, validityDays: offer.validityDays };
    const changed = JSON.stringify(asReadFields(was)) !== JSON.stringify(asReadFields(next));
    const fs = correctionFaults({ state: stateOf(o, l.ex.status), sameOpening: !o.finalisedAt, reason, changed, price: offer.price, period: offer.period });
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { bidderNameAsRead: next.bidder, registrationClassAsRead: registrationClass, registrationStatusAsRead: registrationStatus, priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays, asReadCorrectedAt: now, asReadCorrections: bid.asReadCorrections + 1 } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields(asReadFields(was), asReadFields(next)), reason);
    return { ok: true, message: "Corrected. Each panel member present initials it again." };
  }, { prices: actor });
}

// ------------------------------------------------------------------ the schedule's paper (plan §4.7)

/// FR-OPN-006: a present member's signature on the paper schedule, with the paper's day.
export async function recordSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("SIGNATURE");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  // The panel member signs the schedule with the password, or the paper they signed is recorded for them, with the paper's day (Phase 2b).
  const begun = await beginAct(actor, data, "OpeningSignature.person", { personField: "personId", dateField: "signedOn", document: { entity: "Opening", id: openingId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const signedOn = act.day ?? "";
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const startDay = l.org.timeZone ? dayIn(o.startedAt, l.org.timeZone) : null;
    const fs = markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: o.signatures.some((s) => s.personId === personId), sameOpening: true, signedOn: { day: isDay(signedOn) ? signedOn : null, today: l.org.today, startDay } });
    if (blocking(fs).length) return refuse(fs);
    const name = o.panel.find((p) => p.personId === personId)!.person.name;
    // NFR-SIG-001: the seat the member signed in, kept with the act.
    const seat = o.panel.find((p) => p.personId === personId)!;
    const row = await tx.openingSignature.create({ data: { organisationId: l.org.id, openingId: o.id, personId, panelMemberId: seat.id, signedOn: dayToDate(signedOn), recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.signature, row.id, openingLabel(l, o), "CREATE", diffFields(null, signatureFields({ person: name, signedOn, seat: seat.seatLabelSnapshot })));
    await act.write(tx, row.id, { document: { entity: "Opening", id: o.id } });
    return { ok: true };
  });
}

/// FR-OPN-005 (OD-9): the signed schedule's pages, and the minutes.
export async function recordScheduleDetails(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const pages = r.int("schedulePages", "Pages of the signed schedule", { required: true, min: 1 });
  const minutes = r.text("minutes", "Minutes", { max: 20000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const fs = recordFaults({ state: stateOf(o, l.ex.status), pages });
    if (blocking(fs).length) return refuse(fs);
    await tx.opening.update({ where: { id: o.id, organisationId: actor.organisationId }, data: { schedulePages: pages, minutes } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ pages: o.schedulePages == null ? null : String(o.schedulePages), minutes: o.minutes || null }, { pages: String(pages), minutes: minutes || null }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ finalising (plan §4.8, C-1, C-5)

/**
 * Finalise (FR-OPN-005, 006, 011): every finalise check on the locked rows; only then, in this
 * transaction, the estimate disclosed and the paper copy compared (C-1), the schedule and Grand
 * Summary frozen, and (the main opening) the exercise Opened. A refusal reads the same whatever
 * figure was typed from the paper: the figure is parsed only after every check passed.
 */
export async function finaliseOpening(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  // Finalised by the signed-in officer: the person the disclosure of the estimate and a new evaluation version are attributed to (Phase 2b).
  const begun = await beginAct(actor, data, "EstimateEvent.person", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const paperChoice = String(data.get("paperCopy") ?? "");
  const paperRaw = String(data.get("paperFigure") ?? "");
  const paperAnswered = paperChoice === "notInBox" || (paperChoice === "figure" && paperRaw.trim() !== "");
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await nameOf(tx, l.org.id, personId);
    const state = stateOf(o, l.ex.status);
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const unpurchased = unpurchasedRule(snap, liveUnpurchased(c), now, person?.name ?? "");
    const ineligible = consequenceFor(o.policySnapshot, c.supplierPolicy?.ineligibleBidConsequence ?? null);
    const anyIneligible = o.bids.some((b) => ineligibleOf(b.eligibilityFinding));
    // 6.15a fix R-6, residual 5: each recorded verdict judged again under the rules about to be frozen (one function, shared with the screen).
    const drift = verdictDrift(o.bids, { checklist, completenessEliminates: snap.completeness.eliminates, unpurchased: unpurchased.consequence, ineligible });
    const estimate = { required: snap.estimate.requires === true, lodged: o.kind === "MAIN" && c.estimate?.state === "LODGED", paperAnswered };
    const unopened = c.envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && !e.late && e.status === "RECEIVED").length;
    const admitted = o.admissionDecision?.bidEnvelopeId ? c.envelopes.find((e) => e.id === o.admissionDecision!.bidEnvelopeId) : null;
    const fs = finaliseFaults({
      state,
      bids: o.bids.map((b) => ({ listingNo: b.listingNo, initials: freshInitials(b, b.initials).map((i) => i.personId), unanswered: unansweredItems(checklist.items, new Map(b.answers.map((a) => [a.itemKey, a.answer]))).length, verdict: b.verdict, unpurchased: b.saleFinding !== "LIVE_SALE" })),
      present: presentOf(o),
      signed: o.signatures.map((s) => s.personId),
      pages: o.schedulePages,
      checklist,
      withdrawals: o.kind === "MAIN" ? c.withdrawals.map((w) => ({ id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding })) : [],
      unopened,
      admittedOpened: admitted?.status === "OPENED",
      completenessEliminates: snap.completeness.eliminates,
      unpurchased: unpurchased.consequence,
      // 6.15a (OD-6 A): unset blocks only where a linked bidder was found not eligible.
      ineligible: { consequence: ineligible, anyFound: anyIneligible, disagreements: drift.setting },
      noLongerStands: drift.noLongerStands,
      // R-4: the reading frozen at the start, never today's configuration.
      invitedReading: snap.invited.reading,
      estimate,
      personActive: !!person,
    });
    if (blocking(fs).length) return refuse(fs);
    // Every other check passed: only now is the paper's figure read.
    let paper: PaperCopy | null = null;
    if (estimate.lodged && paperAnswered) {
      if (paperChoice === "notInBox") paper = { notInBox: true };
      else {
        const r = new FormReader(data);
        const figure = r.money("paperFigure", "The figure on the paper copy", { required: true });
        if (!figure) return { ok: false, errors: r.errors };
        paper = { figure: parseSen(figure) };
      }
    }
    let disclosed: Awaited<ReturnType<typeof discloseAtFinalising>> | null = null;
    if (o.kind === "MAIN" && c.estimateFacts && c.estimate?.state === "LODGED") {
      try {
        disclosed = await discloseAtFinalising(tx, toAuditActor(actor), { organisationId: l.org.id, reference: l.ex.reference, facts: c.estimateFacts, at: now, person: person!, act, paper, benchmarkLabelEn: c.scopePolicy.benchmarkLabelEn });
      } catch (e) {
        // R-1: thrown as a Refusal, so anything written in this transaction rolls back with it.
        if (e instanceof DisclosureRefused) throw new Refusal({ ok: false, message: "Nothing was saved: the company estimate could not be disclosed as it stands. Check its state on the Scope and estimate tab." });
        throw e;
      }
    }
    // The schedule: every offer read up to this opening, in opening order (OD-5 versions).
    const rows: ScheduleRowInput[] = c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, price: parseSen(priceRead(b).toString()), period: b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null, isAlternative: b.isAlternative, parentListingNo: b.parentOpenedBid?.listingNo ?? null, openingSequence: x.sequenceNo })));
    const mainSchedule = o.kind === "SUPPLEMENTARY" ? c.main?.scheduleSnapshot : null;
    const priorBenchmark = mainSchedule && typeof mainSchedule === "object" && !Array.isArray(mainSchedule) ? ((mainSchedule as Record<string, unknown>).benchmark as { sealed: false; label: string | null; companyEstimate: string } | { notRequired: true } | undefined) : undefined;
    const benchmark = disclosed?.benchmark ? { sealed: false as const, label: disclosed.benchmark.label, value: disclosed.benchmark.value } : priorBenchmark && "companyEstimate" in priorBenchmark ? { sealed: false as const, label: priorBenchmark.label, value: parseSen(priorBenchmark.companyEstimate) } : { notRequired: true as const };
    const gap = c.main?.lockGapSeconds != null && o.kind === "MAIN" && c.main.boxLockedAt && l.ex.closingAt ? lockGap(l.ex.closingAt, c.main.boxLockedAt) : null;
    const { schedule } = jadualTawaran({ version: o.sequenceNo, title: l.ex.title, reference: l.ex.reference, startDay: l.ex.tenderingStartOn ? storedDay(l.ex.tenderingStartOn) : null, closing: l.ex.closingAt, invited: { reading: snap.invited.reading, ...invitedCounts(c) }, lateCount: lateCount(c.envelopes), pages: o.schedulePages, rows, benchmark, lockGap: gap });
    const verdicts = new Map(c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => [b.id, b.verdict] as const)));
    const summary = grandSummary({ finalised: true, bids: c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, price: parseSen(priceRead(b).toString()), verdict: verdicts.get(b.id) ?? null }))), labels: summaryLabelsOf(snap) });
    // After the disclosure's writes: thrown, so they roll back (R-1, R-7).
    if (!("summary" in summary)) throw new Refusal(refuse([summary.fault]));
    const lodged = disclosed?.lodged ?? null;
    // R-4: the unpurchased rule is recorded at finalising only where an offer needs it, audited with it.
    const recordRule = unpurchased.record && o.bids.some((b) => b.saleFinding !== "LIVE_SALE") ? unpurchased.record : null;
    // 6.15a (OD-6 A): the register's consequence is frozen on the opening at finalising, where a bid needed it.
    const base = (recordRule ?? o.policySnapshot) as Record<string, unknown> | null;
    const frozenSnapshot = anyIneligible && base ? { ...base, ineligible: { consequence: ineligible, provenance: c.supplierPolicy?.ineligibleProvenance ?? null, recordedAt: now.toISOString(), recordedBy: person!.name } } : recordRule;
    await tx.opening.update({
      where: { id: o.id, organisationId: actor.organisationId },
      data: {
        finalisedAt: now,
        scheduleSnapshot: { ...schedule, invitedReadingProvenance: snap.invited.provenance } as unknown as Prisma.InputJsonValue,
        grandSummarySnapshot: summary.summary as unknown as Prisma.InputJsonValue,
        faultsSnapshot: fs.filter((f) => f.level !== "block") as unknown as Prisma.InputJsonValue,
        ...(frozenSnapshot ? { policySnapshot: frozenSnapshot as unknown as Prisma.InputJsonValue } : {}),
        estimatePaperAmount: disclosed?.paper != null ? senToDecimalString(disclosed.paper) : null,
        estimateLodgedAmount: disclosed && disclosed.check ? senToDecimalString(lodged!) : null,
        estimateCopyCheck: disclosed?.check ?? null,
      },
    });
    if (recordRule) {
      const a = unpurchasedRecordAudit(unpurchased.consequence!, now, person!.name, l.org.timeZone);
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields(a.before, a.after));
    }
    if (anyIneligible) {
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ ineligibleBidder: null }, { ineligibleBidder: ineligible === "ELIMINATE" ? "Eliminated at the opening (the supplier register's policy, frozen at finalising)" : "Reported to the committee (the supplier register's policy, frozen at finalising)" }));
    }
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ finalised: null }, finaliseFields({ at: now, by: person!.name, pages: o.schedulePages!, rows: schedule.rows.length, copy: disclosed?.check ?? null, paper: disclosed?.paper ?? null, lodged, disclosed: !!disclosed }, l.org.timeZone)));
    if (o.kind === "MAIN") {
      await moveExercise(tx, l.ex, "OPENED", { today: l.org.today, via: "OPENING_FINALISED", finaliseFaults: 0 });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENED" }));
    }
    // 6.8 E-7: a supplementary opening finalised once an evaluation version exists opens version n+1 in
    // this transaction, superseding the one in force; the evaluations are locked after the opened bids.
    let reopened: number | null = null;
    if (o.kind === "SUPPLEMENTARY") {
      await lockEvaluationRows(tx, l.ex.id);
      reopened = await openNewVersion(tx, toAuditActor(actor), { organisationId: l.org.id, exercise: { id: l.ex.id, reference: l.ex.reference, title: l.ex.title, status: l.ex.status }, ceiling: ceilingOf(l.ex), today: l.org.today, timeZone: l.org.timeZone, now }, { trigger: "SUPPLEMENTARY_OPENING", openingId: o.id, personId: person!.id, act });
    }
    const again = reopened ? ` Evaluation version ${reopened} is opened with the late ${o.bids.length === 1 ? "offer" : "offers"}; every stage is submitted again.` : "";
    const copy = disclosed?.check === "MISMATCH" || disclosed?.check === "NOT_IN_BOX" ? " The estimate's paper copy is recorded as a finding to explain on the Schedule section." : "";
    return { ok: true, message: `Finalised. Attach the signed schedule's scan on the Schedule section.${copy}${again}` };
  }, { estimate: true });
}

/// C-1: the explanation of a MISMATCH or NOT_IN_BOX copy finding, once, never edited.
export async function recordCopyExplanation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const explanation = r.text("explanation", "Explanation", { required: true, max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "EstimateCopyExplanation.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await nameOf(tx, l.org.id, personId);
    const fs = refuseIfCancelled(l.ex.status === "CANCELLED", () => explanationFaults({ finalised: !!o.finalisedAt, check: o.estimateCopyCheck, explained: !!o.copyExplanation, text: explanation, personActive: !!person }));
    if (blocking(fs).length) return refuse(fs);
    const row = await tx.estimateCopyExplanation.create({ data: { organisationId: l.org.id, openingId: o.id, explanation, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.explanation, row.id, openingLabel(l, o), "CREATE", diffFields(null, { explanation, recordedBy: person!.name }));
    await act.write(tx, row.id);
    return { ok: true };
  });
}
