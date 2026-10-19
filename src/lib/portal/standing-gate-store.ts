import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayIn } from "@/lib/dates";
import { standingOf } from "@/lib/suppliers/standing-repo";

import { portalStandingBar, type PortalActKind, type StandingBar } from "./standing-gate";
import { inOrder } from "@/lib/series";

/// What is said where the organisation's day cannot be known, so the standing cannot be judged: the act is refused rather than let through.
export const STANDING_NOT_JUDGED: StandingBar = {
  en: "The organisation's time zone is not set, so your standing on the supplier register cannot be judged today and this cannot be done from the portal. Tell the procurement office.",
  ms: "Zon waktu organisasi belum ditetapkan, jadi kedudukan anda pada daftar pembekal tidak dapat dinilai hari ini dan ini tidak boleh dilakukan dari portal. Beritahu pejabat perolehan.",
};

/**
 * The supplier's standing as the portal's acts ask it (decisions log, 2026-10-09, ruling on 1875(3)), read in the act's own transaction so that what is judged is what stands there. The supplier
 * is the SESSION's, never a request's. A rejected supplier is judged on its status, which needs no day; the standings need the organisation's day, and where it is not known the act is refused in words
 * and never let through. A supplier the register does not know is refused too: nothing of it can be judged.
 */
export async function portalStandingBarOf(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, kind: PortalActKind, now: Date = new Date()): Promise<StandingBar | null> {
  const [org, supplier] = await inOrder(
    () => tx.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } }),
    () => tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { status: true } }));
  if (!supplier) return STANDING_NOT_JUDGED;
  if (supplier.status === "REJECTED") return portalStandingBar({ status: "REJECTED", standing: "NOT_REGISTERED", kind });
  if (!org?.timeZone) return STANDING_NOT_JUDGED;
  const read = await standingOf(actor.supplierId, actor.organisationId, dayIn(now, org.timeZone), tx);
  if (!read) return STANDING_NOT_JUDGED;
  return portalStandingBar({ status: read.status, standing: read.reading.standing, kind });
}
