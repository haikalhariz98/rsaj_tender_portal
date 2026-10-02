/**
 * The Bids received tab's read model (6.6 plan §5): the register, the box, the late envelopes and
 * their admission, the validity, the count and the checklist preview — every act's availability
 * judged by the same pure rule the action re-runs under its locks, so a disabled action and a
 * refused one give the same reason. Words only: codes never reach the screen.
 */

import { ACT_LABEL } from "@/lib/labels";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { dayPlus, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { isLive } from "@/lib/documents/evidence";

import { alternativeStatus } from "./alternatives";
import { boxState, lockFaults } from "./box";
import { checklistFor, completenessConsequence } from "./completeness";
import { correctionFaults } from "./correction";
import { bidCount, competition } from "./count";
import { applyFaults, extensionFaults, RECOMMENDED_ATTESTED } from "./extension";
import { ADMISSION_LABEL, ALTERNATIVE_LABEL, bidFindingText, receiptTime, CHANNEL_LABEL, COMPETITION_LABEL, COMPETITION_TEXT, CONSEQUENCE_LABEL, ENVELOPE_KIND_LABEL, officerStatement, RECORDED_LATER_LABEL, RECORDING_STAMP_LABEL, RETURN_LABEL } from "./labels";
import { admission, lateAdmissionFault, lateMatterFault, needsAdmission } from "./late";
import { LATENESS_READING } from "./lateness";
import { exerciseFaults } from "./receipt";
import { bidRuleFor, frozenUnsetText } from "./rule-snapshot";
import { envelopeFactsOf, exerciseForBids, liveConsents, loadBidMethodRule, loadBidWindow, loadBoxEvents, loadEnvelopes, loadExtensions, loadLateMatters, loadValidityOffsets, loadWithdrawals, validityOf } from "./repo";
import { EXPIRY_READING } from "./validity";
import { bidFieldsFaults } from "./window-fields";
import { returnState, withdrawFaults } from "./withdrawal";
import { blocking, isPublishedStatus, type Finding } from "./types";

type Allowed = { allowed: true } | { allowed: false; reason: string };
const allowed = (fs: readonly Finding[]): Allowed => (blocking(fs).length ? { allowed: false, reason: blocking(fs).map(bidFindingText).join(" ") } : { allowed: true });
const PROVENANCE_WORD = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" } as const;

export async function bidsTab(exerciseId: string) {
  const org = await exerciseOrg();
  if (!org) return null;
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { id: true, organisationId: true, reference: true, title: true, status: true, closingAt: true, sourcingMethodCode: true, packKindSnapshot: true } });
  if (!ex) return null;
  const { timeZone, today } = org;
  const orgId = ex.organisationId;
  const now = new Date();
  const [window, events, envelopes, withdrawals, extensions, matters, liveRule, { offsets, ruleSet }, people, parties, pack] = await Promise.all([
    loadBidWindow(ex.id),
    loadBoxEvents(ex.id),
    loadEnvelopes(ex.id),
    loadWithdrawals(ex.id),
    loadExtensions(ex.id),
    loadLateMatters(ex.id),
    loadBidMethodRule(orgId, ex.sourcingMethodCode),
    loadValidityOffsets(orgId),
    db.person.findMany({ where: { organisationId: orgId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.exerciseParty.findMany({ where: { exerciseId: ex.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, registrationNo: true } }),
    db.tenderPack.findFirst({ where: { exerciseId: ex.id, status: "APPROVED" }, orderBy: { versionNo: "desc" }, select: { versionNo: true, parts: { select: { partCode: true, labelSnapshot: true, mandatory: true, sortOrder: true } } } }),
  ]);
  const addenda = window ? await db.addendum.findMany({ where: { windowId: window.id, status: "ISSUED", number: { not: null } }, orderBy: { number: "asc" }, select: { number: true, title: true } }) : [];
  // CR-2: a published exercise is judged by the rules frozen with its window, never today's method.
  const reading = bidRuleFor(window, liveRule);
  const rule = reading.rule;
  const x = exerciseForBids(ex, window, timeZone, events);
  const facts = envelopes.map(envelopeFactsOf);
  const cancelled = ex.status === "CANCELLED";
  const time = (d: Date | null) => receiptTime(d, timeZone);

  // ---- the committee that decides late admission, its sittings and who may table at them
  const code = rule?.lateAdmissionCommitteeCode ?? null;
  const committee = code ? await db.committee.findFirst({ where: { organisationId: orgId, code }, select: { id: true, code: true, nameEn: true, secretariatRoleCode: true } }) : null;
  const sittings = committee ? await db.meeting.findMany({ where: { committeeId: committee.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: [{ meetingDate: "asc" }, { reference: "asc" }], select: { id: true, reference: true, meetingDate: true } }) : [];
  const roster = committee ? await loadRoster(ORGANISATION_CODE) : null;
  const holders = committee && roster ? secretariatHoldersOn(roster, committee.secretariatRoleCode, today) : [];
  const tablingReason = (() => {
    if (!committee) return null;
    if (sittings.length === 0) return `No sitting of the ${committee.nameEn} is scheduled or in progress. Schedule one under Committees.`;
    const t = checkTabling({ secretariatRoleCode: committee.secretariatRoleCode, tabledByPersonId: holders[0]?.id ?? null, holderIdsOnDate: holders.map((h) => h.id), tablingDay: today });
    if (!t.ok) return t.fault === "NOT_TABLED" ? "Nobody holds the committee's Secretariat office today, so nobody may table the admission. Assign the office under Configuration, Users & roles." : TABLING_FAULT_MESSAGE[t.fault];
    return null;
  })();

  // ---- the register
  const exFaults = exerciseFaults(x);
  const receive = allowed(exFaults);
  const withdraw = allowed(withdrawFaults({ exercise: x, now, envelope: null, markings: "-", personActive: true }));
  const lock = allowed(lockFaults({ exercise: x, now, events, personActive: true }));
  const box = boxState(events);
  const rows = envelopes.map((e) => {
    const f = envelopeFactsOf(e);
    const a = needsAdmission(f) ? admission(e.id, matters) : null;
    const correct = allowed(correctionFaults({ exercise: x, now, envelope: { kind: e.kind, status: e.status, channel: e.channel, markings: e.markings, receivedByPersonId: e.receivedByPersonId }, change: { markings: `${e.markings} ` }, reason: "-", personActive: true }));
    const table = a && !["ADMITTED", "NOT_ADMITTED", "PENDING"].includes(a.state)
      ? (() => {
          const fs = lateMatterFault({ exerciseCancelled: cancelled, committeeCode: code, committeeSource: reading.committee, envelope: f, matters, sitting: { committeeCode: code ?? "", frozen: false } });
          const r = allowed(fs);
          if (!r.allowed) return r;
          if (!committee) return { allowed: false as const, reason: "The committee the method names for late admission is no longer configured. Choose another under Configuration › Invitation." };
          return tablingReason ? { allowed: false as const, reason: tablingReason } : ({ allowed: true } as const);
        })()
      : null;
    const back = returnState(f);
    return {
      id: e.id,
      sequence: e.sequence,
      kind: ENVELOPE_KIND_LABEL[e.kind],
      isEstimate: e.kind === "COMPANY_ESTIMATE",
      channel: CHANNEL_LABEL[e.channel],
      channelCode: e.channel,
      received: time(e.receivedAt),
      /// What the received time is, on every row: the server's recording stamp (S-1).
      stampLabel: RECORDING_STAMP_LABEL,
      entered: e.receivedSource === "ENTERED",
      enteredChip: e.receivedSource === "ENTERED" ? RECORDED_LATER_LABEL : null,
      stated: e.statedReceivedAt ? time(e.statedReceivedAt) : null,
      entryReason: e.entryReason || null,
      statement: e.receivedSource === "ENTERED" ? officerStatement(e.statedReceivedAt ? time(e.statedReceivedAt) : null, e.entryReason || null) : null,
      late: e.late,
      judgedAgainst: e.closingAtJudged ? formatOrgDateTime(e.closingAtJudged, timeZone) : null,
      withdrawn: e.status === "WITHDRAWN",
      returned: back === "NOT_WITHDRAWN" ? null : RETURN_LABEL[back] + (e.returnedUnopenedOn ? ` on ${formatDate(storedDay(e.returnedUnopenedOn))}` : ""),
      markings: e.markings,
      receivedBy: `${e.receivedBy.name}, recorded on their behalf, not signed`,
      receivedById: e.receivedByPersonId,
      corrected: e.correctedAt != null,
      admission: a ? { state: a.state, label: ADMISSION_LABEL[a.state], sitting: a.matter?.sittingReference ?? null, matterId: a.matter?.id ?? null } : null,
      correct: e.kind === "COMPANY_ESTIMATE" || e.status === "WITHDRAWN" ? null : correct,
      table,
      returnable: e.status === "WITHDRAWN" && !e.returnedUnopenedOn && !cancelled,
      alternativeTo: e.parentEnvelopeId ? (envelopes.find((p) => p.id === e.parentEnvelopeId)?.sequence ?? null) : null,
    };
  });

  // ---- the count, before opening: officer-received envelopes only
  const count = bidCount(facts);
  const comp = competition(count.inTime, rule?.minimumBids ?? null);
  const late = rows.filter((r) => r.late && !r.withdrawn && !r.isEstimate);
  const gate = lateAdmissionFault(facts, matters, !!code, reading.committee);

  // ---- validity
  const v = validityOf({ closing: ex.closingAt, timeZone, days: window?.bidValidityDays ?? null, extensions, offsets, now });
  const pending = extensions.some((e) => e.appliedAt == null);
  const extend = allowed(
    extensionFaults({
      cancelled,
      closing: ex.closingAt,
      now,
      today,
      currentExpiry: v.expiry,
      toExpiry: v.expiry ? dayPlus(v.expiry, 1) : null,
      reason: "-",
      partyKnown: true,
      partyId: "-",
      recommendedPartyId: null,
      consentReceivedOn: today,
      pendingExists: pending,
      personActive: true,
    }),
  );
  const answers = allowed(bidFieldsFaults({ status: ex.status, packKind: ex.packKindSnapshot, current: { days: window?.bidValidityDays ?? null, alternativesPermitted: window?.alternativesPermitted ?? null }, next: { days: window?.bidValidityDays ?? 1, provenance: "ASSUMED", alternativesPermitted: window?.alternativesPermitted ?? null }, reason: "-" }));

  // ---- the checklist preview (FR-BID-007)
  const checklist = checklistFor({ parts: (pack?.parts ?? []).map((p) => ({ partCode: p.partCode, label: p.labelSnapshot, mandatory: p.mandatory, sortOrder: p.sortOrder })), addenda: addenda.map((a) => ({ number: a.number!, title: a.title })) });

  return {
    exerciseId: ex.id,
    reference: ex.reference,
    status: ex.status,
    published: isPublishedStatus(ex.status),
    publishedThroughWindow: window?.publishedAt != null,
    windowPrepared: window != null,
    closing: ex.closingAt ? formatOrgDateTime(ex.closingAt, timeZone) : null,
    statement: { reading: LATENESS_READING.text, provenance: PROVENANCE_WORD[LATENESS_READING.provenance] },
    /// Whose rules these are (CR-2): once published, the method's as they stood then.
    rulesNote: reading.frozen ? "The method's late-admission committee, fewest bids and incomplete-bid rule as they stood when the window was published. A later change applies only to exercises published after it." : "The method's rules as they stand today. They are frozen with the window when it is published.",
    exerciseReason: receive.allowed ? null : receive.reason,
    acts: { receive, withdraw, lock, extend, answers },
    box: box.state === "NOT_LOCKED" ? { state: "NOT_LOCKED" as const, text: "Not locked yet" } : { state: box.state, text: `${box.state === "LOCKED" ? "Locked" : "Opened for the opening"} at ${time(box.at)} by ${box.by}, recorded on their behalf, not signed` },
    rows,
    bidOptions: rows.filter((r) => r.kind === ENVELOPE_KIND_LABEL.BID && !r.withdrawn).map((r) => ({ value: r.id, label: `Envelope ${r.sequence}: ${r.markings}` })),
    withdrawable: rows.filter((r) => !r.isEstimate && !r.withdrawn && !r.late).map((r) => ({ value: r.id, label: `Envelope ${r.sequence}: ${r.markings}` })),
    withdrawals: withdrawals.map((w) => {
      const letters = w.attachments.filter(isLive).length;
      return {
        id: w.id,
        received: time(w.receivedAt),
        markings: w.markings,
        receivedBy: `${w.receivedBy.name}, recorded on their behalf, not signed`,
        envelope: w.envelope ? `Envelope ${w.envelope.sequence}` : "In the tender box: matched at opening, and not opened",
        letter: letters > 0 ? "Attached" : "Not attached",
        label: `${ex.reference} · Withdrawal of ${w.envelope ? `envelope ${w.envelope.sequence}` : "an envelope in the box"}`,
      };
    }),
    count: {
      inTime: count.inTime,
      late: count.late,
      alternatives: count.alternatives,
      withdrawn: count.withdrawn,
      competition: COMPETITION_LABEL[comp],
      competitionText: COMPETITION_TEXT[comp],
      competitionTone: (comp === "MET" ? "ok" : comp === "MINIMUM_NOT_SET" ? "neutral" : "warn") as "ok" | "warn" | "neutral",
      minimum: rule?.minimumBids == null ? null : `${rule.minimumBids}${rule.minimumBidsProvenance ? ` (${PROVENANCE_WORD[rule.minimumBidsProvenance]})` : ""}`,
      minimumUnset: frozenUnsetText(reading.minimum) ?? "Not set",
    },
    late: {
      rows: late,
      gate: gate ? bidFindingText(gate) : null,
      committee: committee?.nameEn ?? (code ? "A committee no longer configured" : null),
      committeeProvenance: rule?.lateAdmissionProvenance ? PROVENANCE_WORD[rule.lateAdmissionProvenance] : null,
      /// Unset: what the card says, and whether configuration can still set it (only before publication).
      unsetText: code ? null : `The committee that decides late admission: ${(frozenUnsetText(reading.committee) ?? "not set for this method").replace(/^N/, "n")}.`,
      settable: !reading.frozen,
      act: ACT_LABEL.A ?? "Approve",
      sittings: sittings.map((s) => ({ value: s.id, label: `${s.reference}, ${formatDate(storedDay(s.meetingDate))}` })),
      holders: holders.map((h) => ({ value: h.id, label: h.name })),
    },
    validity: {
      days: window?.bidValidityDays ?? null,
      provenance: window?.bidValidityProvenance ? PROVENANCE_WORD[window.bidValidityProvenance as keyof typeof PROVENANCE_WORD] : null,
      state: v.state,
      baseExpiry: v.baseExpiry ? formatDate(v.baseExpiry) : null,
      expiry: v.expiry ? formatDate(v.expiry) : null,
      expiryDay: v.expiry,
      daysLeft: v.daysLeft,
      alert: v.alertOffset != null ? `Within ${v.alertOffset} days of expiry: an alert is due (shown here, not sent).` : null,
      alertRule: ruleSet ? (offsets.length ? `Alerts at ${offsets.join(", ")} days before expiry` : "The alert rule sets no offsets") : "No alert rule is set for bid validity",
      reading: { text: EXPIRY_READING.text, provenance: PROVENANCE_WORD[EXPIRY_READING.provenance] },
      extensions: extensions.map((e) => ({
        id: e.id,
        from: formatDate(storedDay(e.fromExpiry)),
        to: formatDate(storedDay(e.toExpiry)),
        reason: e.reason,
        consentOf: `${e.consentParty.name}, ${RECOMMENDED_ATTESTED}`,
        consentReceivedOn: formatDate(storedDay(e.consentReceivedOn)),
        recordedBy: `${e.recordedBy.name}, recorded on their behalf, not signed`,
        applied: e.appliedAt ? formatOrgDateTime(e.appliedAt, timeZone) : null,
        consent: liveConsents(e) > 0 ? "Attached" : "Not attached",
        apply: e.appliedAt ? null : allowed(applyFaults({ cancelled, appliedAt: e.appliedAt, liveConsents: liveConsents(e), toExpiry: storedDay(e.toExpiry), currentExpiry: v.expiry })),
        label: `${ex.reference} · Validity extension to ${formatDate(storedDay(e.toExpiry))}`,
      })),
      fault: !window?.publishedAt ? null : v.state === "NOT_SET" ? bidFindingText({ code: "VALIDITY_NOT_SET", level: "warn" }) : v.state === "EXPIRED" ? bidFindingText({ code: "BID_VALIDITY_EXPIRED", level: "warn", data: { expiry: v.expiry } }) : null,
      alternatives: ALTERNATIVE_LABEL[alternativeStatus(window?.alternativesPermitted ?? null)],
      answerValues: { bidValidityDays: window?.bidValidityDays == null ? "" : String(window.bidValidityDays), bidValidityProvenance: window?.bidValidityProvenance ?? "", alternativesPermitted: window?.alternativesPermitted == null ? "unset" : window.alternativesPermitted ? "yes" : "no" },
      answersNeedReason: isPublishedStatus(ex.status),
    },
    checklist: {
      pack: pack ? `Version ${pack.versionNo} of the tender documents, as approved` : null,
      items: checklist.items.map((i) => i.label),
      notSet: checklist.notSet,
      consequence: rule?.completenessEliminates == null && reading.frozen ? `${frozenUnsetText(reading.completeness)}: an opening cannot be finalised on it` : CONSEQUENCE_LABEL[completenessConsequence(rule?.completenessEliminates ?? null)],
      consequenceProvenance: rule?.completenessProvenance ? PROVENANCE_WORD[rule.completenessProvenance] : null,
    },
    people: people.map((p) => ({ value: p.id, label: p.name })),
    parties: parties.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})` })),
    today,
    zoneSet: !!timeZone,
    exerciseFaultsText: exFaults.length ? exFaults.map(bidFindingText).join(" ") : null,
  };
}

export type BidsTab = NonNullable<Awaited<ReturnType<typeof bidsTab>>>;
