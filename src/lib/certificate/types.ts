/**
 * The certificate core's vocabulary (6.14 increment 1, ADR 0022, 0023), as pure types.
 *
 * Mirrors the Prisma enums so `src/lib/certificate/**` stays free of the client, as the other lib modules
 * do. `types-schema.test.ts` keeps every list here equal to the schema's enum, in order, and every map
 * over them exhaustive (X-8).
 */

export type { Finding, Level } from "@/lib/method/types";
export type { Provenance } from "@/lib/award/types";

/// Increment 1 ships 6.13 Part A's kinds; Part B adds its own, each in its own migration before use (X-6).
export type CertificateKind =
  | "DELEGATION_LETTER"
  | "DELEGATION_NOTICE"
  | "INTERIM_PAYMENT"
  | "ADVANCE_PAYMENT"
  | "LAD_WARNING"
  | "NON_COMPLETION"
  | "VARIATION_APPLICATION"
  | "SO_INSTRUCTION"
  | "VARIATION"
  | "SUM_ADJUSTMENT";
export const CERTIFICATE_KINDS: readonly CertificateKind[] = [
  "DELEGATION_LETTER",
  "DELEGATION_NOTICE",
  "INTERIM_PAYMENT",
  "ADVANCE_PAYMENT",
  "LAD_WARNING",
  "NON_COMPLETION",
  "VARIATION_APPLICATION",
  "SO_INSTRUCTION",
  "VARIATION",
  "SUM_ADJUSTMENT",
];

export type CertificateStatus = "DRAFT" | "IN_ROUTING" | "SIGNING" | "ISSUED" | "VOID";
export const CERTIFICATE_STATUSES: readonly CertificateStatus[] = ["DRAFT", "IN_ROUTING", "SIGNING", "ISSUED", "VOID"];

export type SignatureBlockKind = "RECOMMENDING" | "AUTHORISING" | "CONTRACTOR" | "WITNESS" | "APPLICANT" | "SUPPORTING";
export const SIGNATURE_BLOCK_KINDS: readonly SignatureBlockKind[] = ["RECOMMENDING", "AUTHORISING", "CONTRACTOR", "WITNESS", "APPLICANT", "SUPPORTING"];

export type SignatureOfficeRule = "SO" | "SO_REP" | "RECOMMENDING_OFFICER" | "CONTRACTOR" | "WITNESS" | "NAMED_OFFICE";
export const SIGNATURE_OFFICE_RULES: readonly SignatureOfficeRule[] = ["SO", "SO_REP", "RECOMMENDING_OFFICER", "CONTRACTOR", "WITNESS", "NAMED_OFFICE"];

export type SignatureDecision = "SUPPORTED" | "NOT_SUPPORTED";
export const SIGNATURE_DECISIONS: readonly SignatureDecision[] = ["SUPPORTED", "NOT_SUPPORTED"];

export type DistributionCondition = "NONE" | "GUARANTOR_EXISTS" | "CONSULTANT_ENGAGED";
export const DISTRIBUTION_CONDITIONS: readonly DistributionCondition[] = ["NONE", "GUARANTOR_EXISTS", "CONSULTANT_ENGAGED"];

export type RoutingCheckKind = "CHECKED" | "VERIFIED" | "ENDORSED";
export const ROUTING_CHECK_KINDS: readonly RoutingCheckKind[] = ["CHECKED", "VERIFIED", "ENDORSED"];

export type RoutingSubject = "CERTIFICATE" | "AWARD";
export const ROUTING_SUBJECTS: readonly RoutingSubject[] = ["CERTIFICATE", "AWARD"];

export type DeliveryMethod = "REGISTERED_POST" | "COLLECTION" | "BY_HAND";
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["REGISTERED_POST", "COLLECTION", "BY_HAND"];

/// Who signs a block: a Person on the roster (the organisation's own offices), or a named outsider.
export const PERSON_RULES: readonly SignatureOfficeRule[] = ["SO", "SO_REP", "RECOMMENDING_OFFICER", "NAMED_OFFICE"];
export const isPersonRule = (r: SignatureOfficeRule): boolean => PERSON_RULES.includes(r);

/// A signature block as configured (FormSignatureBlock) and as pinned on a certificate.
export interface Block {
  blockOrder: number;
  blockKind: SignatureBlockKind;
  labelEn: string;
  labelMs: string | null;
  datesCertificate: boolean;
  officeRule: SignatureOfficeRule;
  officeCode: string | null;
  delegable: boolean | null;
  carriesDecision: boolean;
  refusalAllowed: boolean;
}

/// A distribution row as configured (FormDistribution) and as pinned.
export interface DistributionRow {
  recipientCode: string;
  labelEn: string;
  labelMs: string | null;
  mandatory: boolean;
  ackRequired: boolean;
  condition: DistributionCondition;
  isOriginal: boolean;
  sortOrder: number;
}

/// A recorded signature, as the rules read it. Days are YYYY-MM-DD.
export interface SignedBlock {
  blockOrder: number;
  personId: string | null;
  name: string;
  signedOn: string;
  refused: boolean;
  decision: SignatureDecision | null;
}
