import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayIn } from "@/lib/dates";
import { standingOf } from "@/lib/suppliers/standing-repo";

import { portalStandingBar, type PortalActKind, type StandingBar } from "./standing-gate";

/**
 * The supplier's standing as the portal's acts ask it (decisions log, 2026-10-09, ruling on 1875(3)), read in the act's own transaction so that what is judged is what stands there. The supplier
 * is the SESSION's, never a request's. A supplier the register does not know reads as barred from nothing here: the act's own lookups refuse it.
 */
export async function portalStandingBarOf(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, kind: PortalActKind, now: Date = new Date()): Promise<StandingBar | null> {
  const org = await tx.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } });
  if (!org?.timeZone) return null;
  const read = await standingOf(actor.supplierId, actor.organisationId, dayIn(now, org.timeZone), tx);
  if (!read) return null;
  return portalStandingBar({ status: read.status, standing: read.reading.standing, kind });
}
