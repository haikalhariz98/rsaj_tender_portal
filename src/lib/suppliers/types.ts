/**
 * The supplier register's vocabulary (spec §6.15, plan 6.15 §2, ADR 0019), as pure types. Mirrors the
 * Prisma enums so `src/lib/suppliers/**` stays free of the client, as the other lib modules do. Every
 * rule about the register lives beside this file; actions and screens call it and never restate it.
 *
 * Nothing here is policy: registration bodies and their values, document types, lists, reasons, bands,
 * periods and switches are the customer's configuration, shipped empty. Unset is "not set", never zero
 * and never a default (AGENTS.md rules 1 and 2).
 */

import type { Provenance } from "@/lib/reference/types";

export type { Provenance };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (labels, days as YYYY-MM-DD, counts). Never codes to show.
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

/// What a registration body's value is (FR-VND-003). Closed product vocabulary; the values are configuration.
export type RegistrationValueKind = "GRADE" | "CATEGORY" | "SPECIALISATION" | "FIELD_CODE" | "CLASS" | "PERMIT_TYPE";
export const REGISTRATION_VALUE_KINDS: readonly RegistrationValueKind[] = ["GRADE", "CATEGORY", "SPECIALISATION", "FIELD_CODE", "CLASS", "PERMIT_TYPE"];

/// Where a supplier stands as a registrant. Standing (suspended, blacklisted) is derived, never stored (ADR 0019).
export type SupplierStatus = "APPLICANT" | "REGISTERED" | "REJECTED";
export const SUPPLIER_STATUSES: readonly SupplierStatus[] = ["APPLICANT", "REGISTERED", "REJECTED"];

export type ApplicationKind = "NEW" | "RENEWAL" | "UPGRADE";
export const APPLICATION_KINDS: readonly ApplicationKind[] = ["NEW", "RENEWAL", "UPGRADE"];

/// How an application reached the organisation. PORTAL: it came in online, through the supplier portal, and an officer
/// recorded it from the staged online application, as every application is recorded (the database refuses a missing
/// recorder on the paper channels, and no code writes one on any channel).
export type ApplicationChannel = "COUNTER" | "POST" | "EMAIL" | "PORTAL";
export const APPLICATION_CHANNELS: readonly ApplicationChannel[] = ["COUNTER", "POST", "EMAIL", "PORTAL"];
/// The channels an officer may record a paper application under. PORTAL is never one of them: an officer records it only from a staged online application.
export const PAPER_CHANNELS: readonly ApplicationChannel[] = ["COUNTER", "POST", "EMAIL"];

export type ApplicationStatus = "RECEIVED" | "RESUBMISSION_REQUESTED" | "APPROVED" | "REJECTED";
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ["RECEIVED", "RESUBMISSION_REQUESTED", "APPROVED", "REJECTED"];

/// A recorded outcome on an application (FR-VND-007). LAPSE is the rejection a lapsed deadline records.
export type ApplicationOutcome = "APPROVE" | "RESUBMIT" | "REJECT" | "LAPSE";
export const APPLICATION_OUTCOMES: readonly ApplicationOutcome[] = ["APPROVE", "RESUBMIT", "REJECT", "LAPSE"];

export type VerificationState = "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER";
export const VERIFICATION_STATES: readonly VerificationState[] = ["NOT_CHECKED", "VERIFIED", "NOT_IN_ORDER"];

/// The register's own configured lists (step 0: not classification taxonomies).
export type SupplierListKind = "ENTITY_TYPE" | "COUNTRY" | "BUMIPUTERA_STATUS" | "STATE" | "BANK" | "ACCOUNT_TYPE";
export const SUPPLIER_LIST_KINDS: readonly SupplierListKind[] = ["ENTITY_TYPE", "COUNTRY", "STATE", "BUMIPUTERA_STATUS", "BANK", "ACCOUNT_TYPE"];
/// The lists that do NOT close the officer's recording or the public form while empty: the declared Bumiputera status is simply not asked, and the banks and account types (Phase 4b) close the bank-details
/// step of the signed-in registration instead, naming the list.
export const OPTIONAL_LIST_KINDS: readonly SupplierListKind[] = ["BUMIPUTERA_STATUS", "BANK", "ACCOUNT_TYPE"];

/// The engine's route domain for a registration decision (OD-2 A). Rows ship empty.
export const SUPPLIER_REGISTRATION_DOMAIN = "supplier_registration";
/// a2 (OD-8 A): the route domain a blacklisting, and its lifting, are decided on. Rows ship empty.
export const SUPPLIER_BLACKLIST_DOMAIN = "supplier_blacklist";
/// a2 (FR-ADV-017): the route domain a special permission granted inside the organisation is decided on. Rows ship empty.
export const SPECIAL_PERMISSION_DOMAIN = "special_permission";

/// The numbering series a supplier's reference is issued from; unset refuses recording, naming it.
export const SUPPLIER_SERIES_KEY = "supplier";

/// The CodeFormat key a registration number is checked against (FR-VND-001). Unset: not checked, never valid.
export const REGISTRATION_NO_FORMAT_KEY = "supplier_registration_no";

/// A configured document type as the rules read it (FR-VND-002).
export interface DocumentTypeFacts {
  id: string;
  label: string;
  /// The registration body whose values the document carries. Null: none.
  bodyId: string | null;
  /// Which of the body's value kinds the document records.
  valueKinds: readonly RegistrationValueKind[];
  /// Whether it carries an expiry. Null: not set, which blocks lodging one.
  expires: boolean | null;
  /// Whether every registration must have it. Null: not set, which blocks a decision.
  mandatoryAtRegistration: boolean | null;
  /// Whether a supplier may record it as not applicable. Null: not set, which blocks recording it so.
  notApplicableAllowed: boolean | null;
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

/// One lodged document as the rules read it. Days are YYYY-MM-DD.
export interface DocumentFacts {
  id: string;
  typeId: string;
  typeLabel: string;
  lodgedOn: string;
  issuedOn: string | null;
  validFrom: string | null;
  expiresOn: string | null;
  notApplicable: boolean;
  verification: VerificationState;
  verifiedOn: string | null;
  /// The document this one renews, where it does.
  supersedesId: string | null;
}
