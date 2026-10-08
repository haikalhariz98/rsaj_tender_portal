/**
 * The two declarations of the registration (FR-VND-005, FR-VND-006): the GIRO authorisation, read and ticked on step 4, and the false-declaration acknowledgement, ticked at Submit with the
 * password asked again. Pure.
 *
 * The wording is the customer's, versioned, in English and Malay, and names the organisation (`{organisation}` is filled from `Organisation.name`); none ships. While a kind has no current text
 * its step is closed and the screen names the missing text. A signature names the text it showed (`textVersionId` must be the current one), and the date is never typed: the server stamps the
 * organisation's day. The signatory is whoever the supplier says signs, and is flagged to the reviewer when it is not the account's contact.
 */

import { createHash } from "node:crypto";

import type { DeclarationInput, DeclarationKind, DeclarationTextConfig, Draft, RegistrationContext, StepFault } from "./types";
import { isBlank } from "./types";

/// A stored text of a declaration, as the store reads it.
export interface StoredDeclarationText {
  id: string;
  kind: DeclarationKind;
  version: number;
  bodyEn: string;
  bodyMs: string | null;
  /// YYYY-MM-DD: the organisation's day it was issued and, once withdrawn, the day it stopped being the one in force.
  issuedOn: string;
  retiredOn: string | null;
}

/// The text in force for a kind on a day: issued on or before the day, not retired on or before it, and of those the highest version. Null while there is none (the step is closed and names
/// the text), and always null while the day is not known.
export function currentDeclarationText(texts: readonly StoredDeclarationText[], kind: DeclarationKind, today: string | null): DeclarationTextConfig | null {
  if (today == null) return null;
  const inForce = texts.filter((t) => t.kind === kind && t.issuedOn <= today && (t.retiredOn == null || t.retiredOn > today)).sort((a, b) => b.version - a.version)[0];
  return inForce ? { id: inForce.id, version: inForce.version, bodyEn: inForce.bodyEn, bodyMs: inForce.bodyMs } : null;
}

/// The placeholder a declaration's wording names the organisation by.
export const ORGANISATION_PLACEHOLDER = "{organisation}";

/// The wording with the organisation's name in it. Every placeholder is filled, so what is shown, signed and frozen is one text.
export function fillText(body: string, organisationName: string): string {
  return body.split(ORGANISATION_PLACEHOLDER).join(organisationName);
}

/// What a signature fixes: the wording in both languages as the supplier was shown it, and the SHA-256 of it. The Malay text is blank where the customer wrote none.
export function frozenWording(text: Pick<DeclarationTextConfig, "bodyEn" | "bodyMs">, organisationName: string): { en: string; ms: string; sha256: string } {
  const en = fillText(text.bodyEn, organisationName);
  const ms = text.bodyMs ? fillText(text.bodyMs, organisationName) : "";
  return { en, ms, sha256: createHash("sha256").update(`${en}\n---\n${ms}`, "utf8").digest("hex") };
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/// Step 4's part: the GIRO authorisation. Blocks Next while its text is unset, and until it is signed for by name and ticked.
export function giroFaults(draft: Pick<Draft, "signatoryName" | "signatoryDesignation" | "giroConfirmed">, ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "epayment", ...f });
  if (!ctx.texts.GIRO_AUTHORISATION) {
    add({ code: "TEXT_NOT_SET", level: "block", field: "giro", data: { kind: "GIRO_AUTHORISATION" } });
    return out;
  }
  if (isBlank(draft.signatoryName)) add({ code: "SIGNATORY_NAME_REQUIRED", level: "block", field: "giro.signatoryName" });
  if (isBlank(draft.signatoryDesignation)) add({ code: "SIGNATORY_DESIGNATION_REQUIRED", level: "block", field: "giro.signatoryDesignation" });
  if (!draft.giroConfirmed) add({ code: "NOT_CONFIRMED", level: "block", field: "giro.confirmed", data: { kind: "GIRO_AUTHORISATION" } });
  if (!isBlank(draft.signatoryName) && !sameName(draft.signatoryName, ctx.supplier.contactName)) add({ code: "SIGNATORY_DIFFERS", level: "warn", field: "giro.signatoryName" });
  return out;
}

/// Step 5's part: the notice the applicant reads, and the false-declaration text. Blocks Submit while either is unset.
export function reviewFaults(ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "review", ...f });
  if (isBlank(ctx.noticeEn)) add({ code: "NOTICE_NOT_SET", level: "block", field: "notice" });
  if (!ctx.texts.FALSE_DECLARATION) add({ code: "TEXT_NOT_SET", level: "block", field: "declaration", data: { kind: "FALSE_DECLARATION" } });
  return out;
}

/**
 * What the Submit request itself says: for each kind, the text it names must be the current one (a stale or forged id is refused), the signatory is named, and the tick is made.
 * The kinds must each be present exactly once. A kind with no current text is reported by `giroFaults` / `reviewFaults`, not here.
 */
export function declarationFaults(inputs: readonly DeclarationInput[], ctx: RegistrationContext): StepFault[] {
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
    if (i.textVersionId !== text.id) add({ code: "TEXT_STALE", level: "block", field, data: { kind } });
    if (isBlank(i.signatoryName)) add({ code: "SIGNATORY_NAME_REQUIRED", level: "block", field: `${field}.signatoryName` });
    if (isBlank(i.signatoryDesignation)) add({ code: "SIGNATORY_DESIGNATION_REQUIRED", level: "block", field: `${field}.signatoryDesignation` });
    if (!i.confirmed) add({ code: "NOT_CONFIRMED", level: "block", field: `${field}.confirmed`, data: { kind } });
  }
  return out;
}
