import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { contractorSigningFaultOf } from "@/lib/portal/projects/signing-store";

import type { InstrumentKind } from "./types";

/**
 * Before the password is asked (as `versionSigns` does): the contract is the session's supplier's, and the account may sign for the company. A read with no lock; the lodge judges
 * everything again on the locked rows. So nobody spends a lockout count on a return that cannot be sent.
 */
export type LodgeReach = { ok: true; instrument: InstrumentKind | null } | { ok: false; reason: "NOT_FOUND" | "NOT_SIGNING_AUTHORITY"; fault?: string };

export async function lodgeReach(actor: SupplierActor, contractId: string): Promise<LodgeReach> {
  const ctx = await loadProjectContext(db, actor, contractId);
  if (!ctx) return { ok: false, reason: "NOT_FOUND" };
  const signing = await contractorSigningFaultOf(db, actor);
  if (signing) return { ok: false, reason: "NOT_SIGNING_AUTHORITY", fault: signing };
  const award = (await db.contract.findFirst({ where: { id: contractId, organisationId: actor.organisationId }, select: { award: { select: { instrumentKind: true } } } }))?.award;
  return { ok: true, instrument: (award?.instrumentKind as InstrumentKind | undefined) ?? null };
}
