"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate, auditedUpsert } from "@/lib/audit/record";
import {
  ATTENDANCE_FAULT_MESSAGE,
  MATTER_KINDS,
  OUTCOME_FAULT_MESSAGE,
  TABLING_FAULT_MESSAGE,
  TRANSITION_FAULT_MESSAGE,
} from "@/lib/committee/labels";
import { checkOutcome, type MeetingStatus } from "@/lib/committee/matter";
import { isFrozen, meetingTransition } from "@/lib/committee/meeting";
import { presentVoters } from "@/lib/committee/sitting";
import { loadSitting, organisationId, type LoadedSitting } from "@/lib/committee/sittings";
import { checkTabling } from "@/lib/committee/tabling";
import { db } from "@/lib/db";
import { afterIssuing, formatReference, patternFaults, serialFor } from "@/lib/numbering/series";
import { holdersOf } from "@/lib/people/roster";
import { FormReader } from "@/lib/validate";

/**
 * Writes for committee sittings.
 *
 * Every action is reachable by a direct POST, so each one re-reads the sitting from
 * the organisation's own records and runs the pure check before writing; a refusal
 * saves nothing. Every write carries its audit row in the same transaction. Nobody is
 * signed in, so whoever records a tabling or a vote is attesting it, not proving it.
 */

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before recording sittings.",
};
const GONE: FormState = { ok: false, message: "That sitting no longer exists." };
const FROZEN: FormState = {
  ok: false,
  message: "This sitting is minuted or cancelled. Nothing under it can change.",
};

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

function refresh(meetingId?: string) {
  revalidatePath("/committees");
  if (meetingId) revalidatePath(`/committees/${meetingId}`);
}

async function openSitting(meetingId: string): Promise<LoadedSitting | FormState> {
  const sitting = await loadSitting(meetingId);
  if (!sitting) return GONE;
  if (isFrozen(sitting.meeting.status)) return FROZEN;
  return sitting;
}
const refused = (s: LoadedSitting | FormState): s is FormState => "ok" in s;

// ------------------------------------------------------------------- schedule

/**
 * Schedule a sitting.
 *
 * The reference is drawn from the numbering series keyed `meeting` where one is
 * configured and valid, in the same transaction as the sitting; otherwise it is typed.
 * Issuance is not atomic across concurrent users (handoff.md).
 */
export async function scheduleSitting(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const committeeId = r.text("committeeId", "Committee", { required: true });
  const meetingDate = r.date("meetingDate", "Date", { required: true });
  const agenda = r.text("agenda", "Agenda", { max: 4000 });
  const typed = r.optionalText("reference");

  const committee = committeeId
    ? await db.committee.findFirst({ where: { id: committeeId, organisationId: orgId } })
    : null;
  if (committeeId && !committee) r.reject("committeeId", "That committee no longer exists.");
  if (committee?.retiredOn && meetingDate && committee.retiredOn <= meetingDate) {
    r.reject("committeeId", "This committee is retired. A retired body schedules nothing.");
  }

  const series = await db.numberingSeries.findUnique({
    where: { organisationId_key: { organisationId: orgId, key: "meeting" } },
  });
  const usable = series && patternFaults(series).length === 0 ? series : null;
  if (!usable && !typed) {
    r.reject("reference", "No numbering series for sittings is configured, so type the reference.");
  }
  if (typed && committee) {
    const clash = await db.meeting.findFirst({ where: { committeeId: committee.id, reference: typed } });
    if (clash) r.reject("reference", "This committee already has a sitting with that reference.");
  }

  const parsed = r.finish({ committeeId, meetingDate, agenda });
  if (!parsed.ok || !committee || !meetingDate) return { ok: false, errors: r.errors };

  const created = await auditedCreate(
    { organisationId: orgId, entity: "Meeting", entityLabel: `${committee.nameEn} sitting` },
    { committee: committee.nameEn, meetingDate, agenda, reference: typed ?? "(from numbering)" },
    async (tx) => {
      let reference = typed;
      if (!reference && usable) {
        const on = new Date();
        reference = formatReference(usable, on, serialFor(usable, on));
        const next = afterIssuing(usable, on);
        await tx.numberingSeries.update({
          where: { id: usable.id },
          data: { nextSerial: next.nextSerial, serialPeriod: next.serialPeriod },
        });
      }
      return tx.meeting.create({
        data: { committeeId: committee.id, reference: reference!, meetingDate, agenda },
      });
    },
  );

  refresh(created.id);
  return { ok: true };
}

/// Edit a sitting's date and agenda. The date moves only before it starts.
export async function editSitting(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const s = await openSitting(meetingId);
  if (refused(s)) return s;

  const r = new FormReader(data);
  const meetingDate = r.date("meetingDate", "Date", { required: true });
  const agenda = r.text("agenda", "Agenda", { max: 4000 });
  const m = s.meeting;
  if (meetingDate && m.status !== "SCHEDULED" && meetingDate.getTime() !== m.meetingDate.getTime()) {
    r.reject("meetingDate", "The date of a sitting that has started cannot change.");
  }
  const parsed = r.finish({ meetingDate, agenda });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  await auditedUpdate(
    { organisationId: s.organisationId, entity: "Meeting", entityId: m.id, entityLabel: m.reference },
    { meetingDate: m.meetingDate, agenda: m.agenda },
    { meetingDate, agenda },
    (tx) => tx.meeting.update({ where: { id: m.id }, data: { meetingDate: meetingDate!, agenda } }),
  );
  refresh(m.id);
  return { ok: true };
}

// ---------------------------------------------------------------- lifecycle

export async function changeStatus(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const to = String(data.get("to") ?? "") as MeetingStatus;
  const reason = String(data.get("reason") ?? "").trim();

  const s = await loadSitting(meetingId);
  if (!s) return GONE;
  const m = s.meeting;

  const check = meetingTransition(m.status, to, {
    minutes: m.minutes,
    reason,
    matterOutcomes: m.decisions.map((d) => d.outcome),
  });
  if (!check.ok) {
    return check.fault === "REASON_REQUIRED"
      ? { ok: false, errors: { reason: TRANSITION_FAULT_MESSAGE.REASON_REQUIRED } }
      : { ok: false, message: TRANSITION_FAULT_MESSAGE[check.fault] };
  }

  const after = {
    status: to,
    ...(to === "CANCELLED" ? { cancelledReason: reason } : {}),
    ...(to === "MINUTED" ? { minutedAt: new Date() } : {}),
  };
  await auditedUpdate(
    { organisationId: s.organisationId, entity: "Meeting", entityId: m.id, entityLabel: m.reference, reason },
    { status: m.status, cancelledReason: m.cancelledReason, minutedAt: m.minutedAt },
    after,
    (tx) => tx.meeting.update({ where: { id: m.id }, data: after }),
  );
  refresh(m.id);
  return { ok: true };
}

export async function saveMinutes(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const s = await openSitting(meetingId);
  if (refused(s)) return s;

  const r = new FormReader(data);
  const minutes = r.text("minutes", "Minutes", { required: true, max: 20000 });
  const parsed = r.finish({ minutes });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const m = s.meeting;
  await auditedUpdate(
    { organisationId: s.organisationId, entity: "Meeting", entityId: m.id, entityLabel: m.reference },
    { minutes: m.minutes },
    { minutes },
    (tx) => tx.meeting.update({ where: { id: m.id }, data: { minutes } }),
  );
  refresh(m.id);
  return { ok: true };
}

// --------------------------------------------------------------- attendance

/**
 * Record one person's attendance.
 *
 * The register is checked as it would stand after the change; a fault that names
 * this person — a stand-in for the chair, a stand-in while the holder is present, an
 * alternate for another seat — refuses the save.
 */
export async function recordAttendance(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const s = await openSitting(meetingId);
  if (refused(s)) return s;
  if (s.meeting.status !== "IN_PROGRESS") {
    return { ok: false, message: "The register is taken once the sitting has started." };
  }

  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const attended = r.choice("attended", "At this sitting", ["yes", "no"] as const, { required: true }) === "yes";
  const standingInForSeatId = attended ? r.optionalText("standingInForSeatId") : null;
  if (r.failed) return { ok: false, errors: r.errors };

  const a = s.assessment;
  const known =
    a.voting.some((v) => v.personId === personId) ||
    a.alternates.some((v) => v.personId === personId) ||
    a.nonVotingMemberIds.includes(personId);
  if (!known) return { ok: false, errors: { personId: ATTENDANCE_FAULT_MESSAGE.NOT_A_MEMBER } };

  const others = s.meeting.attendance.filter((x) => x.personId !== personId);
  const proposed = [...others, { personId, attended, standingInForSeatId }];
  const result = presentVoters({
    voting: a.voting,
    alternates: a.alternates,
    nonVotingMemberIds: a.nonVotingMemberIds,
    attendance: proposed,
  });
  const fault = result.faults.find((f) => f.personId === personId);
  if (fault) {
    return { ok: false, errors: { standingInForSeatId: `This person ${ATTENDANCE_FAULT_MESSAGE[fault.fault]}` } };
  }

  const person = s.roster.people.find((p) => p.id === personId);
  const before = s.meeting.attendance.find((x) => x.personId === personId) ?? null;
  await auditedUpsert(
    { organisationId: s.organisationId, entity: "MeetingAttendance", entityLabel: `${person?.name ?? "Member"} at ${s.meeting.reference}` },
    before && { attended: before.attended, standingInForSeatId: before.standingInForSeatId },
    { attended, standingInForSeatId },
    (tx) =>
      tx.meetingAttendance.upsert({
        where: { meetingId_personId: { meetingId, personId } },
        update: { attended, standingInForSeatId },
        create: { meetingId, personId, attended, standingInForSeatId },
      }),
  );
  refresh(meetingId);
  return { ok: true };
}

// ------------------------------------------------------------------ matters

/**
 * Table a matter (FR-CTE-006).
 *
 * Only a holder of the committee's Secretariat office on the tabling date may table,
 * and the committee must have one set. The tabler is chosen by whoever records it —
 * an attestation until sign-in exists.
 */
export async function tableMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const s = await openSitting(meetingId);
  if (refused(s)) return s;

  const r = new FormReader(data);
  const subject = r.text("subject", "Subject", { required: true, max: 400 });
  const domain = r.text("domain", "Matter", { required: true, max: 60 });
  const matterKind = r.choice("matterKind", "Record kind", MATTER_KINDS);
  const matterRef = r.optionalText("matterRef");
  if (matterKind && !matterRef) r.reject("matterRef", "Give the reference of the record the matter concerns.");
  const amount = r.money("amount", "Amount");
  const act = r.choice("act", "Act", ACTS, { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  const dependsOnDecisionId = r.optionalText("dependsOnDecisionId");

  const on = today();
  const code = s.meeting.committee.secretariatRoleCode;
  const holders = code ? holdersOf(s.roster, code, on).filter((p) => p.isActive).map((p) => p.id) : [];
  const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: holders });
  if (!tabling.ok) {
    if (tabling.fault === "SECRETARIAT_NOT_SET") return { ok: false, message: TABLING_FAULT_MESSAGE.SECRETARIAT_NOT_SET };
    r.reject("tabledByPersonId", TABLING_FAULT_MESSAGE[tabling.fault]);
  }

  if (dependsOnDecisionId) {
    const dep = await db.committeeDecision.findFirst({
      where: { id: dependsOnDecisionId, meeting: { committee: { organisationId: s.organisationId } } },
      select: { id: true },
    });
    if (!dep) r.reject("dependsOnDecisionId", "That matter no longer exists.");
  }

  const v = { subject, domain, matterKind, matterRef, amount, act, tabledByPersonId, dependsOnDecisionId };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
  const tabler = s.roster.people.find((p) => p.id === tabledByPersonId);
  await auditedCreate(
    { organisationId: s.organisationId, entity: "CommitteeDecision", entityLabel: subject },
    { ...v, tabledBy: tabler?.name ?? null, tabledAt: on, sequence },
    (tx) =>
      tx.committeeDecision.create({
        data: {
          meetingId,
          subject,
          domain,
          matterKind,
          matterRef,
          amount,
          act: act!,
          tabledByPersonId,
          tabledAt: on,
          dependsOnDecisionId,
          sequence,
        },
      }),
  );
  refresh(meetingId);
  return { ok: true };
}

/// Declare a recusal on one matter. The member leaves that matter's vote and quorum.
export async function declareRecusal(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
  if (!found) return { ok: false, message: "That matter no longer exists." };
  const s = await openSitting(found.meetingId);
  if (refused(s)) return s;
  const decision = s.meeting.decisions.find((d) => d.id === decisionId)!;
  if (decision.outcome !== "PENDING") return { ok: false, message: "The matter has already been decided." };

  const r = new FormReader(data);
  const personId = r.text("personId", "Member", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  const a = s.assessment;
  const member =
    a.voting.some((x) => x.personId === personId) || a.alternates.some((x) => x.personId === personId);
  if (personId && !member) r.reject("personId", "Only a voting member or an alternate can declare a recusal.");
  if (decision.recusals.some((x) => x.personId === personId)) r.reject("personId", "This member has already recused.");
  if (decision.votes.some((x) => x.personId === personId)) {
    r.reject("personId", "This member has already voted on the matter. A recusal is declared before voting.");
  }
  const parsed = r.finish({ personId, reason });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const person = s.roster.people.find((p) => p.id === personId);
  await auditedCreate(
    { organisationId: s.organisationId, entity: "DecisionRecusal", entityLabel: `${person?.name ?? "Member"} on ${decision.subject}` },
    { member: person?.name ?? personId, reason },
    (tx) => tx.decisionRecusal.create({ data: { decisionId, personId, reason, declaredAt: new Date() } }),
  );
  refresh(s.meeting.id);
  return { ok: true };
}

/**
 * Record a matter's outcome.
 *
 * CARRIED and NOT_CARRIED must follow from the individual votes under the committee's
 * voting rule; NOT_CARRIED also needs one of its configured not-approved outcomes.
 * DEFERRED needs only a note. The quorum, the count present and recused, and the
 * voting rule with its provenance are copied onto the decision, so later
 * configuration never rewrites it.
 */
export async function recordOutcome(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
  if (!found) return { ok: false, message: "That matter no longer exists." };
  const s = await openSitting(found.meetingId);
  if (refused(s)) return s;
  if (s.meeting.status !== "IN_PROGRESS") return { ok: false, message: "Outcomes are recorded while the sitting is in progress." };

  const decision = s.meeting.decisions.find((d) => d.id === decisionId)!;
  if (decision.outcome !== "PENDING") return { ok: false, message: "The matter has already been decided." };

  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["CARRIED", "NOT_CARRIED", "DEFERRED"] as const, { required: true });
  const notApprovedOutcomeId = outcome === "NOT_CARRIED" ? r.optionalText("notApprovedOutcomeId") : null;
  const note = r.text("outcomeNote", "Note", { max: 2000 });
  if (r.failed || !outcome) return { ok: false, errors: r.errors };

  const assessment = s.assessment.matters[decisionId];
  const check = checkOutcome(
    assessment,
    { outcome, notApprovedOutcomeId, note },
    { outcomes: s.outcomesAll, committeeId: s.meeting.committeeId, on: s.meeting.meetingDate },
  );
  if (!check.ok) {
    const field = { OUTCOME_REQUIRED: "notApprovedOutcomeId", OUTCOME_NOT_OFFERED: "notApprovedOutcomeId", NOTE_REQUIRED: "outcomeNote" }[
      check.fault as string
    ];
    return field
      ? { ok: false, errors: { [field]: OUTCOME_FAULT_MESSAGE[check.fault] } }
      : { ok: false, message: OUTCOME_FAULT_MESSAGE[check.fault] };
  }

  const c = s.meeting.committee;
  const decided = outcome !== "DEFERRED";
  const after = {
    outcome,
    decisionDate: s.meeting.meetingDate,
    outcomeNote: note,
    notApprovedOutcomeId,
    quorumRequired: c.quorum,
    presentVoters: s.assessment.present.voterIds.length,
    recusedCount: decision.recusals.length,
    votingRule: decided ? c.votingRule : null,
    votingRuleProvenance: decided ? c.votingRuleProvenance : null,
  };
  await auditedUpdate(
    { organisationId: s.organisationId, entity: "CommitteeDecision", entityId: decisionId, entityLabel: decision.subject },
    { outcome: decision.outcome, decisionDate: decision.decisionDate, outcomeNote: decision.outcomeNote, notApprovedOutcomeId: decision.notApprovedOutcomeId },
    after,
    (tx) => tx.committeeDecision.update({ where: { id: decisionId }, data: after }),
  );
  refresh(s.meeting.id);
  return { ok: true };
}
