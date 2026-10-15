import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { loadBidContext } from "@/lib/portal/bids/context-store";

/**
 * The history of an exercise's published sealing key, as a supplier may read it (SR-13, ADR 0036 D11; build plan step 11, moved from step 8). The staff Sealing key card and the
 * supplier's list read the same rows in the same order, so they cannot disagree (`KEY_CHANGE_ORDER`). A supplier sees when the key changed and the two fingerprints, never why
 * or by whom: the reason and the officer are the organisation's. Another supplier's exercise, another organisation's and one that does not exist all read as null.
 */

/// Newest first, the id breaking a tie, for both readers.
export const KEY_CHANGE_ORDER = [{ at: "desc" }, { id: "desc" }] as const;

export interface KeyHistory {
  /// The fingerprint the exercise is published with now, which is the one printed on a receipt. Null where none is published.
  fingerprint: string | null;
  changes: { id: string; at: Date; fromFingerprint: string; toFingerprint: string }[];
}

export async function loadKeyHistory(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, exerciseId: string): Promise<KeyHistory | null> {
  const ctx = await loadBidContext(client, actor, exerciseId);
  if (!ctx) return null;
  const ex = await client.sourcingExercise.findFirst({ where: { id: ctx.ex.id, organisationId: actor.organisationId }, select: { submissionChannel: true, publishedKeyFingerprint: true } });
  if (!ex || ex.submissionChannel !== "ONLINE") return null;
  const changes = await client.publishedKeyChange.findMany({
    where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId },
    orderBy: [...KEY_CHANGE_ORDER],
    select: { id: true, at: true, fromFingerprint: true, toFingerprint: true },
  });
  return { fingerprint: ex.publishedKeyFingerprint, changes };
}
