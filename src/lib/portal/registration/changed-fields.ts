/**
 * Which findings a change answers (both registration wizards: the public form, ADR 0041, and the signed-in one). A finding names its field; once the applicant changes that field, the
 * finding is about what they typed before, so it goes, beside the field and in the step's summary alike. The rules run again at the next Next (or Submit): a change is not a check, so
 * nothing is added here, and a finding with no field stays until then. Pure, and safe for the browser.
 */

import { TERMS_FIELD } from "./declaration";
import type { CreditorInput } from "./types";

/// The findings that are not about any of these fields.
export function withoutFaultsAt<F extends { field: string | null }>(faults: readonly F[], fields: Iterable<string>): F[] {
  const gone = new Set(fields);
  if (gone.size === 0) return faults as F[];
  const kept = faults.filter((f) => f.field == null || !gone.has(f.field));
  return kept.length === faults.length ? (faults as F[]) : kept;
}

// ---- step 1 -----------------------------------------------------------------------

interface CompanyLike {
  registeredName: string;
  registrationNo: string;
  entityTypeCode: string;
  countryCode: string;
  incorporatedOn: string;
  bumiputeraClaimCode: string | null;
  companyEmail: string;
  address: { addressLine1: string; addressLine2: string; city: string; postcode: string; stateCode: string | null };
  contact: { name: string; designation: string; email: string; phone: string };
}

const COMPANY_KEYS = ["registeredName", "registrationNo", "entityTypeCode", "countryCode", "incorporatedOn", "bumiputeraClaimCode", "companyEmail"] as const;
const ADDRESS_KEYS = ["addressLine1", "addressLine2", "city", "postcode", "stateCode"] as const;
/// The contact's parts, by the field their findings name (`PORTAL_FIELD_OF`, `APPLICATION_LIMITS`). An email and a mobile number answer one rule together ("an email or a telephone
/// number"), whose finding sits on the email: a change to either answers both.
const CONTACT_FIELDS: Record<keyof CompanyLike["contact"], readonly string[]> = { name: ["contactName"], designation: ["contactDesignation"], email: ["contactEmail", "contactPhone"], phone: ["contactEmail", "contactPhone"] };

export function companyChangedFields(was: CompanyLike, now: CompanyLike): string[] {
  const out: string[] = [];
  for (const k of COMPANY_KEYS) if (was[k] !== now[k]) out.push(k);
  for (const k of ADDRESS_KEYS) if (was.address[k] !== now.address[k]) out.push(k);
  for (const k of Object.keys(CONTACT_FIELDS) as (keyof CompanyLike["contact"])[]) if (was.contact[k] !== now.contact[k]) out.push(...CONTACT_FIELDS[k]);
  return [...new Set(out)];
}

// ---- step 2 -----------------------------------------------------------------------

interface RowLike {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  expiresOn: string;
  ratePercent: string;
  notApplicable: boolean;
}

const ROW_KEYS = ["title", "reference", "issuingAuthority", "expiresOn", "ratePercent", "notApplicable"] as const;

/// A row's own fields that changed; a row added or taken away; and, for any of those, the kind it is of (a kind's "required" finding is answered by a row of it).
export function documentsChangedFields(was: readonly RowLike[], now: readonly RowLike[]): string[] {
  const out = new Set<string>();
  const before = new Map(was.map((r) => [r.id, r]));
  const after = new Map(now.map((r) => [r.id, r]));
  const touch = (r: RowLike) => {
    out.add(`documents.${r.id}`);
    out.add(`type.${r.typeId}`);
  };
  for (const r of now) {
    const b = before.get(r.id);
    if (!b) {
      touch(r);
      continue;
    }
    let changed = b.typeId !== r.typeId;
    for (const k of ROW_KEYS) {
      if (b[k] !== r[k]) {
        out.add(`documents.${r.id}.${k}`);
        changed = true;
      }
    }
    // Marked "does not apply", or no longer: whether it needs a file changes too.
    if (b.notApplicable !== r.notApplicable) out.add(`documents.${r.id}.file`);
    if (changed) {
      touch(r);
      if (b.typeId !== r.typeId) out.add(`type.${b.typeId}`);
    }
  }
  for (const r of was) if (!after.has(r.id)) touch(r);
  return [...out];
}

/// A file held or taken away on a row: its own "file" finding, and its kind's.
export const fileChangedFields = (rowId: string, typeId: string | null): string[] => [`documents.${rowId}.file`, ...(typeId ? [`type.${typeId}`] : [])];

// ---- step 3 -----------------------------------------------------------------------

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set([...a, ...b]).size === new Set(a).size;

/// The rows whose chosen codes changed, by any kind.
export function codesChangedFields(was: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>, now: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>): string[] {
  const out: string[] = [];
  for (const id of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const a = Object.values(was[id] ?? {}).flat();
    const b = Object.values(now[id] ?? {}).flat();
    if (!sameSet(a, b)) out.push(`documents.${id}.values`);
  }
  return out;
}

// ---- step 4 -----------------------------------------------------------------------

interface EpaymentLike {
  creditor: CreditorInput;
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
}

export function epaymentChangedFields(was: EpaymentLike, now: EpaymentLike): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(was.creditor), ...Object.keys(now.creditor)]) as Set<keyof CreditorInput>) if (was.creditor[k] !== now.creditor[k]) out.push(`creditor.${k}`);
  if (was.signatoryName !== now.signatoryName) out.push("giro.signatoryName");
  if (was.signatoryDesignation !== now.signatoryDesignation) out.push("giro.signatoryDesignation");
  if (was.giroConfirmed !== now.giroConfirmed) out.push("giro.confirmed");
  return out;
}

/// A statement held or taken away.
export const STATEMENT_FIELDS: readonly string[] = ["creditor.statement"];

// ---- step 5 -----------------------------------------------------------------------

export const DECLARATION_FIELDS: readonly string[] = ["declaration.confirmed"];
export const TERMS_FIELDS: readonly string[] = [TERMS_FIELD];
