/**
 * The supplier register's words, in English and Malay (AGENTS.md rule 5: codes never reach a screen;
 * the bilingual rule: every string here has both). Screens render `.en` today; the Malay line is kept
 * beside it so the bilingual pass needs no rewording.
 */

import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/securities/period";
import type { DeciderFault } from "@/lib/requisition/holders";

import type { DocumentState } from "./documents";
import type { IdentityFault } from "./identity";
import type { StepOneFault } from "./step-one";
import type { LodgeFault, VerifyFault } from "./documents";
import type { ConfigFault } from "./config";
import type { QueueState, ReviewFault } from "./review";
import type { VendorCodeFault } from "@/lib/integration/vendor-master";
import type { BlacklistFault } from "./blacklist";
import type { CancellationFault } from "./cancellation";
import type { ConditionKind, ConditionRow, Result, Verdict } from "./eligibility";
import type { BandFault, ExpiryBand } from "./expiry";
import type { LinkFault } from "./link";
import type { PermissionFault } from "./permission";
import type { ReinstateFault, SuspendFault } from "./reinstate";
import type { CheckState, SaleFault } from "./sale";
import type { Standing, StandingEventKind, StandingNote, StandingReading } from "./standing";
import type { ApplicationChannel, ApplicationKind, ApplicationOutcome, ApplicationStatus, Finding, RegistrationValueKind, SupplierListKind, SupplierStatus, VerificationState } from "./types";

export interface Words {
  en: string;
}

const w = (en: string): Words => ({ en });
const day = (d: unknown) => (typeof d === "string" && d ? formatDate(d) : "—");

/// A configured label written to sit inside a sentence ("the Demo Contractors Board") as a heading or a value on its own line: its first letter capitalised, nothing else changed.
export const asHeading = (label: string) => (label ? label.charAt(0).toUpperCase() + label.slice(1) : label);

/**
 * A blacklisting's end in words (S-1). `endsOn` is exclusive, the free-from day, as every period in the
 * project; the screens say both days so neither can be misread: "Last blacklisted day 30 Sep 2031 · Free
 * from 1 Oct 2031". No end: until further notice.
 */
export function blacklistEndWords(endsOn: string | null): Words {
  if (!endsOn) return w("Until further notice");
  const last = addDays(endsOn, -1);
  return w(`Last blacklisted day ${formatDate(last)} · Free from ${formatDate(endsOn)}`);
}

/// A verified renewal whose validity has not started (fix M-3): the document before it stays in force until then.
export const renewalUpcomingWords = (validFrom: string | null) => `Renewal verified, in force from ${validFrom ? formatDate(validFrom) : "its start"}`;

/// The same, inside a sentence: "last blacklisted day 30 Sep 2031, free from 01 Oct 2031".
export function blacklistEndPhrase(endsOn: string | null): Words {
  if (!endsOn) return w("until further notice");
  const last = addDays(endsOn, -1);
  return w(`last blacklisted day ${formatDate(last)}, free from ${formatDate(endsOn)}`);
}

export const VALUE_KIND_LABEL: Readonly<Record<RegistrationValueKind, Words>> = {
  GRADE: w("Grade"),
  CATEGORY: w("Category"),
  SPECIALISATION: w("Specialisation"),
  FIELD_CODE: w("Field code"),
  CLASS: w("Class"),
  PERMIT_TYPE: w("Permit type"),
};

export const SUPPLIER_STATUS_LABEL: Readonly<Record<SupplierStatus, Words>> = {
  APPLICANT: w("Applicant"),
  REGISTERED: w("Registered"),
  REJECTED: w("Not registered: application rejected"),
};
export const SUPPLIER_STATUS_TONE: Readonly<Record<SupplierStatus, "ok" | "warn" | "err" | "info" | "neutral">> = { APPLICANT: "info", REGISTERED: "ok", REJECTED: "neutral" };

export const APPLICATION_KIND_LABEL: Readonly<Record<ApplicationKind, Words>> = {
  NEW: w("First registration"),
  RENEWAL: w("Renewal of registration"),
  UPGRADE: w("Upgrade of registration"),
};

export const CHANNEL_LABEL: Readonly<Record<ApplicationChannel, Words>> = {
  COUNTER: w("Over the counter"),
  POST: w("By post"),
  EMAIL: w("By email"),
  PORTAL: w("Through the supplier portal"),
};

export const APPLICATION_STATUS_LABEL: Readonly<Record<ApplicationStatus, Words>> = {
  RECEIVED: w("Received"),
  RESUBMISSION_REQUESTED: w("Resubmission requested"),
  APPROVED: w("Approved"),
  REJECTED: w("Rejected"),
};
export const APPLICATION_STATUS_TONE: Readonly<Record<ApplicationStatus, "ok" | "warn" | "err" | "info" | "neutral">> = { RECEIVED: "info", RESUBMISSION_REQUESTED: "warn", APPROVED: "ok", REJECTED: "err" };

/// An application whose resubmission deadline has passed: derived (no scheduler), shown before it is recorded.
export const LAPSED_LABEL = w("Lapsed: deadline passed");
/// The deadline has passed and the supplier answered every item of the request online in time (Phase 4c): the office decides on what it sent.
export const ANSWERED_LABEL = w("Answered online, with the office");
export const LAPSE_RECORDED_LABEL = w("Rejected on lapse");
export const IN_DECISION_LABEL = w("With approval");

export const QUEUE_STATE_LABEL: Readonly<Record<QueueState, Words>> = {
  RECEIVED: w("Received"),
  WITH_APPROVAL: IN_DECISION_LABEL,
  RESUBMISSION_REQUESTED: w("Resubmission requested"),
  LAPSED: LAPSED_LABEL,
  ANSWERED: ANSWERED_LABEL,
  APPROVED: w("Approved"),
  REJECTED: w("Rejected"),
  REJECTED_ON_LAPSE: LAPSE_RECORDED_LABEL,
};
export const QUEUE_STATE_TONE: Readonly<Record<QueueState, "ok" | "warn" | "err" | "info" | "neutral">> = { RECEIVED: "info", WITH_APPROVAL: "info", RESUBMISSION_REQUESTED: "warn", LAPSED: "err", ANSWERED: "info", APPROVED: "ok", REJECTED: "neutral", REJECTED_ON_LAPSE: "neutral" };

export const OUTCOME_LABEL: Readonly<Record<ApplicationOutcome, Words>> = {
  APPROVE: w("Approved"),
  RESUBMIT: w("Resubmission requested"),
  REJECT: w("Rejected"),
  LAPSE: w("Rejected: the resubmission deadline lapsed"),
};

export const VERIFICATION_LABEL: Readonly<Record<VerificationState, Words>> = {
  NOT_CHECKED: w("Not checked"),
  VERIFIED: w("Verified"),
  NOT_IN_ORDER: w("Not in order"),
};
export const VERIFICATION_TONE: Readonly<Record<VerificationState, "ok" | "warn" | "err">> = { NOT_CHECKED: "warn", VERIFIED: "ok", NOT_IN_ORDER: "err" };

export const DOCUMENT_STATE_LABEL: Readonly<Record<DocumentState, Words>> = {
  VALID: w("Valid"),
  NOT_APPLICABLE: w("Not applicable"),
  NOT_YET_VALID: w("Not yet valid"),
  EXPIRED: w("Expired"),
  NOT_CHECKED: w("Lodged, not checked"),
  NOT_IN_ORDER: w("Not in order"),
  MISSING: w("Missing"),
};
export const DOCUMENT_STATE_TONE: Readonly<Record<DocumentState, "ok" | "warn" | "err" | "neutral">> = {
  VALID: "ok",
  NOT_APPLICABLE: "neutral",
  NOT_YET_VALID: "warn",
  EXPIRED: "err",
  NOT_CHECKED: "warn",
  NOT_IN_ORDER: "err",
  MISSING: "err",
};

export const LIST_KIND_LABEL: Readonly<Record<SupplierListKind, Words>> = {
  ENTITY_TYPE: w("Entity types"),
  COUNTRY: w("Countries"),
  STATE: w("States"),
  BUMIPUTERA_STATUS: w("Bumiputera statuses (as declared)"),
  BANK: w("Banks"),
  ACCOUNT_TYPE: w("Bank account types"),
};
export const LIST_KIND_SINGULAR: Readonly<Record<SupplierListKind, Words>> = {
  ENTITY_TYPE: w("Entity type"),
  COUNTRY: w("Country"),
  STATE: w("State"),
  BUMIPUTERA_STATUS: w("Bumiputera status"),
  BANK: w("Bank"),
  ACCOUNT_TYPE: w("Bank account type"),
};

/// Condition (2), as Phase 3b closes it: a supplier's contacts and the scans of its papers are SULIT. A supplier keeps no list of who is named on it, so they are read by the
/// roles the organisation has chosen (`sulit.read.organisation`), and by no one else until it chooses. Every reading and every download is logged.
export const SCANS_SULIT = w(
  "Scans are SULIT: they are downloaded by the roles the organisation has chosen, and every download, allowed or refused, is logged.",
);
/// OD-3 B: the E-Payment form carries bank details and is SULIT at upload.
export const EPAYMENT_SULIT = w("The E-Payment form is SULIT at upload, and its downloads are logged.");
export const PAPER_CALLOUT = w(
  "Recorded from the paper application by an officer; the supplier cannot sign in yet.",
);
export const NOT_VALIDATED = w(
  "Documents are not validated automatically against any registry: each is checked by an officer, who is named with the day of the check.",
);
export const NOT_SENT = w("Shown here, not sent: nothing is sent from the portal in this phase.");
export const FORMAT_NOT_CHECKED_CHIP = w("Format not checked");
export const ERP_NOT_SYNCED = w("Approved, not in the finance system");

const TYPE_STATE = (s: unknown) => DOCUMENT_STATE_LABEL[s as DocumentState] ?? w("not standing");
const SETTINGS = w("Configuration › Supplier register");

type AnyFault = IdentityFault | StepOneFault | LodgeFault | VerifyFault | ReviewFault | ConfigFault | VendorCodeFault | BandFault | BlacklistFault | SuspendFault | ReinstateFault | SaleFault | LinkFault | PermissionFault | StandingNote | CancellationFault;

const TEXT: Record<AnyFault, (d: Record<string, string | number | null>) => Words> = {
  // identity (FR-VND-001)
  NAME_REQUIRED: () => w("Give the registered name."),
  REGISTRATION_NO_REQUIRED: () => w("Give the registration number."),
  FORMAT_MISMATCH: (d) => w(`The registration number ${d.number} does not match the format set for registration numbers. Check it against the certificate.`),
  FORMAT_NOT_CHECKED: () => w("Format not checked: no format is set for registration numbers (Configuration › Reference data, code formats). The number is recorded as typed."),
  DUPLICATE: (d) => w(`The registration number ${d.number} is already on the register, held by ${d.name} (${d.reference}). Open that supplier instead.`),
  ENTITY_TYPES_NOT_SET: () => w(`No entity types are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`),
  ENTITY_TYPE_REQUIRED: () => w("Choose the entity type."),
  ENTITY_TYPE_NOT_LISTED: () => w("That entity type is not on the list in force."),
  COUNTRIES_NOT_SET: () => w(`No countries are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`),
  COUNTRY_REQUIRED: () => w("Choose the country."),
  COUNTRY_NOT_LISTED: () => w("That country is not on the list in force."),
  ADDRESS_REQUIRED: () => w("Give the registered address."),
  EMAIL_REQUIRED: () => w("Give the company email."),
  EMAIL_NOT_VALID: () => w("The company email is not an email address."),
  CONTACT_NAME_REQUIRED: () => w("Give the primary contact's name."),
  CONTACT_REACH_REQUIRED: () => w("Give the primary contact's email or telephone."),
  CONTACT_EMAIL_REQUIRED: () => w("Give the primary contact's email: the organisation asks for both an email and a mobile number."),
  CONTACT_PHONE_REQUIRED: () => w("Give the primary contact's mobile number: the organisation asks for both an email and a mobile number."),
  // step one's parts (Phase 4a)
  CALLING_CODE_ONLY_FOR_COUNTRY: () => w("Only a country has a dial code."),
  CALLING_CODE_NOT_VALID: () => w("A dial code is a plus sign and up to six digits, for example +60."),
  CONTACT_RULE_PROVENANCE_REQUIRED: () => w("Say where the contact rule comes from."),
  ADDRESS_LINE_REQUIRED: () => w("Give the street address."),
  CITY_REQUIRED: () => w("Give the city."),
  POSTCODE_REQUIRED: () => w("Give the postcode."),
  STATES_NOT_SET: () => w(`No states are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`),
  ADDRESS_STATE_REQUIRED: () => w("Choose the state."),
  ADDRESS_STATE_NOT_LISTED: () => w("That state is not on the list in force."),
  BUMIPUTERA_NOT_LISTED: () => w("That Bumiputera status is not on the list in force."),
  INCORPORATED_ON_REQUIRED: () => w("Give the day the company was incorporated."),
  INCORPORATED_ON_NOT_A_DAY: () => w("The date incorporated is not a real day."),
  INCORPORATED_IN_FUTURE: () => w("The date incorporated cannot be after today."),
  CONTACT_EMAIL_NOT_VALID: () => w("The contact's email is not an email address."),
  TIME_ZONE_UNSET: () => w("The organisation's time zone is not set, so no day can be recorded. Set it under Configuration › Organisation."),
  RECEIVED_ON_REQUIRED: () => w("Give the day the application was received."),
  RECEIVED_IN_FUTURE: () => w("The day received cannot be after today."),
  CHANNEL_REQUIRED: () => w("Say how the application came in."),
  DECLARATION_IN_FUTURE: () => w("The declaration's day cannot be after today."),
  DECLARATION_AFTER_RECEIPT: () => w("The declaration was signed before the application arrived: its day cannot be after the day received."),
  RECORDER_REQUIRED: () => w("Name the officer recording it (an active person)."),
  // documents (FR-VND-002, 008)
  TYPE_NOT_CONFIGURED: () => w(`That document type is not configured. Add it under ${SETTINGS.en}, Document types.`),
  TYPE_RETIRED: (d) => w(`${d.type} is retired: no new one is lodged.`),
  ALREADY_LODGED: (d) => w(`A ${d.type} is already on file. Lodge the new one as its renewal.`),
  REFERENCE_REQUIRED: () => w("Give the document's reference (its number as printed)."),
  AUTHORITY_REQUIRED: () => w("Give the issuing authority."),
  EXPIRES_NOT_SET: (d) => w(`Whether a ${d.type} expires is not set, so it cannot be lodged. Set it under ${SETTINGS.en}, Document types.`),
  EXPIRY_REQUIRED: () => w("Give the day it expires."),
  EXPIRY_NOT_TAKEN: (d) => w(`A ${d.type} is set not to expire: leave the expiry empty.`),
  NOT_APPLICABLE_NOT_SET: (d) => w(`Whether a ${d.type} may be not applicable is not set, so it cannot be recorded so. Set it under ${SETTINGS.en}, Document types.`),
  NOT_APPLICABLE_NOT_ALLOWED: (d) => w(`A ${d.type} may not be recorded as not applicable.`),
  NOT_APPLICABLE_WITH_DETAILS: () => w("A document recorded as not applicable carries no reference, days or values."),
  DAY_NOT_VALID: () => w("One of the days is not a real calendar day."),
  ISSUED_IN_FUTURE: () => w("The day issued cannot be after today."),
  VALID_FROM_AFTER_EXPIRY: () => w("It cannot be valid from a day after it expires."),
  VALUE_NOT_OF_TYPE: (d) => w(`A value chosen is not one a ${d.type} records.`),
  VALUE_RETIRED: () => w("A value chosen is retired."),
  VALUES_NOT_TAKEN: (d) => w(`A ${d.type} records no values.`),
  RENEWS_NOTHING: () => w("The document it renews is not on file."),
  RENEWS_SUPERSEDED: () => w("That document is already renewed: renew the latest one."),
  RENEWS_ANOTHER_TYPE: () => w("A renewal is of the same document type."),
  RENEWAL_NOT_LATER: (d) => w(`A renewal ends later than what it renews (${day(d.expiresOn)}).`),
  SUPPLIER_CLOSED: () => w("The supplier's application was rejected: open a new application first."),
  // verification (FR-VND-004)
  ALREADY_CHECKED: () => w("This document is already checked. A corrected one is lodged as a renewal."),
  STATE_REQUIRED: () => w("Say whether it is verified or not in order."),
  PERSON_REQUIRED: () => w("Name the officer (an active person)."),
  DAY_REQUIRED: () => w("Give the day."),
  IN_FUTURE: () => w("The day cannot be after today."),
  BEFORE_LODGED: (d) => w(`It cannot be checked before it was lodged (${day(d.lodgedOn)}).`),
  NOTE_REQUIRED: () => w("Say what is not in order."),
  // review (FR-VND-007)
  DECIDED: () => w("The application is already decided."),
  LAPSED: (d) => w(`The resubmission deadline (${day(d.resubmitBy)}) has passed. Record the lapse first.`),
  LAPSE_UNRECORDED: (d) => w(`The resubmission deadline (${day(d.resubmitBy)}) has passed: record the lapse, which rejects the application.`),
  ANSWERED_ON_TIME: (d) => w(`The supplier answered everything the office asked for online by the deadline (${day(d.resubmitBy)}), so the application has not lapsed and is not rejected for it. Decide it on what was sent: approve it, ask again, or reject it with reasons.`),
  NOT_LAPSED: (d) => w(d.resubmitBy ? `The deadline (${day(d.resubmitBy)}) has not passed: it lapses the day after.` : "No resubmission deadline stands on it."),
  ROUTE_PENDING: () => w("It is with approval: wait for the route's decision."),
  DECLARATION_DAY_REQUIRED: () => w("Record the day the paper declaration was signed."),
  DECLARATION_SCAN_REQUIRED: () => w("Attach the signed declaration's scan on the application."),
  ONLINE_DECLARATION_SWITCH_NOT_SET: () => w("The supplier signed the declaration online, but the organisation has not said whether that stands in for the paper declaration (Configuration, Supplier register, Policy). Until it does, the paper declaration's day and scan are still required."),
  CREDITOR_NOT_VERIFIED: () => w("The supplier's bank details have not been checked. Payments to this supplier will be refused until an officer checks them."),
  TYPES_NOT_SET: () => w(`No document types are configured, so the file cannot be judged complete. Set them under ${SETTINGS.en}, Document types.`),
  DOCUMENT_NOT_STANDING: (d) => w(`${d.type} is mandatory and reads “${TYPE_STATE(d.state).en.toLowerCase()}”: it must be verified and in force.`),
  MANDATORY_NOT_SET: (d) => w(`Whether ${d.type} is mandatory is not set, so the file cannot be judged complete. Set it under ${SETTINGS.en}, Document types.`),
  ITEMS_REQUIRED: () => w("Name at least one item to resubmit."),
  ITEM_REMARKS_REQUIRED: () => w("Every item needs its remarks, as they are to be given to the supplier."),
  ITEM_NAMES_NOTHING: () => w("Every item names a document on file or a configured document type."),
  SCAN_REQUIRED: () => w("Attach the document's scan first: it is verified on its scan."),
  EXPIRY_NOT_A_DAY: () => w("The expiry date is not a date."),
  EXPIRY_REASON_REQUIRED: () => w("You changed the expiry date. Say why in the note: the change is recorded with the date before and after."),
  ITEM_NOT_ON_FILE: () => w("An item names a document not on this supplier's file."),
  DEADLINE_REQUIRED: () => w("Give the resubmission deadline."),
  DEADLINE_NOT_AFTER_TODAY: () => w("The deadline must be after today."),
  REMARKS_REQUIRED: () => w("Give the reasons, as they are to be given to the supplier."),
  OUTCOME_NOT_RECORDED_HERE: () => w("Approval is given on the application's route; a lapse is recorded on its own."),
  ALREADY_OPEN: () => w("An application is already open for this supplier."),
  KIND_REQUIRED: () => w("Say what the application is for."),
  KIND_NOT_FOR_STATUS: (d) => w(d.kind === "NEW" ? "The supplier is registered: open a renewal or an upgrade." : "The supplier is not registered: open a first registration."),
  // configuration
  CODE_REQUIRED: () => w("Give the code."),
  CODE_TAKEN: () => w("That code is already in use."),
  PROVENANCE_REQUIRED: () => w("Say where it comes from."),
  BODY_NOT_CONFIGURED: () => w("That registration body is not configured."),
  VALUE_KIND_REQUIRED: () => w("Say what kind of value it is."),
  PARENT_NOT_CATEGORY: () => w("A specialisation sits under one of the body's categories."),
  PARENT_ONLY_FOR_SPECIALISATION: () => w("Only a specialisation sits under a category."),
  RANK_ONLY_FOR_GRADE: () => w("Only a grade takes a rank."),
  RANK_NOT_VALID: () => w("A rank is a whole number from 1."),
  RANK_TAKEN: (d) => w(`Another of the body's grades has rank ${d.rank}.`),
  RANK_HELD: (d) => w(`This grade's rank cannot change now: ${d.exercises} ask for a grade of this body and have gone for approval or are open, so bidders are being compared by these ranks. It can change when they are opened or cancelled.`),
  CEILING_ONLY_FOR_GRADE: () => w("Only a grade carries a value ceiling."),
  CEILING_NOT_VALID: () => w("The ceiling is an amount above nothing, at most two decimal places."),
  CEILING_PROVENANCE_REQUIRED: () => w("Say where the ceiling comes from."),
  KINDS_WITHOUT_BODY: () => w("A type records values only of a registration body it names."),
  KIND_NOT_LISTED: () => w("That list is not one of the register's."),
  REASON_REQUIRED: () => w("Give the reason."),
  // the finance system's vendor code (INT-03)
  FORMAT: () => w("The code does not match the format set for the finance system's vendor codes."),
  TAKEN: () => w("That vendor code is already recorded on another supplier."),
  NOT_REGISTERED: () => w("A vendor code is recorded once the supplier is registered."),
  // a2: the register's policy (FR-VND-008, OD-4..OD-7, condition 4)
  BAND_NEGATIVE: () => w("Each band is a whole number of days, from 0."),
  BANDS_PARTLY_SET: () => w("Set all three bands, or none: a band on its own cannot be read."),
  BANDS_OUT_OF_ORDER: () => w("The bands run from the soonest: critical fewer days than warning, warning fewer than upcoming."),
  BLACKLIST_PERIOD_NOT_SET: () => w(`How long a first-offence blacklisting lasts is not set, so one cannot be recorded. Set it under ${SETTINGS.en}, Standing.`),
  OFFENCE_INVALID: () => w("The offence's number cannot be read."),
  // fix S-2 (FR-TRM-017): a blacklisting in effect stops a renewal or upgrade, and its approval.
  BLACKLISTED_NO_APPLICATION: (d) => w(`A blacklisting is in effect (since ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).en}): a renewal or upgrade is not opened while it stands.`),
  BLACKLISTED_NOT_APPROVED: (d) => w(`A blacklisting is in effect (since ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).en}): an application is not approved while it stands. Reject it, or wait until the blacklisting ends or is lifted.`),
  // a2: standing (FR-VND-010, OD-7, OD-8)
  STANDING_NEEDS_REGISTRATION: () => w("Only a registered supplier is suspended or blacklisted."),
  ALREADY_BLACKLISTED: () => w("The supplier is already blacklisted."),
  NOT_BLACKLISTED: () => w("No blacklisting of this supplier is in effect."),
  REQUEST_OPEN: () => w("A blacklisting, or its lifting, is already asked for and not yet recorded: finish that one first."),
  REASON_NOT_FOR_BLACKLISTING: () => w("That reason is on the list for suspensions, not blacklistings."),
  REASON_NOT_FOR_SUSPENSION: () => w("That reason is on the list for blacklistings, not suspensions."),
  REASON_RETIRED: () => w("That reason is retired."),
  STANDING_NOTE_REQUIRED: () => w("Say why, in words: it is kept with the record."),
  AWARD_NOT_CANCELLED_FOR_BLACKLISTING: () => w("That award was not cancelled with blacklisting recommended."),
  AWARD_NOT_THIS_SUPPLIER: () => w("That award is not linked to this supplier."),
  ROUTE_NOT_APPROVED: () => w("Its route has not approved it: it is recorded once the route's last step approves."),
  ALREADY_RECORDED: () => w("This is already recorded."),
  // fix R-7: withdrawing a request
  REQUEST_WITHDRAWN: () => w("This request was withdrawn: it is not recorded. Ask again if it is still wanted."),
  ALREADY_WITHDRAWN: () => w("This request is already withdrawn."),
  WITHDRAW_ROUTE_PENDING: () => w("It is still on its route: it is decided there first (a refusal closes it)."),
  WITHDRAW_ROUTE_REFUSED: () => w("Its route refused it: it is already closed."),
  WITHDRAW_REASON_REQUIRED: () => w("Say why it is withdrawn: it is kept with the request."),
  EFFECTIVE_REQUIRED: () => w("Give the day it takes effect."),
  // 615-C2 (BD-613-91): a registration body's cancellation, and its withdrawal when recorded in error.
  REGISTRATION_DAY_NOT_RECORDED: () => w("The supplier's registration day is not recorded, so the registration a cancellation ends cannot be named."),
  CANCELLATION_NEEDS_REGISTRATION: () => w("Only a registered supplier's registration can be recorded as cancelled."),
  ALREADY_CANCELLED: (d) => w(`A cancellation of the registration is already recorded (in effect since ${day(d.since)}). If it was recorded in error, withdraw it first.`),
  CANCELLING_BODY_REQUIRED: () => w("Choose the registration body that cancelled it."),
  CANCELLING_BODY_NOT_CONFIGURED: () => w("That registration body is not configured (Configuration › Supplier register)."),
  CANCELLATION_REFERENCE_REQUIRED: () => w("Give the body's reference for the cancellation, as on its notice."),
  NOT_A_CANCELLATION: () => w("Only a registration cancelled is withdrawn here; the other standing records are ended by their own acts."),
  CANCELLATION_ALREADY_WITHDRAWN: () => w("It is already withdrawn."),
  CANCELLATION_WITHDRAW_REASON_REQUIRED: () => w("Say why it was recorded in error: it is kept with the record."),
  EFFECTIVE_IN_FUTURE: () => w("The day it takes effect cannot be after today: record it on the day."),
  EFFECTIVE_BEFORE_DECISION: (d) => w(`It cannot take effect before its route approved it (${day(d.approvedOn)}).`),
  EFFECTIVE_BEFORE_REGISTRATION: (d) => w(`It cannot take effect before the supplier was registered (${day(d.registeredOn)}).`),
  EFFECTIVE_BEFORE_SUSPENSION: (d) => w(`It cannot take effect before the suspension did (${day(d.since)}).`),
  ALREADY_SUSPENDED: (d) => w(`The supplier is already suspended (since ${day(d.since)}).`),
  // S-1 (Run 0 fix round): only a blacklisting refuses a suspension now; a cancellation is recorded beside one.
  ALREADY_BARRED: (d) => w(`The supplier is blacklisted${d.since ? ` (since ${day(d.since)})` : ""}: a suspension adds nothing.`),
  DOCUMENT_NOT_ON_FILE: () => w("A document named is not on this supplier's file."),
  NOT_SUSPENDED: () => w("No suspension of this supplier is in effect."),
  BLACKLISTED: () => w("The supplier is blacklisted: a blacklisting is not reinstated, it is lifted on its own route."),
  FLAGGED_NOT_STANDING: (d) => w(`Not reinstated: these documents the suspension was for are not verified and in force: ${d.types}.`),
  LAPSED_SINCE: (d) => w(`Not reinstated: a mandatory document has expired since: ${d.types}.`),
  CHECKLIST_INCOMPLETE: (d) => w(`Tick every line of the checklist, having seen each verified: ${d.types}.`),
  LAPSE_RULE_NOT_SET: (d) => w(`Active — lapse rule not set; a mandatory document has expired${d.types ? ` (${d.types})` : ""}. Whether that suspends the supplier is set under ${SETTINGS.en}, Standing.`),
  MANDATORY_EXPIRED: (d) => w(`A mandatory document has expired (${d.types}); the policy does not suspend on lapse.`),
  BLACKLIST_ENDED: (d) => w(`A first-offence blacklisting has ended: last blacklisted day ${day(d.lastDay)} · free from ${day(d.freeFrom)}.`),
  // M-1 (BD-613-108): a cancellation that stood, ended by the supplier registering again.
  CANCELLATION_ENDED: (d) => cancellationEndedWords(d.since, d.registeredOn),
  CANCELLED_NEW_APPLICATION_ONLY: (d) => {
    const by = d.body ? ` by ${d.body}${d.reference ? ` (${d.reference})` : ""}` : "";
    return w(`The supplier's registration is cancelled (since ${day(d.since)}${by}): a renewal or an upgrade is not opened or approved while it stands. The way back is a new registration: open a first registration (a new application), which, once approved, ends the cancellation.`);
  },
  CANCELLED_APPROVE_FROM: (d) => w(`The registration was cancelled from ${day(d.since)}: a new registration ends it only from a later day, so it is approved from ${day(d.from)}.`),
  SCHEDULED: (d) => w(`${STANDING_EVENT_LABEL[d.kind as StandingEventKind]?.en ?? "A change"} takes effect on ${day(d.effectiveOn)}.`),
  // a2: the sale (FR-ADV-010, OD-5)
  SALE_NOT_REGISTERED: () => w("Not sold: the purchaser's supplier is not registered."),
  BARRED: (d) => w(`Not sold: the purchaser's supplier is ${(STANDING_LABEL[d.standing as Standing]?.en ?? "barred").toLowerCase()}.`),
  NOT_LINKED_REGISTER_REQUIRED: () => w("Not sold: the documents are sold only to a purchaser on the supplier register, and no supplier is named for this contractor. Choose its supplier under “Supplier on the register” on this form: the contractor is linked to it as the sale is recorded. A company not yet on the register is recorded there first (Suppliers › Record a paper application)."),
  SALE_PARTY_LINKED_ELSEWHERE: () => w("Not sold: this contractor is already linked to another supplier on the register. A link is not moved: leave “Supplier on the register” empty, or choose the supplier it is linked to."),
  REGISTER_RULE_NOT_SET: () => w(`Not checked against the register: the party is not linked, and whether a sale needs the register is not set (${SETTINGS.en}, Standing).`),
  NOT_LINKED: () => w("Not checked against the register: the party is not linked to a supplier."),
  // a2: links (OD-9)
  AWARD_LINK_DISAGREES: (d) => w(`The award is linked on its own to ${d.awardSupplier ?? "a supplier"} on the register, and the bidder named is ${d.partySupplier ? `linked to ${d.partySupplier}` : "not linked"}: the links would disagree. Link the bidder to the same supplier from the supplier's record first.`),
  ALREADY_LINKED: () => w("It is already linked to that supplier."),
  SUPPLIER_ON_OTHER_PARTY: (d) => w(`${d.party} is already linked to that supplier on this exercise: one company is one party on an exercise. Use that party.`),
  LINKED_ELSEWHERE: () => w("It is already linked to another supplier. A link is not moved."),
  NUMBER_DIFFERS_REASON_REQUIRED: (d) => w(`The registration number recorded (${d.recorded}) differs from the register's (${d.register}): say why they are the same company.`),
  NUMBER_DIFFERS: (d) => w(`Linked although the number recorded (${d.recorded}) differs from the register's (${d.register}).`),
  SUPPLIER_NOT_REGISTERED: () => w("Linked to a supplier that is not registered."),
  AWARD_HAS_PARTY: () => w("This award names its awardee party: link the party, and the award follows it."),
  SUPPLIER_REQUIRED: () => w("Choose the supplier on the register."),
  // a2: special permission (FR-ADV-017)
  NOT_OFFERED: () => w("The exercise's notice does not offer special permission."),
  OFFER_NOT_SET: () => w("Whether the exercise's notice offers special permission is not set: set it on the exercise's window."),
  REQUIREMENT_REQUIRED: () => w("Choose the registration requirement it relaxes."),
  REQUIREMENT_NOT_ON_EXERCISE: () => w("That requirement is not this exercise's."),
  RELAXES_REQUIRED: () => w("Say what it relaxes: the grade or the field codes."),
  PERMISSION_AUTHORITY_REQUIRED: () => w("Name who grants it: a registration body outside the organisation, or the organisation's own approval."),
  CLASS_NOT_CONFIRMED: () => w("Confirm the party already holds a registration class."),
  RECORD_NOT_CONFIRMED: () => w("Confirm the party's record is good."),
  PERMISSION_DUPLICATE: () => w("A permission relaxing that already stands for this party and requirement."),
  ALREADY_GRANTED: () => w("It is already granted."),
  INTERNAL_ROUTE_NOT_APPROVED: () => w("Its approval inside the organisation has not been given: it is granted once its route approves."),
  GRANTED_REQUIRED: () => w("Give the day it was granted."),
  GRANTED_IN_FUTURE: () => w("The day granted cannot be after today."),
  GRANTED_BEFORE_APPROVAL: (d) => w(`It cannot be granted before its route approved it (${day(d.approvedOn)}).`),
};

// ------------------------------------------------------------------ a2: standing, expiry and eligibility words

export const STANDING_LABEL: Readonly<Record<Standing, Words>> = {
  ACTIVE: w("Active"),
  SUSPENDED: w("Suspended"),
  SUSPENDED_ON_LAPSE: w("Suspended on lapse"),
  BLACKLISTED: w("Blacklisted"),
  CANCELLED: w("Registration cancelled"),
  NOT_REGISTERED: w("Not registered"),
};
export const STANDING_TONE: Readonly<Record<Standing, "ok" | "warn" | "err" | "info" | "neutral">> = { ACTIVE: "ok", SUSPENDED: "err", SUSPENDED_ON_LAPSE: "err", BLACKLISTED: "err", CANCELLED: "err", NOT_REGISTERED: "neutral" };

/// OD-7 A as ruled: an active supplier with an expired mandatory document and the lapse rule unset reads exactly this.
export const LAPSE_RULE_NOT_SET_WORDS = w("Active — lapse rule not set; a mandatory document has expired");

/// A standing as one line: the label, or the OD-7 wording where the lapse rule is unset.
export function standingWords(r: Pick<StandingReading, "standing" | "notes">): Words {
  if (r.standing === "ACTIVE" && r.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET")) return LAPSE_RULE_NOT_SET_WORDS;
  return STANDING_LABEL[r.standing];
}
export const standingTone = (r: Pick<StandingReading, "standing" | "notes">) => (r.standing === "ACTIVE" && r.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET") ? "warn" : STANDING_TONE[r.standing]);

export const STANDING_EVENT_LABEL: Readonly<Record<StandingEventKind, Words>> = {
  SUSPEND: w("Suspended"),
  REINSTATE: w("Reinstated"),
  BLACKLIST: w("Blacklisted"),
  BLACKLIST_LIFT: w("Blacklisting lifted"),
  REGISTRATION_CANCELLED: w("Registration cancelled"),
};

/// M-1 (BD-613-108): a cancellation ended by the supplier registering again: the CANCELLATION_ENDED note's words, also the
/// Recorded card's chip on that cancellation (Run 1a, Should 2: one source, English and Malay).
export function cancellationEndedWords(since: unknown, registeredOn: unknown): Words {
  return w(`The registration cancelled from ${day(since)} ended when the supplier registered again on ${day(registeredOn)}.`);
}

/// Run 1a (Should 2): an application's approval, as the act returns it. `again`: a cancellation the new registration ends.
export function approvedWords(kind: string, again: { since: string } | null, today: string): Words {
  const what =
    kind !== "NEW" ? w("the application is approved")
    : again ? w(`the supplier is registered again from ${day(today)}; the registration cancelled from ${day(again.since)} no longer stands`)
    : w("the supplier is registered");
  return w(`Approved: ${what.en}. The notice to the supplier is shown, not sent.`);
}

/// Run 1a (Should 2): a cancellation withdrawn as recorded in error, as the act returns it. `now`: the standing it changed
/// to (null where it did not change); `notRevisited`: what is not revisited (notRevisitedWords).
export function withdrawnWords(now: Words | null, notRevisited: Words): Words {
  return w(
    `Withdrawn as recorded in error. It stays on the record, marked withdrawn with why; the supplier's standing no longer reads it${now ? ` (now ${now.en.toLowerCase()})` : ""}. ${notRevisited.en}`,
  );
}

/// Said (and only said) to a reader who is not named on some restricted exercise, whether or not this supplier bid on it: the openings on those are left out of
/// what is listed as not revisited (FR-MTD-007), and an unconditional sentence cannot tell the reader that this supplier took part in one.
export const RESTRICTED_OPENINGS_NOT_LISTED = w(
  "Openings on exercises restricted to their named people are not listed here to anyone not named on them.",
);

/// The not-revisited words with that sentence added, for a reader who is not named on some restricted exercise.
export const withRestrictedOpeningsNote = (notRevisited: Words): Words => w(`${notRevisited.en} ${RESTRICTED_OPENINGS_NOT_LISTED.en}`);

/// Run 1a (Should 2): the withdrawal drawer's way back for a cancellation that stood.
export const NEW_APPLICATION_WAY_BACK = w(
  "A cancellation that stood is not withdrawn: the supplier registers again, by a new application on the Applications tab, which ends it once approved.",
);

/**
 * BD-613-105(e) / S-3 (Run 0 fix round): a registration cancelled's reason line, composed at read from the body's label as
 * frozen and the body's reference, in English and Malay: "Cancelled by {body} ({reference})". Nothing of it is stored as
 * words (its reasonSnapshot stays ""), so no product wording sits in a data row.
 */
export function cancellationWords(by: { body: string; reference: string }): Words {
  return w(`Cancelled by ${by.body} (${by.reference})`);
}

/// An event's reason line in words: a cancellation's composed from its body and reference; any other kind's its reason as recorded.
export function eventReasonWords(e: { kind: string; reasonLabel: string; cancelledBy: { body: string; reference: string } | null }): Words {
  if (e.kind === "REGISTRATION_CANCELLED") return e.cancelledBy ? cancellationWords(e.cancelledBy) : w("");
  return w(e.reasonLabel);
}

export const REASON_USE_LABEL: Readonly<Record<"SUSPEND" | "BLACKLIST", Words>> = { SUSPEND: w("Suspension"), BLACKLIST: w("Blacklisting") };
export const REQUEST_KIND_LABEL: Readonly<Record<"BLACKLIST" | "BLACKLIST_LIFT", Words>> = { BLACKLIST: w("Blacklisting"), BLACKLIST_LIFT: w("Lifting a blacklisting") };
export const CONSEQUENCE_LABEL: Readonly<Record<"ELIMINATE" | "REPORT", Words>> = { ELIMINATE: w("Eliminated at the opening"), REPORT: w("Reported to the committee, which decides") };
export const RELAXES_LABEL: Readonly<Record<"GRADE" | "FIELD_CODE", Words>> = { GRADE: w("The grade"), FIELD_CODE: w("The field codes") };
export const CHECK_STATE_LABEL: Readonly<Record<CheckState, Words>> = { NOT_CHECKED: w("Not checked"), CLEAR: w("Clear on the register"), FAILED: w("Failed on the register") };

export const EXPIRY_BAND_LABEL: Readonly<Record<ExpiryBand, Words>> = {
  EXPIRED: w("Expired"),
  CRITICAL: w("Critical"),
  WARNING: w("Warning"),
  UPCOMING: w("Upcoming"),
  NONE: w("Not yet near"),
  NO_EXPIRY: w("No expiry"),
  BANDS_NOT_SET: w("Bands not set"),
};
export const EXPIRY_BAND_TONE: Readonly<Record<ExpiryBand, "ok" | "warn" | "err" | "info" | "neutral">> = { EXPIRED: "err", CRITICAL: "err", WARNING: "warn", UPCOMING: "info", NONE: "neutral", NO_EXPIRY: "neutral", BANDS_NOT_SET: "warn" };
export const REMINDER_NOT_SENT = w("Reminder due, not sent");

export const VERDICT_LABEL: Readonly<Record<Verdict, Words>> = { ELIGIBLE: w("Eligible"), NOT_ELIGIBLE: w("Not eligible"), NOT_ASSESSED: w("Not assessed") };
/// "Not assessed" is never green.
export const VERDICT_TONE: Readonly<Record<Verdict, "ok" | "err" | "warn">> = { ELIGIBLE: "ok", NOT_ELIGIBLE: "err", NOT_ASSESSED: "warn" };
export const RESULT_LABEL: Readonly<Record<Result, Words>> = { PASS: w("Pass"), FAIL: w("Fail"), NOT_ASSESSED: w("Not assessed"), PASS_BY_PERMISSION: w("Passes by special permission") };
export const RESULT_TONE: Readonly<Record<Result, "ok" | "err" | "warn" | "info">> = { PASS: "ok", FAIL: "err", NOT_ASSESSED: "warn", PASS_BY_PERMISSION: "info" };
export const CONDITION_LABEL: Readonly<Record<ConditionKind, Words>> = {
  REGISTERED: w("Registered with the organisation"),
  STANDING: w("In good standing"),
  REGISTRATION: w("Registration held across the window"),
  GRADE: w("Grade"),
  CATEGORY: w("Category"),
  SPECIALISATION: w("Specialisation"),
  FIELD_CODES: w("Field codes"),
  PERMITS: w("Permit types"),
  QUALIFIERS: w("What the requirement states"),
  RESTRICTION: w("The restriction's evidence across the window"),
};

/// Why a condition reads as it does, in words.
export function conditionWords(r: Pick<ConditionRow, "reason" | "data">): Words {
  const d = r.data ?? {};
  switch (r.reason) {
    case "IS_REGISTERED": return w("Registered.");
    case "NOT_REGISTERED": return w("Not registered with the organisation.");
    case "IN_GOOD_STANDING": return w("Active.");
    case "BARRED": return w(`${STANDING_LABEL[d.standing as Standing]?.en ?? "Barred"}.`);
    case "LAPSE_RULE_NOT_SET": return w(`${LAPSE_RULE_NOT_SET_WORDS.en}${d.types ? ` (${d.types})` : ""}.`);
    case "NO_DOCUMENT_TYPE_FOR_BODY": return w(`No document type records ${d.body}'s registration (${SETTINGS.en}, Document types).`);
    case "QUALIFIERS_IN_WORDS": return w(`Stated in words only (“${d.qualifiers}”), not compared.`);
    case "GRADE_MET": return w(`Holds ${d.held}; ${d.needed} or above is asked.`);
    case "GRADE_BELOW": return w(`Holds ${d.held}, below the ${d.needed} asked.`);
    case "GRADE_NOT_HELD": return w(`Holds no grade; ${d.needed} is asked.`);
    case "GRADE_RANK_NOT_SET": return w(`A grade's rank is not set (${SETTINGS.en}, Values), so ${d.needed} cannot be compared.`);
    case "VALUE_HELD": return w(`Holds ${d.held}.`);
    case "VALUE_NOT_HELD": return w(`Holds none of ${d.needed}.`);
    case "FIELD_CODES_HELD": return w("Holds every field code asked.");
    case "FIELD_CODES_MISSING": return w(`Does not hold ${d.missing}.`);
    case "PERMITS_HELD": return w("Holds every permit type asked.");
    case "PERMITS_MISSING": return w(`Does not hold ${d.missing}.`);
    case "RESTRICTION_NOT_STATED": return w("Whether the exercise is restricted is not stated on it.");
    case "EVIDENCE_TYPE_NOT_SET": return w(`The document type that evidences the restriction is not set (${SETTINGS.en}, Standing).`);
    case "COVERS_WINDOW": return d.body ? w(`${asHeading(String(d.body))}: verified and in force from the advertisement to past the closing.`) : w("Verified and in force from the advertisement to past the closing.");
    case "COVERS_TO_CLOSING_DAY": return w(`Expires on the closing day (${day(d.expiresOn)}), which the policy counts as valid.`);
    case "NOT_PUBLISHED": return w("The window is not published yet: there is no advertisement day to judge from.");
    case "CLOSING_NOT_SET": return w("The closing is not set.");
    case "NOT_HELD": return d.body ? w(`${asHeading(String(d.body))}: no verified document on file.`) : w("No verified document on file.");
    case "RECORDED_NOT_APPLICABLE": return w("Recorded as not applicable.");
    case "UNVERIFIED": return w("Lodged and not yet verified.");
    case "RENEWAL_UNVERIFIED": return w("A renewal is lodged and not yet verified: judged once it is.");
    case "STARTS_AFTER_ADVERTISEMENT": return w(`Valid only from ${day(d.from)}, after the advertisement (${day(d.advertisementDay)}).`);
    case "EXPIRED_BEFORE_ADVERTISEMENT": return w(`Expired before the advertisement (${day(d.advertisementDay)}).`);
    case "LAPSES_BEFORE_CLOSING": return w(`Expires ${day(d.expiresOn)}, before the closing (${day(d.closingDay)}), though valid today.`);
    case "LAPSES_ON_CLOSING_DAY": return w(`Expires on the closing day (${day(d.expiresOn)}), which the policy does not count as valid.`);
    case "CLOSING_DAY_RULE_NOT_SET": return w(`Expires on the closing day (${day(d.expiresOn)}), and whether that counts is not set (${SETTINGS.en}, Standing).`);
  }
}

/// What a supplier's blacklisting route is called in a refusal.
export const BLACKLIST_MATTER = w("a supplier's blacklisting");
/// What a special permission's route is called in a refusal.
export const PERMISSION_MATTER = w("a special permission");
/// Where a refused blacklisting route goes: nothing is recorded.
export const STANDING_REFUSED_DECIDED_BY = "nothing is recorded: the request is closed, and may be asked for again";
export const PERMISSION_REFUSED_DECIDED_BY = "the permission is not granted: it may be asked for again";

/// A finding of the register's rules, in words.
export function supplierFaultText(f: Finding, lang: keyof Words = "en"): string {
  const t = (TEXT as Record<string, (d: Record<string, string | number | null>) => Words>)[f.code];
  return t ? t(f.data ?? {})[lang] : lang === "en" ? "This cannot be done as it stands." : "Ini tidak boleh dilakukan seperti keadaannya.";
}

/// Whether every code a rule can return has words (the labels test asks this of each fault list).
export const hasFaultText = (code: string) => code in TEXT;

/// A step decider's fault on a supplier route, in words (6.1's rule; the matter is the supplier's, not a requisition).
export const SUPPLIER_DECIDER_TEXT: Readonly<Record<DeciderFault, Words>> = {
  TIME_ZONE_UNSET: w("Set the organisation's time zone before recording decisions."),
  COMMITTEE_STEP: w("A committee step is not taken on a supplier matter."),
  NOT_PENDING: w("This step is already decided."),
  OUT_OF_ORDER: w("An earlier step is still pending. Steps are decided in order."),
  INACTIVE: w("That person is recorded as having left."),
  NOT_HOLDER: w("That person does not hold this office organisation-wide on that day, and holds no delegation of it without a value ceiling (a supplier matter has no value to judge a ceiling by)."),
  DELEGATION_NOT_PERMITTED: w("This step cannot be delegated, and that person acts only under a delegation."),
  OVER_CEILING: w("A delegation with a value ceiling cannot be judged on a supplier matter, which has no value."),
  SELF_APPROVAL: w("That person sent this matter for decision. Nobody decides a matter they sent."),
  // A supplier route bars the one person who sent it (SELF_APPROVAL), so this code is not met here; it has words because every code does.
  SENT_IT: w("That person sent this matter for decision. Nobody decides a matter they sent."),
  ENDORSED_IT: w("That person endorsed this matter."),
  ALREADY_DISCHARGED_A_STEP: w("That person has already decided another step of this route."),
  FUTURE_DATE: w("A decision cannot be dated after today."),
  BEFORE_SUBMISSION: w("A decision cannot be dated before the matter was sent for decision."),
  DECLARED_CONFLICT: w("That person declared a conflict of interest on this step and recused."),
  RECORDER_IS_REQUESTER: w("You sent this matter for decision. Nobody records the decision of a matter they sent, for themselves or on someone else's behalf."),
  RECORDER_ENDORSED_IT: w("You endorsed this matter. An endorser does not record its decision for someone else."),
  RECORDER_DECIDED_ANOTHER_STEP: w("You have already decided another step of this route. The same person does not record a second decision on it for someone else."),
  RECORDER_DECLARED_CONFLICT: w("You declared a conflict of interest on this step and recused. You do not record its decision for someone else."),
};

/// What a supplier's registration is called in a route refusal.
export const REGISTRATION_MATTER = w("a supplier's registration");
/// Where a refused registration route goes: the application stays open.
export const REGISTRATION_REFUSED_DECIDED_BY = "the application stays open: resubmission may be requested, it may be rejected, or sent again";
