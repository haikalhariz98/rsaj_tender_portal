import type { PrismaClient } from "../src/generated/prisma/client";

/// Moves a numbering series on to `next`, never back. The demo is loaded in parts, and a later
/// part setting a series back below serials an earlier part already took made the next number
/// issued in the portal collide with an existing reference (founder, 2026-10-05: a new
/// requisition could not be saved, DEMO/REQ/0043/2026 being taken).
export async function raiseSeries(db: Pick<PrismaClient, "numberingSeries">, id: string, next: number): Promise<void> {
  const s = await db.numberingSeries.findUniqueOrThrow({ where: { id } });
  if (s.nextSerial < next) await db.numberingSeries.update({ where: { id }, data: { nextSerial: next } });
}