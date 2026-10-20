"use server";

import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { BID_ENTITY, envelopeFields, statusField } from "@/lib/bids/audit-view";
import { ENVELOPE_KIND_LABEL } from "@/lib/bids/labels";
import { dayIn, dayToDate, isDay, storedDay } from "@/lib/dates";
import { moveExercise } from "@/lib/method/move";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { estimateEventAudit, ENTITY as SCOPE_ENTITY } from "@/lib/scope/audit-view";
import { leadTime } from "@/lib/scope/estimate";
import { FormReader } from "@/lib/validate";
import { splitValues } from "@/lib/ui/select-logic";
import { answerFields, asReadFields, authorisationFields, initialFields, openedBidFields, OPENING_ENTITY, openingStartFields, renewedBefore, signatureFields, sittingFields, verdictFields, withdrawalMatchFields } from "@/lib/opening/audit-view";
import { boxEnvelopeJudgement, lockGap, registerBoxFaults } from "@/lib/opening/box";
import { answerFaults, checklistFromSnapshot, openingChecklist } from "@/lib/opening/checklist";
import { explanationFaults, refuseIfCancelled } from "@/lib/opening/estimate-copy";
import { markFaults, recordFaults } from "@/lib/opening/finalise";
import { liveSaleOf, restrictionFinding, saleFinding } from "@/lib/opening/findings";
import { openingFindingText, restrictionLabel } from "@/lib/opening/labels";
import { isRestrictionReading, restrictionReadingWords } from "@/lib/suppliers/restriction-register";
import { alternativeInsideFaults, alternativeOf, correctionFaults, nextListingNo, openFaults } from "@/lib/opening/open";
import { panelFaults, supplementaryPanel } from "@/lib/opening/panel";
import { loadOpeningRoster } from "@/lib/opening/roster-store";
import { rosterFaults } from "@/lib/opening/roster";
import { actFaults } from "@/lib/opening/state";
import { panelActorFault } from "@/lib/opening/actor";
import { cellAnswerFaults, columnBindingFaults, columnTally, confirmationStands, confirmFaults, matrixActorFaults, parseColumnBinding } from "@/lib/opening/matrix";
import { loadCellFacts } from "@/lib/opening/matrix-store";
import { openingPolicyFrozen, panelOf, panelSnapshot, policyOf, stateOf, type OpeningContext, type OpeningPolicySnapshot } from "@/lib/opening/repo";
import { unpurchasedRecordAudit, unpurchasedRule } from "@/lib/opening/unpurchased";
import { estimateStateForStart } from "@/lib/sealing/estimate-lodgement";
import { standingLodgement } from "@/lib/sealing/estimate-lodgement-store";
import { estimateLeadFaults, frozenRuleFaults, onlineStartFaults, startFaults, supplementaryFaults } from "@/lib/opening/start";
import { blocking, CHECKLIST_ANSWERS, PERIOD_UNITS, type Finding, type OpeningVerdict, type PeriodUnit } from "@/lib/opening/types";
import { adjournFaults, authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "@/lib/opening/unseal";
import { databaseClock, freezeReceiptRoll, shredReleases } from "@/lib/opening/unseal-store";
import { loadCeremony } from "@/lib/sealing/store";
import { loadPendingSubstitution } from "@/lib/sealing/substitution-store";
import { MAX_STAMP_SKEW_SECONDS } from "@/lib/portal/bids/limits";
import { judgeBid, verdictFaults, verdictRecord } from "@/lib/opening/verdict";
import { consequenceFor, ineligibleOf } from "@/lib/suppliers/opening-hook";
import { eligibilityAtOpening } from "@/lib/suppliers/standing-repo";
import { findingFaults, matchFaults, openFault } from "@/lib/opening/withdrawals";

import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { frozenRuleOf, readingJson, retakeRestriction } from "./restriction";
import { activePerson, audit, exerciseIdOf, label, Refusal } from "../window/shared";
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

import { ENVELOPE_CHANGED, GONE_BID, GONE_OPENING, inOpening, refuse, stampNow, warnings } from "./in-opening";
import { finaliseInTransaction, liveUnpurchased, openingLabel, openingOf } from "./finalise-transaction";
import { ONLINE_AUTHORISE_ELSEWHERE, ONLINE_ENVELOPE_OPENED_BY_UNSEAL, ONLINE_SIGN_ELSEWHERE } from "./online-words";

const bidOf = (c: OpeningContext, id: string) => {
  for (const o of c.openings) {
    const b = o.bids.find((x) => x.id === id);
    if (b) return { opening: o, bid: b };
  }
  return null;
};
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
async function startingPicks(tx: Tx, l: { ex: { id: string; sourcingMethodCode: string; openingRosterRequired: boolean; submissionChannel: string | null }; org: { id: string; code: string; today: string | null } }, data: FormData): Promise<{ picks: { personId: string; present: boolean }[]; faults: Finding[] }> {
  if (!l.ex.openingRosterRequired) return { picks: readPanel(data), faults: [] };
  const roster = await loadOpeningRoster(l.ex, l.org, tx);
  const present = readPresent(data);
  // ONLINE (ADR 0036 D10): every named officer is on the panel and authorises in their own sign-in, so presence is not asked: authorising is the presence.
  return { picks: roster.rows.map((r) => ({ personId: r.personId, present: l.ex.submissionChannel === "ONLINE" || present.has(r.personId) })), faults: rosterFaults(roster.input).filter((f) => f.code === "OFFICER_IS_ADMINISTRATOR") };
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
    const online = l.ex.submissionChannel === "ONLINE";
    const sf = startFaults({ status: l.ex.status, packKind: l.ex.packKindSnapshot, publishedThroughWindow: c.window?.publishedAt != null, timeZone: l.org.timeZone, phase: c.gate.phase, boxLocked: c.boxLocked, changePending: c.gate.changePending, mainExists: c.main != null, personActive: !!person, channel: l.ex.submissionChannel });
    if (blocking(sf).length) return refuse(sf);
    // ADR 0036 D10, H2, 20aa: an online opening starts on a live key split across exactly the officers named, and only once the DATABASE clock (read here, after the locks, the clock the triggers read)
    // is past the closing by the skew, so that no bid sent in time can still be committing when the roll is frozen below.
    let receiptRoll: Awaited<ReturnType<typeof freezeReceiptRoll>> | null = null;
    let liveKeyId: string | null = null;
    let standingCopy: Awaited<ReturnType<typeof standingLodgement>> = null;
    if (online) {
      const ceremony = await loadCeremony(tx, l.org.id, l.ex.id);
      const clock = await databaseClock(tx);
      const of = onlineStartFaults({ closing: l.ex.closingAt, clock, skewSeconds: MAX_STAMP_SKEW_SECONDS, rosterOfficers: ceremony.roster.length, key: ceremony.liveKey ? { officerCount: ceremony.liveKey.officerCount, shareHolders: ceremony.rosterShareHolders } : null });
      const sameOfficers = picks.length === ceremony.roster.length && picks.every((p) => ceremony.roster.some((r) => r.personId === p.personId));
      if (!sameOfficers && !of.some((f) => f.code === "KEY_OFFICERS_MISMATCH")) of.push({ code: "KEY_OFFICERS_MISMATCH", level: "block", data: { officers: ceremony.roster.length, keyOfficers: ceremony.liveKey?.officerCount ?? 0 } });
      // Step 17: a substitution not completed is not a key to make again. The officer replaced still holds their share, and past the closing it can no longer be handed over.
      if (of.some((f) => f.code === "KEY_OFFICERS_MISMATCH") && (await loadPendingSubstitution(tx, l.org.id, l.ex.id)).pending.state === "PENDING") for (const f of of) if (f.code === "KEY_OFFICERS_MISMATCH") f.data = { ...f.data, waiting: 1 };
      if (blocking(of).length) return refuse(of);
      receiptRoll = await freezeReceiptRoll(tx, l.org.id, l.ex.id);
      standingCopy = await standingLodgement(tx, l.org.id, l.ex.id);
      liveKeyId = ceremony.liveKey?.id ?? null;
    }
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
      // ONLINE reads the sealed lodgement, not the paper copy in the box (ADR 0036 D10): no sealed lodgement under the live key is none lodged.
      estimateState: estimateStateForStart({ channel: online ? "ONLINE" : "PAPER", state: c.estimate?.state ?? null, liveKeyId, standing: standingCopy }),
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
        ...(receiptRoll ? { receiptRoll: receiptRoll as unknown as Prisma.InputJsonValue } : {}),
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
    const who = online ? `All ${picked.length} named officers authorise next.` : "Two present members authorise next.";
    return { ok: true, message: `Opening started. ${who}${said ? ` ${said}` : ""}` };
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
    const online = l.ex.submissionChannel === "ONLINE";
    if (online) {
      // The same key, split across the same officers, as the main unseal needs (ADR 0036 D10): an admitted late bid is opened n-of-n again. No skew is waited for: the roll was frozen at the main start.
      const ceremony = await loadCeremony(tx, l.org.id, l.ex.id);
      const of = onlineStartFaults({ closing: l.ex.closingAt, clock: new Date(), skewSeconds: MAX_STAMP_SKEW_SECONDS, waitForSkew: false, rosterOfficers: ceremony.roster.length, key: ceremony.liveKey ? { officerCount: ceremony.liveKey.officerCount, shareHolders: ceremony.rosterShareHolders } : null });
      if (!(picks.length === ceremony.roster.length && picks.every((p) => ceremony.roster.some((r) => r.personId === p.personId)))) of.push({ code: "KEY_OFFICERS_MISMATCH", level: "block", data: { officers: ceremony.roster.length, keyOfficers: ceremony.liveKey?.officerCount ?? 0 } });
      if (blocking(of).length) return refuse(of);
    }
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
    const who = online ? `All ${picked.length} named officers authorise next.` : "Two present members authorise next.";
    return { ok: true, message: `Supplementary opening started. ${who}${warnings(pf) ? ` ${warnings(pf)}` : ""}` };
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
    // ADR 0036 D10: an online opening is unsealed by the officers' own passphrases, each forwarding the shares it holds, and by nothing else.
    if (l.ex.submissionChannel === "ONLINE") return { ok: false, message: ONLINE_AUTHORISE_ELSEWHERE };
    const state = stateOf(o, l.ex.status);
    const person = await nameOf(tx, l.org.id, personId);
    // Authorisations recorded before Phase 3d could be keyed from a member's paper, and whoever keyed one is a hand behind it as well: two people act, never one (Phase 2b
    // review). None is recorded that way now, so for a new one this finds nobody; it stays for the rows that exist.
    const keyedBy = await loadRecorders(tx, l.org.id, [{ entity: "OpeningAuthorisation", slot: "person", ids: o.authorisations.map((a) => a.id) }]);
    const auths = o.authorisations.map((a) => ({ ...a, recordedByPersonId: keyedBy.get(recorderKey({ entity: "OpeningAuthorisation", slot: "person", id: a.id })) ?? null }));
    const fs = authorisationFaults({ state, panel: panelOf(o), auths, personId, recorderId: act.recorderId, now, closing: l.ex.closingAt, boxLocked: lockedAtOrAfterClosing(c.events, l.ex.closingAt), required: state.required });
    if (!person) fs.push({ code: "NOT_ON_PANEL", level: "block" });
    if (blocking(fs).length) return refuse(fs);
    // NFR-SIG-001: the seat the member authorised in is kept with the act (the opening's own panel row, never a code or a label chosen at the screen).
    const seat = o.panel.find((p) => p.personId === personId) ?? null;
    const row = await tx.openingAuthorisation.create({ data: { organisationId: l.org.id, openingId: o.id, personId, panelMemberId: seat?.id ?? null, sittingNo: state.sittingNo, recordedAt: now } });
    const after = unsealState(state.sittingNo, [...o.authorisations, { personId, sittingNo: state.sittingNo, recordedAt: now, lapsedAt: null }], panelOf(o), state.required);
    const opens = opensTheBox(state, after.count, state.required);
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.authorisation, row.id, openingLabel(l, o), "CREATE", diffFields(null, authorisationFields({ person: person!.name, at: now, sittingNo: state.sittingNo, opensTheBox: opens, seat: seat?.seatLabelSnapshot ?? null }, l.org.timeZone)));
    await act.write(tx, row.id, { document: { entity: "Opening", id: o.id } });
    if (!opens) return { ok: true, message: after.state === "AUTHORISED" ? "Recorded. Sitting authorised." : "Recorded. A second member must authorise." };
    await tx.opening.update({ where: { id: o.id, organisationId: actor.organisationId }, data: { unsealedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ opened: null }, { opened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at }));
    if (o.kind === "MAIN") {
      const ev = await tx.boxEvent.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, kind: "UNLOCKED_FOR_OPENING", occurredAt: now, personId, note: "Opened at the opening, on the second authorisation." } });
      await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.box, ev.id, label(l, "Tender box opened"), "CREATE", diffFields(null, { boxOpened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at, openedBy: person!.name }));
      await act.writeAlso(tx, "BoxEvent.person", ev.id);
      await moveExercise(tx, l.ex, "OPENING_IN_PROGRESS", { today: l.org.today, via: "UNSEAL", authorisations: after.count });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENING_IN_PROGRESS" }));
    }
    return { ok: true, message: o.kind === "MAIN" ? "Recorded. Box open." : "Recorded. Envelope may be opened." };
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
      return { ok: true, message: state.online ? `Resumed. All ${state.required} named officers authorise next.` : "Resumed. Two present members authorise next." };
    }
    const sitting = o.sittings.find((s) => s.sittingNo === state.sittingNo)!;
    await tx.openingSitting.update({ where: { id: sitting.id, organisationId: scope.organisationId }, data: { adjournedAt: now, adjournReason: reason } });
    await audit(tx, actor, l.org.id, OPENING_ENTITY.sitting, sitting.id, openingLabel(l, o), "UPDATE", diffFields({ adjourned: null }, sittingFields({ sittingNo: state.sittingNo, at: now, by: person!.name, adjourned: true, reason }, l.org.timeZone)), reason);
    const lapsing = lapsedByAdjourning(state.sittingNo, o.authorisations, panelOf(o), state.required);
    for (const id of lapsing) {
      await tx.openingAuthorisation.update({ where: { id, organisationId: scope.organisationId }, data: { lapsedAt: now } });
      await audit(tx, actor, l.org.id, OPENING_ENTITY.authorisation, id, openingLabel(l, o), "UPDATE", diffFields({ lapsed: null }, { lapsed: "Unpaired when the sitting was adjourned: kept, does not count again" }));
    }
    // C-2, ADR 0036 D10: the shares an unpaired online authorisation forwarded are shredded with it (kept, their sealed column set to NULL), so the next sitting starts from the officers' own shares.
    if (lapsing.length && l.ex.submissionChannel === "ONLINE") await shredReleases(tx, { organisationId: l.org.id, openingId: o.id, authorisationIds: lapsing, as: "lapsed", now });
    return { ok: true, message: state.online ? `Adjourned. Resuming needs ${state.required} fresh authorisations.` : "Adjourned. Resuming needs two fresh authorisations." };
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
    if (!w || !e) return { ok: false, message: "Withdrawal or envelope not found here." };
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
    // ADR 0036 D10: an online envelope is opened by the unseal, from its own sealed record, and never typed in.
    if (e?.channel === "ONLINE") return { ok: false, message: ONLINE_ENVELOPE_OPENED_BY_UNSEAL };
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
  // The column as the officer's screen showed it (security audit): read once, here, and judged against the locked row below.
  const seen = parseColumnBinding((n) => data.getAll(n));
  if (!seen.ok) return { ok: false, errors: seen.fields };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const online = l.ex.submissionChannel === "ONLINE";
    // Ruling 22, 20cp: a confirmation is a named, present officer's own act (online always; on paper it may be recorded for another officer present), never an administrator's, and only of a column that is complete and decided.
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const who = matrixActorFaults({ online, act: "CONFIRM", administrator: actor.isAdministrator, actorPersonId: actor.personId, subjectPersonId: personId, officers: panelOf(o).filter((p) => p.present).map((p) => p.personId) });
    if (blocking(who).length) return refuse(who);
    // A confirmation lands on the column the officer read, or on none: refused in words, before anything is written.
    const moved = columnBindingFaults({ seen: seen.value, current: bid });
    if (blocking(moved).length) return refuse(moved);
    const existing = bid.initials.find((i) => i.personId === personId) ?? null;
    // "Already" is judged on the current reading and the current column revision (plan §1.3).
    const standing = !!existing && confirmationStands(online, bid, existing);
    const fs = [...markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: standing, sameOpening: true }), ...confirmFaults({ tally: columnTally(checklist.items, new Map(bid.answers.map((a) => [a.itemKey, a.answer]))), verdict: bid.verdict })];
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    const name = o.panel.find((p) => p.personId === personId)!.person.name;
    if (existing) {
      const renewed = initialFields({ person: name, listingNo: bid.listingNo, at: now, revision: bid.columnRevision, decision: bid.verdict }, l.org.timeZone);
      await tx.openedBidInitial.update({ where: { id: existing.id, organisationId: actor.organisationId }, data: { recordedAt: now, correctionNo: bid.asReadCorrections, columnRevision: bid.columnRevision } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.initial, existing.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields({ initialled: renewedBefore(existing, bid), columnRevision: String(existing.columnRevision) }, { initialled: renewed.at, columnRevision: renewed.columnRevision, decision: renewed.decision }));
      await act.write(tx, existing.id);
    } else {
      const row = await tx.openedBidInitial.create({ data: { organisationId: l.org.id, openedBidId: bid.id, personId, recordedAt: now, correctionNo: bid.asReadCorrections, columnRevision: bid.columnRevision } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.initial, row.id, label(l, `Offer ${bid.listingNo}`), "CREATE", diffFields(null, initialFields({ person: name, listingNo: bid.listingNo, at: now, revision: bid.columnRevision, decision: bid.verdict }, l.org.timeZone)));
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
    const online = l.ex.submissionChannel === "ONLINE";
    // Ruling 22: an answer is a named, present officer's own act on both channels, never an administrator's. Refused in words, before anything is read again or written.
    const who = matrixActorFaults({ online, act: "ANSWER", administrator: actor.isAdministrator, actorPersonId: actor.personId, subjectPersonId: actor.personId, officers: panelOf(o).filter((p) => p.present).map((p) => p.personId) });
    if (blocking(who).length) return refuse(who);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const fs: Finding[] = [...actFaults(stateOf(o, l.ex.status)), ...answerFaults(checklist.items, itemKey, answer)];
    // Online, Present is refused on a part no file was received for (20cv): the cell is read from the frozen rules, as the screen reads it.
    if (online && !blocking(fs).length) {
      const cell = (await loadCellFacts(tx, { organisationId: l.org.id, exerciseId: l.ex.id, online, items: checklist.items, rules: l.ex.onlineBidRules, envelopeIds: [bid.envelopeId] })).get(bid.envelopeId)?.find((x) => x.itemKey === itemKey);
      if (cell) fs.push(...cellAnswerFaults(cell, answer!));
    }
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    const item = checklist.items.find((i) => i.key === itemKey)!;
    const before = bid.answers.find((a) => a.itemKey === itemKey) ?? null;
    if (before?.answer === answer) return { ok: true };
    const row = await tx.openingChecklistAnswer.upsert({ where: { openedBidId_itemKey: { openedBidId: bid.id, itemKey } }, create: { organisationId: l.org.id, openedBidId: bid.id, itemKey, itemLabelSnapshot: item.label, answer: answer!, recordedAt: now }, update: { answer: answer!, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.answer, row.id, label(l, `Offer ${bid.listingNo}`), before ? "UPDATE" : "CREATE", diffFields(before ? { ...answerFields({ item: item.label, answer: before.answer }), columnRevision: String(bid.columnRevision) } : null, { ...answerFields({ item: item.label, answer: answer! }), columnRevision: String(bid.columnRevision + 1) }));
    // Ruling 22: a changed answer raises the column's revision, once, whether or not it also clears the decision, so a confirmation taken before it is asked for again.
    if (!(before && bid.verdict)) await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { columnRevision: { increment: 1 } } });
    if (before && bid.verdict) {
      // R-7: the verdict's completeness record is cleared with it (database null), not left as it was.
      await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { verdict: null, verdictReason: "", verdictAt: null, completeness: Prisma.DbNull, columnRevision: { increment: 1 } } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields({ ...verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), columnRevision: String(bid.columnRevision) }, { verdict: "Cleared: a checklist answer changed; record it again", reason: null, columnRevision: String(bid.columnRevision + 1) }));
      return { ok: true, message: "Recorded. Verdict cleared. Record it again." };
    }
    return { ok: true };
  });
}


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
  // The column as the officer's screen showed it (security audit): judged against the locked row below.
  const seen = parseColumnBinding((n) => data.getAll(n));
  if (!seen.ok) return { ok: false, errors: seen.fields };
  return inOpening(actor, exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    // Ruling 22: a decision is a named, present officer's own act on both channels, never an administrator's.
    const who = matrixActorFaults({ online: l.ex.submissionChannel === "ONLINE", act: "DECIDE", administrator: actor.isAdministrator, actorPersonId: actor.personId, subjectPersonId: actor.personId, officers: panelOf(o).filter((p) => p.present).map((p) => p.personId) });
    if (blocking(who).length) return refuse(who);
    // A decision is recorded on the column the officer read, or on none: refused in words, before anything is read again or written.
    const moved = columnBindingFaults({ seen: seen.value, current: bid });
    if (blocking(moved).length) return refuse(moved);
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
    const SAVED_AGAIN = "Restriction re-read and saved. Verdict not recorded";
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
    await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { verdict, verdictReason: verdict === "REJECT" ? reason.trim() : "", verdictAt: now, completeness: verdictRecord(j) as unknown as Prisma.InputJsonValue, columnRevision: { increment: 1 } } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE",
      diffFields(bid.verdict ? { ...verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), recordedBy: null, columnRevision: String(bid.columnRevision) } : { verdict: null, recordedBy: null, columnRevision: String(bid.columnRevision) }, { ...verdictFields({ verdict, reason: verdict === "REJECT" ? reason.trim() : "", grounds: j.grounds, reported: j.reported, missing: j.missing.map((m) => m.label) }), recordedBy: person.name, columnRevision: String(bid.columnRevision + 1) }),
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
    const notPanel = panelActorFault(panelOf(o), actor.personId);
    if (notPanel) return { ok: false, message: notPanel };
    // Review S6: an online bid's price is not read before its finalising. Refused in words, before anything reads the price (which would throw).
    if (bid.priceAsRead == null) return refuse(correctionFaults({ state: stateOf(o, l.ex.status), sameOpening: !o.finalisedAt, reason, changed: true, price: offer.price, period: offer.period, priceRead: false }));
    const period = periodOf(offer.period);
    const was = { bidder: bid.bidderNameAsRead, registrationClass: bid.registrationClassAsRead, registrationStatus: bid.registrationStatusAsRead, price: parseSen(priceRead(bid).toString()), period: bid.completionPeriod != null && bid.completionUnit ? { value: bid.completionPeriod, unit: bid.completionUnit } : null, validityDays: bid.validityDaysStated };
    const next = { bidder: bidderName.trim(), registrationClass, registrationStatus, price: offer.price ?? (0n as Sen), period, validityDays: offer.validityDays };
    const changed = JSON.stringify(asReadFields(was)) !== JSON.stringify(asReadFields(next));
    const fs = correctionFaults({ state: stateOf(o, l.ex.status), sameOpening: !o.finalisedAt, reason, changed, price: offer.price, period: offer.period, priceRead: true });
    if (blocking(fs).length) return refuse(fs);
    // Ruling 17a: a restriction not yet assessed is read again each time the officer acts on the offer.
    await retakeRestriction(tx, actor, l, c, o, bid, now);
    await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: { bidderNameAsRead: next.bidder, registrationClassAsRead: registrationClass, registrationStatusAsRead: registrationStatus, priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays, asReadCorrectedAt: now, asReadCorrections: bid.asReadCorrections + 1 } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields(asReadFields(was), asReadFields(next)), reason);
    return { ok: true, message: "Corrected. Members initial again." };
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
    // Ruling 20t: an online opening is signed by each named officer in their own sign-in (signOnlineFinalise), never recorded for another and never from paper.
    if (l.ex.submissionChannel === "ONLINE") return { ok: false, message: ONLINE_SIGN_ELSEWHERE };
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
  return inOpening(actor, exerciseIdOf(data), now, (tx, l, c) => finaliseInTransaction(tx, l, c, { actor, act, now, openingId, personId, paperChoice, paperRaw, data, online: null }), { estimate: true });
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
