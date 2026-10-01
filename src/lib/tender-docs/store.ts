/**
 * Writes another module's act makes on the tender pack, inside that act's transaction and
 * after its locks (requisition, exercise): never a server action of its own.
 */

import { writeAudit, type Tx } from "@/lib/audit/record";

import { ENTITY, packStatusAudit } from "./audit-view";
import { lockPackRows } from "./owner";
import { isLivePack } from "./pack";
import type { TenderPackStatus } from "./types";

/**
 * Void the live pack (a draft, or one with approval) of an exercise being cancelled. Its
 * pending route is withdrawn by the cancel act with the exercise's other routes (X-5); an
 * approved pack stays approved, as history. Audited in the same transaction.
 */
export async function voidLivePacks(tx: Tx, l: { org: { id: string }; ex: { id: string; reference: string } }, reason: string): Promise<void> {
  await lockPackRows(tx, l.ex.id);
  const packs = await tx.tenderPack.findMany({ where: { exerciseId: l.ex.id }, select: { id: true, versionNo: true, status: true } });
  for (const p of packs.filter((x) => isLivePack(x.status as TenderPackStatus))) {
    await tx.tenderPack.update({ where: { id: p.id }, data: { status: "VOID", voidReason: reason } });
    await writeAudit(tx, { organisationId: l.org.id, entity: ENTITY.pack, entityId: p.id, entityLabel: `${l.ex.reference} · Tender documents v${p.versionNo}`, reason }, "UPDATE", packStatusAudit(p.status as TenderPackStatus, "VOID", { voidBecause: reason }));
  }
}
