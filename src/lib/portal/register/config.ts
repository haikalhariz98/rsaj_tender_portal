/**
 * What the public registration form draws itself with (ADR 0041, plan section 4.1): everything the five steps ask and every rule they are judged by, read once on the server
 * (`loadRegisterForm`) and handed to the browser. Types and conversions only, and safe for the browser. Nothing about any supplier or any application is in it: no name, no number, no
 * reference. Byte counts travel as decimal strings and are read back as `bigint` here, so the page and the server judge a file by the same numbers.
 */

import type { PortalApplicationContext } from "@/lib/portal/apply";
import type { UploadPolicy, UploadStore } from "@/lib/portal/registration/upload";
import type { DeclarationKind, RegistrationContext } from "@/lib/portal/registration/types";

export type ListOption = { value: string; label: string };

/// A text as the page shows it: the filled wording, its version, and the hash the tick is bound to.
export interface ShownText {
  id: string;
  en: string;
  version: number;
  sha256: string;
}

/// An upload rule with its bytes as a decimal string. The class is said set or not, never named.
export interface PlainUploadPolicy {
  classSet: boolean;
  /// Asked of the bank statement's class only.
  classIsSulit?: boolean;
  maxFiles: number | null;
  maxBytes: string | null;
}

export interface PublicRegistrationConfig {
  /// The organisation is set up at all. False: nothing else can be said.
  ready: boolean;
  /// What the register still lacks, in words, in `whatIsMissing`'s order. Empty: it is open.
  missing: string[];
  organisationName: string;
  /// Step 1's rule: the organisation's day, the number's format and the codes each list accepts.
  step1: PortalApplicationContext;
  lists: {
    entityTypes: ListOption[];
    countries: (ListOption & { callingCode: string | null })[];
    states: ListOption[];
    /// Empty: the claim is not asked.
    bumiputeraStatuses: ListOption[];
  };
  formatExample: string | null;
  /// Whether the office has said which document evidences a Bumiputera claim: the review reads a claim with it.
  bumiputeraEvidenceSet: boolean;
  /// Steps 2 to 5's configuration, as the rules read it. No value is chosen and no applicant is named: the page adds both.
  context: Omit<RegistrationContext, "values" | "supplier">;
  /// Each agreement's wording as shown, filled with the organisation's name. Null while not set.
  texts: Record<DeclarationKind, ShownText | null>;
  /// The Personal Data Notice, filled, with the hash the terms tick is bound to.
  notice: { en: string; sha256: string } | null;
  /// The office's note to applicants, shown once the application is sent.
  verificationNoticeEn: string | null;
  upload: {
    allowedTypes: string[];
    /// The largest file, the smaller of the organisation's size and the deployment's ceiling.
    capBytes: string | null;
    document: PlainUploadPolicy;
    statement: PlainUploadPolicy;
    /// "PDF, PNG; up to 10 MB each.", from the settings. Null while they are not set.
    acceptNote: string | null;
    /// The media types the file picker offers.
    accept: string;
  };
}

const big = (s: string | null): bigint | null => (s == null ? null : BigInt(s));

/// The upload rules as `uploadFault` reads them.
export function uploadRulesOf(config: Pick<PublicRegistrationConfig, "upload">): { store: UploadStore; document: UploadPolicy; statement: UploadPolicy } {
  const policy = (p: PlainUploadPolicy): UploadPolicy => ({ classId: p.classSet ? "set" : null, ...(p.classIsSulit !== undefined ? { classIsSulit: p.classIsSulit } : {}), maxFiles: p.maxFiles, maxBytes: big(p.maxBytes) });
  return { store: { allowedTypes: config.upload.allowedTypes, capBytes: big(config.upload.capBytes) }, document: policy(config.upload.document), statement: policy(config.upload.statement) };
}
