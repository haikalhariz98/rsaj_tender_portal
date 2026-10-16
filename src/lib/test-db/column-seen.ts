import { db } from "@/lib/db";

/// The two fields a screen posts with a confirmation or a decision (security audit, ruling 22): the column as it reads now, as a test that acts for an officer who has just read it.
export async function columnSeen(openedBidId: string): Promise<{ columnRevision: string; asReadCorrections: string }> {
  const b = await db.openedBid.findUniqueOrThrow({ where: { id: openedBidId }, select: { columnRevision: true, asReadCorrections: true } });
  return { columnRevision: String(b.columnRevision), asReadCorrections: String(b.asReadCorrections) };
}
