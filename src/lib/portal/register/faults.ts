/**
 * Every rule of the one-submission registration, over the whole body at once (ADR 0041 D1, REG-1, plan section 2.2). The server's answer at Submit, and the browser's at each Next: the
 * same functions on the same input. Each finding says its step and field, so a refusal lands beside what the applicant typed. Nothing here restates a rule: step 1 is the public form's
 * own (`portalApplicationFaults`), steps 2 to 5 are the signed-in wizard's (`registrationFaults`, the terms through `termsFaults`). Pure, and safe for the browser.
 */

import { APPLICATION_LIMITS, PORTAL_FIELD_OF, portalApplicationFaults, type PortalApplicationContext, type PortalApplicationInput, type PortalFault } from "@/lib/portal/apply";
import { APPLY, type Words } from "@/lib/portal/labels";
import { draftShapeFaults, registrationFaults } from "@/lib/portal/registration/faults";
import type { Draft, RegistrationContext, StepFault } from "@/lib/portal/registration/types";
import { registrationFaultText } from "@/lib/portal/registration/words";
import type { Finding } from "@/lib/suppliers/types";

import type { FaultView, PublicApplicationBody } from "./contract";
import { heldDeclarations } from "./held-draft";

/// A finding on step 1, the company: the public form's own codes, or a text past its length.
export type CompanyFault = Finding<PortalFault | "TOO_LONG"> & { step: "company"; field?: string };
/// A finding of the one submission: step 1's, or steps 2 to 5's.
export type PublicFault = StepFault | CompanyFault;

/// Step 1's fields as the public form's rule reads them. Codes left blank are not chosen.
export function portalInputOf(company: PublicApplicationBody["company"]): PortalApplicationInput {
  const code = (s: string | null) => (s == null || s.trim() === "" ? null : s.trim());
  return {
    registeredName: company.registeredName,
    registrationNo: company.registrationNo,
    entityTypeCode: code(company.entityTypeCode),
    countryCode: code(company.countryCode),
    companyEmail: company.companyEmail,
    address: { ...company.address, stateCode: code(company.address.stateCode) },
    bumiputeraClaimCode: code(company.bumiputeraClaimCode),
    incorporatedOn: company.incorporatedOn.trim() === "" ? null : company.incorporatedOn.trim(),
    contact: company.contact,
  };
}

/// Step 1: a text past the public form's own length (`APPLICATION_LIMITS`), then the form's rules, each placed on its field (`PORTAL_FIELD_OF`).
export function companyFaults(company: PublicApplicationBody["company"], step1: PortalApplicationContext): CompanyFault[] {
  const out: CompanyFault[] = [];
  const long = (field: keyof typeof APPLICATION_LIMITS, text: string) => {
    const max = APPLICATION_LIMITS[field];
    if (Array.from(text).length > max) out.push({ step: "company", code: "TOO_LONG", level: "block", field, data: { max } });
  };
  long("registeredName", company.registeredName);
  long("registrationNo", company.registrationNo);
  long("companyEmail", company.companyEmail);
  long("incorporatedOn", company.incorporatedOn);
  long("addressLine1", company.address.addressLine1);
  long("addressLine2", company.address.addressLine2);
  long("city", company.address.city);
  long("postcode", company.address.postcode);
  long("contactName", company.contact.name);
  long("contactDesignation", company.contact.designation);
  long("contactEmail", company.contact.email);
  long("contactPhone", company.contact.phone);
  for (const f of portalApplicationFaults(portalInputOf(company), step1)) out.push({ ...f, step: "company", ...(PORTAL_FIELD_OF[f.code] ? { field: PORTAL_FIELD_OF[f.code] } : {}) });
  return out;
}

/// Steps 2 and 4: what could not be stored as it stands (too long, not a day, not a number), as the wizard's save judges it.
export function heldShapeFaults(body: PublicApplicationBody): StepFault[] {
  return [
    ...draftShapeFaults({ step: "documents", documents: body.documents.map((d) => ({ id: d.clientKey, typeId: d.typeId, title: d.title, reference: d.reference, issuingAuthority: d.issuingAuthority, expiresOn: d.expiresOn, notApplicable: d.notApplicable, ratePercent: d.ratePercent })) }),
    ...draftShapeFaults({ step: "codes", documents: body.documents.map((d) => ({ id: d.clientKey, valueIds: d.valueIds })) }),
    ...draftShapeFaults({ step: "epayment", creditor: body.creditor, signatoryName: body.signatory.name, signatoryDesignation: body.signatory.designation }),
  ];
}

/**
 * Every step at once: step 1's rules, then what could not be stored, then every rule of steps 2 to 5 on the body read as a draft (`heldDraft`), the agreements included and the terms
 * judged against the notice the page showed. `step1` and `ctx` are the organisation's configuration; `ctx.supplier` is what the applicant gave as its number and contact.
 */
export function publicApplicationFaults(body: PublicApplicationBody, held: Draft, ctx: RegistrationContext, step1: PortalApplicationContext): PublicFault[] {
  return [...companyFaults(body.company, step1), ...heldShapeFaults(body), ...registrationFaults(held, ctx, heldDeclarations(body), body.noticeSha256)];
}

export const blockingPublicFaults = (fs: readonly PublicFault[]): PublicFault[] => fs.filter((f) => f.level === "block");

const FIELD_LABEL: Readonly<Record<string, Words>> = APPLY.fields;

/// One finding in words: step 1's from the public form's own wording, the rest from the registration's. Null where a finding that does not block has nothing to say.
function wordsOf(f: PublicFault): string | null {
  if (f.step === "company") {
    const c = f as CompanyFault;
    if (c.code === "TOO_LONG") {
      const label = c.field ? FIELD_LABEL[c.field] : undefined;
      return label ? APPLY.tooLong(label.en, Number(c.data?.max ?? 0)).en : registrationFaultText({ code: "TOO_LONG", data: c.data }).en;
    }
    const words = (APPLY.faults as Partial<Record<string, Words>>)[c.code];
    if (words) return words.en;
    return c.level === "block" ? APPLY.cantAccept.en : null;
  }
  // Review SHOULD 3: on this path a reload loses everything held, so a changed wording is never answered with "reload"; the page swaps the wording in and the tick is asked again.
  if (f.code === "TEXT_STALE") return APPLY.textChanged.en;
  return registrationFaultText(f as StepFault).en;
}

/// The findings as the browser and the route say them: words and the field they belong to, never a code.
export function publicFaultViews(fs: readonly PublicFault[]): FaultView[] {
  const out: FaultView[] = [];
  for (const f of fs) {
    const message = wordsOf(f);
    if (message != null) out.push({ step: f.step, field: f.field ?? null, level: f.level, message });
  }
  return out;
}

/// The step an applicant is sent back to: the first, in the stepper's order, with something blocking. Null: nothing blocks.
export function firstPublicBlockedStep(fs: readonly PublicFault[]): PublicFault["step"] | null {
  for (const s of ["company", "documents", "codes", "epayment", "review"] as const) if (fs.some((f) => f.step === s && f.level === "block")) return s;
  return null;
}
