/**
 * The Delegation row lock, and the one read of a delegation taken under it (LESSONS:
 * every write re-validates inside its transaction on locked rows). Both paths that
 * attach a signed recommendation — `saveDelegation` and the generic attach behind the
 * shared panel (`withLockedOwner`) — take the lock here and judge `attachFault` and the
 * recommendation rules on what this returns, never on a read made before it.
 */

import type { Tx } from "@/lib/audit/record";
import { isLive } from "@/lib/documents/evidence";

import type { DelegationTerms, RecommendationFacts } from "./recommendation";

/// What is read of a delegation under its lock: its terms, its recommendation and the
/// names the trail carries. The legacy mark is read, never written.
export const LOCKED_DELEGATION_SELECT = {
  id: true,
  organisationId: true,
  fromPersonId: true,
  roleCode: true,
  toPersonId: true,
  effectiveFrom: true,
  effectiveTo: true,
  capabilityCodes: true,
  holderRecommendation: true,
  recommendationTextOnlyAtLanding: true,
  fromPerson: { select: { name: true } },
  toPerson: { select: { name: true } },
  attachments: { where: { purpose: "HOLDER_RECOMMENDATION" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } },
} as const;

export interface LockedDelegation extends RecommendationFacts, DelegationTerms {
  id: string;
  organisationId: string;
  effectiveTo: Date | null;
  capabilityCodes: string[];
  fromPerson: { name: string };
  toPerson: { name: string };
}

/**
 * Lock the delegation's row (`FOR UPDATE`), then read it. Null where it does not exist
 * in the organisation. The lock is always taken before the read.
 */
export async function lockDelegation(tx: Tx, id: string, organisationId: string): Promise<LockedDelegation | null> {
  await tx.$queryRaw`SELECT id FROM "Delegation" WHERE id = ${id} FOR UPDATE`;
  const row = await tx.delegation.findFirst({ where: { id, organisationId }, select: LOCKED_DELEGATION_SELECT });
  if (!row) return null;
  const { attachments, ...rest } = row;
  return {
    ...rest,
    liveAttachments: attachments.filter(isLive).length,
    everAttachments: attachments.length,
  };
}

/**
 * Serialise the writers of an organisation's delegations (F8). A loop is looked for among the delegations already stored, so two saves that would each close
 * it with the other (A to B, B to A) would both pass if they ran side by side. The transaction-scoped advisory lock queues them: the second reads the first.
 * Taken before any row lock, by every writer of a delegation, and released with the transaction.
 */
export async function lockDelegationsOf(tx: Tx, organisationId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delegation:${organisationId}`}))`;
}

/// The same for reporting lines (a loop of superiors, or two lines for one person over one period): one writer at a time per organisation.
export async function lockReportingLinesOf(tx: Tx, organisationId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reporting_line:${organisationId}`}))`;
}
