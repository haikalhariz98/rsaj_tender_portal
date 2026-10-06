/**
 * The audit trail of the demo's minuted sittings (6.10 local review 4): the rows the
 * committee actions would have written had each sitting been run through the portal —
 * scheduled, matters tabled, recusals declared, started, attendance recorded, votes
 * cast, outcomes recorded, minutes written, minuted.
 *
 * Built from the rows already loaded, with the actions' own `diffFields` and in their
 * fields and labels (src/app/committees/actions.ts and the votes route), dated as the
 * demo tells it. Times within a day only order the entries; they are invented.
 *
 * Every entry's id is `<sitting id>_au<n>` and every entityId is a `demo_` row, so the
 * wipe removes them with the rest (it deletes audit entries by `demo_` entityId).
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACTOR } from "./demo-actor";

const HOUR = 3_600_000;
const MINUTE = 60_000;
/// `day` is midnight UTC; the offsets read as a working day in the demo's zone.
const at = (d: Date, hours: number, minutes = 0) => new Date(d.getTime() + hours * HOUR + minutes * MINUTE);

export async function loadSittingTrail(db: PrismaClient, organisationId: string, meetingIds: string[]) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { scopeTabledAudit } = await import("../src/lib/scope/audit-view");
  const { ACT_LABEL } = await import("../src/lib/labels");

  for (const meetingId of meetingIds) {
    const m = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        committee: true,
        attendance: { include: { person: true }, orderBy: { id: "asc" } },
        decisions: {
          orderBy: [{ sequence: "asc" }, { id: "asc" }],
          include: {
            votes: { include: { person: true }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
            recusals: { include: { person: true }, orderBy: { id: "asc" } },
            tabledBy: true,
            requisition: { select: { reference: true } },
            exercise: { select: { reference: true } },
            bqVersion: { select: { versionNo: true, exercise: { select: { reference: true } } } },
          },
        },
      },
    });
    if (!m) throw new Error(`Demo sitting ${meetingId} did not load.`);
    if (m.status !== "MINUTED" || !m.minutedAt) throw new Error(`Demo sitting ${meetingId} is not minuted; its trail would misstate it.`);

    type Entry = { entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason?: string };
    const trail: Entry[] = [];

    // Scheduled the day before the first matter was tabled (scheduleSitting).
    const firstTabled = m.decisions.map((d) => d.tabledAt).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0];
    const scheduledOn = new Date((firstTabled ?? m.meetingDate).getTime() - 24 * HOUR);
    trail.push({
      entity: "Meeting", entityId: m.id, entityLabel: `${m.committee.nameEn} sitting`, action: "CREATE", at: at(scheduledOn, 1),
      changes: diffFields(null, { committee: m.committee.nameEn, meetingDate: m.meetingDate, agenda: m.agenda, reference: m.reference }),
    });

    // Each matter tabled (tableMatter; a scope matter from its exercise, tableScope).
    for (const d of m.decisions) {
      if (!d.tabledAt) continue;
      if (d.bqVersion) {
        trail.push({
          entity: "CommitteeDecision", entityId: d.id, entityLabel: d.subject, action: "CREATE", at: at(d.tabledAt, 2, d.sequence),
          changes: scopeTabledAudit({ subject: d.subject, versionNo: d.bqVersion.versionNo, sitting: m.reference, committee: m.committee.nameEn, act: ACT_LABEL[d.act] ?? d.act, tabledBy: d.tabledBy?.name ?? null, tabledOn: d.tabledAt.toISOString().slice(0, 10) }),
        });
        continue;
      }
      trail.push({
        entity: "CommitteeDecision", entityId: d.id, entityLabel: d.subject, action: "CREATE", at: at(d.tabledAt, 2, d.sequence),
        changes: diffFields(null, {
          subject: d.subject, domain: d.domain, matterKind: d.matterKind, matterRef: d.matterRef, amount: d.amount?.toString() ?? null, act: d.act,
          tabledByPersonId: d.tabledByPersonId, dependsOnDecisionId: d.dependsOnDecisionId,
          linkedRequisition: d.requisition?.reference ?? null, linkedExercise: d.exercise?.reference ?? null,
          tabledBy: d.tabledBy?.name ?? null, tabledAt: d.tabledAt, sequence: d.sequence,
        }),
      });
    }

    // Started on the day (changeStatus).
    trail.push({ entity: "Meeting", entityId: m.id, entityLabel: m.reference, action: "UPDATE", at: at(m.meetingDate, 1), changes: diffFields({ status: "SCHEDULED" }, { status: "IN_PROGRESS" }) });

    // The register (recordAttendance), then recusals declared (declareRecusal).
    m.attendance.forEach((r, i) => {
      trail.push({
        entity: "MeetingAttendance", entityId: r.id, entityLabel: `${r.person.name} at ${m.reference}`, action: "CREATE", at: at(m.meetingDate, 1, 5 + i),
        changes: diffFields(null, { attended: r.attended, standingInForSeatId: r.standingInForSeatId }),
      });
    });
    for (const d of m.decisions) {
      d.recusals.forEach((r, i) => {
        trail.push({
          entity: "DecisionRecusal", entityId: r.id, entityLabel: `${r.person.name} on ${d.subject}`, action: "CREATE", at: at(r.declaredAt, 1, 30 + i),
          changes: diffFields(null, { member: r.person.name, reason: r.reason }),
        });
      });
    }

    // Votes, as the votes route records them, then the outcome after the last of them (recordOutcome).
    for (const d of m.decisions) {
      let last = d.decisionDate ?? m.meetingDate;
      d.votes.forEach((v, i) => {
        const when = at(v.recordedAt, 2, d.sequence * 10 + i);
        if (v.recordedAt > last) last = v.recordedAt;
        trail.push({
          entity: "Vote", entityId: v.id, entityLabel: `${v.person.name} on ${d.subject}`, action: "CREATE", at: when,
          changes: diffFields(null, { choice: v.choice, comment: v.comment, votedAt: v.votedAt }),
        });
      });
      if (d.outcome === "PENDING") continue;
      trail.push({
        entity: "CommitteeDecision", entityId: d.id, entityLabel: d.subject, action: "UPDATE", at: at(last, 3, d.sequence),
        changes: diffFields(
          { outcome: "PENDING", decisionDate: null, outcomeNote: "", notApprovedOutcomeId: null },
          {
            outcome: d.outcome, decisionDate: d.decisionDate, outcomeNote: d.outcomeNote, notApprovedOutcomeId: d.notApprovedOutcomeId,
            notApprovedOutcomeNameEn: d.notApprovedOutcomeNameEn, notApprovedOutcomeKind: d.notApprovedOutcomeKind,
            quorumRequired: d.quorumRequired, presentVoters: d.presentVoters, recusedCount: d.recusedCount,
            votingRule: d.votingRule, votingRuleProvenance: d.votingRuleProvenance, alternateMayVoteForRecused: d.alternateMayVoteForRecused,
          },
        ),
      });
    }

    // Minutes written (saveMinutes), then the sitting minuted (changeStatus).
    trail.push({ entity: "Meeting", entityId: m.id, entityLabel: m.reference, action: "UPDATE", at: at(m.minutedAt, 1), changes: diffFields({ minutes: "" }, { minutes: m.minutes }) });
    trail.push({
      entity: "Meeting", entityId: m.id, entityLabel: m.reference, action: "UPDATE", at: at(m.minutedAt, 1, 5),
      changes: diffFields({ status: "IN_PROGRESS", minutedAt: null }, { status: "MINUTED", minutedAt: m.minutedAt }),
    });

    trail.sort((a, b) => a.at.getTime() - b.at.getTime());
    await db.auditEntry.createMany({
      data: trail.map((e, i) => ({
        id: `${m.id}_au${i + 1}`, organisationId, entity: e.entity, entityId: e.entityId, entityLabel: e.entityLabel,
        action: e.action, at: e.at, changes: e.changes as object, reason: e.reason ?? "", ...DEMO_ACTOR,
      })),
    });
  }
}
