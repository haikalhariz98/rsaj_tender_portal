import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { holdersOf } from "@/lib/people/roster";

import { assessSitting } from "./assess-sitting";
import { outcomesOffered, type DecisionOutcome } from "./matter";

/**
 * Sittings, loaded. Reads only; every rule is in the pure modules beside this, and
 * this file hands them rows.
 */

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

export async function organisationId(code = ORGANISATION_CODE): Promise<string | null> {
  const org = await db.organisation.findUnique({ where: { code }, select: { id: true } });
  return org?.id ?? null;
}

/// Every sitting of the organisation, newest first, with what the list shows.
export async function listSittings() {
  const orgId = await organisationId();
  if (!orgId) return { sittings: [], committees: [] };

  const [meetings, committees, roster] = await Promise.all([
    db.meeting.findMany({
      where: { committee: { organisationId: orgId } },
      orderBy: { meetingDate: "desc" },
      include: {
        committee: { include: { members: true } },
        attendance: true,
        decisions: { select: { outcome: true } },
      },
    }),
    db.committee.findMany({
      where: { organisationId: orgId },
      orderBy: [{ isExternal: "asc" }, { nameEn: "asc" }],
      select: { id: true, nameEn: true, retiredOn: true },
    }),
    loadRoster(ORGANISATION_CODE),
  ]);

  const sittings = meetings.map((m) => {
    const a = assessSitting({
      meetingDate: m.meetingDate,
      seats: m.committee.members,
      roster,
      quorum: m.committee.quorum,
      votingRule: m.committee.votingRule,
      attendance: m.attendance,
      matters: [],
    });
    return {
      id: m.id,
      reference: m.reference,
      meetingDate: m.meetingDate,
      status: m.status,
      committeeName: m.committee.nameEn,
      matters: m.decisions.length,
      pending: m.decisions.filter((d) => d.outcome === "PENDING").length,
      present: a.present.voterIds.length,
      quorum: m.committee.quorum,
    };
  });

  return { sittings, committees };
}

export type SittingSummary = Awaited<ReturnType<typeof listSittings>>["sittings"][number];

/// One sitting with everything its screen, its actions and the votes route need.
export async function loadSitting(id: string) {
  const orgId = await organisationId();
  if (!orgId) return null;

  const meeting = await db.meeting.findFirst({
    where: { id, committee: { organisationId: orgId } },
    include: {
      committee: { include: { members: { orderBy: [{ position: "asc" }, { id: "asc" }] } } },
      attendance: { include: { person: true } },
      decisions: {
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
        include: {
          votes: { include: { person: true }, orderBy: { recordedAt: "asc" } },
          recusals: { include: { person: true } },
          tabledBy: true,
          notApprovedOutcome: true,
          dependsOn: { select: { id: true, subject: true, outcome: true } },
        },
      },
    },
  });
  if (!meeting) return null;

  const [roster, outcomes] = await Promise.all([
    loadRoster(ORGANISATION_CODE),
    db.notApprovedOutcome.findMany({
      where: { organisationId: orgId },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
  ]);

  const assessment = assessSitting({
    meetingDate: meeting.meetingDate,
    seats: meeting.committee.members,
    roster,
    quorum: meeting.committee.quorum,
    votingRule: meeting.committee.votingRule,
    attendance: meeting.attendance,
    matters: meeting.decisions.map((d) => ({
      id: d.id,
      act: d.act,
      tabled: d.tabledByPersonId != null,
      outcome: d.outcome,
      dependencyOutcome: (d.dependsOn?.outcome as DecisionOutcome | undefined) ?? null,
      recusedIds: d.recusals.map((r) => r.personId),
      votes: d.votes.map((v) => ({ personId: v.personId, choice: v.choice })),
    })),
  });

  const secretariat = meeting.committee.secretariatRoleCode;
  const secretariatHolders = secretariat
    ? holdersOf(roster, secretariat, meeting.meetingDate).filter((p) => p.isActive)
    : [];

  return {
    organisationId: orgId,
    meeting: {
      ...meeting,
      decisions: meeting.decisions.map((d) => ({ ...d, amount: num(d.amount) })),
    },
    roster,
    assessment,
    outcomesOffered: outcomesOffered(outcomes, meeting.committeeId, meeting.meetingDate),
    outcomesAll: outcomes,
    secretariat: {
      code: secretariat,
      office: secretariat ? (roster.offices.find((o) => o.code === secretariat) ?? null) : null,
      holders: secretariatHolders.map((p) => ({ id: p.id, name: p.name })),
    },
  };
}

export type LoadedSitting = NonNullable<Awaited<ReturnType<typeof loadSitting>>>;
