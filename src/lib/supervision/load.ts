/**
 * A contract's supervision, loaded (6.13 Part A, 4b). Reads only; every rule is in the pure modules beside this.
 * Server-only: called by the contract's page and by the supervision acts inside their own locked transaction
 * (`client` the transaction), so a decision reads the rows it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { officeHolders } from "@/lib/certificate/repo";
import type { OfficeHolders } from "@/lib/certificate/signature";
import type { CertificateKind } from "@/lib/certificate/types";
import { baselineFor } from "@/lib/contract/baseline";
import type { LoadedContract } from "@/lib/contract/repo";
import type { BaselineReason } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { recorderFaultOver, type ActNeed, type AuthorityFault, type DelegationFacts, type RecorderDay, type SoOffice } from "./authority";
import { supervisedHolders, type SupervisedRule } from "./blocks";
import { delayReadingsOf as delayReadingsBatch } from "./delay-batch";
import { assumedDelayIds, contractEnded, FINISHED_CONTRACT_STATUSES, inDelay, inDelayIds, type DelayReading } from "./delay";
import { programmeInForce, type PointIn, type RevisionFacts } from "./programme";
import { soOn } from "./so";
import type { DelegateKind, Finding, ProgrammeDecision, SupervisionAct } from "./types";
import { inOrder } from "@/lib/series";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export const supervisionInclude = {
  soAssignments: { orderBy: [{ effectiveOn: "asc" as const }, { recordedAt: "asc" as const }] as { effectiveOn?: "asc"; recordedAt?: "asc" }[] },
  soDelegations: {
    include: {
      scope: { orderBy: { act: "asc" as const } },
      letterCertificate: { select: { id: true, status: true, number: true, certificateDate: true } },
      noticeCertificate: { select: { id: true, status: true, number: true, certificateDate: true } },
    },
    orderBy: { recordedAt: "asc" as const },
  },
  possession: { include: { recordedBy: { select: { id: true, name: true } }, baseline: { select: { version: true } } } },
  workProgrammes: {
    include: { points: { orderBy: { day: "asc" as const } }, scrutinisedBy: { select: { name: true } }, decidedBy: { select: { name: true } }, direction: { select: { id: true, cause: true, directedOn: true } } },
    orderBy: { revision: "asc" as const },
  },
  progressRecords: { include: { recordedBy: { select: { name: true } } }, orderBy: { day: "asc" as const } },
  siteDiaryEntries: { include: { officer: { select: { id: true, name: true } } }, orderBy: { day: "asc" as const } },
  diaryEndorsements: { include: { person: { select: { name: true } } }, orderBy: { visitedOn: "asc" as const } },
  siteMeetings: { include: { chair: { select: { name: true } } }, orderBy: { heldOn: "asc" as const } },
  complianceObservations: { include: { person: { select: { name: true } } }, orderBy: { observedOn: "asc" as const } },
  programmeDirections: { include: { person: { select: { name: true } } }, orderBy: { directedOn: "asc" as const } },
  pendingDeductions: { include: { person: { select: { name: true } }, policy: { select: { id: true, kind: true, policyNo: true } }, valuation: { select: { certificate: { select: { status: true, number: true, sequence: true } } } } }, orderBy: { paidOn: "asc" as const } },
  earlyActionDecisions: { include: { person: { select: { name: true } } }, orderBy: { decidedOn: "asc" as const } },
  contractParties: { orderBy: [{ kind: "asc" as const }, { recordedAt: "asc" as const }] as { kind?: "asc"; recordedAt?: "asc" }[] },
  siteRecordsHandovers: { include: { person: { select: { name: true } } }, orderBy: { handedOverOn: "asc" as const } },
};

export type SupervisionRows = Awaited<ReturnType<typeof readTyped>>;
function readTyped(contractId: string, client: Tx) {
  return client.contract.findUniqueOrThrow({ where: { id: contractId }, select: { id: true, ...supervisionInclude } });
}

export async function loadSupervision(contractId: string, client: Tx = db): Promise<SupervisionRows> {
  return readTyped(contractId, client);
}

/// The delegations as the rules read them.
export const delegationFactsOf = (s: SupervisionRows): DelegationFacts[] =>
  s.soDelegations.map((d) => ({
    id: d.id,
    kind: d.kind as DelegateKind,
    delegatePersonId: d.delegatePersonId,
    letterIssuedOn: d.letterCertificate.status === "ISSUED" ? day(d.letterCertificate.certificateDate) : null,
    revokedOn: day(d.revokedOn),
    scope: d.scope.map((x) => x.act as SupervisionAct),
  }));

/// The S.O. office in force on a day, with its holders and those acting in it (6.1 whole-office delegations).
export async function soOfficeOn(l: LoadedContract, s: SupervisionRows, on: string, client: Tx = db): Promise<{ office: SoOffice; assignment: SupervisionRows["soAssignments"][number] } | null> {
  const a = soOn(s.soAssignments.map((x) => ({ ...x, effectiveOn: storedDay(x.effectiveOn) })), on);
  if (!a) return null;
  const h = await officeHolders(l, a.roleCode, on, client);
  const row = s.soAssignments.find((x) => x.id === a.id)!;
  return { office: { roleLabel: a.roleLabel, holderIds: h.holderIds, actingIds: h.delegates.map((d) => d.personId) }, assignment: row };
}

/**
 * The officer who records a supervision act, judged on the act's own day AND on the day it is recorded (`recorderFaultOver`): the act's day is what the form says, so a representative
 * could otherwise back-date an act to before their letter was issued, when they were no representative, and record what the letter does not cover by naming the S.O. as the Person.
 * `soOnDay` is the S.O. office already read for the act's day; today's is read here when it is another day. Null: allowed (no recorder, the act is the Person's own).
 */
export async function recorderFaultToday(l: LoadedContract, s: SupervisionRows, recorderId: string | null, need: ActNeed, on: string, soOnDay: SoOffice | null, today: string, client: Tx = db): Promise<Finding<AuthorityFault> | null> {
  if (!recorderId) return null;
  const days: RecorderDay[] = [{ so: soOnDay, day: on }];
  if (today !== on) days.push({ so: (await soOfficeOn(l, s, today, client))?.office ?? null, day: today });
  return recorderFaultOver(recorderId, need, days, delegationFactsOf(s));
}

/**
 * Who holds a certificate's supervised block on a day (6.14's SO / SO_REP / RECOMMENDING_OFFICER rules), from the
 * contract's supervision: the S.O. office's holders (and those acting in it), or its Principal Representatives
 * in force. Null: nobody can (no S.O. on the day, or a rule not yet resolved).
 */
export async function supervisedHoldersOn(l: LoadedContract, rule: SupervisedRule, on: string, client: Tx = db, kind: CertificateKind | null = null): Promise<{ holders: OfficeHolders | null; soLabel: string | null }> {
  const s = await loadSupervision(l.contract.id, client);
  const a = soOn(s.soAssignments.map((x) => ({ ...x, effectiveOn: storedDay(x.effectiveOn) })), on);
  if (!a) return { holders: null, soLabel: null };
  return { holders: supervisedHolders(rule, await officeHolders(l, a.roleCode, on, client), delegationFactsOf(s), on, kind), soLabel: a.roleLabel };
}

/// The programme revisions as the rules read them.
export const revisionsOf = (s: SupervisionRows): (RevisionFacts & { id: string; points: PointIn[] })[] =>
  s.workProgrammes.map((p) => ({
    id: p.id,
    revision: p.revision,
    submittedOn: storedDay(p.submittedOn),
    scrutinisedOn: day(p.scrutinisedOn),
    reasonable: p.reasonable,
    decision: p.decision as ProgrammeDecision | null,
    decidedOn: day(p.decidedOn),
    points: p.points.map((x) => ({ day: storedDay(x.day), plannedPct: x.plannedPct.toString() })),
  }));

/// In Delay on a day (FR-SUP-010), from the approved programme in force, the latest progress on or before the
/// day, the baseline's date for completion and the policy's percentage.
export function delayOn(s: SupervisionRows, i: { today: string; dateForCompletion: string | null; policyPct: string | null; status: string }): DelayReading {
  const revs = revisionsOf(s);
  const prog = programmeInForce(revs, i.today);
  const latest = [...s.progressRecords].reverse().find((r) => storedDay(r.day) <= i.today) ?? null;
  return inDelay({
    today: i.today,
    possessed: !!s.possession && storedDay(s.possession.possessionOn) <= i.today,
    dateForCompletion: i.dateForCompletion,
    programme: prog ? prog.points : null,
    latest: latest ? { day: storedDay(latest.day), actualPct: latest.actualPct.toString() } : null,
    policyPct: i.policyPct,
    ended: contractEnded(i.status),
  });
}

/// In Delay for a set of contracts, in O(contracts) rows (6.13A residual D3): see delay-batch.ts.
export async function delayReadingsOf(organisationId: string, rows: readonly { id: string; dateForCompletion: Date | null }[], today: string, client: Tx = db): Promise<Map<string, DelayReading>> {
  return delayReadingsBatch(organisationId, rows, today, client);
}

/// Everything a person was recorded for on the contract, by day (review 6): the supervision's rows and the
/// certificate signatures on the contract's certificates.
export async function actsByPerson(s: SupervisionRows, contractId: string, client: Tx = db): Promise<{ personId: string | null; day: string | null }[]> {
  const sigs = await client.certificateSignature.findMany({ where: { certificate: { contractId } }, select: { personId: true, signedOn: true } });
  // 6.13 Part A steps 3 and 4: the acts recorded for a representative under their delegation (a valuation; a
  // variation's origination, review, commencement support, instruction, measurement, daywork, order and adjustment).
  const [valuations, variations, instructions, measurements, dayworks, orders, adjustments] = await inOrder(
    () => client.interimValuation.findMany({ where: { contractId }, select: { personId: true, valuationDate: true } }),
    () => client.variation.findMany({ where: { contractId }, select: { originatorPersonId: true, recordedOn: true, reviewedByPersonId: true, reviewedOn: true, commencedSupportPersonId: true, commencedOn: true } }),
    () => client.variationInstruction.findMany({ where: { variation: { contractId } }, select: { personId: true, certificate: { select: { openedOn: true } } } }),
    () => client.variationMeasurement.findMany({ where: { variation: { contractId } }, select: { personId: true, measuredOn: true } }),
    () => client.dayworkRecord.findMany({ where: { variation: { contractId } }, select: { personId: true, workedOn: true } }),
    () => client.variationCertificate.findMany({ where: { variation: { contractId } }, select: { personId: true, certificate: { select: { openedOn: true } } } }),
    () => client.sumAdjustment.findMany({ where: { contractId }, select: { personId: true, certificate: { select: { openedOn: true } } } }));
  return [
    ...valuations.map((x) => ({ personId: x.personId, day: storedDay(x.valuationDate) })),
    ...variations.flatMap((x) => [{ personId: x.originatorPersonId, day: storedDay(x.recordedOn) }, { personId: x.reviewedByPersonId, day: day(x.reviewedOn) }, { personId: x.commencedSupportPersonId, day: day(x.commencedOn) }]),
    ...instructions.map((x) => ({ personId: x.personId, day: storedDay(x.certificate.openedOn) })),
    ...measurements.map((x) => ({ personId: x.personId, day: storedDay(x.measuredOn) })),
    ...dayworks.map((x) => ({ personId: x.personId, day: storedDay(x.workedOn) })),
    ...orders.map((x) => ({ personId: x.personId, day: storedDay(x.certificate.openedOn) })),
    ...adjustments.map((x) => ({ personId: x.personId, day: storedDay(x.certificate.openedOn) })),
    ...(s.possession ? [{ personId: s.possession.recordedBy.id, day: storedDay(s.possession.possessionOn) }] : []),
    ...s.workProgrammes.flatMap((p) => [{ personId: p.scrutinisedByPersonId, day: day(p.scrutinisedOn) }, { personId: p.decidedByPersonId, day: day(p.decidedOn) }]),
    ...s.progressRecords.map((p) => ({ personId: p.recordedByPersonId, day: storedDay(p.day) })),
    ...s.siteDiaryEntries.map((e) => ({ personId: e.officerPersonId, day: storedDay(e.day) })),
    ...s.diaryEndorsements.map((e) => ({ personId: e.personId, day: storedDay(e.visitedOn) })),
    ...s.siteMeetings.map((m) => ({ personId: m.chairPersonId, day: storedDay(m.heldOn) })),
    ...s.complianceObservations.map((o) => ({ personId: o.personId, day: storedDay(o.observedOn) })),
    ...s.programmeDirections.map((o) => ({ personId: o.personId, day: storedDay(o.directedOn) })),
    ...s.pendingDeductions.map((o) => ({ personId: o.personId, day: storedDay(o.paidOn) })),
    ...s.earlyActionDecisions.map((o) => ({ personId: o.personId, day: storedDay(o.decidedOn) })),
    ...s.siteRecordsHandovers.map((o) => ({ personId: o.personId, day: storedDay(o.handedOverOn) })),
    ...sigs.map((g) => ({ personId: g.personId, day: storedDay(g.signedOn) })),
  ];
}

/// The exercise's sourcing method's authority key (review 4): what the S.O.'s rows are confined by, as every engine caller reads it.
export async function methodKeyOf(l: LoadedContract, client: Tx = db): Promise<string | null> {
  return (await client.sourcingMethod.findFirst({ where: { organisationId: l.org.id, code: l.ex.sourcingMethodCode }, select: { authorityMethodKey: true } }))?.authorityMethodKey ?? null;
}

/**
 * Review 14: the organisation's contracts In Delay today, over the whole set (every possessed contract, read in
 * batched queries), so the Projects list's In Delay view pages within them rather than filtering one page.
 */
export async function inDelayContractIds(organisationId: string, today: string, client: Tx = db): Promise<{ ids: string[]; assumed: Set<string> }> {
  const possessed = await client.contract.findMany({
    // An ended contract is never In Delay (`contractEnded`): not read at all.
    where: { organisationId, possession: { isNot: null }, status: { notIn: [...FINISHED_CONTRACT_STATUSES] } },
    select: { id: true, baselines: { where: { version: { not: null } }, select: { id: true, version: true, reason: true, recordedOn: true, dateForCompletion: true } } },
  });
  const rows = possessed.map((c) => {
    const inForce = baselineFor(c.baselines.map((b) => ({ ...b, reason: b.reason as BaselineReason | null, recordedOn: day(b.recordedOn) })), today);
    return { id: c.id, dateForCompletion: inForce?.dateForCompletion ?? null };
  });
  const readings = await delayReadingsOf(organisationId, rows, today, client);
  // The 6.13A residual review: which of them rest on the straight-line assumption (tagged ASSUMED only those).
  return { ids: inDelayIds(readings), assumed: new Set(assumedDelayIds(readings)) };
}


/// The organisation's post-award policy (one row; unset where none).
export async function loadPostAwardPolicy(organisationId: string, client: Tx = db) {
  return client.postAwardPolicy.findUnique({ where: { organisationId } });
}
export type PostAwardPolicyRow = Awaited<ReturnType<typeof loadPostAwardPolicy>>;
