import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { dayIn } from "@/lib/dates";
import { formatOrgDateTime } from "@/lib/format";
import { liveSaleOf } from "@/lib/opening/findings";
import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { restrictionLabel } from "@/lib/opening/labels";
import { OPENING_ENTITY } from "@/lib/opening/audit-view";
import type { OpeningContext, OpeningRow } from "@/lib/opening/repo";
import type { FrozenRule } from "@/lib/suppliers/restriction-store";
import type { Finding, RestrictionFinding } from "@/lib/opening/types";
import { isRestrictionReading, restrictionReadingWords, type RestrictionReading } from "@/lib/suppliers/restriction-register";
import type { StaffActor } from "@/lib/auth/types";

import { toAuditActor } from "@/app/_auth/actor";
import { audit, label, type LockedWindow } from "../window/shared";

/**
 * Ruling 17a at the opening: the restriction of a bidder whose sale was made from an ONLINE purchase is read from the supplier register for the closing day, frozen on the opened bid.
 *
 *  - `registerRestrictionOf`: the first reading, when the envelope is opened. A configuration gap is a blocking fault, never a finding.
 *  - `retakeRestriction`: while a bid reads NOT_ASSESSED (a document lodged and not yet verified), the reading is taken again, audited and frozen again, each time the officer acts on the bid. It ends when the
 *    document is verified (EVIDENCED) or found not in order (NOT_EVIDENCED), so the opening can always finish. An alternative to the offer is read with it, so none stays NOT_ASSESSED for ever.
 *    A retake holds to what the first reading froze: the supplier (never looked up again through the sale, which can be voided meanwhile), the document type and the closing-day rule (review of 17a).
 *    Where no supplier can be found it settles NOT_EVIDENCED with its reason rather than hold the opening for ever.
 *    Nothing is retaken once the opening is finalised.
 */

type Bid = OpeningRow["bids"][number];
type Reading = RestrictionReading;

export const readingJson = (r: RestrictionReading) => r as unknown as Prisma.InputJsonValue;

const readingOf = (v: unknown): Reading | null => (isRestrictionReading(v) ? v : null);

/**
 * The document type and closing-day rule this opening started with: the first reading any of its bids froze. One opening judges every bidder under one rule, so a setting changed between two
 * envelopes, or while a bid waits, changes nothing here. A part that was not set when frozen is left null and read from the live setting.
 */
export function frozenRuleOf(bids: readonly Pick<Bid, "restrictionReading">[]): FrozenRule | null {
  const readings = bids.map((b) => readingOf(b.restrictionReading)).filter((r): r is Reading => r != null);
  if (!readings.length) return null;
  return { evidenceTypeId: readings.find((r) => r.evidenceTypeId)?.evidenceTypeId ?? null, closingDayCounts: readings.find((r) => r.closingDayCounts != null)?.closingDayCounts ?? null };
}

/**
 * Take the register's reading again for a bid that reads NOT_ASSESSED, and every alternative of the same bidder at this opening. Returns the finding as it stands after, and whether anything was written:
 * unchanged for any other bid and for a finalised opening, and for one whose reading cannot be taken (the fault is returned so a verdict can refuse in words; other acts carry on).
 */
export async function retakeRestriction(tx: Tx, actor: StaffActor, l: LockedWindow, c: OpeningContext, o: Pick<OpeningRow, "bids" | "finalisedAt">, bid: Bid, now: Date): Promise<{ finding: RestrictionFinding; wrote: boolean } | { fault: Finding }> {
  const unchanged = { finding: bid.restrictionFinding, wrote: false };
  if (o.finalisedAt || bid.restrictionFinding !== "NOT_ASSESSED") return unchanged;
  const was = readingOf(bid.restrictionReading);
  const supplierId = was?.supplierId ?? liveSaleOf(bid.partyId, c.sales)?.purchaseSupplierId ?? null;
  const closingDay = was?.closingDay ?? c.closingDay;
  let r: { finding: RestrictionFinding; reading: RestrictionReading } | { fault: Finding };
  if (!supplierId) {
    // Nothing to read the register by: settled, with the reason, so the verdict is not refused for ever for a document nobody can find.
    if (!closingDay) return { fault: { code: "TIME_ZONE_NOT_SET", level: "block" } };
    r = { finding: "NOT_EVIDENCED", reading: { source: "SUPPLIER_REGISTER", readOn: dayIn(now, l.org.timeZone), closingDay, finding: "NOT_EVIDENCED", reason: "SUPPLIER_NOT_FOUND", document: null, closingDayCounts: was?.closingDayCounts ?? null } };
  } else {
    r = await registerRestrictionOf(tx, l.org, { day: closingDay, at: c.ex.closingAt }, supplierId, now, frozenRuleOf(o.bids));
    if ("fault" in r) return r;
  }
  for (const b of o.bids.filter((x) => x.partyId === bid.partyId && x.restrictionFinding === "NOT_ASSESSED")) {
    await tx.openedBid.update({ where: { id: b.id, organisationId: actor.organisationId }, data: { restrictionFinding: r.finding, restrictionReading: readingJson(r.reading) } });
    const before = readingOf(b.restrictionReading);
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, b.id, label(l, `Offer ${b.listingNo}`), "UPDATE",
      diffFields(
        { restriction: restrictionLabel(b.restrictionFinding, b.restrictionReading), restrictionReading: before ? restrictionReadingWords(before) : null, readAgain: null },
        { restriction: restrictionLabel(r.finding, r.reading), restrictionReading: restrictionReadingWords(r.reading), readAgain: `Read again from the supplier register, ${formatOrgDateTime(now, l.org.timeZone)}` },
      ),
    );
  }
  return { finding: r.finding, wrote: true };
}
