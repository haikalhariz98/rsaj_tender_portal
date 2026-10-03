/**
 * A contract's supervision, loaded (6.13 Part A, 4b). Reads only; every rule is in the pure modules beside this.
 * Server-only: called by the contract's page and by the supervision acts inside their own locked transaction
 * (`client` the transaction), so a decision reads the rows it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { officeHolders } from "@/lib/certificate/repo";
import type { LoadedContract } from "@/lib/contract/repo";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import type { DelegationFacts, SoOffice } from "./authority";
import { inDelay, type DelayReading } from "./delay";
import { programmeInForce, type PointIn, type RevisionFacts } from "./programme";
import { soOn } from "./so";
import type { DelegateKind, ProgrammeDecision, SupervisionAct } from "./types";

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
  pendingDeductions: { include: { person: { select: { name: true } }, policy: { select: { id: true, kind: true, policyNo: true } } }, orderBy: { paidOn: "asc" as const } },
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
export function delayOn(s: SupervisionRows, i: { today: string; dateForCompletion: string | null; policyPct: string | null }): DelayReading {
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
  });
}

/// The organisation's post-award policy (one row; unset where none).
export async function loadPostAwardPolicy(organisationId: string, client: Tx = db) {
  return client.postAwardPolicy.findUnique({ where: { organisationId } });
}
export type PostAwardPolicyRow = Awaited<ReturnType<typeof loadPostAwardPolicy>>;
