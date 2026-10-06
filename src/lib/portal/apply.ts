/**
 * The public registration application: what a stranger's form must satisfy before it lands in the
 * supplier register's review queue. Pure: the lists, the format, the day and "the number is taken" are
 * passed in.
 *
 * It reuses the staff identity and contact rules (`identityFaults`, `contactFaults`) and leaves out
 * `receiptFaults`: a public application has no recorder, no receipt channel to choose and no day to
 * type, so the server fixes the channel and the day. Nothing about the paper declaration or the
 * E-Payment form is asked or accepted here (OD-3).
 *
 * What the applicant is told is the portal's own wording (`APPLY.faults`). The staff wording for a
 * duplicate names the supplier that holds the number; a stranger must never read that, so the
 * duplicate reaches this module as a yes or no and never as a name or a reference.
 */

import { contactFaults, identityFaults, type ContactInput, type IdentityFault, type IdentityInput } from "@/lib/suppliers/identity";
import { blocking, type Finding } from "@/lib/suppliers/types";

import { APPLY, type Words } from "./labels";

/// What the public form is told. Never an echo of what was typed, and never a name from the register.
export interface ApplyState {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  /// The application's reference. Null on a success that created nothing (a dropped bot).
  reference?: string | null;
}

/// The longest each field may be: the staff form's own limits.
export const APPLICATION_LIMITS = {
  registeredName: 240,
  registrationNo: 120,
  registeredAddress: 1000,
  companyEmail: 240,
  contactName: 240,
  contactDesignation: 240,
  contactEmail: 240,
  contactPhone: 60,
} as const;

/// The most bytes a submission may weigh: every field at its limit is under 4 KB, so this is generous and still small.
export const APPLICATION_BODY_LIMIT = 32 * 1024;

/// The name of the form's bait field. A person never sees it; a script that fills every field does.
export const HONEYPOT_FIELD = "faxNumber";

/// A filled bait field: the submission is dropped without a word.
export const honeypotTripped = (value: FormDataEntryValue | null | undefined) => typeof value === "string" && value.trim() !== "";

export interface PortalApplicationInput extends IdentityInput {
  contact: ContactInput;
}

export interface PortalApplicationContext {
  /// The organisation's day; null while its time zone is not set.
  today: string | null;
  formatPattern: string | null;
  entityTypeCodes: readonly string[];
  countryCodes: readonly string[];
  /// Whether the number is already on the register. Only a yes or no: who holds it is not passed in.
  numberTaken: boolean;
}

/// The faults that mean the register cannot take applications yet, whatever was typed.
export const CLOSED_FAULTS: readonly IdentityFault[] = ["TIME_ZONE_UNSET", "ENTITY_TYPES_NOT_SET", "COUNTRIES_NOT_SET"];

export function portalApplicationFaults(i: PortalApplicationInput, ctx: PortalApplicationContext): Finding<IdentityFault>[] {
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  return [
    ...identityFaults(i, {
      today: ctx.today,
      formatPattern: ctx.formatPattern,
      entityTypeCodes: ctx.entityTypeCodes,
      countryCodes: ctx.countryCodes,
      duplicate: ctx.numberTaken ? { reference: "", name: "" } : null,
    }),
    ...contactFaults(i.contact),
  ];
}

/// The form field each fault belongs to.
export const PORTAL_FIELD_OF: Partial<Record<IdentityFault, string>> = {
  NAME_REQUIRED: "registeredName",
  REGISTRATION_NO_REQUIRED: "registrationNo",
  FORMAT_MISMATCH: "registrationNo",
  DUPLICATE: "registrationNo",
  ENTITY_TYPE_REQUIRED: "entityTypeCode",
  ENTITY_TYPE_NOT_LISTED: "entityTypeCode",
  COUNTRY_REQUIRED: "countryCode",
  COUNTRY_NOT_LISTED: "countryCode",
  ADDRESS_REQUIRED: "registeredAddress",
  EMAIL_REQUIRED: "companyEmail",
  EMAIL_NOT_VALID: "companyEmail",
  CONTACT_NAME_REQUIRED: "contactName",
  CONTACT_REACH_REQUIRED: "contactEmail",
  CONTACT_EMAIL_NOT_VALID: "contactEmail",
};

export type PortalRefusal = { closed: true } | { closed: false; errors: Record<string, string>; message: string };

/// What a refusal tells the applicant: the register is not open, or one plain sentence per field. Null: nothing blocks.
export function portalRefusal(findings: readonly Finding<IdentityFault>[]): PortalRefusal | null {
  const blocks = blocking(findings);
  if (blocks.length === 0) return null;
  if (blocks.some((f) => CLOSED_FAULTS.includes(f.code))) return { closed: true };
  const errors: Record<string, string> = {};
  let unplaced = false;
  for (const f of blocks) {
    const field = PORTAL_FIELD_OF[f.code];
    const words = (APPLY.faults as Partial<Record<IdentityFault, Words>>)[f.code];
    if (field && words) errors[field] ??= words.en;
    else unplaced = true;
  }
  // A blocking fault with no field to mark must still be said, never left as "check the marked fields" with none marked.
  return { closed: false, errors, message: (unplaced ? APPLY.cantAccept : APPLY.nothingSent).en };
}

/// What the register still lacks before it can take an application, in the order a person would set it.
export function whatIsMissing(c: { today: string | null; entityTypeCodes: readonly string[]; countryCodes: readonly string[]; numberingReady: boolean }): Words[] {
  return [
    ...(c.today == null ? [APPLY.missing.timeZone] : []),
    ...(c.entityTypeCodes.length === 0 ? [APPLY.missing.entityTypes] : []),
    ...(c.countryCodes.length === 0 ? [APPLY.missing.countries] : []),
    ...(c.numberingReady ? [] : [APPLY.missing.numbering]),
  ];
}
