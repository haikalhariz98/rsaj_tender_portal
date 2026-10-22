/**
 * The agreements of the registration (FR-VND-005, FR-VND-006, ADR 0041 D4): the GIRO authorisation, read and ticked on step 4; the false-declaration acknowledgement, ticked at Submit;
 * and the terms and conditions, whose one tick also agrees the Personal Data Notice (REG-4). On the signed-in wizard the password is asked again at Submit; on the public form there is no
 * account, and an agreement is the applicant's tick, not a signature. Pure, and safe for the browser: no `node:` import.
 *
 * The wording is the customer's, versioned, English only for every new signature (founder, 2026-10-20; a stored Malay body is kept but never shown, signed or hashed), and names the organisation (`{organisation}` is filled from `Organisation.name`); none ships. While a kind has no current text
 * its step is closed and the screen names the missing text. A signature names the text it showed (`textVersionId` must be the current one), and the date is never typed: the server stamps the
 * organisation's day. The signatory is whoever the supplier says signs, and is flagged to the reviewer when it is not the account's contact.
 */

import type { DeclarationInput, DeclarationKind, Draft, RegistrationContext, StepFault } from "./types";
import { isBlank } from "./types";

// The wording's hashes are made on the server (`declaration-text.ts`, `node:crypto`): this file is imported by the browser too, and judges a tick against a hash it is given.

/// The placeholder a declaration's wording names the organisation by.
export const ORGANISATION_PLACEHOLDER = "{organisation}";

/// The wording with the organisation's name in it. Every placeholder is filled, so what is shown, signed and frozen is one text.
export function fillText(body: string, organisationName: string): string {
  return body.split(ORGANISATION_PLACEHOLDER).join(organisationName);
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/// Step 4's part: the GIRO authorisation. Blocks Next while its text is unset, and until it is signed for by name and ticked.
export function giroFaults(draft: Pick<Draft, "signatoryName" | "signatoryDesignation" | "giroConfirmed" | "giroTextSha256">, ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "epayment", ...f });
  if (!ctx.texts.GIRO_AUTHORISATION) {
    add({ code: "TEXT_NOT_SET", level: "block", field: "giro", data: { kind: "GIRO_AUTHORISATION" } });
    return out;
  }
  if (isBlank(draft.signatoryName)) add({ code: "SIGNATORY_NAME_REQUIRED", level: "block", field: "giro.signatoryName" });
  if (isBlank(draft.signatoryDesignation)) add({ code: "SIGNATORY_DESIGNATION_REQUIRED", level: "block", field: "giro.signatoryDesignation" });
  const tick = giroTick(draft, ctx);
  if (tick === "VOID") add({ code: "TEXT_STALE", level: "block", field: "giro.confirmed", data: { kind: "GIRO_AUTHORISATION", ticked: 1 } });
  else if (tick === "NONE") add({ code: "NOT_CONFIRMED", level: "block", field: "giro.confirmed", data: { kind: "GIRO_AUTHORISATION" } });
  if (signatoryDiffers(draft.signatoryName, ctx.supplier.contactName)) add({ code: "SIGNATORY_DIFFERS", level: "warn", field: "giro.signatoryName" });
  return out;
}

/// Whether the person who signs is someone other than the account's contact (flagged to the office, never refused). Blank names are not compared.
export function signatoryDiffers(signatoryName: string, contactName: string): boolean {
  return !isBlank(signatoryName) && !sameName(signatoryName, contactName);
}

/// The GIRO tick against the wording in force: "OK" when it was made on that very wording, "VOID" when it was made on other wording (or on none that can be told), "NONE" when not made.
/// The tick is about a wording, not about the box: wording changed since is wording not read.
export function giroTick(draft: Pick<Draft, "giroConfirmed" | "giroTextSha256">, ctx: Pick<RegistrationContext, "texts">): "OK" | "VOID" | "NONE" {
  if (!draft.giroConfirmed) return "NONE";
  const current = ctx.texts.GIRO_AUTHORISATION;
  return current && draft.giroTextSha256 != null && draft.giroTextSha256 === current.sha256 ? "OK" : "VOID";
}

/// Step 5's part: the notice the applicant reads, the false-declaration text, and the terms with the Personal Data Notice they are agreed with. Blocks Submit while any is unset, naming it
/// (REG-5: on a database with no terms text, Submit is closed and says so).
export function reviewFaults(ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "review", ...f });
  if (isBlank(ctx.noticeEn)) add({ code: "NOTICE_NOT_SET", level: "block", field: "notice" });
  if (!ctx.texts.FALSE_DECLARATION) add({ code: "TEXT_NOT_SET", level: "block", field: "declaration", data: { kind: "FALSE_DECLARATION" } });
  out.push(...termsSetFaults(ctx));
  return out;
}

/// Whether the terms can be agreed at all: their text and the Personal Data Notice are both set.
function termsSetFaults(ctx: Pick<RegistrationContext, "texts" | "personalDataNotice">): StepFault[] {
  const out: StepFault[] = [];
  if (!ctx.texts.TERMS_AND_CONDITIONS) out.push({ step: "review", code: "TEXT_NOT_SET", level: "block", field: TERMS_FIELD, data: { kind: "TERMS_AND_CONDITIONS" } });
  if (!ctx.personalDataNotice) out.push({ step: "review", code: "PRIVACY_NOTICE_NOT_SET", level: "block", field: TERMS_FIELD });
  return out;
}

/// The form field the terms card's words are placed beside.
export const TERMS_FIELD = "terms";

/**
 * The terms and conditions tick (ADR 0041 D4, REG-4): one tick agrees both the terms text and the Personal Data Notice. Refused while either is unset, when the request names another text
 * (id or hash) or another notice (its hash) than the ones in force now, and until ticked. `noticeSha256` is the hash of the notice the page showed.
 */
export function termsFaults(input: DeclarationInput | undefined, noticeSha256: string, ctx: Pick<RegistrationContext, "texts" | "personalDataNotice">): StepFault[] {
  const unset = termsSetFaults(ctx);
  if (unset.length) return unset;
  const text = ctx.texts.TERMS_AND_CONDITIONS!;
  const notice = ctx.personalDataNotice!;
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "review", ...f });
  if (!input) {
    add({ code: "NOT_CONFIRMED", level: "block", field: TERMS_FIELD, data: { kind: "TERMS_AND_CONDITIONS" } });
    return out;
  }
  if (input.textVersionId !== text.id || input.textSha256 !== text.sha256 || noticeSha256 !== notice.sha256) add({ code: "TEXT_STALE", level: "block", field: TERMS_FIELD, data: { kind: "TERMS_AND_CONDITIONS" } });
  if (!input.confirmed) add({ code: "NOT_CONFIRMED", level: "block", field: TERMS_FIELD, data: { kind: "TERMS_AND_CONDITIONS" } });
  return out;
}

/**
 * What the Submit request itself says: for each kind, the text it names must be the current one (a stale or forged id is refused), the signatory is named, and the tick is made.
 * The kinds must each be present exactly once. A kind with no current text (or, for the terms, no Personal Data Notice) is reported by `giroFaults` / `reviewFaults`, not here. The terms
 * are judged by `termsFaults`, against `noticeSha256`, the hash of the notice the page showed.
 */
export function declarationFaults(inputs: readonly DeclarationInput[], ctx: RegistrationContext, noticeSha256: string | null = null): StepFault[] {
  const out: StepFault[] = [];
  const step = (k: DeclarationKind) => (k === "GIRO_AUTHORISATION" ? "epayment" : "review");
  for (const kind of ["GIRO_AUTHORISATION", "FALSE_DECLARATION"] as const) {
    const text = ctx.texts[kind];
    const given = inputs.filter((i) => i.kind === kind);
    const field = kind === "GIRO_AUTHORISATION" ? "giro" : "declaration";
    const add = (f: Omit<StepFault, "step">) => out.push({ step: step(kind), ...f });
    if (!text) continue;
    if (given.length !== 1) {
      add({ code: "NOT_CONFIRMED", level: "block", field: `${field}.confirmed`, data: { kind } });
      continue;
    }
    const i = given[0]!;
    // On the tick, so it clears when the box is ticked again on the wording now shown (review SHOULD 3).
    if (i.textVersionId !== text.id || i.textSha256 !== text.sha256) add({ code: "TEXT_STALE", level: "block", field: `${field}.confirmed`, data: { kind } });
    if (isBlank(i.signatoryName)) add({ code: "SIGNATORY_NAME_REQUIRED", level: "block", field: `${field}.signatoryName` });
    if (isBlank(i.signatoryDesignation)) add({ code: "SIGNATORY_DESIGNATION_REQUIRED", level: "block", field: `${field}.signatoryDesignation` });
    if (!i.confirmed) add({ code: "NOT_CONFIRMED", level: "block", field: `${field}.confirmed`, data: { kind } });
  }
  const terms = inputs.filter((i) => i.kind === "TERMS_AND_CONDITIONS");
  if (ctx.texts.TERMS_AND_CONDITIONS && ctx.personalDataNotice) {
    if (terms.length > 1) out.push({ step: "review", code: "NOT_CONFIRMED", level: "block", field: TERMS_FIELD, data: { kind: "TERMS_AND_CONDITIONS" } });
    else out.push(...termsFaults(terms[0], noticeSha256 ?? "", ctx));
  }
  return out;
}

/**
 * The declarations as they will be signed: the request says which wording it was shown (id and hash) and whether the false declaration was ticked, and everything else is the draft's. The
 * signatory is the one the supplier gave on step 4 and the GIRO tick is the one stored with the hash of the wording it was made on, so nothing the request says of either is stored: a crafted
 * request cannot sign under another name or claim a tick that was not made on the wording in force. Pure.
 */
export function declarationsAsSigned(inputs: readonly DeclarationInput[], draft: Pick<Draft, "signatoryName" | "signatoryDesignation" | "giroConfirmed">): DeclarationInput[] {
  return inputs.map((i) => ({ ...i, signatoryName: draft.signatoryName, signatoryDesignation: draft.signatoryDesignation, confirmed: i.kind === "GIRO_AUTHORISATION" ? draft.giroConfirmed : i.confirmed }));
}
