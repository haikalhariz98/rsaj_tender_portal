import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { SUPPLIER_UPLOADER_WORDS } from "@/lib/documents/labels";
import { formatOrgDateTime } from "@/lib/format";
import { matchesFormat } from "@/lib/integration/award-commitment";
import { bumiputeraReading } from "@/lib/suppliers/bumiputera";
import { composeAddress } from "@/lib/suppliers/step-one";
import { REGISTRATION_NO_FORMAT_KEY, type SupplierListKind, type VerificationState } from "@/lib/suppliers/types";

import { identityDiffers } from "./creditor";
import { signatoryDiffers } from "./declaration";
import type { DraftView } from "./draft-store";
import { parseRate } from "./documents";
import type { SummaryCreditor, SummaryDeclaration, SummaryDocument, SummaryRecord } from "./summary";
import type { DeclarationKind, RegistrationContext } from "./types";
import { valueLabel } from "./values";

/**
 * The rows the registration summary is made of, read (Phase 4b). `registrationSummary` (pure) is given a `SummaryRecord`; these gather its parts for the signed-in supplier's step 5, and for the
 * CPD reviewer's page, so the two cannot disagree about what a registration holds. Reads only, in the caller's client, for one supplier of one organisation: the caller says which, from the
 * session (a supplier) or from the record the officer opened. The SULIT parts (contacts, the creditor profile) are read here and handed to the caller, which decides, per reader, whether to
 * show them (`Sulit<T>`): nothing in this file decides who may read.
 */

export interface SummaryScope {
  organisationId: string;
  supplierId: string;
}

const nameOf = (lists: { list: string; code: string; nameEn: string }[], kind: SupplierListKind, code: string): string | null => (code ? (lists.find((l) => l.list === kind && l.code === code)?.nameEn ?? null) : null);

/// The company as the office accepted it: identity, address in parts, the Bumiputera reading (declared, with the evidence document's state), and whether the number fits the configured form.
export async function loadCompanySummary(client: Tx, scope: SummaryScope, stage: "APPLICATION" | "REGISTER"): Promise<SummaryRecord["company"] | null> {
  const [s, lists, format, policy] = await Promise.all([
    client.supplier.findFirst({ where: { id: scope.supplierId, organisationId: scope.organisationId } }),
    client.supplierListValue.findMany({ where: { organisationId: scope.organisationId, list: { in: ["ENTITY_TYPE", "COUNTRY", "STATE", "BUMIPUTERA_STATUS"] } }, select: { list: true, code: true, nameEn: true } }),
    client.codeFormat.findFirst({ where: { organisationId: scope.organisationId, key: REGISTRATION_NO_FORMAT_KEY }, select: { pattern: true } }),
    client.supplierPolicy.findUnique({ where: { organisationId: scope.organisationId }, select: { restrictionEvidenceTypeId: true } }),
  ]);
  if (!s) return null;
  const evidenceTypeId = policy?.restrictionEvidenceTypeId ?? null;
  const evidenceDocs = evidenceTypeId ? await client.supplierDocument.findMany({ where: { supplierId: s.id, typeId: evidenceTypeId, notApplicable: false }, orderBy: { lodgedOn: "desc" }, select: { reference: true, verification: true } }) : [];
  const evidence = evidenceDocs.find((d) => d.verification === "VERIFIED") ?? evidenceDocs[0] ?? null;
  const claim = s.bumiputeraClaimCode ? (nameOf(lists, "BUMIPUTERA_STATUS", s.bumiputeraClaimCode) ?? "A status no longer listed") : null;
  const stateName = nameOf(lists, "STATE", s.stateCode);
  return {
    registeredName: s.registeredName,
    registrationNo: s.registrationNo,
    formatChecked: matchesFormat(s.registrationNo, format?.pattern ?? null),
    entityTypeName: nameOf(lists, "ENTITY_TYPE", s.entityTypeCode),
    countryName: nameOf(lists, "COUNTRY", s.countryCode),
    // A supplier recorded before the address was asked in parts holds it as one text, shown as it is.
    addressLines: s.addressLine1 ? composeAddress(s, stateName).split("\n") : s.registeredAddress.split("\n"),
    incorporatedOn: s.incorporatedOn ? storedDay(s.incorporatedOn) : null,
    companyEmail: s.companyEmail,
    bumiputera: bumiputeraReading(claim, evidenceTypeId != null, evidence ? { reference: evidence.reference, verification: evidence.verification as VerificationState } : null, stage),
  };
}

export async function loadContactsSummary(client: Tx, scope: SummaryScope) {
  const rows = await client.supplierContact.findMany({ where: { supplierId: scope.supplierId, organisationId: scope.organisationId, retiredOn: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { name: true, designation: true, email: true, phone: true, isPrimary: true } });
  return rows.map((c) => ({ name: c.name, designation: c.designation, email: c.email, phone: c.phone, primary: c.isPrimary }));
}

/// The documents of a draft, as the summary reads them. Nothing is verified yet and nobody has lodged them: the draft is the supplier's own.
export function draftDocumentsSummary(view: DraftView, ctx: RegistrationContext, valueNames: ReadonlyMap<string, string>): SummaryDocument[] {
  return view.documents.map((d) => {
    const type = ctx.types.find((t) => t.id === d.typeId);
    return {
      id: d.id,
      typeName: type?.nameEn ?? "A document no longer asked for",
      hint: type?.hintEn ?? null,
      title: d.title,
      reference: d.reference,
      issuingAuthority: d.issuingAuthority,
      expiresOn: d.expiresOn,
      notApplicable: d.notApplicable,
      ratePercent: d.ratePercent ? parseRate(d.ratePercent) : null,
      files: d.files.map((f) => ({ name: f.name, scanLabel: "Not scanned" })),
      verification: null,
      lodgedBy: null,
      lodgedByOfficer: false,
      codes: d.valueIds.map((id) => valueNames.get(id) ?? "A code no longer listed"),
    };
  });
}

const SCAN_LABEL: Readonly<Record<string, string>> = { NOT_SCANNED: "Not scanned", CLEAN: "Scanned, clean", THREAT: "Scanned, a threat was found" };

/// The supplier's lodged documents (a registration that was sent, or one an officer recorded), as the summary reads them: with the officer's check, who lodged them, and their codes as they were named.
export async function loadSentDocumentsSummary(client: Tx, scope: SummaryScope, opts: { applicationId?: string } = {}): Promise<SummaryDocument[]> {
  const rows = await client.supplierDocument.findMany({
    where: { supplierId: scope.supplierId, organisationId: scope.organisationId, ...(opts.applicationId ? { applicationId: opts.applicationId } : {}) },
    orderBy: [{ lodgedOn: "asc" }, { recordedAt: "asc" }, { id: "asc" }],
    include: {
      type: { select: { hintEn: true } },
      values: { select: { codeSnapshot: true, labelSnapshot: true }, orderBy: { codeSnapshot: "asc" } },
      recordedBy: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      attachments: { where: { purpose: "SUPPLIER_DOCUMENT", detachedAt: null }, select: { version: { select: { originalFilename: true, scanState: true, withdrawnAt: true } } } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    typeName: d.typeLabelSnapshot,
    hint: d.type.hintEn,
    title: d.title,
    reference: d.reference,
    issuingAuthority: d.issuingAuthority,
    expiresOn: d.expiresOn ? storedDay(d.expiresOn) : null,
    notApplicable: d.notApplicable,
    ratePercent: d.ratePercent ? d.ratePercent.toString() : null,
    files: d.attachments.filter((a) => a.version.withdrawnAt == null).map((a) => ({ name: a.version.originalFilename, scanLabel: SCAN_LABEL[a.version.scanState] ?? "Not scanned" })),
    verification: { state: d.verification as VerificationState, by: d.verifiedBy?.name ?? null, on: d.verifiedOn ? storedDay(d.verifiedOn) : null, note: d.verificationNote },
    lodgedBy: d.recordedBy ? d.recordedBy.name : SUPPLIER_UPLOADER_WORDS.toLowerCase(),
    lodgedByOfficer: d.recordedBy != null,
    codes: d.values.map((v) => valueLabel({ code: v.codeSnapshot, nameEn: v.labelSnapshot })),
  }));
}

/// The declarations a supplier signed, newest first within an application.
export async function loadDeclarationsSummary(client: Tx, scope: SummaryScope, zone: string | null, opts: { applicationId?: string } = {}): Promise<SummaryDeclaration[]> {
  const rows = await client.registrationDeclaration.findMany({
    where: { organisationId: scope.organisationId, application: { supplierId: scope.supplierId, ...(opts.applicationId ? { id: opts.applicationId } : {}) } },
    orderBy: [{ signedAt: "asc" }, { kind: "asc" }],
    include: { signedBy: { select: { contact: { select: { name: true } } } } },
  });
  // The person who signs is compared with the contact of the account that sent the registration (the contact as it reads now): another is flagged to the reviewer, never refused.
  return rows.map((d) => ({ kind: d.kind as DeclarationKind, textVersion: d.textVersion, signatoryName: d.signatoryName, signatoryDesignation: d.signatoryDesignation, signedAt: formatOrgDateTime(d.signedAt, zone), by: "the supplier's portal account", signatoryIsNotContact: signatoryDiffers(d.signatoryName, d.signedBy.contact.name) }));
}

export interface CreditorRow {
  id: string;
  version: number;
  submittedAt: Date | null;
  verification: VerificationState;
  verifiedOn: Date | null;
  verificationNote: string;
  verifiedByName: string | null;
  supersedesId: string | null;
  /// The officer who checked it, by id, for who is named on it (the creditor profile's gate).
  verifiedByPersonId: string | null;
  values: Record<string, string>;
  statement: { versionId: string; name: string; scanState: string }[];
}

const CREDITOR_COLUMNS = ["beneficiaryName", "beneficiaryAddress", "beneficiaryIdentityNo", "beneficiaryContactPerson", "beneficiaryTelephone", "beneficiaryFax", "beneficiaryTaxRegistrationNo", "beneficiaryEmail", "bankCode", "bankAccountNo", "bankAccountTypeCode", "bankSwiftCode", "bankAddress"] as const;

/// A supplier's creditor profiles, newest version first. SULIT: the caller hands a row to a reader only through the gate.
export async function loadCreditorRows(client: Tx, scope: SummaryScope): Promise<CreditorRow[]> {
  const rows = await client.creditorProfile.findMany({
    where: { supplierId: scope.supplierId, organisationId: scope.organisationId },
    orderBy: { version: "desc" },
    include: {
      verifiedBy: { select: { name: true } },
      attachments: { where: { purpose: "SUPPLIER_BANK_STATEMENT", detachedAt: null }, select: { version: { select: { id: true, originalFilename: true, scanState: true, withdrawnAt: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    submittedAt: r.submittedAt,
    verification: r.verification as VerificationState,
    verifiedOn: r.verifiedOn,
    verificationNote: r.verificationNote,
    verifiedByName: r.verifiedBy?.name ?? null,
    supersedesId: r.supersedesId,
    verifiedByPersonId: r.verifiedByPersonId,
    values: Object.fromEntries(CREDITOR_COLUMNS.map((k) => [k, r[k]])),
    statement: r.attachments.filter((a) => a.version.withdrawnAt == null).map((a) => ({ versionId: a.version.id, name: a.version.originalFilename, scanState: a.version.scanState })),
  }));
}

/// A creditor row as the summary reads it: the bank and the account type by their names, the statement by its file names.
export async function creditorSummaryOf(client: Tx, organisationId: string, row: CreditorRow): Promise<SummaryCreditor> {
  const [lists, owner] = await Promise.all([
    client.supplierListValue.findMany({ where: { organisationId, list: { in: ["BANK", "ACCOUNT_TYPE"] } }, select: { list: true, code: true, nameEn: true } }),
    // The supplier the profile belongs to is read from the profile itself, in this organisation (never from the caller).
    client.creditorProfile.findFirst({ where: { id: row.id, organisationId }, select: { supplier: { select: { registrationNoKey: true } } } }),
  ]);
  const v = row.values;
  return {
    beneficiaryName: v.beneficiaryName ?? "",
    beneficiaryAddress: v.beneficiaryAddress ?? "",
    beneficiaryIdentityNo: v.beneficiaryIdentityNo ?? "",
    beneficiaryContactPerson: v.beneficiaryContactPerson ?? "",
    beneficiaryTelephone: v.beneficiaryTelephone ?? "",
    beneficiaryFax: v.beneficiaryFax ?? "",
    beneficiaryTaxRegistrationNo: v.beneficiaryTaxRegistrationNo ?? "",
    beneficiaryEmail: v.beneficiaryEmail ?? "",
    bankCode: v.bankCode ?? "",
    bankAccountNo: v.bankAccountNo ?? "",
    bankAccountTypeCode: v.bankAccountTypeCode ?? "",
    bankSwiftCode: v.bankSwiftCode ?? "",
    bankAddress: v.bankAddress ?? "",
    bankName: v.bankCode ? (nameOf(lists, "BANK", v.bankCode) ?? "A bank no longer listed") : "",
    accountTypeName: v.bankAccountTypeCode ? (nameOf(lists, "ACCOUNT_TYPE", v.bankAccountTypeCode) ?? "An account type no longer listed") : "",
    statementFiles: row.statement.map((s) => s.name),
    identityDiffersFromCompany: owner ? identityDiffers(v.beneficiaryIdentityNo ?? "", owner.supplier.registrationNoKey) : false,
    verification: row.submittedAt ? { state: row.verification, by: row.verifiedByName, on: row.verifiedOn ? storedDay(row.verifiedOn) : null, note: row.verificationNote } : null,
  };
}
