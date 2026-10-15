import { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { BidPartRule } from "@/lib/bids/online/types";

import { SHARE_WITHOUT_PEPPER_WORDS } from "./share";
import { sealedSqlState } from "./store";

/**
 * What publishing an ONLINE exercise freezes for sealing (ADR 0036 D1, D3, D7; build plan step 8), in the publishing transaction and BEFORE the exercise moves: from ADVERTISED or INVITED
 * on, trigger 11 (PA025) refuses any change of the rules, and the fingerprint then changes only by a recorded key change. The mode, the returned parts' upload rules (`v: 1`) and the
 * live key's fingerprint are written together. A refusal the database makes here is said in words and the caller rolls the publication back; it is never thrown at the person.
 */
export class FreezeRefused extends Error {
  /// The live key was not there to freeze: the page was out of date, the way every window write says it.
  constructor(message: string, readonly changed = false) {
    super(message);
  }
}

export const FREEZE_FAILED_WORDS = "Not published: the key and the upload rules could not be fixed for bids, and nothing was saved. Try again; if it persists, tell the procurement office.";

export async function freezeOnlineSealing(
  tx: Tx,
  i: { organisationId: string; exerciseId: string; mode: "LIVE" | "DEMONSTRATION"; rules: BidPartRule[]; now: Date; actor: AuditActor; entityLabel: string },
): Promise<{ fingerprint: string }> {
  const live = await tx.exerciseSealingKey.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, retiredAt: null }, select: { fingerprint: true } });
  if (!live) throw new FreezeRefused("changed", true);
  try {
    await tx.sourcingExercise.update({
      where: { id: i.exerciseId, organisationId: i.organisationId },
      data: { onlineSubmissionMode: i.mode, onlineBidRules: { v: 1, frozenAt: i.now.toISOString(), parts: i.rules } as unknown as Prisma.InputJsonValue, publishedKeyFingerprint: live.fingerprint },
    });
  } catch (e) {
    const state = sealedSqlState(e);
    if (state === "PA019") throw new FreezeRefused(`Not published: ${SHARE_WITHOUT_PEPPER_WORDS}`);
    if (state !== null) {
      console.error(`publication freeze refused by the database: ${state}`);
      throw new FreezeRefused(FREEZE_FAILED_WORDS);
    }
    throw e;
  }
  await writeAudit(
    tx,
    { actor: i.actor, organisationId: i.organisationId, entity: "SourcingExercise", entityId: i.exerciseId, entityLabel: i.entityLabel },
    "UPDATE",
    diffFields(
      { onlineMode: null, uploadRulesFrozen: null, keyFingerprint: null },
      { onlineMode: i.mode === "LIVE" ? "Live" : "Demonstration", uploadRulesFrozen: `${i.rules.filter((r) => r.returnedByBidder).length} returned parts`, keyFingerprint: live.fingerprint },
    ),
  );
  return { fingerprint: live.fingerprint };
}
