/**
 * The registration's findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A rule returns a code and the labels it is about; this says it. A setting that
 * is not set is named, and says where to ask: the supplier cannot set it, so the sentence tells them the procurement office has to.
 */

import { formatDate } from "@/lib/format";
import type { Finding } from "@/lib/suppliers/types";

import type { UploadFault } from "./upload";
import { UPLOAD_SETTING_NAME } from "./upload";
import type { RegistrationFault, StepFault } from "./types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });

type Data = Record<string, string | number | null>;
const s = (d: Data | undefined, k: string): string => (d && d[k] != null ? String(d[k]) : "");

const TEXT: Readonly<Record<RegistrationFault, (d: Data) => Words>> = {
  TIME_ZONE_UNSET: () => w("Time zone not set, so nothing can be checked. Tell the procurement office."),
  DOCUMENT_TYPES_NOT_SET: () => w("Document list not set. Tell the procurement office."),
  DOCUMENT_TYPE_UNKNOWN: () => w("The office no longer asks for this kind. Remove it."),
  DOCUMENT_REQUIRED: (d) => w(`The ${s(d, "type")} is required. Upload it, or say it does not apply.`),
  DOCUMENT_DUPLICATE: (d) => w(`Only one ${s(d, "type")} is kept. Remove the extra one.`),
  FILE_REQUIRED: (d) => w(`Upload the file for the ${s(d, "type")}.`),
  EXPIRY_REQUIRED: (d) => w(`Give the date the ${s(d, "type")} expires.`),
  EXPIRY_NOT_A_DAY: (d) => w(`The expiry date of the ${s(d, "type")} is not a date.`),
  ALREADY_EXPIRED: (d) => w(`The ${s(d, "type")} expired on ${s(d, "expiresOn") ? formatDate(s(d, "expiresOn")) : "an earlier date"}. Upload a current one.`),
  EXPIRES_NOT_SET: (d) => w(`Give the ${s(d, "type")} expiry date, if it has one.`),
  RATE_INVALID: (d) => w(`Give the ${s(d, "type")} rate as a percentage, 0 to 100, up to two decimals.`),
  TITLE_REQUIRED: (d) => w(`Give this ${s(d, "type")} a title.`),
  TITLE_DUPLICATE: (d) => w(`You already have a ${s(d, "type")} titled "${s(d, "title")}". Give this one a different title.`),
  MANDATORY_NOT_SAID: (d) => w(`The procurement office has not said whether the ${s(d, "type")} is required.`),
  NOT_APPLICABLE_NOT_ALLOWED: (d) => w(`The ${s(d, "type")} cannot be marked as not applicable.`),
  VALUE_UNKNOWN: () => w("This code is not on the procurement office's list."),
  VALUE_RETIRED: (d) => w(`${s(d, "value")} is no longer on the list. Choose another, or remove it.`),
  VALUE_NOT_FOR_DOCUMENT: (d) => w(`${s(d, "value")} does not belong to the ${s(d, "type") || "document"} it was chosen for.`),
  ONE_GRADE_ONLY: (d) => w(`Choose one grade only for the ${s(d, "type")}.`),
  DOCUMENT_FIRST: (d) => w(`Add the ${s(d, "type")} in step 2 first. The codes of ${s(d, "body")} are recorded on it.`),
  LIST_NOT_CONFIGURED: (d) => w(`Codes for ${s(d, "body")} not set. Nothing to choose. You can still send.`),
  FIELD_REQUIRED: (d) => w(`${s(d, "field")} is required.`),
  BANKS_NOT_SET: () => w("Bank list not set. Tell the procurement office."),
  ACCOUNT_TYPES_NOT_SET: () => w("Account types not set. Tell the procurement office."),
  BANK_NOT_LISTED: () => w("Choose the bank from the list."),
  ACCOUNT_TYPE_NOT_LISTED: () => w("Choose the account type from the list."),
  EMAIL_NOT_VALID: () => w("This email address does not look right."),
  FORMAT_MISMATCH: (d) => w(`${s(d, "field")} is not in the form the procurement office expects. Check it.`),
  FORMAT_NOT_CHECKED: (d) => w(`${s(d, "field")}: no form is set, so it is not checked. Check it yourself.`),
  IDENTITY_DIFFERS: () => w("Not the company's registration number. Allowed, and the office will see it."),
  STATEMENT_REQUIRED: () => w("Upload a bank statement."),
  TEXT_NOT_SET: (d) => (s(d, "kind") === "GIRO_AUTHORISATION"
    ? w("The GIRO authorisation text is not set. Tell the procurement office.")
    : w("The false-declaration text is not set. Tell the procurement office.")),
  TEXT_STALE: (d) => (s(d, "ticked")
    ? w("The authorisation wording changed since you ticked. Read it again and tick again.")
    : w("The wording has been changed since you opened this page. Reload it.")),
  SIGNATORY_NAME_REQUIRED: () => w("Give the name of the person who signs."),
  SIGNATORY_DESIGNATION_REQUIRED: () => w("Give the position of the person who signs."),
  NOT_CONFIRMED: (d) => (s(d, "kind") === "FALSE_DECLARATION" ? w("Tick the box to confirm the declaration.") : w("Tick the box to confirm the authorisation.")),
  NOTICE_NOT_SET: () => w("The notice before sending is not set. Tell the procurement office."),
  SIGNATORY_DIFFERS: () => w("Not the contact on your account. Allowed, and the office will see it."),
  TOO_LONG: (d) => w(`This is too long. Keep it to ${s(d, "max")} characters.`),
  NOT_A_DAY: () => w("This is not a date."),
  NOT_A_NUMBER: () => w("This is not a number."),
};

/// A finding of the registration's rules, in words.
export function registrationFaultText(f: Pick<StepFault, "code" | "data">): Words {
  const t = TEXT[f.code];
  return t ? t(f.data ?? {}) : w("This cannot be done as it stands.");
}

export const hasRegistrationFaultText = (code: string): boolean => code in TEXT;

/// The words for a refused upload. The settings that are not set are named, because only the procurement office can set them.
export function uploadFaultText(f: Finding<UploadFault>, kind: "document" | "statement" = "document"): Words {
  switch (f.code) {
    case "STORE_POLICY_NOT_SET":
      return w("Uploads closed: the office has not set which kinds of file it takes. Tell the procurement office.");
    case "CLASS_NOT_SET":
      return w(`Uploads closed: ${s(f.data, "setting") || UPLOAD_SETTING_NAME[kind].cls} not set. Tell the procurement office.`);
    case "STATEMENT_CLASS_NOT_SULIT":
      return w("Statement uploads closed: their document class is not classified SULIT. Tell the procurement office.");
    case "QUOTA_NOT_SET":
      return w("Uploads closed: the office has not set how many files or bytes. Tell the procurement office.");
    case "EMPTY":
      return w("That file is empty.");
    case "TOO_LARGE":
      return w("That file is larger than the procurement office takes.");
    case "TYPE_NOT_ALLOWED":
      return w("That kind of file is not accepted. Use one listed beside the upload button.");
    case "QUOTA_FILES":
      return w(`Your registration already holds as many files as it may (${s(f.data, "max")}). Remove one first.`);
    case "QUOTA_BYTES":
      return w("Over the size limit in all. Remove a file, or upload a smaller one.");
    default:
      // A refusal the document store itself gave (the class is gone, the class list is empty): the supplier cannot mend it, so the office is told.
      return w("That file could not be stored. Tell the procurement office.");
  }
}
