/**
 * Contracts after award, loaded (6.12). Reads only, apart from the one lock helper every contract
 * write goes through; every rule is in the pure modules beside this.
 *
 * The canonical lock order for every post-award write (6.12, 6.13, 6.14; rulings condition): Requisition
 * → SourcingExercise → (window, party, sale: none of 6.12's acts touch them) → Award → Contract →
 * Certificate → the domain row → Supplier last. `withLockedContract` extends 6.11's `withLockedAward`
 * (requisition → exercise → award) with the contract row, then re-reads the contract and everything a
 * contract act judges inside the write's own transaction. 6.11's register writes (`lodgeSecurity`,
 * `reviewSecurity`, `lodgePolicy`, `reviewPolicy`) hold the award's lock, so the signature reads the
 * bond and policy registers on rows a concurrent rejection cannot change mid-check. A source scan
 * (`lock-order.test.ts`) keeps every contract write on this helper and these statements in this order.
 */

import type { Tx } from "@/lib/audit/record";
import { loadAward, withLockedAward, type LoadedAward } from "@/lib/award/repo";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";

export const contractInclude = {
  assemblyParts: { orderBy: [{ sortOrder: "asc" as const }, { partCode: "asc" as const }] },
  reconciliations: { include: { checkedBy: { select: { id: true, name: true } }, amendments: { include: { officer: { select: { id: true, name: true } } }, orderBy: { recordedAt: "asc" as const } } }, orderBy: { comparison: "asc" as const } },
  checks: { include: { completedBy: { select: { id: true, name: true } }, corrections: { orderBy: { recordedAt: "asc" as const } }, rates: { orderBy: { recordedAt: "asc" as const } } }, orderBy: { kind: "asc" as const } },
  legalReviews: { include: { submittedBy: { select: { id: true, name: true } }, reviewer: { select: { id: true, name: true } } }, orderBy: { iteration: "asc" as const } },
  signatures: { include: { person: { select: { id: true, name: true } } }, orderBy: { recordedAt: "asc" as const } },
  briefing: true,
  baselines: { include: { sections: { orderBy: { sortOrder: "asc" as const } } }, orderBy: [{ version: { sort: "asc" as const, nulls: "last" as const } }] },
  copies: { include: { recipient: { select: { id: true, nameEn: true } } }, orderBy: { copyNo: "asc" as const } },
  custodyItems: {
    include: {
      custodian: { select: { id: true, name: true } },
      security: { select: { id: true, kind: true, instrumentRef: true } },
      policy: { select: { id: true, kind: true, policyNo: true } },
      movements: { include: { person: { select: { id: true, name: true } } }, orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }] },
    },
    orderBy: { recordedAt: "asc" as const },
  },
  attachments: { select: { id: true, purpose: true, attachedAt: true, detachedAt: true, versionId: true, version: { select: { id: true, documentId: true, versionNo: true, sha256: true, withdrawnAt: true, document: { select: { title: true } } } } }, orderBy: { attachedAt: "asc" as const } },
  securities: { include: { issuer: { select: { id: true, name: true } }, verifiedBy: { select: { name: true } } }, orderBy: { lodgedOn: "asc" as const } },
  policies: { include: { issuer: { select: { id: true, name: true } }, verifiedBy: { select: { name: true } }, wcCheckedBy: { select: { id: true, name: true } } }, orderBy: { lodgedOn: "asc" as const } },
};

async function readContract(id: string, organisationId: string, client: Tx) {
  return client.contract.findFirst({ where: { id, organisationId }, include: contractInclude });
}

export type ContractRow = NonNullable<Awaited<ReturnType<typeof readContract>>>;
export type LoadedContract = LoadedAward & { contract: ContractRow };

/// A contract with its award, exercise and requisition (6.11's loader), read on one client.
export async function loadContract(id: string, client: Tx = db): Promise<LoadedContract | null> {
  const org = await exerciseOrg(client);
  if (!org) return null;
  const c = await client.contract.findFirst({ where: { id, organisationId: org.id }, select: { awardId: true } });
  if (!c) return null;
  const l = await loadAward(c.awardId, client);
  if (!l) return null;
  const contract = await readContract(id, l.org.id, client);
  if (!contract) return null;
  return { ...l, contract };
}

/// The contract's award, read without a lock, to know what to lock.
export async function awardOfContract(contractId: string): Promise<string | null> {
  return (await db.contract.findUnique({ where: { id: contractId }, select: { awardId: true } }))?.awardId ?? null;
}

/**
 * Lock the requisition, the exercise, the award (6.11's helper, in that order), then the contract, and
 * re-read all of them. Null: the contract or its award is gone, or the award no longer names it.
 */
export async function withLockedContract<T>(contractId: string, fn: (tx: Tx, l: LoadedContract) => Promise<T>): Promise<T | null> {
  const awardId = await awardOfContract(contractId);
  if (!awardId) return null;
  return withLockedAward(awardId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
    const contract = await readContract(contractId, l.org.id, tx);
    if (!contract || contract.awardId !== l.award.id) return null;
    return fn(tx, { ...l, contract });
  });
}

/// What the document store judges a contract's attachments on (`documents/owner-facts.ts`).
export const CONTRACT_FACTS_SELECT = {
  status: true,
  number: true,
  award: { select: { reference: true, awardeeName: true } },
  signatures: { select: { party: true } },
  legalReviews: { select: { id: true } },
} as const;

/// A contract as the trail and the documents name it.
export const contractLabel = (c: { number: string; award: { awardeeName: string } }) => `Contract ${c.number} · ${c.award.awardeeName}`;
