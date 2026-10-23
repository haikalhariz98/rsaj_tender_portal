/**
 * What the opening finds of each bidder, computed from the record, never typed (X-11, FR-DOC-009).
 *
 * - The sale (X-11, OD-4): the bidder holds a live sale of the documents (one not voided), and, on
 *   the invited path, was invited (its letter was issued; letters go only to the frozen invitee list,
 *   ADR 0015). Otherwise NO_LIVE_SALE or NOT_ON_INVITEE_LIST; what follows is the method's
 *   `unpurchasedBidConsequence` (eliminated or reported), applied at the verdict.
 * - The restriction (FR-DOC-009 on paper, SK001 7.3.4 (a)): on a restricted exercise, the sale's
 *   sighted certificate must be valid on the closing day (the reading is ASSUMED and shown), else
 *   NOT_EVIDENCED, which is eliminatory. An exercise whose restriction is not answered blocks (6.4
 *   refused it earlier; defensive).
 * Pure.
 */

import type { Finding, RestrictionFinding, SaleFinding } from "./types";

export interface SaleFacts {
  partyId: string;
  voided: boolean;
  certSighted: "ORIGINAL" | "CERTIFIED_COPY" | "NOT_SHOWN" | null;
  /// The day the certificate is valid until, as recorded at the sale (YYYY-MM-DD); null: not recorded.
  certValidUntil: string | null;
  /// Ruling 17a: the supplier a sale from an online purchase was made to; null for a sale at the counter. Such a sale has no sighting columns, and its restriction is read from the supplier register.
  purchaseSupplierId?: string | null;
}

/// The bidder's live sale, where it holds one (the latest not voided).
export const liveSaleOf = (partyId: string, sales: readonly SaleFacts[]): SaleFacts | null => sales.filter((s) => s.partyId === partyId && !s.voided).at(-1) ?? null;

export function saleFinding(partyId: string, sales: readonly SaleFacts[], path: "ADVERTISED" | "INVITED", invitedPartyIds: ReadonlySet<string>): SaleFinding {
  if (path === "INVITED" && !invitedPartyIds.has(partyId)) return "NOT_ON_INVITEE_LIST";
  return liveSaleOf(partyId, sales) ? "LIVE_SALE" : "NO_LIVE_SALE";
}

/// `closingDay` null: the closing day cannot be told (no time zone, review R-5) — a restricted tender's certificate is then not judged, never read against an empty day.
export function restrictionFinding(restricted: boolean | null, sale: SaleFacts | null, closingDay: string | null): { finding: RestrictionFinding } | { fault: Finding<"RESTRICTION_NOT_ANSWERED" | "TIME_ZONE_NOT_SET"> } {
  if (restricted == null) return { fault: { code: "RESTRICTION_NOT_ANSWERED", level: "block" } };
  if (!restricted) return { finding: "NOT_RESTRICTED" };
  if (!closingDay) return { fault: { code: "TIME_ZONE_NOT_SET", level: "block" } };
  if (!sale || sale.certSighted == null || sale.certSighted === "NOT_SHOWN" || !sale.certValidUntil) return { finding: "NOT_EVIDENCED" };
  return { finding: sale.certValidUntil >= closingDay ? "EVIDENCED" : "NOT_EVIDENCED" };
}
