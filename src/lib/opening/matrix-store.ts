/**
 * The inputs to `cellFacts` for the SR-14 matrix (wave 3c plan §3.1, §4.1, §4.3), read in one place so the acts and the screen's read model cannot disagree about what a cell offers.
 *
 * Online, a cell is classified from the rules frozen at publication (`SourcingExercise.onlineBidRules`, G1), the bid's own submitted files (an alternative has its own envelope and
 * its own files) and the portal's record of which addenda the bidder's supplier acknowledged. Only ids, part codes and days are read: no filename, size, hash, price or period.
 * Paper reads nothing: every cell is PAPER. Nothing is written here.
 */

import type { Tx } from "@/lib/audit/record";
import type { OnlineBidRules } from "@/lib/bids/online/types";
import { storedDay } from "@/lib/dates";

import type { ChecklistItem } from "./checklist";
import { cellFacts, type CellFacts } from "./matrix";

/// Each envelope's cells, one per item of the frozen checklist, keyed by the opened bid's envelope id.
export async function loadCellFacts(tx: Tx, i: { organisationId: string; exerciseId: string; online: boolean; items: readonly ChecklistItem[]; rules: unknown; envelopeIds: readonly string[] }): Promise<Map<string, CellFacts[]>> {
  const out = new Map<string, CellFacts[]>();
  if (!i.online || i.envelopeIds.length === 0) {
    for (const id of i.envelopeIds) out.set(id, cellFacts({ online: false, items: i.items, packParts: [], rules: [], files: [], acknowledgements: new Map() }));
    return out;
  }
  const rules = (i.rules as OnlineBidRules | null)?.parts ?? [];
  const bids = await tx.onlineBid.findMany({
    where: { organisationId: i.organisationId, exerciseId: i.exerciseId, status: "OPENED", envelopeId: { in: [...i.envelopeIds] } },
    select: { envelopeId: true, supplierId: true, parts: { orderBy: [{ file: { uploadedAt: "asc" } }, { fileId: "asc" }], select: { file: { select: { id: true, packPartId: true } } } } },
  });
  const partIds = [...new Set([...rules.map((r) => r.packPartId), ...bids.flatMap((b) => b.parts.map((p) => p.file.packPartId))])];
  const packParts = partIds.length === 0 ? [] : await tx.tenderPackPart.findMany({ where: { organisationId: i.organisationId, id: { in: partIds } }, select: { id: true, partCode: true } });
  const acks = await tx.addendumAcknowledgement.findMany({
    where: { organisationId: i.organisationId, supplierId: { in: [...new Set(bids.map((b) => b.supplierId))] }, addendum: { status: "ISSUED", number: { not: null }, window: { exerciseId: i.exerciseId } } },
    select: { supplierId: true, acknowledgedOn: true, addendum: { select: { number: true } } },
  });
  for (const envelopeId of i.envelopeIds) {
    const bid = bids.find((b) => b.envelopeId === envelopeId) ?? null;
    const acknowledgements = new Map<number, string>();
    for (const a of acks) if (bid && a.supplierId === bid.supplierId && a.addendum.number != null) acknowledgements.set(a.addendum.number, storedDay(a.acknowledgedOn));
    out.set(envelopeId, cellFacts({ online: true, items: i.items, packParts, rules, files: (bid?.parts ?? []).map((p) => ({ fileId: p.file.id, packPartId: p.file.packPartId })), acknowledgements }));
  }
  return out;
}
