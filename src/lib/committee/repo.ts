import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

async function organisationId(code = ORGANISATION_CODE) {
  const org = await db.organisation.findUnique({ where: { code }, select: { id: true } });
  return org?.id ?? null;
}

export async function listCommittees() {
  const id = await organisationId();
  if (!id) return [];

  const committees = await db.committee.findMany({
    where: { organisationId: id },
    orderBy: [{ isExternal: "asc" }, { code: "asc" }],
    include: {
      members: { where: { effectiveTo: null } },
      _count: { select: { meetings: true } },
    },
  });

  return committees.map((c) => ({
    code: c.code,
    nameEn: c.nameEn,
    nameMs: c.nameMs,
    mandate: c.mandate,
    governingSource: c.governingSource,
    action: c.action,
    isExternal: c.isExternal,
    quorum: c.quorum,
    quorumProvenance: c.quorumProvenance,
    compositionProvenance: c.compositionProvenance,
    valueScopeMin: num(c.valueScopeMin),
    valueScopeMax: num(c.valueScopeMax),
    seatCount: c.members.length,
    filledCount: c.members.filter((m) => m.personId != null).length,
    meetingCount: c._count.meetings,
  }));
}

export type CommitteeSummary = Awaited<ReturnType<typeof listCommittees>>[number];

export async function getCommittee(code: string) {
  const id = await organisationId();
  if (!id) return null;

  const committee = await db.committee.findUnique({
    where: { organisationId_code: { organisationId: id, code } },
    include: {
      members: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: { person: true },
      },
      meetings: {
        orderBy: { meetingDate: "desc" },
        include: {
          attendance: { include: { person: true } },
          decisions: {
            orderBy: { id: "asc" },
            include: { votes: { include: { person: true } } },
          },
        },
      },
    },
  });
  if (!committee) return null;

  return {
    ...committee,
    valueScopeMin: num(committee.valueScopeMin),
    valueScopeMax: num(committee.valueScopeMax),
    meetings: committee.meetings.map((m) => ({
      ...m,
      decisions: m.decisions.map((d) => ({ ...d, amount: num(d.amount) })),
    })),
  };
}

export type CommitteeDetail = NonNullable<Awaited<ReturnType<typeof getCommittee>>>;

/// Which DAL rows route to this body — the reason it exists, drawn from the matrix
/// rather than restated by hand.
export async function rulesRoutingTo(committeeCode: string) {
  const id = await organisationId();
  if (!id) return [];

  const version = await db.authorityMatrix.findFirst({
    where: { organisationId: id },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true },
  });
  if (!version) return [];

  const rules = await db.authorityRule.findMany({
    where: {
      authorityMatrixId: version.id,
      OR: [{ committeeCode }, { approverCode: committeeCode }],
    },
    orderBy: [{ domain: "asc" }, { sortOrder: "asc" }],
    select: {
      ruleKey: true,
      domain: true,
      labelEn: true,
      clause: true,
      committeeAct: true,
      approverCode: true,
      nonDelegable: true,
    },
  });

  return rules;
}
