/**
 * A contract's post-award matters, loaded (6.13 Part B run 1b; ADR 0029). Reads only; every rule is in the pure modules
 * beside this. Server-only: called by the contract's screens and by the acts inside their locked transaction.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { recordOf } from "@/lib/requisition/repo";
import { matterInclude } from "@/lib/variation/load";

import type { ContractMatterKind, MatterFacts } from "./matter";
import type { MatterFact } from "./tabling";

const name = { select: { id: true, name: true } } as const;
const certSelect = { id: true, kind: true, status: true, number: true, sequence: true, certificateDate: true, issuedAt: true, openedOn: true } as const;

export const matterRowInclude = {
  person: name,
  routes: { include: { steps: { orderBy: { sequence: "asc" as const } } }, orderBy: [{ openedAt: "asc" as const }, { id: "asc" as const }] as Prisma.ApprovalInstanceOrderByWithRelationInput[] },
  decisions: { include: matterInclude, orderBy: { tabledAt: "asc" as const } },
  eotClaim: {
    include: {
      person: name,
      determinedBy: name,
      programme: { select: { id: true, revision: true, decision: true } },
      excludedByCondition: { select: { id: true, kindName: true, excludesEot: true, satisfiedOn: true } },
      notices: { include: { notice: true } },
      reasons: { orderBy: [{ sortOrder: "asc" as const }, { delayFrom: "asc" as const }] },
      extensions: { include: { certificate: { select: certSelect } }, orderBy: { recordedAt: "asc" as const } },
      lossExpenseClaims: true,
      attachments: { where: { detachedAt: null }, select: { id: true, purpose: true, version: { select: { withdrawnAt: true } } } },
    },
  },
  periodExtension: { include: { agreements: { include: { certificate: { select: certSelect } } } } },
  lossExpenseClaim: true,
  ladWaiver: true,
} satisfies Prisma.ContractMatterInclude;

export type MatterRow = Awaited<ReturnType<typeof readMatters>>[number];
function readMatters(contractId: string, client: Tx) {
  return client.contractMatter.findMany({ where: { contractId }, include: matterRowInclude, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
}

export async function loadMatters(contractId: string, client: Tx = db): Promise<MatterRow[]> {
  return readMatters(contractId, client);
}

/// The matter as its rules read it. `seriesSet`: whether the contract_matter series exists (read where needed).
export const matterFactsOf = (m: MatterRow, seriesSet = true): MatterFacts => ({
  kind: m.kind as ContractMatterKind,
  reference: m.reference,
  closed: m.closedAt ? { reason: m.closeReason } : null,
  seriesSet,
  routes: m.routes.map((r) => ({ id: r.id, status: r.status })),
  approvedRouteId: m.approvedRouteId,
});

/// The committee matters tabled from it, as the one tabling rule reads them.
export const tablingFactsOf = (m: MatterRow): MatterFact[] => m.decisions.map((d) => ({ withdrawn: !!d.withdrawnAt, domain: d.domain, committeeCode: d.meeting.committee.code, outcome: d.outcome as MatterFact["outcome"] }));

/// A committee matter's decision record (as a variation's are read).
export const decisionRecordOf = (d: MatterRow["decisions"][number]) => recordOf(d);

/// The route waiting for a decision, if any.
export const openRouteOf = (m: MatterRow) => m.routes.find((r) => r.status === "PENDING") ?? null;
