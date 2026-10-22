/**
 * The public registration application: what a stranger's form must satisfy before it is staged for an
 * officer. Pure: the lists, the format and the day are passed in.
 *
 * It reuses the staff identity and contact rules (`identityFaults`, `contactFaults`) and leaves out
 * `receiptFaults`: a public application has no recorder, no receipt channel to choose and no day to
 * type, so the server fixes the channel and the day. Nothing about the paper declaration or the
 * E-Payment form is asked or accepted here (OD-3).
 *
 * What the applicant is told is the portal's own wording (`APPLY.faults`). Nothing here depends on what
 * is on the register: whether a registration number is already held is never asked on this path, so
 * the form cannot be used to find out which companies are registered. The officer sees that, when
 * recording the supplier from the application (`portalFlags`).
 */

import { contactFaults, identityFaults, type ContactInput, type IdentityFault, type IdentityInput } from "@/lib/suppliers/identity";
import { stepOneFaults, type AddressParts, type StepOneFault } from "@/lib/suppliers/step-one";
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

/// The series that numbers online applications: its own, so no supplier reference is spent on a stranger.
export const PORTAL_APPLICATION_SERIES_KEY = "portal_application";

/// The longest each field may be: the staff form's own limits.
export const APPLICATION_LIMITS = {
  registeredName: 240,
  registrationNo: 120,
  /// The legacy single address text, kept for the readers that want one. The form no longer posts it: it is composed from the parts below.
  registeredAddress: 1000,
  addressLine1: 240,
  addressLine2: 240,
  city: 120,
  postcode: 30,
  incorporatedOn: 10,
  companyEmail: 240,
  contactName: 240,
  contactDesignation: 240,
  contactEmail: 240,
  contactPhone: 60,
} as const;

/// The name of the form's bait field. A person never sees it; a script that fills every field does. It was `faxNumber` until Phase 4a: a real Fax field is coming to
/// the form (the creditor's profile asks for one), and the bait must not share a name with a field a person is asked to fill.
export const HONEYPOT_FIELD = "website2";

/// A filled bait field: the submission is dropped without a word.
export const honeypotTripped = (value: FormDataEntryValue | null | undefined) => typeof value === "string" && value.trim() !== "";

/// The identity of the company as the public form takes it. The address is in parts: the single `registeredAddress` is composed from them, never typed.
export interface PortalApplicationInput extends Omit<IdentityInput, "registeredAddress"> {
  address: AddressParts;
  /// A code on the BUMIPUTERA_STATUS list: what the applicant declares. Null: no claim.
  bumiputeraClaimCode: string | null;
  /// YYYY-MM-DD as typed.
  incorporatedOn: string | null;
  contact: ContactInput;
}

export interface PortalApplicationContext {
  /// The organisation's day; null while its time zone is not set.
  today: string | null;
  formatPattern: string | null;
  entityTypeCodes: readonly string[];
  countryCodes: readonly string[];
  /// The live codes of the STATE list. Empty: not set, and the form is closed.
  stateCodes: readonly string[];
  /// The live codes of the BUMIPUTERA_STATUS list. Empty: not set, and the claim is not asked.
  bumiputeraCodes: readonly string[];
  /// `SupplierPolicy.contactNeedsEmailAndPhone`. Null: not set, and the contact needs an email or a telephone.
  contactNeedsEmailAndPhone: boolean | null;
}

export type PortalFault = IdentityFault | StepOneFault;

/// The faults that mean the register cannot take applications yet, whatever was typed.
export const CLOSED_FAULTS: readonly PortalFault[] = ["TIME_ZONE_UNSET", "ENTITY_TYPES_NOT_SET", "COUNTRIES_NOT_SET", "STATES_NOT_SET"];

export function portalApplicationFaults(i: PortalApplicationInput, ctx: PortalApplicationContext): Finding<PortalFault>[] {
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  return [
    // The address is judged by its parts (`stepOneFaults`), so the identity rule's own "address required" is not asked: it would say the same thing twice.
    ...identityFaults(
      { ...i, registeredAddress: "" },
      {
        addressJudgedByParts: true,
        today: ctx.today,
        formatPattern: ctx.formatPattern,
        entityTypeCodes: ctx.entityTypeCodes,
        countryCodes: ctx.countryCodes,
        // Never asked of the register here: a stranger must not learn which numbers are held.
        duplicate: null,
      },
    ),
    ...stepOneFaults({ address: i.address, bumiputeraClaimCode: i.bumiputeraClaimCode, incorporatedOn: i.incorporatedOn }, { today: ctx.today, stateCodes: ctx.stateCodes, bumiputeraCodes: ctx.bumiputeraCodes }),
    ...contactFaults(i.contact, ctx.contactNeedsEmailAndPhone),
  ];
}

/// The form field each fault belongs to.
export const PORTAL_FIELD_OF: Partial<Record<PortalFault, string>> = {
  NAME_REQUIRED: "registeredName",
  REGISTRATION_NO_REQUIRED: "registrationNo",
  FORMAT_MISMATCH: "registrationNo",
  ENTITY_TYPE_REQUIRED: "entityTypeCode",
  ENTITY_TYPE_NOT_LISTED: "entityTypeCode",
  COUNTRY_REQUIRED: "countryCode",
  COUNTRY_NOT_LISTED: "countryCode",
  ADDRESS_LINE_REQUIRED: "addressLine1",
  CITY_REQUIRED: "city",
  POSTCODE_REQUIRED: "postcode",
  ADDRESS_STATE_REQUIRED: "stateCode",
  ADDRESS_STATE_NOT_LISTED: "stateCode",
  BUMIPUTERA_NOT_LISTED: "bumiputeraClaimCode",
  INCORPORATED_ON_REQUIRED: "incorporatedOn",
  INCORPORATED_ON_NOT_A_DAY: "incorporatedOn",
  INCORPORATED_IN_FUTURE: "incorporatedOn",
  EMAIL_REQUIRED: "companyEmail",
  EMAIL_NOT_VALID: "companyEmail",
  CONTACT_NAME_REQUIRED: "contactName",
  CONTACT_REACH_REQUIRED: "contactEmail",
  CONTACT_EMAIL_REQUIRED: "contactEmail",
  CONTACT_PHONE_REQUIRED: "contactPhone",
  CONTACT_EMAIL_NOT_VALID: "contactEmail",
};

export type PortalRefusal = { closed: true } | { closed: false; errors: Record<string, string>; message: string };

/// What a refusal tells the applicant: the register is not open, or one plain sentence per field. Null: nothing blocks.
export function portalRefusal(findings: readonly Finding<PortalFault>[]): PortalRefusal | null {
  const blocks = blocking(findings);
  if (blocks.length === 0) return null;
  if (blocks.some((f) => CLOSED_FAULTS.includes(f.code))) return { closed: true };
  const errors: Record<string, string> = {};
  let unplaced = false;
  for (const f of blocks) {
    const field = PORTAL_FIELD_OF[f.code];
    const words = (APPLY.faults as Partial<Record<PortalFault, Words>>)[f.code];
    if (field && words) errors[field] ??= words.en;
    else unplaced = true;
  }
  // A blocking fault with no field to mark must still be said, never left as "check the marked fields" with none marked.
  return { closed: false, errors, message: (unplaced ? APPLY.cantAccept : APPLY.nothingSent).en };
}

/// How many online applications the form takes, from the organisation's own settings. Null: not set.
export interface PortalLimits {
  daily: number | null;
  perNumber: number | null;
}

/// What has arrived in the last 24 hours, in all and for the one registration number being sent.
export interface PortalLoad {
  lastDay: number;
  forNumber: number;
}

/// Whether one more application may be taken: a limit not set means closed (nothing is assumed), and a limit reached means busy.
export type PortalCapacity = "OPEN" | "NOT_SET" | "BUSY";

export function portalCapacity(load: PortalLoad, limits: PortalLimits): PortalCapacity {
  if (limits.daily == null || limits.perNumber == null) return "NOT_SET";
  return load.lastDay >= limits.daily || load.forNumber >= limits.perNumber ? "BUSY" : "OPEN";
}

/// Whether a limit is a figure an officer may set: a whole number of at least one.
export const validLimit = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100_000;

/**
 * Whether each thing the one-submission register needs is set (ADR 0041 D9, plan section 5): what the five steps are judged by, and the limits that bound a stranger's post. Each is the
 * customer's, or the deployment's, and an unset one keeps the register closed. Read by one loader (`loadRegisterSettings`), so the page and the submit route cannot disagree.
 */
export interface RegisterReadiness {
  /// The organisation's day; null while its time zone is not set.
  today: string | null;
  entityTypeCodes: readonly string[];
  countryCodes: readonly string[];
  stateCodes: readonly string[];
  /// The `portal_application` numbering series exists and its pattern is sound.
  numberingReady: boolean;
  /// `SupplierPolicy.personalDataNoticeEn`, agreed with the terms.
  noticeSet: boolean;
  /// A current text of each kind the applicant agrees to.
  termsTextSet: boolean;
  falseDeclarationTextSet: boolean;
  giroTextSet: boolean;
  /// `SupplierPolicy.verificationNoticeEn`, shown after Submit.
  verificationNoticeSet: boolean;
  /// At least one live supplier document type.
  documentTypesSet: boolean;
  banksSet: boolean;
  accountTypesSet: boolean;
  /// The document store's file types (those a supplier may send) and its size.
  storeRulesSet: boolean;
  /// The deployment's largest file (`DOCUMENT_MAX_BYTES`), valid.
  ceilingSet: boolean;
  /// `SupplierPolicy.supplierUploadClassId`, naming a class of the organisation.
  documentClassSet: boolean;
  /// `SupplierPolicy.supplierBankStatementClassId`, naming a class of the organisation that is SULIT.
  statementClassSet: boolean;
  /// `uploadMaxFilesPerApplication` and `uploadMaxBytesPerApplication`.
  quotasSet: boolean;
  /// `portalDailyLimit` and `portalDailyLimitPerNumber`.
  limitsSet: boolean;
  /// `SupplierPolicy.onlineDeclarationReplacesPaper` is true (plan O-8): otherwise no online application could ever be approved.
  onlineDeclarationAccepted: boolean;
  /// The document store's driver is configured for this deployment.
  storeDriverSet: boolean;
  /// The portal's form key (`PORTAL_FORM_SECRET`).
  formKeySet: boolean;
}

/// What the register still lacks before it can take an application, each named, in the order a person would set it.
export function whatIsMissing(c: RegisterReadiness): Words[] {
  const m = APPLY.missing;
  const unset: [boolean, Words][] = [
    [c.today == null, m.timeZone],
    [c.entityTypeCodes.length === 0, m.entityTypes],
    [c.countryCodes.length === 0, m.countries],
    [c.stateCodes.length === 0, m.states],
    [!c.numberingReady, m.numbering],
    [!c.noticeSet, m.notice],
    [!c.termsTextSet, m.termsText],
    [!c.falseDeclarationTextSet, m.falseDeclarationText],
    [!c.giroTextSet, m.giroText],
    [!c.verificationNoticeSet, m.verificationNotice],
    [!c.documentTypesSet, m.documentTypes],
    [!c.banksSet, m.banks],
    [!c.accountTypesSet, m.accountTypes],
    [!c.storeRulesSet, m.storeRules],
    [!c.ceilingSet, m.ceiling],
    [!c.documentClassSet, m.documentClass],
    [!c.statementClassSet, m.statementClass],
    [!c.quotasSet, m.quotas],
    [!c.limitsSet, m.limits],
    [!c.onlineDeclarationAccepted, m.onlineDeclaration],
    [!c.storeDriverSet, m.storeDriver],
    [!c.formKeySet, m.formKey],
  ];
  return unset.filter(([missing]) => missing).map(([, words]) => words);
}
