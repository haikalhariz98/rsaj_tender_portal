import type { RegistrationFault } from "@/lib/portal/registration/types";
import type { DocumentFacts, Finding } from "@/lib/suppliers/types";

/**
 * What the supplier's own Company workspace (Phase 4c) is made of: the findings its acts can return, and the shapes the pure rules take. No rule is here; they are in `documents.ts`,
 * `bank.ts` and `eligibility-view.ts`. Nothing names a supplier: the supplier is the signed-in session's, and the stores read only its rows.
 */

export const COMPANY_TABS = ["overview", "documents", "bank", "eligibility"] as const;
export type CompanyTab = (typeof COMPANY_TABS)[number];
export const isCompanyTab = (s: string | undefined): s is CompanyTab => (COMPANY_TABS as readonly string[]).includes(s ?? "");

export type CompanyFault =
  | RegistrationFault
  /// A supplier whose registration was not accepted lodges nothing here.
  | "SUPPLIER_CLOSED"
  /// A supplier not yet registered answers an office's request, and does nothing else here: its registration is the wizard's, or the office's.
  | "NOT_ON_REGISTER"
  | "TYPE_RETIRED"
  | "ALREADY_LODGED"
  | "RENEWS_NOTHING"
  | "RENEWS_SUPERSEDED"
  | "RENEWS_WAITING"
  | "RENEWAL_NOT_LATER"
  | "REQUEST_NOT_OPEN"
  | "REQUEST_LAPSED"
  | "ITEM_NOT_FOUND"
  | "ITEM_WAITING"
  | "EXPIRY_NOT_TAKEN"
  | "REFERENCE_REQUIRED"
  | "AUTHORITY_REQUIRED"
  | "CHANGE_WAITING"
  | "NOT_REGISTERED_FOR_CHANGE"
  | "PASSWORD_REQUIRED"
  | "UPLOADS_CLOSED";

export type CompanyFinding = Finding<CompanyFault> & { field?: string };

/// A document the supplier holds, as the Company workspace reads it: the rules' facts, and what the screen adds.
export interface CompanyDocument extends DocumentFacts {
  title: string;
  reference: string;
  issuingAuthority: string;
  /// A percentage as text ("8.00"), where the type records a rate.
  ratePercent: string | null;
  /// "code — name" of each registration value recorded on it.
  codes: string[];
  /// The same values by id and kind, so a replacement can start from them.
  codeValues: { id: string; kind: string; label: string }[];
  /// How many live files it has, and whether any is still unscanned.
  files: number;
  notScanned: boolean;
  lodgedBySupplier: boolean;
  /// The application it was lodged with, and the item of an office request it answers.
  applicationId: string | null;
  answersItemId: string | null;
}

/// One thing an office request asks for.
export interface RequestItemFacts {
  id: string;
  /// What it is about, as it read when asked (the document and its reference, or the type).
  label: string;
  /// The officer's words, verbatim (FR-VND-007).
  remarks: string;
  /// The document on file it is about, or null for a type not given yet.
  documentId: string | null;
  typeId: string | null;
}

/// The office's open request for more documents (FR-VND-007), from the application's latest resubmission decision.
export interface OpenRequestFacts {
  applicationId: string;
  decisionId: string;
  /// The officer's remarks on the whole request, verbatim.
  remarks: string;
  /// The organisation's day the supplier must answer by; after it the application is rejected.
  resubmitBy: string | null;
  decidedOn: string;
  items: RequestItemFacts[];
}
