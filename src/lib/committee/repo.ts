import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { seatsInForce } from "./seats";
import { issuedInForce } from "@/lib/authority/issue";

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
      members: true,
      _count: { select: { meetings: true } },
    },
  });

  const today = new Date();
  return committees.map((c) => ({
    id: c.id,
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
    notes: c.notes,
    aliases: c.aliases,
    retiredOn: c.retiredOn,
    secretariatRoleCode: c.secretariatRoleCode,
    votingRule: c.votingRule,
    votingRuleProvenance: c.votingRuleProvenance,
    alternateMayVoteForRecused: c.alternateMayVoteForRecused,
    alternateMayVoteForRecusedProvenance: c.alternateMayVoteForRecusedProvenance,
    seatCount: seatsInForce(c.members, today).length,
    filledCount: seatsInForce(c.members, today).filter((m) => m.personId != null).length,
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
          attendance: true,
          decisions: { select: { outcome: true } },
        },
      },
    },
  });
  if (!committee) return null;

  return {
    ...committee,
    valueScopeMin: num(committee.valueScopeMin),
    valueScopeMax: num(committee.valueScopeMax),
    meetings: committee.meetings,
  };
}

export type CommitteeDetail = NonNullable<Awaited<ReturnType<typeof getCommittee>>>;

/// Which DAL rows route to this body — the reason it exists, drawn from the matrix
/// rather than restated by hand.
export async function rulesRoutingTo(committeeCode: string) {
  const id = await organisationId();
  if (!id) return [];

  const version = await db.authorityMatrix.findFirst({
    where: { organisationId: id, ...issuedInForce(new Date()) },
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

/// Not-approved outcomes of the organisation, retired ones included, for the list.
export async function listNotApprovedOutcomes() {
  const id = await organisationId();
  if (!id) return [];
  return db.notApprovedOutcome.findMany({
    where: { organisationId: id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { committee: { select: { nameEn: true } }, _count: { select: { decisions: true } } },
  });
}
