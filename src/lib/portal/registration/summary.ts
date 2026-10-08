/**
 * The registration summary: one projection for the supplier's step 5 and for the CPD reviewer's page (Phase 4b, ruling 6), so the officer reads exactly what the applicant read. Pure.
 *
 * What it covers: the company's identity (the registration number's format chip, never "validated"), the address, the Bumiputera reading (declared, not the status), the contacts, every document
 * with its expiry, "Not scanned", who lodged it and whether an officer has verified it, the codes as "code — name" (a retired value from the name it had), the creditor profile and the signed declarations.
 * Codes never appear alone. The SULIT parts arrive as `Sulit<…>` and are held to the reader's answer: a withheld part carries the reason in words and no value, so a summary built for
 * a reader who may not see the bank details cannot show them. The record carries every name already resolved, so no code reaches a screen. Ownership is not captured (CPD, 2026-10-07).
 */

import type { Sulit } from "@/lib/auth/sulit-access";
import { bumiputeraNeedsAttention, bumiputeraWords, type BumiputeraReading } from "@/lib/suppliers/bumiputera";
import type { VerificationState } from "@/lib/suppliers/types";

import type { CreditorInput } from "./types";
import { CREDITOR_FIELD_LABEL } from "./creditor";
import type { DeclarationKind } from "./types";

export interface SummaryItem {
  label: string;
  value: string;
  /// A second line under the value: what a reviewer is told about it.
  note?: string;
  tone?: "ok" | "warn" | "err";
}

export interface SummarySection {
  key: "company" | "contacts" | "documents" | "codes" | "creditor" | "declarations";
  title: string;
  items: SummaryItem[];
  /// Set where the section is SULIT and the reader may not see it: the reason, in words, and no items.
  withheld?: { en: string; ms: string };
  /// What the section says when it has nothing to show.
  empty?: string;
}

export interface SummaryDocument {
  id: string;
  typeName: string;
  /// What the applicant was told the document is.
  hint: string | null;
  title: string;
  reference: string;
  issuingAuthority: string;
  /// YYYY-MM-DD.
  expiresOn: string | null;
  notApplicable: boolean;
  /// A percentage, already in its canonical text, or null.
  ratePercent: string | null;
  files: { name: string; scanLabel: string }[];
  /// Null while the document is a draft's (nothing to verify yet).
  verification: { state: VerificationState; by: string | null; on: string | null; note: string } | null;
  /// "The supplier's own portal account", or the officer who lodged it.
  lodgedBy: string | null;
  /// "code — name", from the name each value had when it was recorded.
  codes: string[];
}

export interface SummaryCreditor extends CreditorInput {
  /// The bank and the account type, by their names.
  bankName: string;
  accountTypeName: string;
  statementFiles: string[];
  verification: { state: VerificationState; by: string | null; on: string | null; note: string } | null;
}

export interface SummaryDeclaration {
  kind: DeclarationKind;
  textVersion: number;
  signatoryName: string;
  signatoryDesignation: string;
  /// The server's time, formatted.
  signedAt: string;
  by: string;
}

export interface SummaryRecord {
  company: {
    registeredName: string;
    registrationNo: string;
    /// Whether the number matches the organisation's configured form: true, false, or null where no form is set (not checked).
    formatChecked: boolean | null;
    entityTypeName: string | null;
    countryName: string | null;
    addressLines: string[];
    incorporatedOn: string | null;
    companyEmail: string;
    bumiputera: BumiputeraReading;
  };
  contacts: Sulit<{ name: string; designation: string; email: string; phone: string; primary: boolean }[]>;
  documents: SummaryDocument[];
  creditor: Sulit<SummaryCreditor | null>;
  declarations: SummaryDeclaration[];
}

export interface SummaryFormat {
  day(iso: string): string;
}

const DECLARATION_TITLE: Readonly<Record<DeclarationKind, string>> = {
  GIRO_AUTHORISATION: "GIRO authorisation",
  FALSE_DECLARATION: "Declaration that the information is true",
};

const VERIFICATION_WORDS: Readonly<Record<VerificationState, { text: string; tone: "ok" | "warn" | "err" }>> = {
  NOT_CHECKED: { text: "Not yet checked by the office", tone: "warn" },
  VERIFIED: { text: "Checked and in order", tone: "ok" },
  NOT_IN_ORDER: { text: "Checked and found not in order", tone: "err" },
};

const verificationNote = (v: NonNullable<SummaryDocument["verification"]>, fmt: SummaryFormat): string => {
  const w = VERIFICATION_WORDS[v.state];
  if (v.state === "NOT_CHECKED") return w.text;
  return `${w.text}${v.by ? `, by ${v.by}` : ""}${v.on ? `, ${fmt.day(v.on)}` : ""}${v.note ? `. “${v.note}”` : ""}`;
};

export function registrationSummary(record: SummaryRecord, fmt: SummaryFormat): SummarySection[] {
  const c = record.company;
  const sections: SummarySection[] = [];

  const formatItem: SummaryItem =
    c.formatChecked === true
      ? { label: "Registration number", value: c.registrationNo, note: "Format checked. It is not checked against the registrar's records.", tone: "ok" }
      : c.formatChecked === false
        ? { label: "Registration number", value: c.registrationNo, note: "Format does not match the form the office expects.", tone: "err" }
        : { label: "Registration number", value: c.registrationNo, note: "Format not checked: the office has not set one. It is not checked against the registrar's records.", tone: "warn" };
  const bumiputera = bumiputeraWords(c.bumiputera).en;
  sections.push({
    key: "company",
    title: "Company",
    items: [
      { label: "Registered name", value: c.registeredName },
      formatItem,
      { label: "Business entity", value: c.entityTypeName ?? "Not listed" },
      { label: "Country", value: c.countryName ?? "Not listed" },
      { label: "Registered address", value: c.addressLines.filter(Boolean).join(", ") || "Not given" },
      { label: "Date incorporated", value: c.incorporatedOn ? fmt.day(c.incorporatedOn) : "Not given" },
      { label: "Company email", value: c.companyEmail, note: "Not verified. Nothing is e-mailed from the portal.", tone: "warn" },
      { label: "Bumiputera status", value: bumiputera, ...(bumiputeraNeedsAttention(c.bumiputera) ? { note: "A claim with no evidence document lodged.", tone: "warn" as const } : {}) },
    ],
  });

  if (record.contacts.state === "WITHHELD") sections.push({ key: "contacts", title: "Contacts", items: [], withheld: record.contacts.words });
  else
    sections.push({
      key: "contacts",
      title: "Contacts",
      items: record.contacts.value.map((p) => ({ label: p.primary ? "Primary contact" : "Contact", value: p.name, note: [p.designation, p.email, p.phone].filter(Boolean).join(" · ") || undefined })),
      empty: "No contact is recorded.",
    });

  sections.push({
    key: "documents",
    title: "Documents",
    empty: "No document has been added.",
    items: record.documents.map((d): SummaryItem => {
      const name = d.title ? `${d.typeName} · ${d.title}` : d.typeName;
      if (d.notApplicable) return { label: name, value: "Does not apply" };
      const parts = [
        d.reference ? `Reference ${d.reference}` : null,
        d.issuingAuthority ? `Issued by ${d.issuingAuthority}` : null,
        d.expiresOn ? `Expires ${fmt.day(d.expiresOn)}` : "No expiry date given",
        d.ratePercent ? `Rate ${d.ratePercent}%` : null,
      ].filter(Boolean);
      const files = d.files.length ? d.files.map((f) => `${f.name} (${f.scanLabel})`).join(", ") : "No file";
      const verification = d.verification ? verificationNote(d.verification, fmt) : null;
      const noteLines = [files, d.lodgedBy ? `Lodged by ${d.lodgedBy}` : null, verification, d.codes.length ? `Codes: ${d.codes.join("; ")}` : null].filter(Boolean);
      return { label: name, value: parts.join(" · "), note: noteLines.join(" · "), ...(d.verification ? { tone: VERIFICATION_WORDS[d.verification.state].tone } : {}) };
    }),
  });

  sections.push({
    key: "codes",
    title: "Work codes",
    empty: "No code has been chosen.",
    items: record.documents
      .filter((d) => d.codes.length > 0)
      .map((d) => ({ label: d.title ? `${d.typeName} · ${d.title}` : d.typeName, value: d.codes.join("; ") })),
  });

  if (record.creditor.state === "WITHHELD") sections.push({ key: "creditor", title: "Creditor's profile", items: [], withheld: record.creditor.words });
  else if (record.creditor.value == null) sections.push({ key: "creditor", title: "Creditor's profile", items: [], empty: "No bank details have been entered." });
  else {
    const p = record.creditor.value;
    const item = (k: keyof CreditorInput, value: string): SummaryItem => ({ label: CREDITOR_FIELD_LABEL[k], value: value || "Not given" });
    sections.push({
      key: "creditor",
      title: "Creditor's profile",
      items: [
        item("beneficiaryName", p.beneficiaryName),
        item("beneficiaryAddress", p.beneficiaryAddress),
        item("beneficiaryIdentityNo", p.beneficiaryIdentityNo),
        item("beneficiaryContactPerson", p.beneficiaryContactPerson),
        item("beneficiaryTelephone", p.beneficiaryTelephone),
        item("beneficiaryFax", p.beneficiaryFax),
        item("beneficiaryTaxRegistrationNo", p.beneficiaryTaxRegistrationNo),
        item("beneficiaryEmail", p.beneficiaryEmail),
        { label: CREDITOR_FIELD_LABEL.bankCode, value: p.bankName || "Not given" },
        item("bankAccountNo", p.bankAccountNo),
        { label: CREDITOR_FIELD_LABEL.bankAccountTypeCode, value: p.accountTypeName || "Not given" },
        item("bankSwiftCode", p.bankSwiftCode),
        item("bankAddress", p.bankAddress),
        { label: "Bank statement", value: p.statementFiles.length ? p.statementFiles.join(", ") : "No file", note: "Not scanned for malware." },
        ...(p.verification ? [{ label: "Bank details", value: verificationNote(p.verification, fmt), tone: VERIFICATION_WORDS[p.verification.state].tone }] : []),
      ],
    });
  }

  sections.push({
    key: "declarations",
    title: "Declarations",
    empty: "Nothing has been signed yet. The declarations are signed when the registration is sent.",
    items: record.declarations.map((d) => ({
      label: DECLARATION_TITLE[d.kind],
      value: `${d.signatoryName}, ${d.signatoryDesignation}`,
      note: `Signed ${d.signedAt} by ${d.by} · wording version ${d.textVersion}`,
    })),
  });
  return sections;
}
