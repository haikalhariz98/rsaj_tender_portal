import { db } from "@/lib/db";
import { seatsInForce } from "./seats";
import { issuedInForce } from "@/lib/authority/issue";
import type { TablingSource } from "./table-prefill";

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

/**
 * The amount a record's tabling link asks the drawer to start from, read here on the server
 * rather than carried in the URL (table-prefill.ts): a requisition's estimated value (a gate
 * matter's amount must equal it), or an award's awarded value. The record must be the
 * organisation's; otherwise nothing is filled in. The figure is the stored decimal, unrounded.
 */
/// `hidden`: the restricted exercises the reader may not see; an award of one fills in nothing (FR-MTD-007).
export async function tablingAmount(organisationId: string, source: TablingSource, hidden: readonly string[]): Promise<string | null> {
  if (!source) return null;
  const organisation = organisationId;
  if (source.kind === "requisition") {
    const r = await db.requisition.findFirst({ where: { id: source.id, organisationId: organisation }, select: { estimatedValue: true } });
    return r ? r.estimatedValue.toString() : null;
  }
  const a = await db.award.findFirst({ where: { id: source.id, organisationId: organisation, ...(hidden.length ? { exerciseId: { notIn: [...hidden] } } : {}) }, select: { awardedValue: true } });
  return a?.awardedValue != null ? a.awardedValue.toString() : null;
}

export async function listCommittees(organisationId: string) {
  const id = organisationId;

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
    carriedLabelEn: c.carriedLabelEn,
    carriedLabelMs: c.carriedLabelMs,
    seatCount: seatsInForce(c.members, today).length,
    filledCount: seatsInForce(c.members, today).filter((m) => m.personId != null).length,
    meetingCount: c._count.meetings,
  }));
}

export type CommitteeSummary = Awaited<ReturnType<typeof listCommittees>>[number];

export async function getCommittee(organisationId: string, code: string) {
  const id = organisationId;

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
          decisions: { select: { outcome: true, withdrawnAt: true } },
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
export async function rulesRoutingTo(organisationId: string, committeeCode: string) {
  const id = organisationId;

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
export async function listNotApprovedOutcomes(organisationId: string) {
  const id = organisationId;
  return db.notApprovedOutcome.findMany({
    where: { organisationId: id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { committee: { select: { nameEn: true } }, _count: { select: { decisions: true } } },
  });
}
