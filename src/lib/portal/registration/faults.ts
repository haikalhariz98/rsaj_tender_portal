/**
 * What stops a registration step, and what stops Submit (Phase 4b). Three questions, three functions, none of them the same:
 *
 * - `draftShapeFaults(section)`: may this be SAVED. Shape and length only. A saved draft never claims validity, so a half-finished, wrong or empty answer is saved as it is and judged later.
 * - `stepFaults(step, draft, ctx)`: may the supplier go NEXT from this step. The rules of the step.
 * - `registrationFaults(draft, ctx, declarations)`: may the registration be SENT. Every step's rules at once, and the declarations the request carries.
 *
 * A finding's level says what it does: `block` stops the step, `warn` is said and goes on, `info` is said only. Pure.
 */

import { isDay } from "@/lib/dates";

import { codeFaults } from "./codes";
import { creditorFaults } from "./creditor";
import { declarationFaults, giroFaults, reviewFaults } from "./declaration";
import { documentFaults } from "./documents";
import { CREDITOR_FIELDS, type CreditorInput, type DeclarationInput, type Draft, type RegistrationContext, type RegistrationStep, type StepFault } from "./types";

/// A section of the draft as the save request carries it: only the step that is being saved.
export type DraftSection =
  | { step: "documents"; documents: readonly { id: string; typeId: string; title: string; reference: string; issuingAuthority: string; expiresOn: string; notApplicable: boolean; ratePercent: string }[] }
  | { step: "codes"; documents: readonly { id: string; valueIds: readonly string[] }[] }
  | { step: "epayment"; creditor: Partial<CreditorInput>; signatoryName?: string; signatoryDesignation?: string; giroConfirmed?: boolean; /** The hash of the wording on the page when the box was ticked: required with a tick. */ giroTextSha256?: string }
  | { step: "review" };

/// Longest each text may be. Technical bounds on what a row holds, not policy.
export const LIMITS = {
  title: 120,
  reference: 120,
  issuingAuthority: 160,
  signatoryName: 160,
  signatoryDesignation: 120,
  name: 240,
  address: 1000,
  short: 160,
  rows: 200,
  valuesPerDocument: 200,
} as const;

const CREDITOR_LIMIT: Readonly<Record<keyof CreditorInput, number>> = {
  beneficiaryName: LIMITS.name,
  beneficiaryAddress: LIMITS.address,
  beneficiaryIdentityNo: LIMITS.short,
  beneficiaryContactPerson: LIMITS.name,
  beneficiaryTelephone: LIMITS.short,
  beneficiaryFax: LIMITS.short,
  beneficiaryTaxRegistrationNo: LIMITS.short,
  beneficiaryEmail: LIMITS.name,
  bankCode: LIMITS.short,
  bankAccountNo: LIMITS.short,
  bankAccountTypeCode: LIMITS.short,
  bankSwiftCode: LIMITS.short,
  bankAddress: LIMITS.address,
};

/// The shape of a section, for a save. Nothing about what is right: only what could not be stored (too long, not a day, not a number).
export function draftShapeFaults(section: DraftSection): StepFault[] {
  const out: StepFault[] = [];
  const long = (step: RegistrationStep, field: string, text: string | undefined, max: number) => {
    if (text != null && Array.from(text).length > max) out.push({ step, code: "TOO_LONG", level: "block", field, data: { max } });
  };
  if (section.step === "documents") {
    if (section.documents.length > LIMITS.rows) out.push({ step: "documents", code: "TOO_LONG", level: "block", data: { max: LIMITS.rows } });
    for (const d of section.documents) {
      const at = (n: string) => `documents.${d.id}.${n}`;
      long("documents", at("title"), d.title, LIMITS.title);
      long("documents", at("reference"), d.reference, LIMITS.reference);
      long("documents", at("issuingAuthority"), d.issuingAuthority, LIMITS.issuingAuthority);
      if (d.expiresOn.trim() !== "" && !isDay(d.expiresOn.trim())) out.push({ step: "documents", code: "NOT_A_DAY", level: "block", field: at("expiresOn") });
      if (d.ratePercent.trim() !== "" && !/^\d{1,3}(\.\d{1,2})?$/.test(d.ratePercent.trim())) out.push({ step: "documents", code: "NOT_A_NUMBER", level: "block", field: at("ratePercent") });
    }
  } else if (section.step === "codes") {
    for (const d of section.documents) {
      if (d.valueIds.length > LIMITS.valuesPerDocument) out.push({ step: "codes", code: "TOO_LONG", level: "block", field: `documents.${d.id}.values`, data: { max: LIMITS.valuesPerDocument } });
    }
  } else if (section.step === "epayment") {
    for (const k of CREDITOR_FIELDS) long("epayment", `creditor.${k}`, section.creditor[k], CREDITOR_LIMIT[k]);
    long("epayment", "giro.signatoryName", section.signatoryName, LIMITS.signatoryName);
    long("epayment", "giro.signatoryDesignation", section.signatoryDesignation, LIMITS.signatoryDesignation);
  }
  return out;
}

/// The rules of one step, for Next. The company step is the record as accepted: nothing to judge.
export function stepFaults(step: RegistrationStep, draft: Draft, ctx: RegistrationContext): StepFault[] {
  switch (step) {
    case "company":
      return [];
    case "documents":
      return documentFaults(draft.documents, ctx);
    case "codes":
      return codeFaults(draft.documents, ctx);
    case "epayment":
      return [...creditorFaults(draft.creditor, draft.statementCount, ctx), ...giroFaults(draft, ctx)];
    case "review":
      return reviewFaults(ctx);
  }
}

/**
 * Every rule, for Submit. `declarations` is what the Submit request carries (the two texts' ids, the signatory and the ticks); where it is not given the request's own parts are not judged
 * (the page asks this to say what stands in the way before the supplier has ticked anything).
 */
export function registrationFaults(draft: Draft, ctx: RegistrationContext, declarations?: readonly DeclarationInput[]): StepFault[] {
  return [
    ...stepFaults("documents", draft, ctx),
    ...stepFaults("codes", draft, ctx),
    ...stepFaults("epayment", draft, ctx),
    ...stepFaults("review", draft, ctx),
    ...(declarations ? declarationFaults(declarations, ctx) : []),
  ];
}

export const blockingFaults = (fs: readonly StepFault[]): StepFault[] => fs.filter((f) => f.level === "block");

/// The step a supplier is sent back to: the first with something blocking, or null.
export function firstBlockedStep(fs: readonly StepFault[]): RegistrationStep | null {
  for (const s of ["documents", "codes", "epayment", "review"] as const) if (fs.some((f) => f.step === s && f.level === "block")) return s;
  return null;
}
