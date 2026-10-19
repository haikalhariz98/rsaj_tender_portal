/**
 * The words of a supplier's export of its own data (N2), in English and Malay. The section keys are stable English JSON keys and are never
 * shown; these titles and labels are. Enumerated values are read through the register's own label tables where they exist
 * (`src/lib/suppliers/labels.ts`), and through the tables here where they did not.
 */

import type { AccountStatus, DeclarationKind, OnlineBidKind, OnlineBidStatus, PaymentChannel, PaymentOutcome, PurchaseDownloadKind, PurchaseState } from "@/generated/prisma/client";
import { w, type Words } from "@/lib/contract/labels";

export type ExportSectionKey = "company" | "contacts" | "accounts" | "declarations" | "bank" | "documents" | "standing" | "standingChanges" | "applications" | "purchases" | "bidReceipts";

/// The sections, in the order the export carries them.
export const EXPORT_SECTION_ORDER: readonly ExportSectionKey[] = ["company", "contacts", "accounts", "declarations", "bank", "documents", "standing", "standingChanges", "applications", "purchases", "bidReceipts"];

export const EXPORT_SECTION_TITLE: Readonly<Record<ExportSectionKey, Words>> = {
  company: w("Company", "Syarikat"),
  contacts: w("Contacts", "Orang hubungan"),
  accounts: w("Portal accounts", "Akaun portal"),
  declarations: w("Declarations signed", "Perakuan yang ditandatangani"),
  bank: w("Bank details", "Butiran bank"),
  documents: w("Documents", "Dokumen"),
  standing: w("Current standing", "Kedudukan semasa"),
  standingChanges: w("Changes to your standing", "Perubahan kedudukan anda"),
  applications: w("Applications and outcomes", "Permohonan dan keputusan"),
  purchases: w("Tender document purchases", "Pembelian dokumen tender"),
  bidReceipts: w("Online bid receipts", "Resit bida dalam talian"),
};

/// Every label a row of the export carries.
export const EXPORT_LABEL = {
  // Company
  reference: w("Supplier reference", "Rujukan pembekal"),
  registeredName: w("Registered name", "Nama berdaftar"),
  registrationNo: w("Registration number", "Nombor pendaftaran"),
  entityType: w("Entity type", "Jenis entiti"),
  country: w("Country", "Negara"),
  registeredAddress: w("Registered address", "Alamat berdaftar"),
  addressLine1: w("Address line 1", "Alamat baris 1"),
  addressLine2: w("Address line 2", "Alamat baris 2"),
  city: w("City", "Bandar"),
  postcode: w("Postcode", "Poskod"),
  state: w("State", "Negeri"),
  bumiputeraClaim: w("Bumiputera status (declared)", "Status Bumiputera (diisytiharkan)"),
  incorporatedOn: w("Date incorporated", "Tarikh diperbadankan"),
  companyEmail: w("Company email", "E-mel syarikat"),
  status: w("Status", "Status"),
  registeredOn: w("Registered on", "Didaftarkan pada"),
  // Contacts and accounts
  contact: w("Contact", "Orang hubungan"),
  designation: w("Designation", "Jawatan"),
  email: w("Email", "E-mel"),
  phone: w("Telephone", "Telefon"),
  primary: w("Primary contact", "Orang hubungan utama"),
  account: w("Account of", "Akaun milik"),
  loginName: w("Sign-in name", "Nama log masuk"),
  accountStatus: w("Account status", "Status akaun"),
  openedOn: w("Opened", "Dibuka"),
  passwordChangedAt: w("Password last changed", "Kata laluan terakhir ditukar"),
  lastSignInAt: w("Last signed in", "Log masuk terakhir"),
  disabledAt: w("Disabled", "Dinyahdayakan"),
  // Declarations
  declaration: w("Declaration", "Perakuan"),
  textVersion: w("Wording version", "Versi teks"),
  textEn: w("Wording (English)", "Teks (Bahasa Inggeris)"),
  textMs: w("Wording (Malay)", "Teks (Bahasa Melayu)"),
  signatoryName: w("Signed by", "Ditandatangani oleh"),
  signatoryDesignation: w("Signatory's designation", "Jawatan penandatangan"),
  signedOn: w("Signed on", "Ditandatangani pada"),
  signedAt: w("Signed at", "Masa ditandatangani"),
  // Bank
  bankVersion: w("Version", "Versi"),
  bankState: w("Where it stands", "Kedudukannya"),
  beneficiaryName: w("Beneficiary's name", "Nama penerima"),
  beneficiaryAddress: w("Beneficiary's address", "Alamat penerima"),
  beneficiaryIdentityNo: w("Beneficiary's identity number", "Nombor pengenalan penerima"),
  beneficiaryContactPerson: w("Contact person", "Orang untuk dihubungi"),
  beneficiaryTelephone: w("Telephone", "Telefon"),
  beneficiaryFax: w("Fax", "Faks"),
  beneficiaryTaxRegistrationNo: w("Tax registration number", "Nombor pendaftaran cukai"),
  beneficiaryEmail: w("Email", "E-mel"),
  bank: w("Bank", "Bank"),
  bankAccountNo: w("Account number", "Nombor akaun"),
  bankAccountType: w("Account type", "Jenis akaun"),
  bankSwiftCode: w("SWIFT code", "Kod SWIFT"),
  bankAddress: w("Bank's address", "Alamat bank"),
  submittedAt: w("Sent", "Dihantar"),
  verification: w("Verification", "Pengesahan"),
  verifiedOn: w("Checked on", "Disemak pada"),
  verificationNote: w("Why it was not in order", "Sebab tidak teratur"),
  // Documents
  document: w("Document", "Dokumen"),
  documentReference: w("Document reference", "Rujukan dokumen"),
  issuingAuthority: w("Issuing authority", "Pihak berkuasa yang mengeluarkan"),
  title: w("Title", "Tajuk"),
  issuedOn: w("Issued on", "Dikeluarkan pada"),
  validFrom: w("Valid from", "Sah dari"),
  expiresOn: w("Expires on", "Tamat tempoh pada"),
  notApplicable: w("Not applicable", "Tidak berkenaan"),
  ratePercent: w("Rate (%)", "Kadar (%)"),
  lodgedOn: w("Lodged on", "Diserahkan pada"),
  codes: w("Codes", "Kod"),
  // Standing
  standing: w("Standing", "Kedudukan"),
  standingLine: w("Detail", "Butiran"),
  standingMeaning: w("What it means", "Maksudnya"),
  change: w("Change", "Perubahan"),
  reason: w("Reason", "Sebab"),
  effectiveOn: w("Takes effect on", "Berkuat kuasa pada"),
  endsOn: w("Free from", "Bebas mulai"),
  offenceNo: w("Offence", "Kesalahan"),
  periodMonths: w("Period (months)", "Tempoh (bulan)"),
  cancellingBody: w("Cancelled by", "Dibatalkan oleh"),
  externalReference: w("Their reference", "Rujukan mereka"),
  cancelsRegistrationOn: w("Registration cancelled from", "Pendaftaran dibatalkan mulai"),
  withdrawnAt: w("Withdrawn", "Ditarik balik"),
  // Applications
  application: w("Application", "Permohonan"),
  receivedOn: w("Received on", "Diterima pada"),
  channel: w("How it came in", "Cara diterima"),
  declarationSignedOn: w("Declaration signed on", "Perakuan ditandatangani pada"),
  epaymentFormReceivedOn: w("E-Payment form received on", "Borang E-Payment diterima pada"),
  resubmitBy: w("Resubmit by", "Hantar semula sebelum"),
  outcome: w("Outcome", "Keputusan"),
  decidedOn: w("Decided on", "Diputuskan pada"),
  remarks: w("Remarks", "Catatan"),
  itemAskedFor: w("Asked for", "Diminta"),
  // Purchases
  purchase: w("Purchase", "Pembelian"),
  exercise: w("Exercise", "Perolehan"),
  amount: w("Amount (RM)", "Amaun (RM)"),
  purchaseState: w("Where it stands", "Kedudukannya"),
  createdAt: w("Started", "Dimulakan"),
  paidAt: w("Paid", "Dibayar"),
  paidChannel: w("How it was paid", "Cara dibayar"),
  paidMethod: w("Payment method", "Kaedah pembayaran"),
  paidReference: w("Payment reference", "Rujukan pembayaran"),
  attempt: w("Payment attempt", "Cubaan pembayaran"),
  attemptNo: w("Attempt", "Cubaan"),
  method: w("Method", "Kaedah"),
  paymentOutcome: w("Outcome", "Keputusan"),
  paymentReference: w("Reference", "Rujukan"),
  failureText: w("Why it failed", "Sebab gagal"),
  attemptedAt: w("Attempted", "Dicuba"),
  download: w("Download", "Muat turun"),
  downloadKind: w("What was downloaded", "Apa yang dimuat turun"),
  packVersion: w("Tender document version", "Versi dokumen tender"),
  partLabel: w("Part", "Bahagian"),
  downloadedAt: w("Downloaded", "Dimuat turun"),
  // Bid receipts
  bidReceipt: w("Submission", "Penyerahan"),
  bidKind: w("What it is", "Jenisnya"),
  bidStatus: w("Where it stands", "Kedudukannya"),
  statusAt: w("Changed", "Diubah"),
  receivedAt: w("Received", "Diterima"),
  late: w("Received after the closing time", "Diterima selepas waktu tutup"),
  receiptDigest: w("Receipt digest", "Cerna resit"),
  keyFingerprint: w("Sealing key fingerprint", "Cap jari kunci meterai"),
} as const satisfies Readonly<Record<string, Words>>;

export type ExportLabelKey = keyof typeof EXPORT_LABEL;

export const YES = w("Yes", "Ya");
export const NO = w("No", "Tidak");

/// A list code no longer on the organisation's list: said, never shown as the code.
export const NOT_ON_LIST = w("No longer on the list", "Tiada lagi dalam senarai");

/// A contact the reader may not read (its SULIT read was not granted): the row is said to be withheld.
export const CONTACT_WITHHELD = w("Withheld: not open to this account", "Ditahan: tidak dibuka kepada akaun ini");

/// Where the bank details version stands, as the bank tab says it.
export const BANK_STATE_WORDS = {
  inForce: w("In force", "Berkuat kuasa"),
  waiting: w("Waiting for the office to check", "Menunggu semakan pejabat"),
  notInOrder: w("Not in order", "Tidak teratur"),
} as const satisfies Readonly<Record<string, Words>>;

export const ACCOUNT_STATUS_WORDS: Readonly<Record<AccountStatus, Words>> = {
  ACTIVE: w("Active", "Aktif"),
  DISABLED: w("Disabled", "Dinyahdayakan"),
  PENDING_ACTIVATION: w("Waiting to be activated", "Menunggu pengaktifan"),
};

export const DECLARATION_KIND_EXPORT_WORDS: Readonly<Record<DeclarationKind, Words>> = {
  GIRO_AUTHORISATION: w("GIRO authorisation", "Kebenaran GIRO"),
  FALSE_DECLARATION: w("False-declaration acknowledgement", "Pengakuan perakuan palsu"),
};

export const PURCHASE_STATE_EXPORT_WORDS: Readonly<Record<PurchaseState, Words>> = {
  AWAITING_PAYMENT: w("Waiting for payment", "Menunggu pembayaran"),
  PAID: w("Paid", "Dibayar"),
};

export const PAYMENT_CHANNEL_WORDS: Readonly<Record<PaymentChannel, Words>> = {
  SIMULATED: w("Simulated payment", "Pembayaran simulasi"),
  FINANCE_RECEIPT: w("Finance receipt recorded by an officer", "Resit kewangan direkodkan oleh pegawai"),
};

export const PAYMENT_OUTCOME_WORDS: Readonly<Record<PaymentOutcome, Words>> = {
  PAID: w("Paid", "Dibayar"),
  FAILED: w("Failed", "Gagal"),
};

export const DOWNLOAD_KIND_WORDS: Readonly<Record<PurchaseDownloadKind, Words>> = {
  FILE: w("A file", "Satu fail"),
  MERGED_TEXT: w("The tender document as one text", "Dokumen tender sebagai satu teks"),
};

export const BID_KIND_WORDS: Readonly<Record<OnlineBidKind, Words>> = {
  BID: w("Bid", "Bida"),
  ALTERNATIVE: w("Alternative bid", "Bida alternatif"),
};

export const BID_STATUS_WORDS: Readonly<Record<OnlineBidStatus, Words>> = {
  SUBMITTED: w("Standing", "Berdiri"),
  REPLACED: w("Replaced", "Diganti"),
  WITHDRAWN: w("Withdrawn", "Ditarik balik"),
  OPENED: w("Opened", "Dibuka"),
};

/// What the export leaves out, and how to ask the office for it. The office is named as the organisation configures it, or as the portal
/// already says it ("the procurement office"), never by a literal address (decision 1, decisions log 2026-10-19).
export function leftOutWords(officeName: string, reference: string): Words[] {
  const name = officeName.trim();
  const office = w(name || "the procurement office", name || "pejabat perolehan");
  return [
    w(
      "This record does not include the office's internal notes: its working notes on your documents and standing, its checklists, and the reasons it records for its own use. Nor does it include which officer did what.",
      "Rekod ini tidak termasuk catatan dalaman pejabat: catatan kerjanya tentang dokumen dan kedudukan anda, senarai semaknya, dan sebab yang direkodkan untuk kegunaannya sendiri. Rekod ini juga tidak menyatakan pegawai yang melakukan sesuatu.",
    ),
    w(
      `To ask for them, contact ${office.en} and quote your supplier reference ${reference}.`,
      `Untuk memintanya, hubungi ${office.ms} dan nyatakan rujukan pembekal anda ${reference}.`,
    ),
  ];
}

/// How an export reads on the supplier's History (`exportAuditChanges`): the form, what it held, and the file's digest. Never a value.
export const EXPORT_FORM_WORDS: Readonly<Record<"FILE" | "PAGE", Words>> = {
  FILE: w("File (JSON)", "Fail (JSON)"),
  PAGE: w("Printable page", "Halaman boleh cetak"),
};

export const EXPORT_AUDIT_FIELD_WORDS = {
  exportForm: w("Form", "Bentuk"),
  exportSections: w("What it held", "Kandungannya"),
  exportDigest: w("File's digest (SHA-256)", "Cerna fail (SHA-256)"),
} as const satisfies Readonly<Record<string, Words>>;

/// An enumerated value the export has no words for: said, never shown as its code.
export const VALUE_NOT_KNOWN = w("Not known", "Tidak diketahui");

/// The printable page's own words (N2). English only (founder, 2026-10-19: no Malay is added); the page renders nothing else.
export const EXPORT_PAGE_WORDS = {
  title: "Your data",
  print: "Print",
  download: "Download (JSON)",
  nothing: "Nothing on record",
  open: "Open file",
  leftOutTitle: "What this record leaves out",
  yourData: "Your data",
  yourDataOpen: "View",
} as const;
