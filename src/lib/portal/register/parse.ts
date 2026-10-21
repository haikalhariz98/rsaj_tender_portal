/**
 * The public form's one body, read strictly (ADR 0041, plan section 2.2), in the style of the signed-in wizard's `api.ts`: a field of the wrong type, a key that is not the shape's, a list
 * past its bound, a text past its hard bound, a bad row key or a repeated one is a refusal, never a guess. What is RIGHT is not judged here: the rules do that, by step and field
 * (`faults.ts`). Pure, and safe for the browser.
 *
 * Each text's hard bound is twice the length the rules allow (as `parseSubmitBody` bounds the signatory), so an over-long field reaches the rules and is named beside its field, while
 * the whole body stays inside the ceiling the route enforces (`ceiling.ts` is computed from these bounds).
 */

import { APPLICATION_LIMITS } from "@/lib/portal/apply";
import type { Parsed } from "@/lib/portal/registration/api";
import { CREDITOR_LIMIT, LIMITS } from "@/lib/portal/registration/faults";
import { CREDITOR_FIELDS, type CreditorInput } from "@/lib/portal/registration/types";

import type { AgreementKind, PublicApplicationBody } from "./contract";

/// A row key the browser made for a document it holds: "new:" and up to 40 safe characters.
export const CLIENT_KEY = /^new:[A-Za-z0-9_-]{1,40}$/;
/// A row the server issued (a cuid), named by the body: a document type, a registration value, a text.
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const AGREEMENT_KINDS: readonly AgreementKind[] = ["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"];

/// How far past the rules' own length a text may be and still be read (and then named as too long).
export const HARD_BOUND_FACTOR = 2;

/// The longest a list code may be (entity type, country, state, Bumiputera claim, bank, account type). A technical bound, not policy.
export const CODE_BOUND = 64;

/// Every text of the body, by its path, and the most code points it may hold to be read at all. The ceiling is computed from this.
export const COMPANY_BOUNDS = {
  registeredName: APPLICATION_LIMITS.registeredName * HARD_BOUND_FACTOR,
  registrationNo: APPLICATION_LIMITS.registrationNo * HARD_BOUND_FACTOR,
  entityTypeCode: CODE_BOUND,
  countryCode: CODE_BOUND,
  incorporatedOn: APPLICATION_LIMITS.incorporatedOn * HARD_BOUND_FACTOR,
  bumiputeraClaimCode: CODE_BOUND,
  companyEmail: APPLICATION_LIMITS.companyEmail * HARD_BOUND_FACTOR,
} as const;
export const ADDRESS_BOUNDS = {
  addressLine1: APPLICATION_LIMITS.addressLine1 * HARD_BOUND_FACTOR,
  addressLine2: APPLICATION_LIMITS.addressLine2 * HARD_BOUND_FACTOR,
  city: APPLICATION_LIMITS.city * HARD_BOUND_FACTOR,
  postcode: APPLICATION_LIMITS.postcode * HARD_BOUND_FACTOR,
  stateCode: CODE_BOUND,
} as const;
export const CONTACT_BOUNDS = {
  name: APPLICATION_LIMITS.contactName * HARD_BOUND_FACTOR,
  designation: APPLICATION_LIMITS.contactDesignation * HARD_BOUND_FACTOR,
  email: APPLICATION_LIMITS.contactEmail * HARD_BOUND_FACTOR,
  phone: APPLICATION_LIMITS.contactPhone * HARD_BOUND_FACTOR,
} as const;
export const DOCUMENT_BOUNDS = {
  clientKey: 44,
  typeId: 40,
  title: LIMITS.title * HARD_BOUND_FACTOR,
  reference: LIMITS.reference * HARD_BOUND_FACTOR,
  issuingAuthority: LIMITS.issuingAuthority * HARD_BOUND_FACTOR,
  expiresOn: 10 * HARD_BOUND_FACTOR,
  ratePercent: 10,
  valueId: 40,
} as const;
export const SIGNATORY_BOUNDS = { name: LIMITS.signatoryName * HARD_BOUND_FACTOR, designation: LIMITS.signatoryDesignation * HARD_BOUND_FACTOR } as const;
export const CREDITOR_BOUNDS: Readonly<Record<keyof CreditorInput, number>> = Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, CREDITOR_LIMIT[k] * HARD_BOUND_FACTOR])) as Record<keyof CreditorInput, number>;
export const AGREEMENT_BOUNDS = { textVersionId: 60, textSha256: 64 } as const;
/// The lists: the documents (the wizard's own row bound), the codes on each, and one agreement of each kind.
export const LIST_BOUNDS = { documents: LIMITS.rows, valuesPerDocument: LIMITS.valuesPerDocument, agreements: AGREEMENT_KINDS.length } as const;

const bad = <T>(message: string): Parsed<T> => ({ ok: false, message });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const length = (s: string) => Array.from(s).length;

/// Only these keys, every one of them present (a nullable one may be null).
function exactKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && own.every((k) => keys.includes(k)) && keys.every((k) => k in o);
}

/// The texts of one record, each a string within its bound. Null where one is not.
function texts<K extends string>(o: Record<string, unknown>, bounds: Readonly<Record<K, number>>, nullable: readonly NoInfer<K>[] = []): Record<K, string | null> | null {
  const out = {} as Record<K, string | null>;
  for (const k of Object.keys(bounds) as K[]) {
    const v = o[k];
    if (v === null && nullable.includes(k)) {
      out[k] = null;
      continue;
    }
    if (typeof v !== "string" || length(v) > bounds[k]) return null;
    out[k] = v;
  }
  return out;
}

export function parsePublicApplication(json: unknown): Parsed<PublicApplicationBody> {
  if (!isObject(json) || !exactKeys(json, ["company", "documents", "creditor", "signatory", "agreements", "noticeSha256"])) return bad("The application is not in the form expected.");

  // ---- the company (step 1)
  const c = json.company;
  if (!isObject(c) || !exactKeys(c, [...Object.keys(COMPANY_BOUNDS), "address", "contact"])) return bad("The company details are not in the form expected.");
  const company = texts(c, COMPANY_BOUNDS, ["bumiputeraClaimCode"]);
  if (!company) return bad("A company detail is not text, or is far too long.");
  const a = c.address;
  if (!isObject(a) || !exactKeys(a, Object.keys(ADDRESS_BOUNDS))) return bad("The address is not in the form expected.");
  const address = texts(a, ADDRESS_BOUNDS, ["stateCode"]);
  if (!address) return bad("An address line is not text, or is far too long.");
  const p = c.contact;
  if (!isObject(p) || !exactKeys(p, Object.keys(CONTACT_BOUNDS))) return bad("The contact is not in the form expected.");
  const contact = texts(p, CONTACT_BOUNDS);
  if (!contact) return bad("A contact detail is not text, or is far too long.");

  // ---- the documents and their codes (steps 2 and 3)
  const rows = json.documents;
  if (!Array.isArray(rows) || rows.length > LIST_BOUNDS.documents) return bad("The documents are not a list, or there are too many.");
  const documents: PublicApplicationBody["documents"] = [];
  for (const r of rows) {
    if (!isObject(r) || !exactKeys(r, ["clientKey", "typeId", "title", "reference", "issuingAuthority", "expiresOn", "notApplicable", "ratePercent", "valueIds"])) return bad("A document is not in the form expected.");
    const t = texts(r, { clientKey: DOCUMENT_BOUNDS.clientKey, typeId: DOCUMENT_BOUNDS.typeId, title: DOCUMENT_BOUNDS.title, reference: DOCUMENT_BOUNDS.reference, issuingAuthority: DOCUMENT_BOUNDS.issuingAuthority, expiresOn: DOCUMENT_BOUNDS.expiresOn, ratePercent: DOCUMENT_BOUNDS.ratePercent });
    if (!t || !CLIENT_KEY.test(t.clientKey!) || !ID.test(t.typeId!)) return bad("A document does not say which it is.");
    if (typeof r.notApplicable !== "boolean") return bad("A document does not say whether it applies.");
    const ids = r.valueIds;
    if (!Array.isArray(ids) || ids.length > LIST_BOUNDS.valuesPerDocument || !ids.every((x) => typeof x === "string" && ID.test(x))) return bad("The codes of a document are not a list.");
    if (new Set(ids).size !== ids.length) return bad("A code is chosen twice on one document.");
    documents.push({ clientKey: t.clientKey!, typeId: t.typeId!, title: t.title!, reference: t.reference!, issuingAuthority: t.issuingAuthority!, expiresOn: t.expiresOn!, notApplicable: r.notApplicable, ratePercent: t.ratePercent!, valueIds: ids as string[] });
  }
  if (new Set(documents.map((d) => d.clientKey)).size !== documents.length) return bad("A document is listed twice.");

  // ---- the bank details and the signatory (step 4)
  const k = json.creditor;
  if (!isObject(k) || !exactKeys(k, CREDITOR_FIELDS)) return bad("The bank details are not in the form expected.");
  const creditor = texts(k, CREDITOR_BOUNDS);
  if (!creditor) return bad("A bank detail is not text, or is far too long.");
  const s = json.signatory;
  if (!isObject(s) || !exactKeys(s, ["name", "designation"])) return bad("The signatory is not in the form expected.");
  const signatory = texts(s, SIGNATORY_BOUNDS);
  if (!signatory) return bad("The signatory is not text, or is far too long.");

  // ---- the agreements (steps 4 and 5)
  const g = json.agreements;
  if (!Array.isArray(g) || g.length > LIST_BOUNDS.agreements) return bad("The agreements are not a list.");
  const agreements: PublicApplicationBody["agreements"] = [];
  for (const x of g) {
    if (!isObject(x) || !exactKeys(x, ["kind", "textVersionId", "textSha256", "confirmed"])) return bad("An agreement is not in the form expected.");
    if (typeof x.kind !== "string" || !(AGREEMENT_KINDS as readonly string[]).includes(x.kind)) return bad("An agreement does not say which it is.");
    if (typeof x.textVersionId !== "string" || length(x.textVersionId) > AGREEMENT_BOUNDS.textVersionId || typeof x.textSha256 !== "string" || !SHA256.test(x.textSha256)) return bad("An agreement does not name its wording properly.");
    if (typeof x.confirmed !== "boolean") return bad("An agreement does not say whether it was ticked.");
    agreements.push({ kind: x.kind as AgreementKind, textVersionId: x.textVersionId, textSha256: x.textSha256, confirmed: x.confirmed });
  }
  if (new Set(agreements.map((x) => x.kind)).size !== agreements.length) return bad("An agreement is listed twice.");

  // ---- the notice the terms were agreed with: its hash, or blank where none was shown (refused by the rules as stale)
  if (typeof json.noticeSha256 !== "string" || (json.noticeSha256 !== "" && !SHA256.test(json.noticeSha256))) return bad("The notice the agreement was made on is not named properly.");

  return {
    ok: true,
    value: {
      company: {
        registeredName: company.registeredName!,
        registrationNo: company.registrationNo!,
        entityTypeCode: company.entityTypeCode!,
        countryCode: company.countryCode!,
        incorporatedOn: company.incorporatedOn!,
        bumiputeraClaimCode: company.bumiputeraClaimCode,
        companyEmail: company.companyEmail!,
        address: { addressLine1: address.addressLine1!, addressLine2: address.addressLine2!, city: address.city!, postcode: address.postcode!, stateCode: address.stateCode },
        contact: { name: contact.name!, designation: contact.designation!, email: contact.email!, phone: contact.phone! },
      },
      documents,
      creditor: creditor as unknown as CreditorInput,
      signatory: { name: signatory.name!, designation: signatory.designation! },
      agreements,
      noticeSha256: json.noticeSha256,
    },
  };
}
