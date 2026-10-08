/**
 * Bumiputera status, as the register says it (FR-VND-001, ruling of 2026-10-07).
 *
 * The applicant DECLARES a claim, from the customer's own list. The effective status is still only what a verified document says: the configured restriction-evidence
 * document (`SupplierPolicy.restrictionEvidenceTypeId`, BD-615-1), lodged and verified like any other. A screen that showed the claim as the status would overstate what
 * anybody has checked, so the claim is always read through this: "Declared", with the document's reference and whether it has been verified. Pure: nothing here reads
 * a table, and nothing reads the claim for eligibility.
 */

import type { VerificationState } from "./types";

export type BumiputeraReadingKind =
  /// The organisation has not said which document evidences the status, so nothing can be said of whether a claim is evidenced.
  | "NOT_SET"
  /// The applicant made no claim.
  | "NO_CLAIM"
  /// A claim, at the application stage: nothing has been lodged yet to check it against.
  | "DECLARED_ONLY"
  /// A claim and the evidence document lodged, not yet verified (or found not in order).
  | "DECLARED_EVIDENCE_PENDING"
  /// A claim and the evidence document verified.
  | "DECLARED_VERIFIED"
  /// A claim on a supplier that is on the register's books and has no evidence document lodged: flagged to the reviewer.
  | "CLAIM_WITHOUT_DOCUMENT";

export interface BumiputeraReading {
  kind: BumiputeraReadingKind;
  /// The claim as the list names it (never its code). Null where none was made.
  claim: string | null;
  /// The evidence document's reference as printed ("STB-9912"), where one is lodged.
  reference: string | null;
  verification: VerificationState | null;
}

export interface EvidenceDocument {
  reference: string;
  verification: VerificationState;
}

/**
 * @param claim the name of the declared claim on the list, or null for none
 * @param evidenceTypeSet whether `restrictionEvidenceTypeId` is set
 * @param document the live evidence document of the supplier, where one is lodged
 * @param stage "APPLICATION" before the supplier is on the register's books (an online application not yet recorded), "REGISTER" once it is
 */
export function bumiputeraReading(claim: string | null, evidenceTypeSet: boolean, document: EvidenceDocument | null, stage: "APPLICATION" | "REGISTER"): BumiputeraReading {
  const base = { claim, reference: document?.reference ?? null, verification: document?.verification ?? null };
  if (!evidenceTypeSet) return { kind: "NOT_SET", ...base };
  if (claim == null) return { kind: "NO_CLAIM", ...base };
  if (stage === "APPLICATION") return { kind: "DECLARED_ONLY", ...base };
  if (document == null) return { kind: "CLAIM_WITHOUT_DOCUMENT", ...base };
  return { kind: document.verification === "VERIFIED" ? "DECLARED_VERIFIED" : "DECLARED_EVIDENCE_PENDING", ...base };
}

export interface BumiputeraWords {
  en: string;
  ms: string;
}

/// One line for a screen: always "Declared", never the bare status. "Declared: Bumiputera company · STB-9912 · not verified".
export function bumiputeraWords(r: BumiputeraReading): BumiputeraWords {
  const withDocument = (state: BumiputeraWords): BumiputeraWords => {
    if (r.reference == null) return state;
    const checked = r.verification === "VERIFIED" ? { en: "verified", ms: "disahkan" } : r.verification === "NOT_IN_ORDER" ? { en: "found not in order", ms: "didapati tidak teratur" } : { en: "not verified", ms: "belum disahkan" };
    return { en: `${state.en} · ${r.reference} · ${checked.en}`, ms: `${state.ms} · ${r.reference} · ${checked.ms}` };
  };
  switch (r.kind) {
    case "NOT_SET":
      return r.claim ? withDocument({ en: `Declared: ${r.claim} · what evidences it is not set`, ms: `Diisytiharkan: ${r.claim} · bukti belum ditetapkan` }) : { en: "No claim made · what evidences it is not set", ms: "Tiada tuntutan dibuat · bukti belum ditetapkan" };
    case "NO_CLAIM":
      return { en: "No claim made", ms: "Tiada tuntutan dibuat" };
    case "DECLARED_ONLY":
      return { en: `Declared: ${r.claim} · nothing lodged to check it yet`, ms: `Diisytiharkan: ${r.claim} · belum ada dokumen untuk menyemaknya` };
    case "DECLARED_EVIDENCE_PENDING":
    case "DECLARED_VERIFIED":
      return withDocument({ en: `Declared: ${r.claim}`, ms: `Diisytiharkan: ${r.claim}` });
    case "CLAIM_WITHOUT_DOCUMENT":
      return { en: `Declared: ${r.claim} · no evidence document is lodged`, ms: `Diisytiharkan: ${r.claim} · tiada dokumen bukti dikemukakan` };
  }
}

/// Whether a reviewer should be told something is missing (a claim with nothing behind it).
export const bumiputeraNeedsAttention = (r: BumiputeraReading): boolean => r.kind === "CLAIM_WITHOUT_DOCUMENT";
