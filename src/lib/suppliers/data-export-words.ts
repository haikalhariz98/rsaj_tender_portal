/**
 * The words of a supplier's export of its own data (N2), in English only (founder, 2026-10-19). The section keys are stable English JSON keys and are never
 * shown; these titles and labels are. Enumerated values are read through the register's own label tables where they exist
 * (`src/lib/suppliers/labels.ts`), and through the tables here where they did not.
 */

import type { AccountStatus, DeclarationKind, OnlineBidKind, OnlineBidStatus, PaymentChannel, PaymentOutcome, PurchaseDownloadKind, PurchaseState } from "@/generated/prisma/client";

export type ExportSectionKey = "company" | "contacts" | "accounts" | "declarations" | "bank" | "documents" | "standing" | "standingChanges" | "applications" | "purchases" | "bidReceipts";

/// The sections, in the order the export carries them.
export const EXPORT_SECTION_ORDER: readonly ExportSectionKey[] = ["company", "contacts", "accounts", "declarations", "bank", "documents", "standing", "standingChanges", "applications", "purchases", "bidReceipts"];

export const EXPORT_SECTION_TITLE: Readonly<Record<ExportSectionKey, string>> = {
  company: "Company",
  contacts: "Contacts",
  accounts: "Portal accounts",
  declarations: "Declarations signed",
  bank: "Bank details",
  documents: "Documents",
  standing: "Current standing",
  standingChanges: "Changes to your standing",
  applications: "Applications and outcomes",
  purchases: "Tender document purchases",
  bidReceipts: "Online bid receipts",
};

/// Every label a row of the export carries.
export const EXPORT_LABEL = {
  // Company
  reference: "Supplier reference",
  registeredName: "Registered name",
  registrationNo: "Registration number",
  entityType: "Entity type",
  country: "Country",
  registeredAddress: "Registered address",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  postcode: "Postcode",
  state: "State",
  bumiputeraClaim: "Bumiputera status (declared)",
  incorporatedOn: "Date incorporated",
  companyEmail: "Company email",
  status: "Status",
  registeredOn: "Registered on",
  // Contacts and accounts
  contact: "Contact",
  designation: "Designation",
  email: "Email",
  phone: "Telephone",
  primary: "Primary contact",
  account: "Account of",
  loginName: "Sign-in name",
  accountStatus: "Account status",
  openedOn: "Opened",
  passwordChangedAt: "Password last changed",
  lastSignInAt: "Last signed in",
  disabledAt: "Disabled",
  // Declarations
  declaration: "Declaration",
  textVersion: "Wording version",
  textEn: "Wording (English)",
  textMs: "Wording (Malay)",
  noticeEn: "Personal Data Notice, as agreed",
  signatoryName: "Signed by",
  signatoryDesignation: "Signatory's designation",
  signedOn: "Signed on",
  signedAt: "Signed at",
  // Bank
  bankVersion: "Version",
  bankState: "Where it stands",
  beneficiaryName: "Beneficiary's name",
  beneficiaryAddress: "Beneficiary's address",
  beneficiaryIdentityNo: "Beneficiary's identity number",
  beneficiaryContactPerson: "Contact person",
  beneficiaryTelephone: "Telephone",
  beneficiaryFax: "Fax",
  beneficiaryTaxRegistrationNo: "Tax registration number",
  beneficiaryEmail: "Email",
  bank: "Bank",
  bankAccountNo: "Account number",
  bankAccountType: "Account type",
  bankSwiftCode: "SWIFT code",
  bankAddress: "Bank's address",
  submittedAt: "Sent",
  verification: "Verification",
  verifiedOn: "Checked on",
  verificationNote: "Why it was not in order",
  // Documents
  document: "Document",
  documentReference: "Document reference",
  issuingAuthority: "Issuing authority",
  title: "Title",
  issuedOn: "Issued on",
  validFrom: "Valid from",
  expiresOn: "Expires on",
  notApplicable: "Not applicable",
  ratePercent: "Rate (%)",
  lodgedOn: "Lodged on",
  codes: "Codes",
  // Standing
  standing: "Standing",
  standingLine: "Detail",
  standingMeaning: "What it means",
  change: "Change",
  reason: "Reason",
  effectiveOn: "Takes effect on",
  endsOn: "Free from",
  offenceNo: "Offence",
  periodMonths: "Period (months)",
  cancellingBody: "Cancelled by",
  externalReference: "Their reference",
  cancelsRegistrationOn: "Registration cancelled from",
  withdrawnAt: "Withdrawn",
  // Applications
  application: "Application",
  receivedOn: "Received on",
  channel: "How it came in",
  declarationSignedOn: "Declaration signed on",
  epaymentFormReceivedOn: "E-Payment form received on",
  resubmitBy: "Resubmit by",
  outcome: "Outcome",
  decidedOn: "Decided on",
  remarks: "Remarks",
  itemAskedFor: "Asked for",
  // Purchases
  purchase: "Purchase",
  exercise: "Exercise",
  amount: "Amount (RM)",
  purchaseState: "Where it stands",
  createdAt: "Started",
  paidAt: "Paid",
  paidChannel: "How it was paid",
  paidMethod: "Payment method",
  paidReference: "Payment reference",
  attempt: "Payment attempt",
  attemptNo: "Attempt",
  method: "Method",
  paymentOutcome: "Outcome",
  paymentReference: "Reference",
  failureText: "Why it failed",
  attemptedAt: "Attempted",
  download: "Download",
  downloadKind: "What was downloaded",
  packVersion: "Tender document version",
  partLabel: "Part",
  downloadedAt: "Downloaded",
  // Bid receipts
  bidReceipt: "Submission",
  bidKind: "What it is",
  bidStatus: "Where it stands",
  statusAt: "Changed",
  receivedAt: "Received",
  late: "Received after the closing time",
  receiptDigest: "Receipt digest",
  keyFingerprint: "Sealing key fingerprint",
} as const satisfies Readonly<Record<string, string>>;

export type ExportLabelKey = keyof typeof EXPORT_LABEL;

export const YES = "Yes";
export const NO = "No";

/// A list code no longer on the organisation's list: said, never shown as the code.
export const NOT_ON_LIST = "No longer on the list";

/// A contact the reader may not read (its SULIT read was not granted): the row is said to be withheld.
export const CONTACT_WITHHELD = "Withheld: not open to this account";

/// Where the bank details version stands, as the bank tab says it.
export const BANK_STATE_WORDS = {
  inForce: "In force",
  waiting: "Waiting for the office to check",
  notInOrder: "Not in order",
} as const satisfies Readonly<Record<string, string>>;

export const ACCOUNT_STATUS_WORDS: Readonly<Record<AccountStatus, string>> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  PENDING_ACTIVATION: "Waiting to be activated",
};

export const DECLARATION_KIND_EXPORT_WORDS: Readonly<Record<DeclarationKind, string>> = {
  GIRO_AUTHORISATION: "GIRO authorisation",
  FALSE_DECLARATION: "False-declaration acknowledgement",
  TERMS_AND_CONDITIONS: "Terms and conditions",
};

export const PURCHASE_STATE_EXPORT_WORDS: Readonly<Record<PurchaseState, string>> = {
  AWAITING_PAYMENT: "Waiting for payment",
  PAID: "Paid",
};

export const PAYMENT_CHANNEL_WORDS: Readonly<Record<PaymentChannel, string>> = {
  SIMULATED: "Simulated payment",
  FINANCE_RECEIPT: "Finance receipt recorded by an officer",
};

export const PAYMENT_OUTCOME_WORDS: Readonly<Record<PaymentOutcome, string>> = {
  PAID: "Paid",
  FAILED: "Failed",
};

export const DOWNLOAD_KIND_WORDS: Readonly<Record<PurchaseDownloadKind, string>> = {
  FILE: "A file",
  MERGED_TEXT: "The tender document as one text",
};

export const BID_KIND_WORDS: Readonly<Record<OnlineBidKind, string>> = {
  BID: "Bid",
  ALTERNATIVE: "Alternative bid",
};

export const BID_STATUS_WORDS: Readonly<Record<OnlineBidStatus, string>> = {
  SUBMITTED: "Standing",
  REPLACED: "Replaced",
  WITHDRAWN: "Withdrawn",
  OPENED: "Opened",
};

/// What the export leaves out, and how to ask the office for it. The office is named as the organisation configures it, or as the portal
/// already says it ("the procurement office"), never by a literal address (decision 1, decisions log 2026-10-19).
export function leftOutWords(officeName: string, reference: string): string[] {
  const office = officeName.trim() || "the procurement office";
  return [`Office internal notes are not included. Ask ${office}, quoting ${reference}.`];
}

/// How an export reads on the supplier's History (`exportAuditChanges`): the form, what it held, and the file's digest. Never a value.
export const EXPORT_FORM_WORDS: Readonly<Record<"FILE" | "PAGE", string>> = {
  FILE: "File (JSON)",
  PAGE: "Printable page",
};

export const EXPORT_AUDIT_FIELD_WORDS = {
  exportForm: "Form",
  exportSections: "What it held",
  exportDigest: "File's digest (SHA-256)",
} as const satisfies Readonly<Record<string, string>>;

/// An enumerated value the export has no words for: said, never shown as its code.
export const VALUE_NOT_KNOWN = "Not known";

/// The printable page's own words (N2). English only (founder, 2026-10-19: no Malay is added); the page renders nothing else.
export const EXPORT_PAGE_WORDS = {
  title: "Your data",
  print: "Print",
  download: "Download (JSON)",
  nothing: "Nothing on record",
  yourData: "Your data",
  yourDataOpen: "View",
} as const;
