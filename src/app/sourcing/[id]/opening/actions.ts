"use server";

import type { Prisma } from "@/generated/prisma/client";
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
import { splitValues } from "@/lib/ui/select-logic";
import { answerFields, asReadFields, authorisationFields, finaliseFields, initialFields, openedBidFields, OPENING_ENTITY, openingStartFields, signatureFields, sittingFields, verdictFields, withdrawalMatchFields } from "@/lib/opening/audit-view";
import { boxEnvelopeJudgement, lockGap, registerBoxFaults } from "@/lib/opening/box";
import { answerFaults, checklistFromSnapshot, openingChecklist, unansweredItems } from "@/lib/opening/checklist";
import { DisclosureRefused, discloseAtFinalising } from "@/lib/opening/estimate";
import { explanationFaults, type PaperCopy } from "@/lib/opening/estimate-copy";
import { finaliseFaults, markFaults, recordFaults } from "@/lib/opening/finalise";
import { liveSaleOf, restrictionFinding, saleFinding } from "@/lib/opening/findings";
import { grandSummary } from "@/lib/opening/grand-summary";
import { freshInitials, initialStale } from "@/lib/opening/initials";
import { openingFindingText } from "@/lib/opening/labels";
import { lockOpenedBidRows, lockOpeningRows } from "@/lib/opening/lock";
import { alternativeInsideFaults, alternativeOf, correctionFaults, nextListingNo, openFaults } from "@/lib/opening/open";
import { panelFaults, supplementaryPanel } from "@/lib/opening/panel";
import { actFaults } from "@/lib/opening/state";
import { invitedCounts, openingContext, openingPolicyFrozen, panelOf, panelSnapshot, policyOf, presentOf, stateOf, summaryLabelsOf, type OpeningContext, type OpeningPolicySnapshot, type OpeningRow } from "@/lib/opening/repo";
import { unpurchasedRecordAudit, unpurchasedRule, type LiveUnpurchased } from "@/lib/opening/unpurchased";
import { jadualTawaran, lateCount, type ScheduleRowInput } from "@/lib/opening/schedule";
import { estimateLeadFaults, frozenRuleFaults, startFaults, supplementaryFaults } from "@/lib/opening/start";
import { blocking, CHECKLIST_ANSWERS, PERIOD_UNITS, type Finding, type OpeningVerdict, type PeriodUnit } from "@/lib/opening/types";
import { adjournFaults, authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "@/lib/opening/unseal";
import { judgeBid, verdictFaults, verdictRecord } from "@/lib/opening/verdict";
import { findingFaults, matchFaults, openFault } from "@/lib/opening/withdrawals";

import { activePerson, audit, exerciseIdOf, inWindow, label, Refusal, type LockedWindow } from "../window/shared";

/**
 * Writes for 6.7's opening (plan §4, as ruled C-1..C-13). Each runs in one transaction that locks the
 * exercise's requisition, the exercise and its window (`inWindow`), then the exercise's openings, (for
 * finalising) its live estimate, its envelopes, withdrawals and box events, and its opened bids, in
 * that order (`src/lib/opening/lock.ts`); re-reads everything the rules judge under those locks
 * (`openingContext`) and re-runs the pure rule on the locked data. The server's clock is read once,
 * at the act's entry, before any lock, truncated to the second (6.6 CR-3). Every write is audited
 * before and after in the same transaction. People are recorded on their behalf, not signed (ADR
 * 0017). Codes go back, never figures: no refusal names a price or the estimate.
 */

const stampNow = () => toSecond(new Date());

const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${blocking(fs).map(openingFindingText).join(" ")}` });
const warnings = (fs: readonly Finding[]) => fs.filter((f) => f.level !== "block").map(openingFindingText).join(" ");
const GONE_OPENING: FormState = { ok: false, message: "That opening is not on this exercise." };
const GONE_BID: FormState = { ok: false, message: "That offer is not on this exercise." };

/// Run an opening write with every lock its order asks for, and the context read under them.
async function inOpening(exerciseId: string, now: Date, fn: (tx: Tx, l: LockedWindow, c: OpeningContext) => Promise<FormState>, opts: { estimate?: boolean } = {}): Promise<FormState> {
  return inWindow(exerciseId, async (tx, l) => {
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
  const now = stampNow();
  const r = new FormReader(data);
  const startedByPersonId = r.optionalText("startedByPersonId");
  const overrideAuthority = r.text("panelOverrideAuthority", "Authority", { max: 300 });
  const overrideReason = r.text("panelOverrideReason", "Reason", { max: 1000 });
  const overridePersonId = r.optionalText("panelOverrideByPersonId");
  const lateOverridePersonId = r.optionalText("lateOverridePersonId");
  const lateOverrideReason = r.text("lateOverrideReason", "Why the late estimate is accepted", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const picks = readPanel(data);
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const person = await nameOf(tx, l.org.id, startedByPersonId);
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
    await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: opening.id, sittingNo: 1, startedAt: now, recordedByPersonId: person!.id } });
    for (const p of picked) {
      const seat = c.seats.find((s) => s.personId === p.personId)!;
      await tx.openingPanelMember.create({ data: { organisationId: l.org.id, openingId: opening.id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    await audit(tx, l.org.id, OPENING_ENTITY.opening, opening.id, label(l, "Opening"), "CREATE",
      diffFields(null, openingStartFields({ kind: "MAIN", committee: c.committee!.nameEn, panel: picked, startedAt: now, startedBy: person!.name, panelOverride: panelOverride ? { authority: panelOverride.authority, reason: panelOverride.reason, by: panelOverride.by.name } : null, independence: pf.some((f) => f.code === "EXCLUSION_RULE_NOT_SET") ? "Independence rule not set; panel not checked" : c.committee!.panelExclusionRule ? "Checked against the committee's independence rule" : "No independence rule applies", estimateLead: est.outcome === "OVERRIDDEN" ? "Late, accepted on an override" : est.outcome === "READY" ? "In time" : est.outcome === "VOLUNTARY" ? "Not required; one was lodged" : "Not required", boxLockedAt: c.lockEvent?.occurredAt ?? null, lockGap: gap?.text ?? null }, l.org.timeZone)),
      panelOverride?.reason ?? "");
    // FR-EST-007: the override is 6.2's LATE_OVERRIDE custody event, frozen with the opening.
    if (est.outcome === "OVERRIDDEN" && c.estimate) {
      const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: c.estimate.id, kind: "LATE_OVERRIDE", personId: overrider!.id, capacity: "At the opening", note: lateOverrideReason, versionNo: c.estimate.currentVersionNo, at: now } });
      await audit(tx, l.org.id, SCOPE_ENTITY.estimateEvent, ev.id, label(l, "Company estimate · late, overridden"), "CREATE", estimateEventAudit({ kind: "LATE_OVERRIDE", personName: overrider!.name, capacity: "At the opening", versionNo: c.estimate.currentVersionNo, reason: lateOverrideReason }), lateOverrideReason);
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
  const now = stampNow();
  const r = new FormReader(data);
  const decisionId = r.text("decisionId", "Admission", { required: true });
  const startedByPersonId = r.optionalText("startedByPersonId");
  const overrideAuthority = r.text("panelOverrideAuthority", "Authority", { max: 300 });
  const overrideReason = r.text("panelOverrideReason", "Reason", { max: 1000 });
  const overridePersonId = r.optionalText("panelOverrideByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  const picks = readPanel(data);
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const person = await nameOf(tx, l.org.id, startedByPersonId);
    const decision = await tx.committeeDecision.findFirst({ where: { id: decisionId, bidEnvelope: { exerciseId: l.ex.id } }, select: { id: true, matterKind: true, outcome: true, bidEnvelopeId: true, withdrawnAt: true, meeting: { select: { reference: true } } } });
    const envelope = decision?.bidEnvelopeId ? (c.envelopes.find((e) => e.id === decision.bidEnvelopeId) ?? null) : null;
    const sf = supplementaryFaults({ status: l.ex.status, mainFinalised: !!c.main?.finalisedAt, decision: decision && !decision.withdrawnAt ? { matterKind: decision.matterKind ?? "", outcome: decision.outcome, bidEnvelopeId: decision.bidEnvelopeId } : null, alreadyOpened: c.openings.some((o) => o.admissionDecisionId === decisionId), envelope: envelope ? { status: envelope.status, late: envelope.late } : null, personActive: !!person });
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
    await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: opening.id, sittingNo: 1, startedAt: now, recordedByPersonId: person!.id } });
    for (const p of picked) {
      const seat = c.mainSeats.find((s) => s.personId === p.personId)!;
      await tx.openingPanelMember.create({ data: { organisationId: l.org.id, openingId: opening.id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    await audit(tx, l.org.id, OPENING_ENTITY.opening, opening.id, label(l, `Supplementary opening ${sequenceNo - 1}`), "CREATE",
      diffFields(null, { ...openingStartFields({ kind: "SUPPLEMENTARY", committee: committee!.nameEn, panel: picked, startedAt: now, startedBy: person!.name, panelOverride: panelOverride ? { authority: panelOverride.authority, reason: panelOverride.reason, by: panelOverride.by.name } : null, independence: pf.some((f) => f.code === "EXCLUSION_RULE_NOT_SET") ? "Independence rule not set; panel not checked" : "As the committee's rule", estimateLead: "Not judged: the estimate was disclosed at the main opening", boxLockedAt: null, lockGap: null }, l.org.timeZone), admittedBy: decision!.meeting.reference, envelope: envelope ? `Envelope ${envelope.sequence}` : null }),
      panelOverride?.reason ?? "");
    return { ok: true, message: `Supplementary opening started. Two panel members present now each authorise it.${warnings(pf) ? ` ${warnings(pf)}` : ""}` };
  });
}

// ------------------------------------------------------------------ authorisations, adjourning (plan §4.2, C-2)

/// One panel member's authorisation, stamped now. The second distinct present member's opens the box (MAIN) and the exercise is then Opening in progress.
export async function recordAuthorisation(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const personId = String(data.get("personId") ?? "");
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const state = stateOf(o, l.ex.status);
    const person = await nameOf(tx, l.org.id, personId);
    const fs = authorisationFaults({ state, panel: panelOf(o), auths: o.authorisations, personId, now, closing: l.ex.closingAt, boxLocked: lockedAtOrAfterClosing(c.events, l.ex.closingAt) });
    if (!person) fs.push({ code: "NOT_ON_PANEL", level: "block" });
    if (blocking(fs).length) return refuse(fs);
    const row = await tx.openingAuthorisation.create({ data: { organisationId: l.org.id, openingId: o.id, personId, sittingNo: state.sittingNo, recordedAt: now } });
    const after = unsealState(state.sittingNo, [...o.authorisations, { personId, sittingNo: state.sittingNo, recordedAt: now, lapsedAt: null }], panelOf(o));
    const opens = opensTheBox(state, after.count);
    await audit(tx, l.org.id, OPENING_ENTITY.authorisation, row.id, openingLabel(l, o), "CREATE", diffFields(null, authorisationFields({ person: person!.name, at: now, sittingNo: state.sittingNo, opensTheBox: opens }, l.org.timeZone)));
    if (!opens) return { ok: true, message: after.state === "AUTHORISED" ? "Recorded. The sitting is authorised: the opening may continue." : "Recorded. A second panel member present now authorises it." };
    await tx.opening.update({ where: { id: o.id }, data: { unsealedAt: now } });
    await audit(tx, l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ opened: null }, { opened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at }));
    if (o.kind === "MAIN") {
      const ev = await tx.boxEvent.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, kind: "UNLOCKED_FOR_OPENING", occurredAt: now, personId, note: "Opened at the opening, on the second authorisation." } });
      await audit(tx, l.org.id, BID_ENTITY.box, ev.id, label(l, "Tender box opened"), "CREATE", diffFields(null, { boxOpened: authorisationFields({ person: person!.name, at: now, sittingNo: 1, opensTheBox: true }, l.org.timeZone).at, openedBy: `${person!.name} (recorded on their behalf, not signed)` }));
      await moveExercise(tx, l.ex, "OPENING_IN_PROGRESS", { today: l.org.today, via: "UNSEAL", authorisations: after.count });
      await audit(tx, l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENING_IN_PROGRESS" }));
    }
    return { ok: true, message: o.kind === "MAIN" ? "Recorded. The box is opened: register the envelopes found in it, then open them." : "Recorded. The admitted envelope may now be opened." };
  });
}

/// FR-OPN-011, C-2: adjourn, with the reason; an unpaired authorisation of the sitting lapses (kept).
export async function adjournOpening(_prev: FormState, data: FormData): Promise<FormState> {
  return sittingAct(data, false);
}

/// Resume an adjourned opening: a new sitting, which needs two fresh authorisations.
export async function resumeOpening(_prev: FormState, data: FormData): Promise<FormState> {
  return sittingAct(data, true);
}

async function sittingAct(data: FormData, resume: boolean): Promise<FormState> {
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 1000);
  const personId = String(data.get("personId") ?? "") || null;
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const state = stateOf(o, l.ex.status);
    const person = await nameOf(tx, l.org.id, personId);
    const fs = adjournFaults({ state, reason, personActive: !!person, resume });
    if (fs.length) return fs.some((f) => f.code === "REASON_REQUIRED") && fs.length === 1 ? { ok: false, errors: { reason: openingFindingText(fs[0]) } } : refuse(fs);
    if (resume) {
      const row = await tx.openingSitting.create({ data: { organisationId: l.org.id, openingId: o.id, sittingNo: state.sittingNo + 1, startedAt: now, resumeReason: reason, recordedByPersonId: person!.id } });
      await audit(tx, l.org.id, OPENING_ENTITY.sitting, row.id, openingLabel(l, o), "CREATE", diffFields(null, sittingFields({ sittingNo: state.sittingNo + 1, at: now, by: person!.name, adjourned: false, reason }, l.org.timeZone)), reason);
      return { ok: true, message: "Resumed. Two panel members present now each authorise the new sitting." };
    }
    const sitting = o.sittings.find((s) => s.sittingNo === state.sittingNo)!;
    await tx.openingSitting.update({ where: { id: sitting.id }, data: { adjournedAt: now, adjournReason: reason } });
    await audit(tx, l.org.id, OPENING_ENTITY.sitting, sitting.id, openingLabel(l, o), "UPDATE", diffFields({ adjourned: null }, sittingFields({ sittingNo: state.sittingNo, at: now, by: person!.name, adjourned: true, reason }, l.org.timeZone)), reason);
    for (const id of lapsedByAdjourning(state.sittingNo, o.authorisations, panelOf(o))) {
      await tx.openingAuthorisation.update({ where: { id }, data: { lapsedAt: now } });
      await audit(tx, l.org.id, OPENING_ENTITY.authorisation, id, openingLabel(l, o), "UPDATE", diffFields({ lapsed: null }, { lapsed: "Unpaired when the sitting was adjourned: kept, does not count again" }));
    }
    return { ok: true, message: "Adjourned. Nothing recorded is lost; resuming needs two fresh authorisations." };
  });
}

// ------------------------------------------------------------------ the box and withdrawals (plan §4.3)

/// OD-4, C-3: register an envelope found in the box, after it is opened and before any is opened; in time by the lock.
export async function registerBoxEnvelope(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const kind = r.choice("kind", "Envelope", ["BID", "ALTERNATIVE"] as const, { required: true });
  const markings = r.text("markings", "Markings", { required: true, max: 1000 });
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
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
    await audit(tx, l.org.id, BID_ENTITY.envelope, row.id, label(l, `Envelope ${sequence}`), "CREATE", diffFields(null, envelopeFields({ ...row, receivedBy: person!.name, parentSequence: null }, l.org.timeZone)));
    return { ok: true, message: `Envelope ${sequence} registered from the box (${ENVELOPE_KIND_LABEL[kind!].toLowerCase()}).` };
  });
}

/// X-11: match a withdrawal to the envelope in the box it withdraws; the envelope is then never opened.
export async function matchWithdrawal(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const withdrawalId = String(data.get("withdrawalId") ?? "");
  const envelopeId = String(data.get("envelopeId") ?? "");
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const w = c.withdrawals.find((x) => x.id === withdrawalId);
    const e = c.envelopes.find((x) => x.id === envelopeId);
    if (!w || !e) return { ok: false, message: "That withdrawal or envelope is not on this exercise." };
    const facts = c.withdrawals.map((x) => ({ id: x.id, envelopeId: x.envelopeId, unmatchedFinding: x.unmatchedFinding }));
    const fs = matchFaults({ state: stateOf(o, l.ex.status), withdrawal: facts.find((x) => x.id === w.id)!, envelope: { id: e.id, kind: e.kind, status: e.status, late: e.late, receivedSource: e.receivedSource }, withdrawals: facts });
    if (blocking(fs).length) return refuse(fs);
    await tx.bidWithdrawal.update({ where: { id: w.id }, data: { envelopeId: e.id } });
    await audit(tx, l.org.id, BID_ENTITY.withdrawal, w.id, label(l, "Withdrawal of an envelope in the box"), "UPDATE", diffFields({ matchedTo: null }, withdrawalMatchFields({ envelope: `Envelope ${e.sequence}` })));
    const moved = await tx.bidEnvelope.updateMany({ where: { id: e.id, status: "RECEIVED" }, data: { status: "WITHDRAWN" } });
    if (moved.count !== 1) return { ok: false, message: "The envelope changed while this was being saved. Reload and try again." };
    await audit(tx, l.org.id, BID_ENTITY.envelope, e.id, label(l, `Envelope ${e.sequence}`), "UPDATE", diffFields(statusField("RECEIVED"), statusField("WITHDRAWN")));
    return { ok: true, message: `Envelope ${e.sequence} is withdrawn and will not be opened.` };
  });
}

/// X-11: what the panel found of a withdrawal no envelope in the box matched.
export async function recordWithdrawalFinding(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const withdrawalId = r.text("withdrawalId", "Withdrawal", { required: true });
  const finding = r.text("finding", "What the panel found", { required: true, max: 2000 });
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const w = c.withdrawals.find((x) => x.id === withdrawalId);
    if (!w) return { ok: false, message: "That withdrawal is not on this exercise." };
    const person = await nameOf(tx, l.org.id, personId);
    const fs = findingFaults({ state: stateOf(o, l.ex.status), withdrawal: { id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding }, finding, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    await tx.bidWithdrawal.update({ where: { id: w.id }, data: { unmatchedFinding: finding, findingRecordedAt: now, findingByPersonId: person!.id } });
    await audit(tx, l.org.id, BID_ENTITY.withdrawal, w.id, label(l, "Withdrawal of an envelope in the box"), "UPDATE", diffFields({ finding: null }, withdrawalMatchFields({ envelope: "", finding, by: person!.name })));
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
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
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
    });
    if (blocking(fs).length) return refuse(fs);
    const bidder = party ?? (await tx.exerciseParty.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, source: "BIDDER_AT_OPENING", name: bidderName.trim(), registrationNo: registrationNo.trim() } }));
    if (!party) await audit(tx, l.org.id, "ExerciseParty", bidder.id, label(l, `Party · ${bidder.name}`), "CREATE", diffFields(null, { party: bidder.name, registrationNo: bidder.registrationNo, cameAs: "Named at opening, from its bid" }));
    const sale = saleFinding(bidder.id, c.sales, snap.path, c.invitedPartyIds);
    const restriction = restrictionFinding(snap.restrictedTender, liveSaleOf(bidder.id, c.sales), c.closingDay ?? "");
    if ("fault" in restriction) return refuse([restriction.fault]);
    const listingNo = nextListingNo(c.openings.flatMap((x) => x.bids.map((b) => b.listingNo)));
    const alternative = alternativeOf(isAlternative, snap.alternativesPermitted);
    const period = periodOf(offer.period);
    const bid = await tx.openedBid.create({
      data: {
        organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, envelopeId: e!.id, listingNo, partyId: bidder.id, openedAt: now,
        bidderNameAsRead: party ? (bidderName.trim() || party.name) : bidder.name, registrationClassAsRead: registrationClass, registrationStatusAsRead: registrationStatus,
        priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays,
        isAlternative, parentOpenedBidId: parent?.id ?? null, alternativeStatus: alternative, saleFinding: sale, restrictionFinding: restriction.finding,
      },
    });
    // OD-2, C-10: the one writer of an envelope's party, at its opening.
    const moved = await tx.bidEnvelope.updateMany({ where: { id: e!.id, status: "RECEIVED" }, data: { status: "OPENED", partyId: bidder.id } });
    if (moved.count !== 1) return { ok: false, message: "The envelope changed while this was being saved. Reload and try again." };
    await audit(tx, l.org.id, BID_ENTITY.envelope, e!.id, label(l, `Envelope ${e!.sequence}`), "UPDATE", diffFields({ ...statusField("RECEIVED"), bidder: null }, { ...statusField("OPENED"), bidder: bidder.name }));
    await audit(tx, l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${listingNo}`), "CREATE",
      diffFields(null, openedBidFields({ listingNo, envelope: `Envelope ${e!.sequence}`, bidder: bid.bidderNameAsRead, registrationClass, registrationStatus, price: offer.price!, period, validityDays: offer.validityDays, alternative, parentListingNo: parent?.listingNo ?? null, sale, restriction: restriction.finding, at: now }, l.org.timeZone)));
    return { ok: true, message: `Opened as No. ${listingNo}. Each panel member present now initials it, and its checklist is answered.` };
  });
}

/// FR-BID-006: an alternative offer found inside an envelope already opened at this opening.
export async function recordAlternative(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const mainBidId = r.text("openedBidId", "Offer", { required: true });
  const offer = readOffer(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
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
      },
    });
    await audit(tx, l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${listingNo}`), "CREATE",
      diffFields(null, openedBidFields({ listingNo, envelope: `Envelope ${main.envelope.sequence}`, bidder: main.bidderNameAsRead, registrationClass: main.registrationClassAsRead, registrationStatus: main.registrationStatusAsRead, price: offer.price!, period, validityDays: offer.validityDays, alternative, parentListingNo: main.listingNo, sale: main.saleFinding, restriction: main.restrictionFinding, at: now }, l.org.timeZone)));
    return { ok: true, message: `Recorded as No. ${listingNo}, an alternative to No. ${main.listingNo}.` };
  });
}

// ------------------------------------------------------------------ initials, checklist, verdicts, corrections (plan §4.5)

/// FR-OPN-006: a present member's initial on an offer as read (after its last correction).
export async function recordInitial(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const bidId = String(data.get("openedBidId") ?? "");
  const personId = String(data.get("personId") ?? "");
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const existing = bid.initials.find((i) => i.personId === personId) ?? null;
    const stale = !!existing && initialStale(bid, existing);
    const fs = markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: !!existing && !stale, sameOpening: true });
    if (blocking(fs).length) return refuse(fs);
    const name = o.panel.find((p) => p.personId === personId)!.person.name;
    if (existing) {
      await tx.openedBidInitial.update({ where: { id: existing.id }, data: { recordedAt: now, correctionNo: bid.asReadCorrections } });
      await audit(tx, l.org.id, OPENING_ENTITY.initial, existing.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields({ initialled: "Before the correction" }, { initialled: initialFields({ person: name, listingNo: bid.listingNo, at: now }, l.org.timeZone).at }));
    } else {
      const row = await tx.openedBidInitial.create({ data: { organisationId: l.org.id, openedBidId: bid.id, personId, recordedAt: now, correctionNo: bid.asReadCorrections } });
      await audit(tx, l.org.id, OPENING_ENTITY.initial, row.id, label(l, `Offer ${bid.listingNo}`), "CREATE", diffFields(null, initialFields({ person: name, listingNo: bid.listingNo, at: now }, l.org.timeZone)));
    }
    return { ok: true };
  });
}

/// FR-OPN-008: one checklist item for one offer. A changed answer clears the offer's verdict, which is recorded again.
export async function recordChecklistAnswer(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const itemKey = r.text("itemKey", "Item", { required: true });
  const answer = r.choice("answer", "Answer", CHECKLIST_ANSWERS, { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const fs = [...actFaults(stateOf(o, l.ex.status)), ...answerFaults(checklist.items, itemKey, answer)];
    if (blocking(fs).length) return refuse(fs);
    const item = checklist.items.find((i) => i.key === itemKey)!;
    const before = bid.answers.find((a) => a.itemKey === itemKey) ?? null;
    if (before?.answer === answer) return { ok: true };
    const row = await tx.openingChecklistAnswer.upsert({ where: { openedBidId_itemKey: { openedBidId: bid.id, itemKey } }, create: { organisationId: l.org.id, openedBidId: bid.id, itemKey, itemLabelSnapshot: item.label, answer: answer!, recordedAt: now }, update: { answer: answer!, recordedAt: now } });
    await audit(tx, l.org.id, OPENING_ENTITY.answer, row.id, label(l, `Offer ${bid.listingNo}`), before ? "UPDATE" : "CREATE", diffFields(before ? answerFields({ item: item.label, answer: before.answer }) : null, answerFields({ item: item.label, answer: answer! })));
    if (before && bid.verdict) {
      await tx.openedBid.update({ where: { id: bid.id }, data: { verdict: null, verdictReason: "", verdictAt: null, completeness: undefined } });
      await audit(tx, l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields(verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), { verdict: "Cleared: a checklist answer changed; record it again", reason: null }));
      return { ok: true, message: "Recorded. The answer changed, so the offer's verdict is cleared: record it again." };
    }
    return { ok: true };
  });
}

/// The method's unpurchased-bid rule as it stands now (OD-4), for an opening that froze it unset.
const liveUnpurchased = (c: OpeningContext): LiveUnpurchased => ({ consequence: c.method?.unpurchasedBidConsequence ?? null, provenance: (c.method?.unpurchasedProvenance as OpeningPolicySnapshot["unpurchased"]["provenance"]) ?? null });

/// FR-OPN-008, 009, R12, OD-4: the verdict on one offer, on the grounds the rules make eliminatory only.
export async function recordVerdict(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const verdict = r.choice("verdict", "Verdict", ["PASS", "REJECT"] as const, { required: true }) as OpeningVerdict | null;
  const reason = r.text("verdictReason", "Reason", { max: 2000 });
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    // S-3: who records the verdict is named, so a rule recorded with it says by whom.
    const person = await nameOf(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { personId: openingFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const answers = new Map(bid.answers.map((a) => [a.itemKey, a.answer]));
    const unpurchased = unpurchasedRule(snap, liveUnpurchased(c), now, person.name);
    const policy = { completenessEliminates: snap.completeness.eliminates, unpurchased: unpurchased.consequence };
    const facts = { saleFinding: bid.saleFinding, restrictionFinding: bid.restrictionFinding, isAlternative: bid.isAlternative, alternativeStatus: bid.alternativeStatus };
    const fs = verdictFaults({ state: stateOf(o, l.ex.status), sameOpening: true, bid: facts, checklist, answers, policy, verdict, reason });
    if (blocking(fs).length) return fs.length === 1 && fs[0].code === "REASON_REQUIRED" ? { ok: false, errors: { verdictReason: openingFindingText(fs[0]) } } : refuse(fs);
    const j = judgeBid(facts, checklist, answers, policy);
    // OD-4: an unset unpurchased rule, set since the opening started, is recorded on the opening once, the first time it is used.
    if (unpurchased.record && bid.saleFinding !== "LIVE_SALE") {
      await tx.opening.update({ where: { id: o.id }, data: { policySnapshot: unpurchased.record as unknown as Prisma.InputJsonValue } });
      const a = unpurchasedRecordAudit(unpurchased.consequence!, now, person.name, l.org.timeZone);
      await audit(tx, l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields(a.before, a.after));
    }
    await tx.openedBid.update({ where: { id: bid.id }, data: { verdict, verdictReason: verdict === "REJECT" ? reason.trim() : "", verdictAt: now, completeness: verdictRecord(j) as unknown as Prisma.InputJsonValue } });
    await audit(tx, l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE",
      diffFields(bid.verdict ? { ...verdictFields({ verdict: bid.verdict, reason: bid.verdictReason, grounds: [], reported: [], missing: [] }), recordedBy: null } : { verdict: null, recordedBy: null }, { ...verdictFields({ verdict, reason: verdict === "REJECT" ? reason.trim() : "", grounds: j.grounds, reported: j.reported, missing: j.missing.map((m) => m.label) }), recordedBy: `${person.name} (recorded on their behalf, not signed)` }),
      verdict === "REJECT" ? reason.trim() : "");
    return { ok: true };
  });
}

/// OD-10: correct a keying slip in what was read, before finalising, with the reason, audited before and after. Initials are taken again.
export async function correctAsRead(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const bidId = r.text("openedBidId", "Offer", { required: true });
  const bidderName = r.text("bidderName", "Bidder's name as read", { required: true, max: 400 });
  const registrationClass = r.text("registrationClass", "Registration class as read", { max: 120 });
  const registrationStatus = r.text("registrationStatus", "Registration status as read", { max: 120 });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  const offer = readOffer(r);
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const found = bidOf(c, bidId);
    if (!found) return GONE_BID;
    const { opening: o, bid } = found;
    const period = periodOf(offer.period);
    const was = { bidder: bid.bidderNameAsRead, registrationClass: bid.registrationClassAsRead, registrationStatus: bid.registrationStatusAsRead, price: parseSen(bid.priceAsRead.toString()), period: bid.completionPeriod != null && bid.completionUnit ? { value: bid.completionPeriod, unit: bid.completionUnit } : null, validityDays: bid.validityDaysStated };
    const next = { bidder: bidderName.trim(), registrationClass, registrationStatus, price: offer.price ?? (0n as Sen), period, validityDays: offer.validityDays };
    const changed = JSON.stringify(asReadFields(was)) !== JSON.stringify(asReadFields(next));
    const fs = correctionFaults({ state: stateOf(o, l.ex.status), sameOpening: !o.finalisedAt, reason, changed, price: offer.price, period: offer.period });
    if (blocking(fs).length) return refuse(fs);
    await tx.openedBid.update({ where: { id: bid.id }, data: { bidderNameAsRead: next.bidder, registrationClassAsRead: registrationClass, registrationStatusAsRead: registrationStatus, priceAsRead: senToDecimalString(offer.price!), completionPeriod: period?.value ?? null, completionUnit: period?.unit ?? null, validityDaysStated: offer.validityDays, asReadCorrectedAt: now, asReadCorrections: bid.asReadCorrections + 1 } });
    await audit(tx, l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields(asReadFields(was), asReadFields(next)), reason);
    return { ok: true, message: "Corrected. Each panel member present initials it again." };
  });
}

// ------------------------------------------------------------------ the schedule's paper (plan §4.7)

/// FR-OPN-006: a present member's signature on the paper schedule, with the paper's day.
export async function recordSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const personId = String(data.get("personId") ?? "");
  const signedOn = String(data.get("signedOn") ?? "");
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const startDay = l.org.timeZone ? dayIn(o.startedAt, l.org.timeZone) : null;
    const fs = markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: o.signatures.some((s) => s.personId === personId), sameOpening: true, signedOn: { day: isDay(signedOn) ? signedOn : null, today: l.org.today, startDay } });
    if (blocking(fs).length) return refuse(fs);
    const name = o.panel.find((p) => p.personId === personId)!.person.name;
    const row = await tx.openingSignature.create({ data: { organisationId: l.org.id, openingId: o.id, personId, signedOn: dayToDate(signedOn), recordedAt: now } });
    await audit(tx, l.org.id, OPENING_ENTITY.signature, row.id, openingLabel(l, o), "CREATE", diffFields(null, signatureFields({ person: name, signedOn })));
    return { ok: true };
  });
}

/// FR-OPN-005 (OD-9): the signed schedule's pages, and the minutes.
export async function recordScheduleDetails(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const pages = r.int("schedulePages", "Pages of the signed schedule", { required: true, min: 1 });
  const minutes = r.text("minutes", "Minutes", { max: 20000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const fs = recordFaults({ state: stateOf(o, l.ex.status), pages });
    if (blocking(fs).length) return refuse(fs);
    await tx.opening.update({ where: { id: o.id }, data: { schedulePages: pages, minutes } });
    await audit(tx, l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ pages: o.schedulePages == null ? null : String(o.schedulePages), minutes: o.minutes || null }, { pages: String(pages), minutes: minutes || null }));
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
  const now = stampNow();
  const openingId = String(data.get("openingId") ?? "");
  const personId = String(data.get("personId") ?? "") || null;
  const paperChoice = String(data.get("paperCopy") ?? "");
  const paperRaw = String(data.get("paperFigure") ?? "");
  const paperAnswered = paperChoice === "notInBox" || (paperChoice === "figure" && paperRaw.trim() !== "");
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await nameOf(tx, l.org.id, personId);
    const state = stateOf(o, l.ex.status);
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const unpurchased = unpurchasedRule(snap, liveUnpurchased(c), now, person?.name ?? "");
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
        disclosed = await discloseAtFinalising(tx, { organisationId: l.org.id, reference: l.ex.reference, facts: c.estimateFacts, at: now, person: person!, paper, benchmarkLabelEn: c.scopePolicy.benchmarkLabelEn });
      } catch (e) {
        // R-1: thrown as a Refusal, so anything written in this transaction rolls back with it.
        if (e instanceof DisclosureRefused) throw new Refusal({ ok: false, message: "Nothing was saved: the company estimate could not be disclosed as it stands. Check its state on the Scope and estimate tab." });
        throw e;
      }
    }
    // The schedule: every offer read up to this opening, in opening order (OD-5 versions).
    const rows: ScheduleRowInput[] = c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, price: parseSen(b.priceAsRead.toString()), period: b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null, isAlternative: b.isAlternative, parentListingNo: b.parentOpenedBid?.listingNo ?? null, openingSequence: x.sequenceNo })));
    const mainSchedule = o.kind === "SUPPLEMENTARY" ? c.main?.scheduleSnapshot : null;
    const priorBenchmark = mainSchedule && typeof mainSchedule === "object" && !Array.isArray(mainSchedule) ? ((mainSchedule as Record<string, unknown>).benchmark as { sealed: false; label: string | null; companyEstimate: string } | { notRequired: true } | undefined) : undefined;
    const benchmark = disclosed?.benchmark ? { sealed: false as const, label: disclosed.benchmark.label, value: disclosed.benchmark.value } : priorBenchmark && "companyEstimate" in priorBenchmark ? { sealed: false as const, label: priorBenchmark.label, value: parseSen(priorBenchmark.companyEstimate) } : { notRequired: true as const };
    const gap = c.main?.lockGapSeconds != null && o.kind === "MAIN" && c.main.boxLockedAt && l.ex.closingAt ? lockGap(l.ex.closingAt, c.main.boxLockedAt) : null;
    const { schedule } = jadualTawaran({ version: o.sequenceNo, title: l.ex.title, reference: l.ex.reference, startDay: l.ex.tenderingStartOn ? storedDay(l.ex.tenderingStartOn) : null, closing: l.ex.closingAt, invited: { reading: snap.invited.reading, ...invitedCounts(c) }, lateCount: lateCount(c.envelopes), pages: o.schedulePages, rows, benchmark, lockGap: gap });
    const verdicts = new Map(c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => [b.id, b.verdict] as const)));
    const summary = grandSummary({ finalised: true, bids: c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, price: parseSen(b.priceAsRead.toString()), verdict: verdicts.get(b.id) ?? null }))), labels: summaryLabelsOf(snap) });
    if (!("summary" in summary)) return refuse([summary.fault]);
    const lodged = disclosed?.lodged ?? null;
    // R-4: the unpurchased rule is recorded at finalising only where an offer needs it, audited with it.
    const recordRule = unpurchased.record && o.bids.some((b) => b.saleFinding !== "LIVE_SALE") ? unpurchased.record : null;
    await tx.opening.update({
      where: { id: o.id },
      data: {
        finalisedAt: now,
        scheduleSnapshot: { ...schedule, invitedReadingProvenance: snap.invited.provenance } as unknown as Prisma.InputJsonValue,
        grandSummarySnapshot: summary.summary as unknown as Prisma.InputJsonValue,
        faultsSnapshot: fs.filter((f) => f.level !== "block") as unknown as Prisma.InputJsonValue,
        ...(recordRule ? { policySnapshot: recordRule as unknown as Prisma.InputJsonValue } : {}),
        estimatePaperAmount: disclosed?.paper != null ? senToDecimalString(disclosed.paper) : null,
        estimateLodgedAmount: disclosed && disclosed.check ? senToDecimalString(lodged!) : null,
        estimateCopyCheck: disclosed?.check ?? null,
      },
    });
    if (recordRule) {
      const a = unpurchasedRecordAudit(unpurchased.consequence!, now, person!.name, l.org.timeZone);
      await audit(tx, l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields(a.before, a.after));
    }
    await audit(tx, l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ finalised: null }, finaliseFields({ at: now, by: person!.name, pages: o.schedulePages!, rows: schedule.rows.length, copy: disclosed?.check ?? null, paper: disclosed?.paper ?? null, lodged, disclosed: !!disclosed }, l.org.timeZone)));
    if (o.kind === "MAIN") {
      await moveExercise(tx, l.ex, "OPENED", { today: l.org.today, via: "OPENING_FINALISED", finaliseFaults: 0 });
      await audit(tx, l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENED" }));
    }
    const copy = disclosed?.check === "MISMATCH" || disclosed?.check === "NOT_IN_BOX" ? " The estimate's paper copy is recorded as a finding to explain on the Schedule section." : "";
    return { ok: true, message: `Finalised. Attach the signed schedule's scan on the Schedule section.${copy}` };
  }, { estimate: true });
}

/// C-1: the explanation of a MISMATCH or NOT_IN_BOX copy finding, once, never edited.
export async function recordCopyExplanation(_prev: FormState, data: FormData): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const openingId = r.text("openingId", "Opening", { required: true });
  const explanation = r.text("explanation", "Explanation", { required: true, max: 4000 });
  const personId = r.optionalText("personId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inOpening(exerciseIdOf(data), now, async (tx, l, c) => {
    const o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await nameOf(tx, l.org.id, personId);
    const fs = explanationFaults({ finalised: !!o.finalisedAt, check: o.estimateCopyCheck, explained: !!o.copyExplanation, text: explanation, personActive: !!person });
    if (blocking(fs).length) return refuse(fs);
    const row = await tx.estimateCopyExplanation.create({ data: { organisationId: l.org.id, openingId: o.id, explanation, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, l.org.id, OPENING_ENTITY.explanation, row.id, openingLabel(l, o), "CREATE", diffFields(null, { explanation, recordedBy: `${person!.name} (recorded on their behalf, not signed)` }));
    return { ok: true };
  });
}
