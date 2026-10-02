/**
 * How the supplier register's audit rows read on its History (AGENTS.md rule 5): each row's kind and
 * each field's name in words. Contact fields are registered SULIT (src/lib/sulit-fields.ts, condition 2):
 * History chips them and the audit export withholds them.
 */

import type { Words } from "./labels";

/// The entity names the register's audit rows are written under.
export const SUPPLIER_ENTITY = {
  supplier: "Supplier",
  contact: "SupplierContact",
  application: "SupplierApplication",
  decision: "ApplicationDecision",
  document: "SupplierDocument",
} as const;

export const SUPPLIER_ENTITY_LABEL: Readonly<Record<string, Words>> = {
  Supplier: { en: "Supplier", ms: "Pembekal" },
  SupplierContact: { en: "Contact", ms: "Orang hubungan" },
  SupplierApplication: { en: "Application", ms: "Permohonan" },
  ApplicationDecision: { en: "Outcome", ms: "Keputusan" },
  SupplierDocument: { en: "Document", ms: "Dokumen" },
  ApprovalInstance: { en: "Approval route", ms: "Laluan kelulusan" },
  ApprovalStep: { en: "Approval step", ms: "Langkah kelulusan" },
  DocumentAttachment: { en: "Attachment", ms: "Lampiran" },
};

/// Field names as History shows them.
export const SUPPLIER_FIELD_NAME: Readonly<Record<string, string>> = {
  reference: "Reference",
  registeredName: "Registered name",
  registrationNo: "Registration number",
  formatChecked: "Number format",
  entityType: "Entity type",
  country: "Country",
  registeredAddress: "Registered address",
  companyEmail: "Company email",
  status: "Status",
  registeredOn: "Registered on",
  contactName: "Contact's name",
  contactDesignation: "Contact's designation",
  contactEmail: "Contact's email",
  contactPhone: "Contact's telephone",
  primary: "Primary contact",
  kind: "What it is for",
  receivedOn: "Received on",
  channel: "How it came in",
  recordedBy: "Recorded by",
  recordedOnBehalf: "Recorded on their behalf",
  declarationSignedOn: "Declaration signed on",
  epaymentFormReceivedOn: "E-Payment form received on",
  outcome: "Outcome",
  remarks: "Remarks",
  resubmitBy: "Resubmit by",
  items: "Items asked for",
  decidedBy: "Decided by",
  decidedOn: "Decided on",
  documentType: "Document type",
  documentReference: "Document reference",
  issuingAuthority: "Issuing authority",
  issuedOn: "Issued on",
  validFrom: "Valid from",
  expiresOn: "Expires on",
  notApplicable: "Not applicable",
  values: "Values",
  renews: "Renews",
  lodgedOn: "Lodged on",
  verification: "Verification",
  verifiedBy: "Checked by",
  verifiedOn: "Checked on",
  verificationNote: "Why",
  erpVendorCode: "Finance system's vendor code",
  sentBy: "Sent by",
  lapse: "Lapse",
};
