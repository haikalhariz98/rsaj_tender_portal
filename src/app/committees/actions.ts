"use server";

import { bidGate } from "@/lib/bids/repo";
import { bidFindingText } from "@/lib/bids/labels";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { auditedCreate, writeAudit, type Tx } from "@/lib/audit/record";
import {
  checkAttendanceChange,
  checkRecusalChange,
  minutingChecks,
  snapshotRegister,
} from "@/lib/committee/assess-sitting";
import {
  attendanceFaultText,
  RECORD_TABLED_DOMAIN_TEXT,
  SITTING_TABLED_MATTER_KINDS,
  sittingTablesDomain,
  recordTabledText,
  OUTCOME_FAULT_MESSAGE,
  TABLING_FAULT_MESSAGE,
  TRANSITION_FAULT_MESSAGE,
  WITHDRAW_FAULT_MESSAGE,
} from "@/lib/committee/labels";
import { checkOutcome, checkRecusal, liveOutcomes, withdrawFault, type MeetingStatus } from "@/lib/committee/matter";
import { meetingTransition, sittingPermits, type SittingAct } from "@/lib/committee/meeting";
import { registerRole } from "@/lib/committee/sitting";
import { organisationId, withLockedSitting, type LoadedSitting } from "@/lib/committee/sittings";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { dayToDate, organisationDay, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { afterIssuing, formatReference, patternFaults, serialFor } from "@/lib/numbering/series";
import { MATTER_REF_TEXT, resolveMatterRef } from "@/lib/requisition/matter-link";
import { FormReader } from "@/lib/validate";

/**
 * Writes for committee sittings.
 *
 * Every action is reachable by a direct POST. Each write to a sitting runs inside
 * `withLockedSitting`: the sitting's row is locked, everything under it is re-read in
 * the same transaction, the pure check runs on that data, and only then is the write
 * made, with its audit row, in that transaction. Two writes to one sitting therefore
 * never both pass a check on data the other is about to change. A refusal saves
 * nothing. Nobody is signed in, so whoever records a tabling or a vote attests it.
 */

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before recording sittings.",
};
const GONE: FormState = { ok: false, message: "That sitting no longer exists." };
const CLOSED: FormState = {
  ok: false,
  message: "This sitting is minuted or cancelled. Nothing under it can change.",
};
const NOT_IN_PROGRESS: FormState = {
  ok: false,
  message: "The register, votes and outcomes are recorded while the sitting is in progress.",
};

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;

function refresh(meetingId?: string) {
  revalidatePath("/committees");
  if (meetingId) revalidatePath(`/committees/${meetingId}`);
}

/// Refuse an act the sitting's status does not permit (ruling 8.2).
function permit(s: LoadedSitting, act: SittingAct): FormState | null {
  if (sittingPermits(s.meeting.status, act)) return null;
  return s.meeting.status === "MINUTED" || s.meeting.status === "CANCELLED" ? CLOSED : NOT_IN_PROGRESS;
}

async function audit(
  tx: Tx,
  s: LoadedSitting,
  entity: string,
  entityId: string,
  entityLabel: string,
  action: "CREATE" | "UPDATE",
  changes: FieldChange[],
  reason = "",
) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: s.organisationId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Run a sitting write under the lock; a missing sitting reads as gone.
async function inSitting(meetingId: string, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>): Promise<FormState> {
  const result = await withLockedSitting(meetingId, fn);
  if (result?.ok) refresh(meetingId);
  return result ?? GONE;
}

async function meetingOf(decisionId: string): Promise<string | null> {
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
  return found?.meetingId ?? null;
}

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
  // The series numbers by the organisation's day, never the UTC one (6.10 §9.5 follow-up).
  const zone = (await db.organisation.findUnique({ where: { id: orgId }, select: { timeZone: true } }))?.timeZone ?? null;
  const day = organisationDay(new Date(), zone);
  if (usable && !typed && !day) {
    r.reject("reference", "The sittings series numbers by the organisation's day, and its time zone is not set. Set it under Configuration, Organisation, or type the reference.");
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
        const on = day!;
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
  const r = new FormReader(data);
  const meetingDate = r.date("meetingDate", "Date", { required: true });
  const agenda = r.text("agenda", "Agenda", { max: 4000 });

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "EDIT");
    if (refusal) return refusal;
    const m = s.meeting;
    if (meetingDate && m.status !== "SCHEDULED" && meetingDate.getTime() !== m.meetingDate.getTime()) {
      r.reject("meetingDate", "The date of a sitting that has started cannot change.");
    }
    const parsed = r.finish({ meetingDate, agenda });
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    await tx.meeting.update({ where: { id: m.id }, data: { meetingDate: meetingDate!, agenda } });
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE",
      diffFields({ meetingDate: m.meetingDate, agenda: m.agenda }, { meetingDate, agenda }));
    return { ok: true };
  });
}

// ---------------------------------------------------------------- lifecycle

/**
 * Start, minute or cancel a sitting.
 *
 * Minuting also checks the register has no faults and every decided matter still
 * follows from it, and freezes the register as the sitting's snapshot: from then on
 * the sitting renders from what stood on the day, not from today's configuration.
 */
export async function changeStatus(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const to = String(data.get("to") ?? "") as MeetingStatus;
  const reason = String(data.get("reason") ?? "").trim();

  return inSitting(meetingId, async (tx, s) => {
    const m = s.meeting;
    const checks = minutingChecks(s.assessment, s.matters);
    const check = meetingTransition(m.status, to, {
      minutes: m.minutes,
      reason,
      // A matter withdrawn before the sitting opened is not on the agenda (6.10 follow-up).
      matterOutcomes: liveOutcomes(m.decisions),
      today: s.today,
      meetingDay: storedDay(m.meetingDate),
      ...checks,
    });
    if (!check.ok) {
      return check.fault === "REASON_REQUIRED"
        ? { ok: false, errors: { reason: TRANSITION_FAULT_MESSAGE.REASON_REQUIRED } }
        : { ok: false, message: TRANSITION_FAULT_MESSAGE[check.fault] };
    }

    const minutedAt = to === "MINUTED" ? new Date() : undefined;
    const registerSnapshot =
      to === "MINUTED"
        ? snapshotRegister(
            s.register,
            s.rules,
            s.committeeName,
            Object.fromEntries(
              [
                ...s.register.voting.map((v) => v.personId),
                ...s.register.alternates.map((v) => v.personId),
                ...s.register.nonVotingMemberIds,
                ...m.attendance.map((a) => a.personId),
              ]
                .filter((id): id is string => id != null)
                .map((id) => [id, s.names[id] ?? "Not on record"]),
            ),
          )
        : undefined;

    const after = {
      status: to,
      ...(to === "CANCELLED" ? { cancelledReason: reason } : {}),
      ...(minutedAt ? { minutedAt } : {}),
    };
    // Guarded on the status read under the lock, so a second transition cannot land.
    const moved = await tx.meeting.updateMany({
      where: { id: m.id, status: m.status },
      data: { ...after, ...(registerSnapshot ? { registerSnapshot: registerSnapshot as object } : {}) },
    });
    if (moved.count !== 1) return { ok: false, message: "The sitting changed while this was being saved. Reload and try again." };
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE",
      diffFields({ status: m.status, cancelledReason: m.cancelledReason, minutedAt: m.minutedAt }, after), reason);
    return { ok: true };
  });
}

export async function saveMinutes(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const minutes = r.text("minutes", "Minutes", { required: true, max: 20000 });
  const parsed = r.finish({ minutes });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "MINUTES");
    if (refusal) return refusal;
    const m = s.meeting;
    await tx.meeting.update({ where: { id: m.id }, data: { minutes } });
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE", diffFields({ minutes: m.minutes }, { minutes }));
    return { ok: true };
  });
}

// --------------------------------------------------------------- attendance

/**
 * Record one person's attendance.
 *
 * The register is checked as it would stand after the change. The change is refused
 * where it would create a fault for anyone, make a vote already on record ineligible
 * (a vote cannot be withdrawn), or leave a decided matter no longer following from
 * the register.
 */
export async function recordAttendance(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const attended = r.choice("attended", "At this sitting", ["yes", "no"] as const, { required: true }) === "yes";
  const standingInForSeatId = attended ? r.optionalText("standingInForSeatId") : null;
  if (r.failed) return { ok: false, errors: r.errors };

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "ATTENDANCE");
    if (refusal) return refusal;

    const name = s.names[personId] ?? "This person";
    const role = registerRole(s.register, personId);
    if (role.kind === "CONTESTED") {
      return {
        ok: false,
        message: attendanceFaultText(name, "OFFICE_CONTESTED", {
          office: role.seat.officeLabel,
          holders: role.seat.contestedHolderIds.map((id) => s.names[id] ?? "Not on record"),
        }),
      };
    }
    if (role.kind === "NOT_A_MEMBER") {
      return { ok: false, errors: { personId: attendanceFaultText(name, "NOT_A_MEMBER") } };
    }

    const proposed = [
      ...s.meeting.attendance.filter((x) => x.personId !== personId),
      { personId, attended, standingInForSeatId },
    ];
    const change = checkAttendanceChange(s.register, s.rules, s.matters, proposed);
    if (!change.ok) {
      const subject = (id: string) => s.meeting.decisions.find((d) => d.id === id)?.subject ?? "a matter";
      const lines = [
        ...change.newFaults.map((f) => attendanceFaultText(s.names[f.personId] ?? "Someone", f.fault)),
        ...change.newlyIneligible.map(
          (v) => `${s.names[v.personId] ?? "Someone"} has voted on “${subject(v.matterId)}”, and that vote would no longer count. A vote cannot be withdrawn.`,
        ),
        ...(change.brokenDecisions.length === 0
          ? []
          : attended
            ? [
                // Ruling §9.1: a late arrival cannot be recorded until per-matter presence
                // exists; it goes in the minutes instead.
                `${name}'s arrival can't be recorded yet: ${change.brokenDecisions.map((id) => `“${subject(id)}”`).join(" and ")} ${change.brokenDecisions.length === 1 ? "is" : "are"} already decided, and presence per matter is not built, so recording it would count ${name} as present on a matter they did not vote on. Note the arrival in the minutes.`,
              ]
            : change.brokenDecisions.map((id) => `“${subject(id)}” is decided, and would no longer follow from the register.`)),
      ];
      return { ok: false, message: `This change is refused. ${lines.join(" ")}` };
    }

    const before = s.meeting.attendance.find((x) => x.personId === personId) ?? null;
    const row = await tx.meetingAttendance.upsert({
      where: { meetingId_personId: { meetingId, personId } },
      update: { attended, standingInForSeatId },
      create: { meetingId, personId, attended, standingInForSeatId },
    });
    await audit(tx, s, "MeetingAttendance", row.id, `${name} at ${s.meeting.reference}`, before ? "UPDATE" : "CREATE",
      diffFields(before && { attended: before.attended, standingInForSeatId: before.standingInForSeatId }, { attended, standingInForSeatId }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ matters

/**
 * Table a matter (FR-CTE-006).
 *
 * Only a holder of the committee's Secretariat office on the tabling day — today in
 * the organisation's zone, the same day the drawer offered its tablers from — and
 * the committee must have one set. An attestation until sign-in exists. Under the
 * sitting's lock, so a matter cannot be tabled onto a sitting being minuted.
 */
export async function tableMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const subject = r.text("subject", "Subject", { required: true, max: 400 });
  const domain = r.text("domain", "Matter", { required: true, max: 60 });
  if (domain && !sittingTablesDomain(domain)) r.reject("domain", recordTabledText(domain) ?? RECORD_TABLED_DOMAIN_TEXT);
  const matterKind = r.choice("matterKind", "Record kind", SITTING_TABLED_MATTER_KINDS);
  // A kind tabled only from its record (scope, late tender admission) is refused naming where (6.6 CR-1).
  const kindTabledElsewhere = recordTabledText(String(data.get("matterKind") ?? ""));
  if (kindTabledElsewhere) r.reject("matterKind", kindTabledElsewhere);
  const matterRef = r.optionalText("matterRef");
  if (matterKind && !matterRef) r.reject("matterRef", "Give the reference of the record the matter concerns.");
  const amount = r.money("amount", "Amount");
  const act = r.choice("act", "Act", ACTS, { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  const dependsOnDecisionId = r.optionalText("dependsOnDecisionId");

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "TABLE");
    if (refusal) return refusal;

    const code = s.meeting.committee.secretariatRoleCode;
    const holders = secretariatHoldersOn(s.roster, code, s.today).map((h) => h.id);
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: holders, tablingDay: s.today });
    if (!tabling.ok) {
      if (tabling.fault === "SECRETARIAT_NOT_SET" || tabling.fault === "TIME_ZONE_UNSET") {
        return { ok: false, message: TABLING_FAULT_MESSAGE[tabling.fault] };
      }
      r.reject("tabledByPersonId", TABLING_FAULT_MESSAGE[tabling.fault]);
    }
    // A requisition matter links to its requisition by the typed key (6.10 ruling), found
    // by the reference given: the portal's own, or the finance system's numbers.
    let requisitionId: string | null = null;
    let requisitionReference: string | null = null;
    if (matterKind === "REQUISITION" && matterRef) {
      // Two matches are refused as ambiguous, never picked between; a cancelled or
      // closed requisition takes nothing (ruling BD-18).
      const matches = await tx.requisition.findMany({
        where: { organisationId: s.organisationId, OR: [{ reference: matterRef }, { erpRequisitionNo: matterRef }, { erpNoteNo: matterRef }] },
        select: { id: true, status: true, reference: true },
        take: 2,
      });
      const found = resolveMatterRef(matches);
      requisitionReference = found.ok ? matches[0].reference : null;
      if (!found.ok) r.reject("matterRef", MATTER_REF_TEXT[found.fault]);
      requisitionId = found.ok ? found.requisitionId : null;
    }
    // An exercise matter links to its exercise the same way (6.11): by the exercise's
    // portal reference, exactly one, and not a cancelled one.
    let exerciseId: string | null = null;
    let exerciseReference: string | null = null;
    if (matterKind === "EXERCISE" && matterRef) {
      const matches = await tx.sourcingExercise.findMany({ where: { organisationId: s.organisationId, reference: matterRef }, select: { id: true, status: true, reference: true }, take: 2 });
      if (matches.length === 1 && matches[0].status !== "CANCELLED") {
        exerciseId = matches[0].id;
        exerciseReference = matches[0].reference;
      } else if (matches.length === 1) r.reject("matterRef", "That exercise is cancelled, so nothing can be tabled against it.");
      // 6.6 (OD-6, flagged): an appointment is not tabled while a late envelope on the exercise waits for
      // the committee's decision on admission. Read inside this transaction; the sitting's lock is held.
      if (exerciseId && domain === APPOINTMENT_DOMAIN) {
        const bids = await bidGate(exerciseId, tx);
        if (bids.lateFault) r.reject("matterRef", bidFindingText(bids.lateFault));
      }
      // No exercise has that reference: tabled as a manual matter, linked to no record, as before.
    }
    if (dependsOnDecisionId) {
      const dep = await tx.committeeDecision.findFirst({
        where: { id: dependsOnDecisionId, meeting: { committee: { organisationId: s.organisationId } } },
        select: { id: true },
      });
      if (!dep) r.reject("dependsOnDecisionId", "That matter no longer exists.");
    }

    const v = { subject, domain, matterKind, matterRef, amount, act, tabledByPersonId, dependsOnDecisionId };
    const parsed = r.finish(v);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const tabledAt = dayToDate(s.today!);
    const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    const row = await tx.committeeDecision.create({
      data: { meetingId, subject, domain, matterKind, matterRef, requisitionId, exerciseId, amount, act: act!, tabledByPersonId, tabledAt, dependsOnDecisionId, sequence },
    });
    await audit(tx, s, "CommitteeDecision", row.id, subject, "CREATE",
      diffFields(null, { ...v, linkedRequisition: requisitionReference, linkedExercise: exerciseReference, tabledBy: tabledByPersonId ? s.names[tabledByPersonId] : null, tabledAt, sequence }));
    return { ok: true };
  });
}

/// Declare a recusal on one matter. The member leaves that matter's vote and quorum.
export async function declareRecusal(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };

  const r = new FormReader(data);
  const personId = r.text("personId", "Member", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };

  return inSitting(meetingId, async (tx, s) => {
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    const check = checkRecusal({
      meetingStatus: s.meeting.status,
      outcome: decision.outcome,
      role: registerRole(s.register, personId).kind,
      alreadyRecused: decision.recusals.some((x) => x.personId === personId),
      hasVoted: decision.votes.some((x) => x.personId === personId),
      withdrawn: decision.withdrawnAt != null,
    });
    if (!check.ok) {
      const message = {
        SITTING_CLOSED: CLOSED.message!,
        MATTER_DECIDED: "The matter has already been decided.",
        MATTER_WITHDRAWN: "The matter was withdrawn from the agenda.",
        NOT_A_VOTING_MEMBER: "Only a voting member or an alternate can declare a recusal.",
        ALREADY_RECUSED: "This member has already recused.",
        ALREADY_VOTED: "This member has already voted on the matter. A recusal is declared before voting, and a vote cannot be withdrawn.",
      }[check.fault];
      return check.fault === "SITTING_CLOSED" || check.fault === "MATTER_DECIDED" || check.fault === "MATTER_WITHDRAWN"
        ? { ok: false, message }
        : { ok: false, errors: { personId: message } };
    }
    // A holder's recusal excuses their seat: an alternate who has already voted in
    // it would lose that vote, and a vote cannot be withdrawn (acceptance send-back 1).
    const matter = s.matters.find((x) => x.id === decisionId)!;
    const change = checkRecusalChange(s.register, s.rules, matter, personId);
    if (!change.ok) {
      const who = change.newlyIneligible.map((p) => s.names[p] ?? "A member").join(" and ");
      return {
        ok: false,
        errors: {
          personId: `${who} ${change.newlyIneligible.length === 1 ? "has" : "have"} already voted in this member's seat on the matter, and that vote would no longer count. A recusal is declared before anyone votes in the seat.`,
        },
      };
    }
    const name = s.names[personId] ?? "Member";
    const row = await tx.decisionRecusal.create({ data: { decisionId, personId, reason, declaredAt: new Date() } });
    await audit(tx, s, "DecisionRecusal", row.id, `${name} on ${decision.subject}`, "CREATE", diffFields(null, { member: name, reason }));
    return { ok: true };
  });
}

/**
 * Record a matter's outcome.
 *
 * CARRIED and NOT_CARRIED must follow from the individual votes under the committee's
 * voting rule; NOT_CARRIED also needs one of its configured not-approved outcomes.
 * DEFERRED needs only a note. Re-assessed under the sitting's lock, so a vote landing
 * at the same moment is either counted or refused, and a second save on the same
 * matter finds it decided. The snapshot stores the count the matter's quorum was
 * judged on, the recusals among those present, the rule with its provenance, and the
 * outcome's name and kind.
 */
export async function recordOutcome(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };

  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["CARRIED", "NOT_CARRIED", "DEFERRED"] as const, { required: true });
  const notApprovedOutcomeId = outcome === "NOT_CARRIED" ? r.optionalText("notApprovedOutcomeId") : null;
  const note = r.text("outcomeNote", "Note", { max: 2000 });
  if (r.failed || !outcome) return { ok: false, errors: r.errors };

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "OUTCOME");
    if (refusal) return refusal;
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    if (decision.outcome !== "PENDING") return { ok: false, message: "The matter has already been decided." };
    if (decision.withdrawnAt) return { ok: false, message: "The matter was withdrawn from the agenda: nothing is recorded on it." };

    const assessment = s.assessment.matters[decisionId];
    const check = checkOutcome(
      assessment,
      { outcome, notApprovedOutcomeId, note },
      { outcomes: s.outcomesAll, committeeId: s.meeting.committeeId, on: s.meeting.meetingDate },
    );
    if (!check.ok) {
      const field = ({ OUTCOME_REQUIRED: "notApprovedOutcomeId", OUTCOME_NOT_OFFERED: "notApprovedOutcomeId", NOTE_REQUIRED: "outcomeNote" } as Record<string, string>)[check.fault];
      if (field) return { ok: false, errors: { [field]: OUTCOME_FAULT_MESSAGE[check.fault] } };
      // Every refusal names what blocks it, not only that something does.
      if (check.fault === "MATTER_NOT_READY") {
        return { ok: false, message: `This matter cannot be decided yet. ${assessment.messageEn}` };
      }
      if (check.fault === "OUTCOME_CONTRADICTS_VOTES") {
        const came = assessment.computed === "CARRIED" ? "carried" : "not carried";
        return { ok: false, message: `That outcome does not follow from the votes recorded: they come to ${came}.` };
      }
      return { ok: false, message: OUTCOME_FAULT_MESSAGE[check.fault] };
    }

    const decided = outcome !== "DEFERRED";
    const chosen = notApprovedOutcomeId ? s.outcomesAll.find((o) => o.id === notApprovedOutcomeId) : undefined;
    const after = {
      outcome,
      decisionDate: s.meeting.meetingDate,
      outcomeNote: note,
      notApprovedOutcomeId,
      notApprovedOutcomeNameEn: chosen?.nameEn ?? null,
      notApprovedOutcomeKind: chosen?.kind ?? null,
      quorumRequired: s.rules.quorum,
      presentVoters: assessment.entitledIds.length,
      recusedCount: assessment.recusedPresentIds.length,
      votingRule: decided ? s.rules.votingRule : null,
      votingRuleProvenance: decided ? (s.rules.votingRuleProvenance as "STATED" | "OBSERVED" | "ASSUMED" | null) : null,
      alternateMayVoteForRecused: decided ? s.rules.alternateMayVoteForRecused : null,
    };
    // Guarded on PENDING as well as locked: exactly one outcome lands.
    const done = await tx.committeeDecision.updateMany({ where: { id: decisionId, outcome: "PENDING" }, data: after });
    if (done.count !== 1) return { ok: false, message: "The matter has already been decided." };
    await audit(tx, s, "CommitteeDecision", decisionId, decision.subject, "UPDATE",
      diffFields({ outcome: decision.outcome, decisionDate: decision.decisionDate, outcomeNote: decision.outcomeNote, notApprovedOutcomeId: decision.notApprovedOutcomeId }, after));
    return { ok: true };
  });
}

/**
 * Withdraw a tabled matter from the agenda before the sitting opens (6.10 follow-up,
 * 6.11 BD-31), with a reason. The row is kept, the withdrawal audited; the matter is
 * then left out of the votes, the quorum and the minuting. Once the sitting is in
 * progress a pending matter is deferred instead, with a note.
 */
export async function withdrawMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };
  return inSitting(meetingId, async (tx, s) => {
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    const cited = (await tx.approvalStep.count({ where: { committeeDecisionId: decision.id } })) > 0 || decision.requisitionGateId != null;
    const dependents = await tx.committeeDecision.count({ where: { dependsOnDecisionId: decision.id, withdrawnAt: null } });
    const fault = withdrawFault({ meetingStatus: s.meeting.status, outcome: decision.outcome, withdrawn: decision.withdrawnAt != null, cited, dependents, reason });
    if (fault) return fault === "REASON_REQUIRED" ? { ok: false, errors: { reason: WITHDRAW_FAULT_MESSAGE[fault] } } : { ok: false, message: WITHDRAW_FAULT_MESSAGE[fault] };
    const withdrawnAt = new Date();
    const moved = await tx.committeeDecision.updateMany({ where: { id: decision.id, outcome: "PENDING", withdrawnAt: null }, data: { withdrawnAt, withdrawnReason: reason } });
    if (moved.count !== 1) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };
    await audit(tx, s, "CommitteeDecision", decision.id, decision.subject, "UPDATE", diffFields({ withdrawnAt: null }, { withdrawnAt, withdrawn: "from the agenda, before the sitting opened" }), reason);
    return { ok: true };
  });
}
