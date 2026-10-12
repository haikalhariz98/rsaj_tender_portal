/**
 * A restricted tender sold ONLINE is evidenced from the supplier register (ruling 17a). Pure.
 *
 * At the counter an officer sights the status certificate and types what was seen. Online there is no counter, so the evidence is the organisation's configured
 * evidence document (`SupplierPolicy.restrictionEvidenceTypeId`) lodged on the supplier's record and VERIFIED by an officer. The declared claim (`bumiputeraClaimCode`)
 * is never read here: a claim is not evidence. Two readings, both over the documents of that one type:
 *
 *  - at the PURCHASE (`readRestrictionForPurchase`): the document must be verified and in force on the day of purchase, else the purchase is refused with the reason
 *    kept. In force today but lapsing before the closing day is allowed with a warning, as the counter's `CERT_EXPIRES_BEFORE_CLOSING` is;
 *  - at the OPENING (`readRestrictionForClosing`), for a sale made from a purchase: whether a verified document is in force on the closing day itself, under the
 *    customer's `expiryOnClosingDayCounts`. A renewal lodged by the closing day and not yet verified is NOT_ASSESSED: never evidenced and never quietly not evidenced.
 *    A configuration gap (no evidence type, or the closing-day rule not set where it decides) is a fault, never a finding.
 */

import { formatDate } from "@/lib/format";

import { documentInForce } from "./documents";
import type { DocumentFacts } from "./types";

/// A document of the evidence type, with the reference the issuer gave it (shown beside the reading).
export type EvidenceDocument = DocumentFacts & { reference: string };

export interface EvidenceCited {
  id: string;
  reference: string;
  validFrom: string | null;
  expiresOn: string | null;
}

const cite = (d: EvidenceDocument): EvidenceCited => ({ id: d.id, reference: d.reference, validFrom: d.validFrom, expiresOn: d.expiresOn });

// ------------------------------------------------------------------ at the purchase

export type PurchaseRefusal = "EVIDENCE_TYPE_NOT_SET" | "NONE_LODGED" | "NOT_VERIFIED" | "NOT_IN_ORDER" | "NOT_APPLICABLE" | "NOT_YET_VALID" | "EXPIRED";

/// How a document in force today still falls short of the closing day.
export type LapseKind = "BEFORE_CLOSING" | "ON_CLOSING_DAY_NOT_COUNTED" | "ON_CLOSING_DAY_NOT_SET";

export type PurchaseRestriction =
  | { outcome: "REFUSE"; reason: PurchaseRefusal }
  | { outcome: "ALLOW"; document: EvidenceCited; lapses: { kind: LapseKind; on: string } | null };

export function readRestrictionForPurchase(i: { evidenceTypeSet: boolean; docs: readonly EvidenceDocument[]; today: string; closingDay: string | null; expiryOnClosingDayCounts: boolean | null }): PurchaseRestriction {
  if (!i.evidenceTypeSet) return { outcome: "REFUSE", reason: "EVIDENCE_TYPE_NOT_SET" };
  const doc = documentInForce(i.docs, i.today) as EvidenceDocument | null;
  if (!doc) {
    if (i.docs.length === 0) return { outcome: "REFUSE", reason: "NONE_LODGED" };
    return { outcome: "REFUSE", reason: i.docs.some((d) => d.verification === "NOT_CHECKED") ? "NOT_VERIFIED" : "NOT_IN_ORDER" };
  }
  if (doc.notApplicable) return { outcome: "REFUSE", reason: "NOT_APPLICABLE" };
  if (doc.validFrom != null && doc.validFrom > i.today) return { outcome: "REFUSE", reason: "NOT_YET_VALID" };
  if (doc.expiresOn != null && doc.expiresOn < i.today) return { outcome: "REFUSE", reason: "EXPIRED" };
  const end = doc.expiresOn;
  let lapses: { kind: LapseKind; on: string } | null = null;
  if (end != null && i.closingDay != null) {
    if (end < i.closingDay) lapses = { kind: "BEFORE_CLOSING", on: end };
    else if (end === i.closingDay && i.expiryOnClosingDayCounts !== true) lapses = { kind: i.expiryOnClosingDayCounts === false ? "ON_CLOSING_DAY_NOT_COUNTED" : "ON_CLOSING_DAY_NOT_SET", on: end };
  }
  return { outcome: "ALLOW", document: cite(doc), lapses };
}

// ------------------------------------------------------------------ at the opening

export type ClosingFinding = "EVIDENCED" | "NOT_EVIDENCED" | "NOT_ASSESSED";

export type ClosingReason =
  | "COVERS_CLOSING_DAY"
  | "EXPIRES_ON_CLOSING_DAY_COUNTED"
  | "NONE_LODGED"
  | "NOT_IN_ORDER"
  | "NOT_APPLICABLE"
  | "NOT_YET_VALID"
  | "EXPIRED_BEFORE_CLOSING"
  | "EXPIRES_ON_CLOSING_DAY_NOT_COUNTED"
  | "RENEWAL_NOT_VERIFIED";

/// What is frozen on the opened bid: the finding, why, the document it rests on, the day read and the closing-day rule it was read under.
export interface RestrictionReading {
  source: "SUPPLIER_REGISTER";
  readOn: string;
  closingDay: string;
  finding: ClosingFinding;
  reason: ClosingReason;
  document: EvidenceCited | null;
  /// The customer's `expiryOnClosingDayCounts` as read (null: not set).
  closingDayCounts: boolean | null;
}

export type ClosingFault = "EVIDENCE_TYPE_NOT_SET" | "CLOSING_DAY_RULE_NOT_SET";

export const isRestrictionReading = (v: unknown): v is RestrictionReading => !!v && typeof v === "object" && (v as RestrictionReading).source === "SUPPLIER_REGISTER" && typeof (v as RestrictionReading).finding === "string";

/**
 * Whether a verified document of the evidence type is in force on the closing day. Documents lodged after the closing day are not read (a late lodging does not rescue a bid).
 * Where the document in force falls short but a renewal lodged by the closing day is waiting for its check, the answer is NOT_ASSESSED until an officer verifies it or finds it not in order.
 */
export function readRestrictionForClosing(i: { evidenceTypeSet: boolean; docs: readonly EvidenceDocument[]; closingDay: string; readOn: string; expiryOnClosingDayCounts: boolean | null }): { reading: RestrictionReading } | { fault: ClosingFault } {
  if (!i.evidenceTypeSet) return { fault: "EVIDENCE_TYPE_NOT_SET" };
  const docs = i.docs.filter((d) => d.lodgedOn <= i.closingDay);
  const waiting = docs.some((d) => d.verification === "NOT_CHECKED");
  const base = { source: "SUPPLIER_REGISTER" as const, readOn: i.readOn, closingDay: i.closingDay, closingDayCounts: i.expiryOnClosingDayCounts };
  /// Falls short: not assessed while a renewal waits for its check, otherwise not evidenced for the reason.
  const short = (reason: ClosingReason, document: EvidenceDocument | null): { reading: RestrictionReading } => ({
    reading: waiting ? { ...base, finding: "NOT_ASSESSED", reason: "RENEWAL_NOT_VERIFIED", document: document ? cite(document) : null } : { ...base, finding: "NOT_EVIDENCED", reason, document: document ? cite(document) : null },
  });
  const doc = documentInForce(docs, i.closingDay) as EvidenceDocument | null;
  if (!doc) return short(docs.length === 0 ? "NONE_LODGED" : "NOT_IN_ORDER", null);
  if (doc.notApplicable) return short("NOT_APPLICABLE", doc);
  if (doc.validFrom != null && doc.validFrom > i.closingDay) return short("NOT_YET_VALID", doc);
  const end = doc.expiresOn;
  if (end == null || end > i.closingDay) return { reading: { ...base, finding: "EVIDENCED", reason: "COVERS_CLOSING_DAY", document: cite(doc) } };
  if (end === i.closingDay) {
    if (i.expiryOnClosingDayCounts == null) return { fault: "CLOSING_DAY_RULE_NOT_SET" };
    return i.expiryOnClosingDayCounts ? { reading: { ...base, finding: "EVIDENCED", reason: "EXPIRES_ON_CLOSING_DAY_COUNTED", document: cite(doc) } } : short("EXPIRES_ON_CLOSING_DAY_NOT_COUNTED", doc);
  }
  return short("EXPIRED_BEFORE_CLOSING", doc);
}

// ------------------------------------------------------------------ words

/// Why the finding is what it is, in words for the opening, the print and the audit. The register is named, and nobody "sighted" anything.
export function restrictionReadingWords(r: RestrictionReading): string {
  const doc = r.document ? `${r.document.reference ? `document ${r.document.reference}` : "the evidence document"}${r.document.expiresOn ? `, valid until ${formatDate(r.document.expiresOn)}` : ", with no expiry"}` : null;
  const on = formatDate(r.closingDay);
  switch (r.reason) {
    case "COVERS_CLOSING_DAY":
      return `Verified on the supplier register: ${doc}, in force on the closing day (${on}). Read ${formatDate(r.readOn)}.`;
    case "EXPIRES_ON_CLOSING_DAY_COUNTED":
      return `Verified on the supplier register: ${doc}. It expires on the closing day (${on}), and the organisation counts a document expiring on the closing day as valid. Read ${formatDate(r.readOn)}.`;
    case "NONE_LODGED":
      return `The supplier register holds no evidence document for this supplier lodged by the closing day (${on}). Read ${formatDate(r.readOn)}.`;
    case "NOT_IN_ORDER":
      return `The supplier register holds no verified evidence document in force on the closing day (${on}): what was lodged was found not in order. Read ${formatDate(r.readOn)}.`;
    case "NOT_APPLICABLE":
      return `The supplier register records the evidence document as not applicable to this supplier, so it does not evidence the restriction. Read ${formatDate(r.readOn)}.`;
    case "NOT_YET_VALID":
      return `The verified evidence document on the supplier register (${doc}) was not yet valid on the closing day (${on}). Read ${formatDate(r.readOn)}.`;
    case "EXPIRED_BEFORE_CLOSING":
      return `The verified evidence document on the supplier register (${doc}) had expired before the closing day (${on}). Read ${formatDate(r.readOn)}.`;
    case "EXPIRES_ON_CLOSING_DAY_NOT_COUNTED":
      return `The verified evidence document on the supplier register (${doc}) expires on the closing day (${on}), and the organisation does not count a document expiring on the closing day as valid. Read ${formatDate(r.readOn)}.`;
    case "RENEWAL_NOT_VERIFIED":
      return `Not assessed: a renewal of the evidence document was lodged on the supplier register by the closing day (${on}) and no officer has verified it yet. It is read again each time an officer acts on this bid, until it is verified or found not in order. Read ${formatDate(r.readOn)}.`;
    default: {
      const never: never = r.reason;
      return never;
    }
  }
}

/// A configuration gap at the opening, in words naming the setting.
export const CLOSING_FAULT_WORDS: Readonly<Record<ClosingFault, string>> = {
  EVIDENCE_TYPE_NOT_SET: "The document that evidences a restricted tender's restriction is not set under Configuration, Suppliers, so a buyer's restriction cannot be read from the supplier register. Set it, then open the envelope again.",
  CLOSING_DAY_RULE_NOT_SET: "A supplier's evidence document expires on the closing day, and the organisation has not set whether a document expiring on the closing day counts as valid (Configuration, Suppliers), so the restriction cannot be judged. Set it, then open the envelope again.",
};
