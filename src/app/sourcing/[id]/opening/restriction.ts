import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { formatOrgDateTime } from "@/lib/format";
import { liveSaleOf } from "@/lib/opening/findings";
import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { restrictionLabel } from "@/lib/opening/labels";
import { OPENING_ENTITY } from "@/lib/opening/audit-view";
import type { OpeningContext, OpeningRow } from "@/lib/opening/repo";
import type { Finding, RestrictionFinding } from "@/lib/opening/types";
import { isRestrictionReading, restrictionReadingWords, type RestrictionReading } from "@/lib/suppliers/restriction-register";
import type { StaffActor } from "@/lib/auth/types";

import { toAuditActor } from "@/app/_auth/actor";
import { audit, label, type LockedWindow } from "../window/shared";

/**
 * Ruling 17a at the opening: the restriction of a bidder whose sale was made from an ONLINE purchase is read from the supplier register for the closing day, frozen on the opened bid.
 *
 *  - `registerRestrictionOf`: the first reading, when the envelope is opened. A configuration gap is a blocking fault, never a finding.
 *  - `retakeRestriction`: while a bid reads NOT_ASSESSED (a renewal lodged and not yet verified), the reading is taken again, audited and frozen again, each time the officer acts on the bid. It ends when the
 *    document is verified (EVIDENCED) or found not in order (NOT_EVIDENCED), so the opening can always finish. An alternative to the offer is read with it, so none stays NOT_ASSESSED for ever.
 */

type Bid = OpeningRow["bids"][number];

export const readingJson = (r: RestrictionReading) => r as unknown as Prisma.InputJsonValue;

/**
 * Take the register's reading again for a bid that reads NOT_ASSESSED, and every alternative of the same bidder at this opening. Returns the finding as it stands after: unchanged for any other bid,
 * and for one whose reading cannot be taken (the fault is returned so a verdict can refuse in words; other acts carry on).
 */
export async function retakeRestriction(tx: Tx, actor: StaffActor, l: LockedWindow, c: OpeningContext, openingBids: readonly Bid[], bid: Bid, now: Date): Promise<{ finding: RestrictionFinding } | { fault: Finding }> {
  if (bid.restrictionFinding !== "NOT_ASSESSED") return { finding: bid.restrictionFinding };
  const supplierId = liveSaleOf(bid.partyId, c.sales)?.purchaseSupplierId ?? null;
  if (!supplierId) return { finding: bid.restrictionFinding };
  const r = await registerRestrictionOf(tx, l.org, c.closingDay, supplierId, now);
  if ("fault" in r) return r;
  for (const b of openingBids.filter((x) => x.partyId === bid.partyId && x.restrictionFinding === "NOT_ASSESSED")) {
    await tx.openedBid.update({ where: { id: b.id, organisationId: actor.organisationId }, data: { restrictionFinding: r.finding, restrictionReading: readingJson(r.reading) } });
    const was = isRestrictionReading(b.restrictionReading) ? restrictionReadingWords(b.restrictionReading) : null;
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, b.id, label(l, `Offer ${b.listingNo}`), "UPDATE",
      diffFields(
        { restriction: restrictionLabel(b.restrictionFinding, b.restrictionReading), restrictionReading: was, readAgain: null },
        { restriction: restrictionLabel(r.finding, r.reading), restrictionReading: restrictionReadingWords(r.reading), readAgain: `Read again from the supplier register, ${formatOrgDateTime(now, l.org.timeZone)}` },
      ),
    );
  }
  return { finding: r.finding };
}
