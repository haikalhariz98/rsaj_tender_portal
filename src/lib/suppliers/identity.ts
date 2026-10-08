/**
 * Recording a supplier from its paper application (FR-VND-001, a1). An officer types what the
 * application says; every mandatory identity field must be there, the registration number is checked
 * against the configured format where one is set (unset: "format not checked", a warning that never
 * reads as valid), and a number already on the register is refused, naming the supplier that holds it.
 *
 * FR-VND-001's "Bumiputera status": the EFFECTIVE status is still the configured restriction evidence
 * document, lodged and verified like any other (BD-615-1, `SupplierPolicy.restrictionEvidenceTypeId`).
 * Phase 4a amends the step-0 note that it is "not a field": the applicant may now DECLARE a claim, from the
 * customer's own list, and a claim is only ever shown as declared (`bumiputeraReading`, `bumiputera.ts`).
 * Nothing reads the claim for eligibility. The primary contact is a `SupplierContact`, never a `Person`
 * (ADR 0019). Pure: the lists, the format, the duplicate and the day are passed in.
 */

import { isDay } from "@/lib/dates";
import { matchesFormat } from "@/lib/integration/award-commitment";

import type { ApplicationChannel, Finding } from "./types";

export type IdentityFault =
  | "NAME_REQUIRED"
  | "REGISTRATION_NO_REQUIRED"
  | "FORMAT_MISMATCH"
  | "FORMAT_NOT_CHECKED"
  | "DUPLICATE"
  | "ENTITY_TYPES_NOT_SET"
  | "ENTITY_TYPE_REQUIRED"
  | "ENTITY_TYPE_NOT_LISTED"
  | "COUNTRIES_NOT_SET"
  | "COUNTRY_REQUIRED"
  | "COUNTRY_NOT_LISTED"
  | "ADDRESS_REQUIRED"
  | "EMAIL_REQUIRED"
  | "EMAIL_NOT_VALID"
  | "CONTACT_NAME_REQUIRED"
  | "CONTACT_REACH_REQUIRED"
  | "CONTACT_EMAIL_REQUIRED"
  | "CONTACT_PHONE_REQUIRED"
  | "CONTACT_EMAIL_NOT_VALID"
  | "TIME_ZONE_UNSET"
  | "RECEIVED_ON_REQUIRED"
  | "RECEIVED_IN_FUTURE"
  | "CHANNEL_REQUIRED"
  | "DECLARATION_IN_FUTURE"
  | "DECLARATION_AFTER_RECEIPT"
  | "RECORDER_REQUIRED";

export interface ContactInput {
  name: string;
  designation: string;
  email: string;
  phone: string;
}

export interface IdentityInput {
  registeredName: string;
  registrationNo: string;
  entityTypeCode: string | null;
  countryCode: string | null;
  registeredAddress: string;
  companyEmail: string;
}

export interface ApplicationInput extends IdentityInput {
  contact: ContactInput;
  /// `SupplierPolicy.contactNeedsEmailAndPhone`. Null (the default): not set, and the rule stays "an email or a telephone".
  contactNeedsEmailAndPhone?: boolean | null;
  receivedOn: string | null;
  channel: ApplicationChannel | null;
  declarationSignedOn: string | null;
  /// Whether the officer recording it is an active Person.
  recorderActive: boolean;
}

export interface IdentityContext {
  /// The organisation's day; null while its time zone is not set.
  today: string | null;
  /// The configured format for registration numbers. Null: not set.
  formatPattern: string | null;
  /// The live codes of each configured list. Empty: the list is not set.
  entityTypeCodes: readonly string[];
  countryCodes: readonly string[];
  /// The supplier already holding the number, where one does (another than the one being edited).
  duplicate: { reference: string; name: string } | null;
  /// The address was taken in parts and judged by `stepOneFaults` (Phase 4a), so the single text is not asked for here: it would say the same thing twice.
  addressJudgedByParts?: boolean;
}

/// A registration number as compared for duplicates: spaces collapsed, letters in capitals. Stored as typed.
export const normaliseRegistrationNo = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// The identity fields alone: name, number (format, duplicate), entity type, country, address and email.
export function identityFaults(i: IdentityInput, ctx: IdentityContext): Finding<IdentityFault>[] {
  const out: Finding<IdentityFault>[] = [];
  const add = (code: IdentityFault, level: Finding["level"] = "block", data?: Finding["data"]) => out.push({ code, level, ...(data ? { data } : {}) });
  if (!i.registeredName.trim()) add("NAME_REQUIRED");
  const no = i.registrationNo.trim();
  if (!no) add("REGISTRATION_NO_REQUIRED");
  else {
    const fits = matchesFormat(no, ctx.formatPattern);
    if (fits === false) add("FORMAT_MISMATCH", "block", { number: no });
    else if (fits === null) add("FORMAT_NOT_CHECKED", "warn");
    if (ctx.duplicate) add("DUPLICATE", "block", { number: no, reference: ctx.duplicate.reference, name: ctx.duplicate.name });
  }
  if (ctx.entityTypeCodes.length === 0) add("ENTITY_TYPES_NOT_SET");
  else if (!i.entityTypeCode) add("ENTITY_TYPE_REQUIRED");
  else if (!ctx.entityTypeCodes.includes(i.entityTypeCode)) add("ENTITY_TYPE_NOT_LISTED");
  if (ctx.countryCodes.length === 0) add("COUNTRIES_NOT_SET");
  else if (!i.countryCode) add("COUNTRY_REQUIRED");
  else if (!ctx.countryCodes.includes(i.countryCode)) add("COUNTRY_NOT_LISTED");
  if (!ctx.addressJudgedByParts && !i.registeredAddress.trim()) add("ADDRESS_REQUIRED");
  if (!i.companyEmail.trim()) add("EMAIL_REQUIRED");
  else if (!EMAIL.test(i.companyEmail.trim())) add("EMAIL_NOT_VALID");
  return out;
}

/**
 * The primary contact: a name, and a way to reach them. Which way is the customer's choice (`SupplierPolicy.contactNeedsEmailAndPhone`, Phase 4a): true asks for
 * BOTH an email and a mobile number, false asks for either, and null (not set) keeps today's rule, either one. A switch that is not set never asks for more.
 */
export function contactFaults(c: ContactInput, needsEmailAndPhone: boolean | null = null): Finding<IdentityFault>[] {
  const out: Finding<IdentityFault>[] = [];
  if (!c.name.trim()) out.push({ code: "CONTACT_NAME_REQUIRED", level: "block" });
  if (needsEmailAndPhone === true) {
    if (!c.email.trim()) out.push({ code: "CONTACT_EMAIL_REQUIRED", level: "block" });
    if (!c.phone.trim()) out.push({ code: "CONTACT_PHONE_REQUIRED", level: "block" });
  } else if (!c.email.trim() && !c.phone.trim()) out.push({ code: "CONTACT_REACH_REQUIRED", level: "block" });
  if (c.email.trim() && !EMAIL.test(c.email.trim())) out.push({ code: "CONTACT_EMAIL_NOT_VALID", level: "block" });
  return out;
}

/// What the paper says of its own receipt: the day it arrived (not after today), how, and the declaration's day (not after either).
export function receiptFaults(i: Pick<ApplicationInput, "receivedOn" | "channel" | "declarationSignedOn" | "recorderActive">, today: string | null): Finding<IdentityFault>[] {
  const out: Finding<IdentityFault>[] = [];
  if (today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (!i.receivedOn || !isDay(i.receivedOn)) out.push({ code: "RECEIVED_ON_REQUIRED", level: "block" });
  else if (i.receivedOn > today) out.push({ code: "RECEIVED_IN_FUTURE", level: "block" });
  if (!i.channel) out.push({ code: "CHANNEL_REQUIRED", level: "block" });
  if (i.declarationSignedOn) {
    if (i.declarationSignedOn > today) out.push({ code: "DECLARATION_IN_FUTURE", level: "block" });
    else if (i.receivedOn && i.declarationSignedOn > i.receivedOn) out.push({ code: "DECLARATION_AFTER_RECEIPT", level: "block" });
  }
  if (!i.recorderActive) out.push({ code: "RECORDER_REQUIRED", level: "block" });
  return out;
}

/**
 * A paper application as recorded (FR-VND-001): every mandatory identity field, the primary contact,
 * and the receipt. A warning (format not checked) never stops it; a block always does.
 */
export function applicationFaults(i: ApplicationInput, ctx: IdentityContext): Finding<IdentityFault>[] {
  return [...identityFaults(i, ctx), ...contactFaults(i.contact, i.contactNeedsEmailAndPhone ?? null), ...receiptFaults(i, ctx.today)];
}
