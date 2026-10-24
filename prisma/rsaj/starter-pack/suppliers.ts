/**
 * RSAJ starter pack, suppliers (plan step 4.6): the registration bodies, the statutory document types, the expiry bands, and the suspension and
 * blacklist reasons. Transcribed from the specification; each entry cites its requirement and clause, and every one is STATED.
 *
 * Only what the documents state is set. Which document types are mandatory at registration is not stated, so that switch stays unset and the
 * applicant is told it has not been said. The reminders at 90, 60, 30 and 7 days (FR-VND-008) load as the one notification rule for an expiring
 * document, naming no office: they show as notices in the portal, and sending waits for the mail integration. The rules that name offices wait (SP-16).
 */

import { group, list, ref } from "./shape";

// ------------------------------------------------------------------ registration bodies (FR-DOC-005, FR-VND-002, FR-VND-003)

const ELIGIBILITY = { requirement: "FR-DOC-005, FR-VND-003", source: "SK001 7.3.4(a)" };
export const BODIES = list("RegistrationBody", "Registration body", [
  { code: "ssm", values: { labelEn: "SSM" }, ...ELIGIBILITY },
  { code: "cidb", values: { labelEn: "CIDB", qualifierLabelEn: "Grade, category and specialisation" }, ...ELIGIBILITY },
  { code: "mof", values: { labelEn: "MOF", qualifierLabelEn: "Field codes" }, ...ELIGIBILITY },
  { code: "span", values: { labelEn: "SPAN", qualifierLabelEn: "Permit type and grade" }, requirement: "FR-VND-002", source: "SK001 7.3.4(a); FR-VND-002 (SPAN permit with type and grade)" },
  // RSAJ answer 23: ST registration is an eligibility condition where the work needs it. What it qualifies by is not stated.
  { code: "st", values: { labelEn: "Suruhanjaya Tenaga" }, ...ELIGIBILITY, source: "SK001 7.3.4(a); RSAJ answer 23 (2026-10-24)" },
]);

// ------------------------------------------------------------------ statutory document types (FR-VND-002, FR-VND-003)

/// FR-VND-002: every document has an expiry date, and each row may read valid, not applicable or missing.
const EACH = { expires: true, notApplicableAllowed: true } as const;
const DOCS = { requirement: "FR-VND-002", source: "SK001 7.3.4(a); FR-VND-002" };
const body = (code: string) => ({ bodyId: ref("RegistrationBody", code) });
export const DOCUMENT_TYPES = list("SupplierDocumentType", "Supplier document type", [
  { code: "ssm_certificate", values: { nameEn: "SSM certificate", ...body("ssm"), ...EACH }, ...DOCS },
  { code: "pkk", values: { nameEn: "PKK certificate", ...EACH }, ...DOCS },
  { code: "stb", values: { nameEn: "STB certificate", ...EACH }, ...DOCS },
  { code: "mof_certificate", values: { nameEn: "MOF registration certificate", ...body("mof"), valueKinds: ["FIELD_CODE"], ...EACH }, requirement: "FR-VND-002, FR-VND-003", source: DOCS.source },
  { code: "cidb_certificate", values: { nameEn: "CIDB certificate", ...body("cidb"), valueKinds: ["GRADE", "CATEGORY", "SPECIALISATION"], ...EACH }, requirement: "FR-VND-002, FR-VND-003", source: DOCS.source },
  { code: "span_permit", values: { nameEn: "SPAN permit", ...body("span"), valueKinds: ["PERMIT_TYPE", "GRADE"], ...EACH }, ...DOCS },
  { code: "suruhanjaya_tenaga", values: { nameEn: "Suruhanjaya Tenaga certificate", ...body("st"), ...EACH }, ...DOCS },
  { code: "ljt", values: { nameEn: "LJT land surveyor", ...EACH }, ...DOCS },
  { code: "bnm_broker", values: { nameEn: "Bank Negara Malaysia broker", ...EACH }, ...DOCS },
  { code: "sst", values: { nameEn: "SST registration", recordsRate: true, ...EACH }, ...DOCS },
  { code: "lhdn_tax_clearance", values: { nameEn: "LHDN tax clearance", ...EACH }, ...DOCS },
  { code: "other_licences", values: { nameEn: "Other licences", ...EACH }, ...DOCS },
  { code: "not_blacklisted", values: { nameEn: "Declaration of not being blacklisted", ...EACH }, ...DOCS },
]);

// ------------------------------------------------------------------ expiry bands (FR-VND-008)

const SUPPLIER_GROUPS = [
  group("SupplierPolicy", "Supplier register · expiry bands", { criticalDays: 30, warningDays: 60, upcomingDays: 90 }, { requirement: "FR-VND-008", source: "Specification FR-VND-008 (net new)" }, { provenance: "bandsProvenance" }),
];

// ------------------------------------------------------------------ document expiry reminders (FR-VND-008; ST-13, 2026-10-24)

/// No office is named: who is told is not stated (SP-16). The event key is `SUPPLIER_EXPIRY_EVENT` (src/lib/suppliers/expiry.ts).
export const EXPIRY_REMINDERS = list("NotificationRule", "Notification rule", [
  { code: "supplier_document_expiring", values: { eventKey: "supplier.document.expiring", nameEn: "Supplier document expiring", recipientRoleCodes: [], reminderOffsetDays: [90, 60, 30, 7] }, requirement: "FR-VND-008", source: "Specification FR-VND-008" },
]);

// ------------------------------------------------------------------ suspension and blacklist reasons (FR-VND-010, FR-TRM-017)

const SUSPEND = { requirement: "FR-VND-010", source: "Specification FR-VND-010 (net new); SK002 7.5.1(c)" };
export const STANDING_REASONS = list("StandingReason", "Suspension or blacklist reason", [
  { code: "certificate_expiry", values: { nameEn: "Certificate expiry", appliesTo: "SUSPEND" }, ...SUSPEND },
  { code: "poor_performance", values: { nameEn: "Poor performance", appliesTo: "SUSPEND" }, ...SUSPEND },
  { code: "integrity_findings", values: { nameEn: "Integrity findings", appliesTo: "SUSPEND" }, ...SUSPEND },
  { code: "registration_revoked", values: { nameEn: "Revocation of a statutory registration", appliesTo: "SUSPEND" }, ...SUSPEND },
  { code: "termination", values: { nameEn: "Termination of contract", appliesTo: "BLACKLIST" }, requirement: "FR-VND-010, FR-TRM-017", source: "SK008 §7.9(a),(b)" },
]);

export const SUPPLIERS = {
  lists: [BODIES, DOCUMENT_TYPES, EXPIRY_REMINDERS, STANDING_REASONS],
  groups: SUPPLIER_GROUPS,
};
