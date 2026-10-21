/**
 * The one-submission registration's contract (ADR 0041, plan section 2.1): the shape of the multipart POST to `/supplier/register/submit`, its replies, and the token and code-search
 * replies. Types and constants only, and safe for the browser: the public wizard (step 3) builds this body and the route (step 2) parses it, against the same declarations.
 */

import type { AddressParts } from "@/lib/suppliers/step-one";
import type { CreditorInput, RegistrationStep } from "@/lib/portal/registration/types";

export const REGISTER_APPLICATION_PART = "application"; // the JSON part
export const documentFilePart = (clientKey: string) => `doc.${clientKey}`; // one or more files per row
export const STATEMENT_FILE_PART = "statement";
// The token travels in FORM_TOKEN_HEADER ("x-form-token"); the honeypot stays the multipart field HONEYPOT_FIELD.

export type AgreementKind = "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS";

export interface PublicApplicationBody {
  company: {
    registeredName: string; registrationNo: string; entityTypeCode: string; countryCode: string;
    incorporatedOn: string; bumiputeraClaimCode: string | null; companyEmail: string;
    address: AddressParts;
    contact: { name: string; designation: string; email: string; phone: string };
  };
  documents: {
    clientKey: string; typeId: string; title: string; reference: string; issuingAuthority: string;
    expiresOn: string; notApplicable: boolean; ratePercent: string; valueIds: string[];
  }[];
  creditor: CreditorInput;
  signatory: { name: string; designation: string };
  agreements: { kind: AgreementKind; textVersionId: string; textSha256: string; confirmed: boolean }[];
  /// The SHA-256 of the Personal Data Notice the page showed. Judged with the TERMS tick.
  noticeSha256: string;
}

export interface FaultView { step: RegistrationStep; field: string | null; level: "block" | "warn" | "info"; message: string }

export type RegisterReply =
  | { ok: true; reference: string | null }   // null: a dropped bot (honeypot)
  | { ok: false; code: "VALIDATION"; message: string; faults: FaultView[] }
  | { ok: false; code: "FORM_EXPIRED" | "CLOSED" | "BUSY" | "TOO_LARGE" | "NO_LENGTH" | "UNREADABLE" | "TRY_AGAIN"; message: string };

export type TokenReply = { ok: true; token: string } | { ok: false; code: "CLOSED"; message: string };
export interface ValueHit { id: string; code: string; name: string; kind: string; bodyId: string }
