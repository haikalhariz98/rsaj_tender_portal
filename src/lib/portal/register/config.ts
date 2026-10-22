/**
 * What the public registration form draws itself with (ADR 0041, plan section 4.1): everything the five steps ask and every rule they are judged by, read once on the server
 * (`loadRegisterForm`) and handed to the browser. Types and conversions only, and safe for the browser. Nothing about any supplier or any application is in it: no name, no number, no
 * reference. Byte counts travel as decimal strings and are read back as `bigint` here, so the page and the server judge a file by the same numbers.
 */

import type { PortalApplicationContext } from "@/lib/portal/apply";
import type { UploadPolicy, UploadStore } from "@/lib/portal/registration/upload";
import { fillText } from "@/lib/portal/registration/declaration";
import type { DeclarationKind, RegistrationContext } from "@/lib/portal/registration/types";

import type { CurrentTexts } from "./contract";

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

/// The texts in force, from the rules' context, as a refusal carries them back (review SHOULD 3). No Malay wording is sent.
export function currentTextsOf(ctx: Pick<RegistrationContext, "texts" | "personalDataNotice">): CurrentTexts {
  const t = (k: DeclarationKind) => {
    const x = ctx.texts[k];
    return x ? { id: x.id, version: x.version, bodyEn: x.bodyEn, sha256: x.sha256 } : null;
  };
  return { texts: { giro: t("GIRO_AUTHORISATION"), declaration: t("FALSE_DECLARATION"), terms: t("TERMS_AND_CONDITIONS") }, notice: ctx.personalDataNotice };
}

/// The page's configuration with the texts in force swapped in: what is shown (filled with the organisation's name) and what the rules read.
const CURRENT_KEY = { GIRO_AUTHORISATION: "giro", FALSE_DECLARATION: "declaration", TERMS_AND_CONDITIONS: "terms" } as const satisfies Record<DeclarationKind, keyof CurrentTexts["texts"]>;

export function withCurrentTexts(config: PublicRegistrationConfig, current: CurrentTexts): PublicRegistrationConfig {
  const shown = (k: DeclarationKind): ShownText | null => {
    const x = current.texts[CURRENT_KEY[k]];
    return x ? { id: x.id, en: fillText(x.bodyEn, config.organisationName), version: x.version, sha256: x.sha256 } : null;
  };
  const rule = (k: DeclarationKind) => {
    const x = current.texts[CURRENT_KEY[k]];
    return x ? { ...x, bodyMs: null } : null;
  };
  return {
    ...config,
    texts: { GIRO_AUTHORISATION: shown("GIRO_AUTHORISATION"), FALSE_DECLARATION: shown("FALSE_DECLARATION"), TERMS_AND_CONDITIONS: shown("TERMS_AND_CONDITIONS") },
    notice: current.notice,
    context: { ...config.context, texts: { GIRO_AUTHORISATION: rule("GIRO_AUTHORISATION"), FALSE_DECLARATION: rule("FALSE_DECLARATION"), TERMS_AND_CONDITIONS: rule("TERMS_AND_CONDITIONS") }, personalDataNotice: current.notice },
  };
}

/// Which ticks were made on wording that is no longer in force: each kind whose text changed, and the terms also when the notice agreed with them did.
export function staleTicks(config: Pick<PublicRegistrationConfig, "texts" | "notice">, current: CurrentTexts): { giro: boolean; declaration: boolean; terms: boolean } {
  const changed = (k: DeclarationKind) => (config.texts[k]?.id ?? null) !== (current.texts[CURRENT_KEY[k]]?.id ?? null) || (config.texts[k]?.sha256 ?? null) !== (current.texts[CURRENT_KEY[k]]?.sha256 ?? null);
  return { giro: changed("GIRO_AUTHORISATION"), declaration: changed("FALSE_DECLARATION"), terms: changed("TERMS_AND_CONDITIONS") || (config.notice?.sha256 ?? null) !== (current.notice?.sha256 ?? null) };
}

/// The upload rules as `uploadFault` reads them.
export function uploadRulesOf(config: Pick<PublicRegistrationConfig, "upload">): { store: UploadStore; document: UploadPolicy; statement: UploadPolicy } {
  const policy = (p: PlainUploadPolicy): UploadPolicy => ({ classId: p.classSet ? "set" : null, ...(p.classIsSulit !== undefined ? { classIsSulit: p.classIsSulit } : {}), maxFiles: p.maxFiles, maxBytes: big(p.maxBytes) });
  return { store: { allowedTypes: config.upload.allowedTypes, capBytes: big(config.upload.capBytes) }, document: policy(config.upload.document), statement: policy(config.upload.statement) };
}
