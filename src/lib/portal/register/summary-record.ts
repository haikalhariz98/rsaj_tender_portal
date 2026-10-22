/**
 * The one projection the applicant reviews on step 5 and the officer reads on the online application's page (ADR 0041, plan section 2.2): both build a `SummaryRecord` and render it with
 * `registrationSummary`, so the two cannot disagree about what was sent. Pure, and safe for the browser: every name is resolved by the caller (lists, codes, files), and the SULIT parts
 * arrive already decided for the reader (`Sulit<T>`).
 */

import { APPLICANT_WORDS } from "@/lib/audit/actor";
import type { Sulit } from "@/lib/auth/sulit-access";
import { matchesFormat } from "@/lib/integration/award-commitment";
import { identityDiffers } from "@/lib/portal/registration/creditor";
import { parseRate } from "@/lib/portal/registration/documents";
import type { SummaryCreditor, SummaryDeclaration, SummaryDocument, SummaryRecord } from "@/lib/portal/registration/summary";
import type { CreditorInput, DeclarationKind, DocumentTypeConfig, ListEntry } from "@/lib/portal/registration/types";
import { valueLabel } from "@/lib/portal/registration/values";
import { bumiputeraReading } from "@/lib/suppliers/bumiputera";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";
import { composeAddress } from "@/lib/suppliers/step-one";
import type { VerificationState } from "@/lib/suppliers/types";

import type { PublicApplicationBody } from "./contract";

/// The lists the applicant chose from, by code, so a code is shown by its name.
export interface SummaryLists {
  entityTypes: readonly ListEntry[];
  countries: readonly ListEntry[];
  states: readonly ListEntry[];
  bumiputeraStatuses: readonly ListEntry[];
  banks: readonly ListEntry[];
  accountTypes: readonly ListEntry[];
  /// The configured form of a registration number. Null: none set, not checked.
  formatPattern: string | null;
  /// Whether the organisation has said which document evidences a Bumiputera claim.
  bumiputeraEvidenceSet: boolean;
}

const nameIn = (list: readonly ListEntry[], code: string | null | undefined): string | null => (code ? (list.find((l) => l.code === code)?.nameEn ?? null) : null);
const own = <T>(value: T): Sulit<T> => ({ state: "GRANTED", value, basis: "OWN_RECORD" });
const NOT_SCANNED = "Not scanned";

/// What the browser holds on step 5: the body, the names of the files held for each row and for the statement, and the codes chosen, by id, with the names they had when chosen.
export interface HeldSummaryState {
  body: PublicApplicationBody;
  files: ReadonlyMap<string, readonly string[]>;
  statementFiles: readonly string[];
  chosen: ReadonlyMap<string, { code: string; name: string }>;
}

export interface HeldSummaryConfig extends SummaryLists {
  types: readonly DocumentTypeConfig[];
}

function company(c: { registeredName: string; registrationNo: string; entityTypeCode: string; countryCode: string; incorporatedOn: string; bumiputeraClaimCode: string | null; companyEmail: string; addressLine1: string; addressLine2: string; city: string; postcode: string; stateCode: string | null }, lists: SummaryLists): SummaryRecord["company"] {
  const claim = c.bumiputeraClaimCode ? (nameIn(lists.bumiputeraStatuses, c.bumiputeraClaimCode) ?? "A status no longer listed") : null;
  return {
    registeredName: c.registeredName,
    registrationNo: c.registrationNo,
    formatChecked: matchesFormat(c.registrationNo, lists.formatPattern),
    entityTypeName: nameIn(lists.entityTypes, c.entityTypeCode),
    countryName: nameIn(lists.countries, c.countryCode),
    addressLines: composeAddress({ addressLine1: c.addressLine1, addressLine2: c.addressLine2, city: c.city, postcode: c.postcode }, nameIn(lists.states, c.stateCode)).split("\n"),
    incorporatedOn: c.incorporatedOn.trim() || null,
    companyEmail: c.companyEmail,
    // At the application stage a claim is declared only: nothing has been checked against it.
    bumiputera: bumiputeraReading(claim, lists.bumiputeraEvidenceSet, null, "APPLICATION"),
  };
}

function creditorOf(c: CreditorInput, lists: SummaryLists, statementFiles: readonly string[], registrationNo: string, verification: SummaryCreditor["verification"]): SummaryCreditor {
  return {
    ...c,
    bankName: nameIn(lists.banks, c.bankCode) ?? "",
    accountTypeName: nameIn(lists.accountTypes, c.bankAccountTypeCode) ?? "",
    statementFiles: [...statementFiles],
    identityDiffersFromCompany: identityDiffers(c.beneficiaryIdentityNo, normaliseRegistrationNo(registrationNo)),
    verification,
  };
}

/// The applicant's own review, before anything is sent: nothing is verified, nobody has lodged anything, and nothing has been agreed yet (the agreements are made at Submit).
export function summaryRecordOfHeld(state: HeldSummaryState, config: HeldSummaryConfig): SummaryRecord {
  const b = state.body;
  return {
    company: company({ ...b.company, ...b.company.address }, config),
    contacts: own([{ name: b.company.contact.name, designation: b.company.contact.designation, email: b.company.contact.email, phone: b.company.contact.phone, primary: true }]),
    documents: b.documents.map((d): SummaryDocument => {
      const type = config.types.find((t) => t.id === d.typeId);
      return {
        id: d.clientKey,
        typeName: type?.nameEn ?? "A document no longer asked for",
        hint: type?.hintEn ?? null,
        title: d.title,
        reference: d.reference,
        issuingAuthority: d.issuingAuthority,
        expiresOn: d.notApplicable ? null : d.expiresOn.trim() || null,
        notApplicable: d.notApplicable,
        ratePercent: d.ratePercent.trim() ? parseRate(d.ratePercent) : null,
        files: (state.files.get(d.clientKey) ?? []).map((name) => ({ name, scanLabel: NOT_SCANNED })),
        verification: null,
        lodgedBy: null,
        lodgedByOfficer: false,
        codes: d.valueIds.map((id) => {
          const v = state.chosen.get(id);
          return v ? valueLabel({ code: v.code, nameEn: v.name }) : "A code no longer listed";
        }),
      };
    }),
    creditor: own(creditorOf(b.creditor, config, state.statementFiles, b.company.registrationNo, null)),
    declarations: [],
    agreedOnline: true,
  };
}

/// An online application as the office holds it (ADR 0041 D2): the rows read by the staff page, every name resolved.
export interface PortalSummaryRows {
  company: Parameters<typeof company>[0];
  contact: { name: string; designation: string; email: string; phone: string };
  documents: readonly {
    id: string;
    typeLabelSnapshot: string;
    hint: string | null;
    title: string;
    reference: string;
    issuingAuthority: string;
    expiresOn: string | null;
    notApplicable: boolean;
    ratePercent: string | null;
    files: readonly { name: string; scanLabel: string }[];
    verification: { state: VerificationState; by: string | null; on: string | null; note: string };
    codes: readonly { code: string; label: string }[];
  }[];
  /// The bank details as sent, or null where the application holds none (erased once it was set aside).
  creditor: { values: CreditorInput; statementFiles: readonly string[]; verification: { state: VerificationState; by: string | null; on: string | null; note: string } } | null;
  agreements: readonly { kind: DeclarationKind; textVersion: number; signatoryName: string; signatoryDesignation: string; signedAt: string }[];
}

/// What the reader may see of the SULIT parts, decided by the caller for this reader (`creditorDecision`, the supplier rule): a withheld part carries its words and no value.
export interface PortalSummarySulit {
  contacts: (value: SummaryRecord["contacts"] extends Sulit<infer T> ? T : never) => SummaryRecord["contacts"];
  creditor: (value: SummaryCreditor | null) => SummaryRecord["creditor"];
}

/// The officer's page: the same projection, with each document's check, and the agreements as the applicant made them, not signed in.
export function summaryRecordOfPortal(rows: PortalSummaryRows, lists: SummaryLists, sulit: PortalSummarySulit): SummaryRecord {
  return {
    company: company(rows.company, lists),
    contacts: sulit.contacts([{ ...rows.contact, primary: true }]),
    documents: rows.documents.map((d) => ({
      id: d.id,
      typeName: d.typeLabelSnapshot,
      hint: d.hint,
      title: d.title,
      reference: d.reference,
      issuingAuthority: d.issuingAuthority,
      expiresOn: d.expiresOn,
      notApplicable: d.notApplicable,
      ratePercent: d.ratePercent,
      files: [...d.files],
      verification: d.verification,
      lodgedBy: APPLICANT_WORDS,
      lodgedByOfficer: false,
      codes: d.codes.map((v) => valueLabel({ code: v.code, nameEn: v.label })),
    })),
    creditor: sulit.creditor(rows.creditor ? creditorOf(rows.creditor.values, lists, rows.creditor.statementFiles, rows.company.registrationNo, rows.creditor.verification) : null),
    declarations: rows.agreements.map((a): SummaryDeclaration => ({ kind: a.kind, textVersion: a.textVersion, signatoryName: a.signatoryName, signatoryDesignation: a.signatoryDesignation, signedAt: a.signedAt, by: APPLICANT_WORDS, signatoryIsNotContact: false, agreedNotSignedIn: true })),
    agreedOnline: true,
  };
}
