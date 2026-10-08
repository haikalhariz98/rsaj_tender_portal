/**
 * Test fixtures for the registration's rules. The names and lists are invented for the tests (a `demo_` style configuration), never a customer's: nothing here is read by the product.
 */

import type { CreditorInput, DocumentTypeConfig, Draft, DraftDocument, RegistrationContext, RegistrationValueConfig } from "./types";
import { EMPTY_CREDITOR } from "./types";

export const type = (o: Partial<DocumentTypeConfig> & { id: string; nameEn: string }): DocumentTypeConfig => ({
  nameMs: null,
  hintEn: null,
  hintMs: null,
  bodyId: null,
  valueKinds: [],
  expires: true,
  mandatoryAtRegistration: true,
  notApplicableAllowed: false,
  recordsRate: false,
  repeatable: false,
  retired: false,
  ...o,
});

export const value = (o: Partial<RegistrationValueConfig> & { id: string; code: string; nameEn: string }): RegistrationValueConfig => ({ bodyId: "body-1", kind: "FIELD_CODE", retired: false, ...o });

export const doc = (o: Partial<DraftDocument> & { id: string; typeId: string }): DraftDocument => ({
  title: "",
  reference: "R-1",
  issuingAuthority: "An authority",
  expiresOn: "2027-06-30",
  notApplicable: false,
  ratePercent: null,
  fileCount: 1,
  valueIds: [],
  ...o,
});

/// What the context says is available, from the values it holds: every live value of a body and kind.
const availableOf = (values: readonly RegistrationValueConfig[]) => [...new Map(values.filter((v) => !v.retired).map((v) => [`${v.bodyId}|${v.kind}`, { bodyId: v.bodyId, kind: v.kind }])).values()];

const BASE_VALUES = [
  value({ id: "v-g1", code: "G1", nameEn: "Grade 1", kind: "GRADE" }),
  value({ id: "v-g2", code: "G2", nameEn: "Grade 2", kind: "GRADE" }),
  value({ id: "v-b", code: "B", nameEn: "Buildings", kind: "CATEGORY" }),
];

export const ctx = (o: Partial<RegistrationContext> = {}): RegistrationContext => ({
  today: "2026-10-09",
  types: [type({ id: "t-reg", nameEn: "Companies registry certificate" }), type({ id: "t-works", nameEn: "Works board certificate", bodyId: "body-1", valueKinds: ["GRADE", "CATEGORY"] })],
  bodies: [{ id: "body-1", nameEn: "Works board" }],
  values: BASE_VALUES,
  available: availableOf(o.values ?? BASE_VALUES),
  banks: [{ code: "bank-a", nameEn: "Demonstration Bank" }],
  accountTypes: [{ code: "current", nameEn: "Current account" }],
  texts: {
    GIRO_AUTHORISATION: { id: "text-giro-1", version: 1, bodyEn: "We authorise {organisation} to pay.", bodyMs: "Kami membenarkan {organisation} membayar." },
    FALSE_DECLARATION: { id: "text-false-1", version: 1, bodyEn: "We declare this is true to {organisation}.", bodyMs: null },
  },
  noticeEn: "The office checks your registration.",
  accountNoPattern: null,
  swiftPattern: null,
  supplier: { registrationNoKey: "202001000001", contactName: "Aminah Binti Ali" },
  ...o,
});

export const creditor = (o: Partial<CreditorInput> = {}): CreditorInput => ({
  ...EMPTY_CREDITOR,
  beneficiaryName: "Demonstration Contractors",
  beneficiaryAddress: "1 Demonstration Road",
  beneficiaryIdentityNo: "202001000001",
  beneficiaryContactPerson: "Aminah Binti Ali",
  beneficiaryTelephone: "0123456789",
  beneficiaryEmail: "accounts@example.invalid",
  bankCode: "bank-a",
  bankAccountNo: "1234567890",
  bankAccountTypeCode: "current",
  bankAddress: "2 Demonstration Street",
  ...o,
});

export const draft = (o: Partial<Draft> = {}): Draft => ({
  documents: [doc({ id: "d-reg", typeId: "t-reg" }), doc({ id: "d-works", typeId: "t-works" })],
  creditor: creditor(),
  statementCount: 1,
  signatoryName: "Aminah Binti Ali",
  signatoryDesignation: "Director",
  giroConfirmed: true,
  ...o,
});
