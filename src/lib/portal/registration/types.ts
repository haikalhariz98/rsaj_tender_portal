/**
 * CPD's registration after the officer's acceptance (steps 2 to 5 of the wizard, Phase 4b; FR-VND-002 to 007). The vocabulary the pure rules in this directory share. Nothing here reads
 * a table, the clock or the environment: the store builds a `RegistrationContext` from the organisation's configuration and hands it in with the draft.
 *
 * Nothing is policy. The document types and their switches, the registration bodies' values, the banks, the declaration texts, the notice, the limits and the contact rule are the
 * customer's configuration and ship empty. A setting that is not set closes the step it belongs to and is named (AGENTS.md rules 1 and 2), and a draft never claims validity: a save
 * judges shape and length only, and only Next and Submit apply the rules.
 */

import type { Finding, RegistrationValueKind } from "@/lib/suppliers/types";

export const REGISTRATION_STEPS = ["company", "documents", "codes", "epayment", "review"] as const;
export type RegistrationStep = (typeof REGISTRATION_STEPS)[number];

/// The steps a supplier fills in and saves. The company step is the record as the office accepted it, read-only.
export const EDITABLE_STEPS: readonly RegistrationStep[] = ["documents", "codes", "epayment", "review"];

export const isRegistrationStep = (s: string): s is RegistrationStep => (REGISTRATION_STEPS as readonly string[]).includes(s);

/// The agreements of a registration: the GIRO authorisation (step 4), the false declaration (FR-VND-006) and the terms and conditions, whose tick also agrees the Personal Data Notice
/// (ADR 0041 D4, REG-4). Each is a `RegistrationDeclaration` row.
export type DeclarationKind = "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS";
export const DECLARATION_KINDS: readonly DeclarationKind[] = ["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"];

export type RegistrationFault =
  // the organisation's day
  | "TIME_ZONE_UNSET"
  // documents (step 2)
  | "DOCUMENT_TYPES_NOT_SET"
  | "DOCUMENT_TYPE_UNKNOWN"
  | "DOCUMENT_REQUIRED"
  | "DOCUMENT_DUPLICATE"
  | "FILE_REQUIRED"
  | "EXPIRY_REQUIRED"
  | "EXPIRY_NOT_A_DAY"
  | "ALREADY_EXPIRED"
  | "EXPIRES_NOT_SET"
  | "RATE_INVALID"
  | "TITLE_REQUIRED"
  | "TITLE_DUPLICATE"
  | "MANDATORY_NOT_SAID"
  | "NOT_APPLICABLE_NOT_ALLOWED"
  // codes (step 3)
  | "VALUE_UNKNOWN"
  | "VALUE_RETIRED"
  | "VALUE_NOT_FOR_DOCUMENT"
  | "ONE_GRADE_ONLY"
  | "DOCUMENT_FIRST"
  | "LIST_NOT_CONFIGURED"
  // the bank details (step 4)
  | "FIELD_REQUIRED"
  | "BANKS_NOT_SET"
  | "ACCOUNT_TYPES_NOT_SET"
  | "BANK_NOT_LISTED"
  | "ACCOUNT_TYPE_NOT_LISTED"
  | "EMAIL_NOT_VALID"
  | "FORMAT_MISMATCH"
  | "FORMAT_NOT_CHECKED"
  | "IDENTITY_DIFFERS"
  | "STATEMENT_REQUIRED"
  // the declarations (steps 4 and 5)
  | "TEXT_NOT_SET"
  | "TEXT_STALE"
  | "SIGNATORY_NAME_REQUIRED"
  | "SIGNATORY_DESIGNATION_REQUIRED"
  | "NOT_CONFIRMED"
  | "NOTICE_NOT_SET"
  /// The Personal Data Notice (`SupplierPolicy.personalDataNoticeEn`), agreed with the terms (ADR 0041 D4). Not the notice before sending above.
  | "PRIVACY_NOTICE_NOT_SET"
  | "SIGNATORY_DIFFERS"
  // shape and length (a save)
  | "TOO_LONG"
  | "NOT_A_DAY"
  | "NOT_A_NUMBER";

/// A finding of the registration's rules, and where it belongs: the step it blocks, and the form field or the row it is about. A screen shows it beside that field or row.
export type StepFault = Finding<RegistrationFault> & {
  step: RegistrationStep;
  /// The form field (`documents.<rowId>.expiresOn`, `creditor.bankAccountNo`, `giro.signatoryName`): not shown, used to place the words beside it.
  field?: string;
};

// ------------------------------------------------------------------------------------------------ the draft

/// A certificate in the draft (step 2). `fileCount` is the live files on it (not withdrawn, not detached): the rules never see the files themselves.
export interface DraftDocument {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  /// YYYY-MM-DD, or null.
  expiresOn: string | null;
  notApplicable: boolean;
  /// A percentage as typed ("8", "6.5"), or null.
  ratePercent: string | null;
  fileCount: number;
  /// The registration values chosen on it (step 3), by id.
  valueIds: readonly string[];
}

/// The bank and beneficiary details (step 4), as typed. Codes are on the BANK and ACCOUNT_TYPE lists.
export interface CreditorInput {
  beneficiaryName: string;
  beneficiaryAddress: string;
  beneficiaryIdentityNo: string;
  beneficiaryContactPerson: string;
  beneficiaryTelephone: string;
  beneficiaryFax: string;
  beneficiaryTaxRegistrationNo: string;
  beneficiaryEmail: string;
  bankCode: string;
  bankAccountNo: string;
  bankAccountTypeCode: string;
  bankSwiftCode: string;
  bankAddress: string;
}

export const CREDITOR_FIELDS = [
  "beneficiaryName",
  "beneficiaryAddress",
  "beneficiaryIdentityNo",
  "beneficiaryContactPerson",
  "beneficiaryTelephone",
  "beneficiaryFax",
  "beneficiaryTaxRegistrationNo",
  "beneficiaryEmail",
  "bankCode",
  "bankAccountNo",
  "bankAccountTypeCode",
  "bankSwiftCode",
  "bankAddress",
] as const satisfies readonly (keyof CreditorInput)[];

export const EMPTY_CREDITOR: CreditorInput = {
  beneficiaryName: "",
  beneficiaryAddress: "",
  beneficiaryIdentityNo: "",
  beneficiaryContactPerson: "",
  beneficiaryTelephone: "",
  beneficiaryFax: "",
  beneficiaryTaxRegistrationNo: "",
  beneficiaryEmail: "",
  bankCode: "",
  bankAccountNo: "",
  bankAccountTypeCode: "",
  bankSwiftCode: "",
  bankAddress: "",
};

/// What the supplier signs: which text (by its row), who signs, and that they ticked it.
export interface DeclarationInput {
  kind: DeclarationKind;
  textVersionId: string;
  /// The SHA-256 of the wording the page showed (organisation name filled in). A signature is refused unless it is the hash of the wording in force now.
  textSha256: string;
  signatoryName: string;
  signatoryDesignation: string;
  confirmed: boolean;
}

export interface Draft {
  documents: readonly DraftDocument[];
  creditor: CreditorInput;
  /// Live files on the creditor profile's bank statement.
  statementCount: number;
  /// Who signs the declarations, as the supplier gave it on step 4.
  signatoryName: string;
  signatoryDesignation: string;
  /// The GIRO authorisation was read and ticked on step 4.
  giroConfirmed: boolean;
  /// The hash of the wording the tick was made on. A tick counts only while the wording in force hashes to this.
  giroTextSha256: string | null;
}

// ------------------------------------------------------------------------------------------------ the configuration

/// A document type as the wizard reads it (FR-VND-002). A switch that is null is not set: it is shown as not said, and behaves as it did before the wizard.
export interface DocumentTypeConfig {
  id: string;
  nameEn: string;
  nameMs: string | null;
  hintEn: string | null;
  hintMs: string | null;
  bodyId: string | null;
  valueKinds: readonly RegistrationValueKind[];
  expires: boolean | null;
  mandatoryAtRegistration: boolean | null;
  notApplicableAllowed: boolean | null;
  recordsRate: boolean | null;
  repeatable: boolean | null;
  retired: boolean;
}

export interface RegistrationValueConfig {
  id: string;
  bodyId: string;
  kind: RegistrationValueKind;
  code: string;
  nameEn: string;
  retired: boolean;
}

export interface BodyConfig {
  id: string;
  nameEn: string;
}

export interface ListEntry {
  code: string;
  nameEn: string;
}

/// A declaration's current text, or null while none is set for its kind. `id` is the row a signature will name.
export interface DeclarationTextConfig {
  id: string;
  version: number;
  bodyEn: string;
  bodyMs: string | null;
  /// The SHA-256 of the wording as it is shown and signed (organisation name filled in): what a tick and a signature are bound to.
  sha256: string;
}

export interface RegistrationContext {
  /// The organisation's day. Null while its time zone is not set.
  today: string | null;
  types: readonly DocumentTypeConfig[];
  bodies: readonly BodyConfig[];
  /// The registration values the draft has CHOSEN (live or retired), so a retired one is told apart from an unknown one. Never the whole list: the published lists run to thousands
  /// of codes, and the page searches them on the server (`/supplier/registration/values`). A value that is not in this list is unknown.
  values: readonly RegistrationValueConfig[];
  /// Which kinds of value each body has at least one LIVE value of: all a section of step 3 needs to know to say whether there is anything to choose.
  available: readonly { bodyId: string; kind: RegistrationValueKind }[];
  banks: readonly ListEntry[];
  accountTypes: readonly ListEntry[];
  /// The current text of each kind, or null where none is set.
  texts: Readonly<Record<DeclarationKind, DeclarationTextConfig | null>>;
  /// The notice the supplier reads before sending (`SupplierPolicy.verificationNoticeEn`). Null or blank: not set.
  noticeEn: string | null;
  /// The Personal Data Notice as shown and agreed with the terms (`SupplierPolicy.personalDataNoticeEn`, filled with the organisation's name), and the SHA-256 the tick is bound to.
  /// Null while not set. It has no version of its own: its hash is its identity (ADR 0041 D4).
  personalDataNotice: { en: string; sha256: string } | null;
  /// CodeFormat patterns for the account number and the SWIFT code. Null: no format is set, and the field is accepted with a warning.
  accountNoPattern: string | null;
  swiftPattern: string | null;
  /// The supplier as the office accepted it, for the checks that compare the draft with it.
  supplier: { registrationNoKey: string; contactName: string };
}

export const isBlank = (s: string | null | undefined): boolean => !s || s.trim() === "";
