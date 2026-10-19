/**
 * A supplier's export of its own data (N2, the PDPA right of access; plan docs/notes/plans/backlog-n2.md). Pure: the reader
 * (`src/lib/portal/data-export-store.ts`) reads the supplier's rows and the derived readings the portal already computes, and this turns them
 * into one record that the printable page and the JSON file both show.
 *
 * Every row passes through the allow-list (`pickIn`, `data-export-fields.ts`) before anything is read from it, so a column the reader selected
 * beyond `inColumns` cannot reach the export. Two IN columns are gated here: a verification note is shown only where the office found the
 * item not in order (as the Company page shows it), and a sign-in name only for a contact open to the reader (ruling 1875(7)).
 *
 * The JSON keys are stable English and never shown. Days are `YYYY-MM-DD`, moments ISO instants. An enumerated value or a list code is its
 * label in both languages, never the code (AGENTS.md rule 5). Money is the Decimal as a string, never a float. A file's path carries no form
 * token: a token in a saved file would outlive its purpose (decision 6), and only the printable page carries live links.
 */

import type { FieldChange } from "@/lib/audit/diff";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import type { Words } from "@/lib/contract/labels";
import { storedDay } from "@/lib/dates";
import { bankState } from "@/lib/portal/company/bank";
import type { StandingView } from "@/lib/portal/company/standing-view";

import { pickIn, type ExportModel } from "./data-export-fields";
import {
  ACCOUNT_STATUS_WORDS,
  BANK_STATE_WORDS,
  BID_KIND_WORDS,
  BID_STATUS_WORDS,
  CONTACT_WITHHELD,
  DECLARATION_KIND_EXPORT_WORDS,
  DOWNLOAD_KIND_WORDS,
  EXPORT_FORM_WORDS,
  EXPORT_LABEL,
  EXPORT_SECTION_ORDER,
  EXPORT_SECTION_TITLE,
  leftOutWords,
  NO,
  NOT_ON_LIST,
  PAYMENT_CHANNEL_WORDS,
  PAYMENT_OUTCOME_WORDS,
  PURCHASE_STATE_EXPORT_WORDS,
  VALUE_NOT_KNOWN,
  YES,
  type ExportLabelKey,
  type ExportSectionKey,
} from "./data-export-words";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS_LABEL, CHANNEL_LABEL, OUTCOME_LABEL, STANDING_EVENT_LABEL, SUPPLIER_STATUS_LABEL, VALUE_KIND_LABEL, VERIFICATION_LABEL } from "./labels";

export type { ExportSectionKey } from "./data-export-words";

export const EXPORT_FORMAT = "perolehan-supplier-export";
export const EXPORT_VERSION = 1;

/// A row as the reader read it. Only its model's IN columns are ever looked at.
export type SourceRow = Readonly<Record<string, unknown>>;

/// The organisation's maintained lists, by code, as their labels. A code missing from its list is said to be so, never shown.
export interface ExportLists {
  entityType: Readonly<Record<string, Words>>;
  country: Readonly<Record<string, Words>>;
  state: Readonly<Record<string, Words>>;
  bumiputeraClaim: Readonly<Record<string, Words>>;
  bank: Readonly<Record<string, Words>>;
  bankAccountType: Readonly<Record<string, Words>>;
}

export interface SupplierExportSource {
  organisationName: string;
  /// Supplier.
  supplier: SourceRow;
  lists: ExportLists;
  /// The supplier's contacts as the step-5 summary lists them (not retired), each with whether its SULIT read was granted to the reader, and its
  /// account (SupplierAccount) where it has one.
  contacts: readonly { row: SourceRow; open: boolean; account: SourceRow | null }[];
  /// RegistrationDeclaration.
  declarations: readonly SourceRow[];
  /// CreditorProfile versions, each with its statement's files (DocumentVersion). Only the bank tab's set is exported (decision 3).
  bank: readonly { row: SourceRow; files: readonly SourceRow[] }[];
  /// SupplierDocument, with its values (SupplierDocumentValue) and live files (DocumentVersion).
  documents: readonly { row: SourceRow; values: readonly SourceRow[]; files: readonly SourceRow[] }[];
  /// `standingView` of `standingOf`, or null where there is no reading.
  standing: StandingView | null;
  /// StandingEvent.
  standingChanges: readonly SourceRow[];
  /// SupplierApplication, with its decisions (ApplicationDecision) and their items (ResubmissionItem).
  applications: readonly { row: SourceRow; decisions: readonly { row: SourceRow; items: readonly SourceRow[] }[] }[];
  /// One per exercise the supplier bought or downloaded from, under the restricted-exercise visibility: DocumentPurchase (null where only
  /// downloads were taken), its PaymentAttempts and the PurchaseDownloads.
  purchases: readonly { exerciseName: string; row: SourceRow | null; attempts: readonly SourceRow[]; downloads: readonly SourceRow[] }[];
  /// OnlineBid, with what the receipt card shows beside it.
  bidReceipts: readonly { row: SourceRow; exerciseName: string; receivedAt: Date; late: boolean; keyFingerprint: string }[];
}

export interface ExportFile {
  name: string;
  type: string;
  size: string;
  lodgedOn: string;
  versionId: string;
  /// The download's path with no token.
  path: string;
}

export interface ExportRow {
  label: Words;
  value: string | Words | null;
  files?: ExportFile[];
  /// What belongs to this row (a contact's details, an application's outcomes).
  rows?: ExportRow[];
}

export interface ExportSection {
  /// A stable English JSON key, never shown.
  key: ExportSectionKey;
  title: Words;
  /// One top-level row per record.
  rows: ExportRow[];
}

export interface SupplierExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  /// An ISO instant. The page formats it in the organisation's zone.
  generatedAt: string;
  organisation: string;
  supplier: { reference: string; name: string };
  sections: ExportSection[];
  leftOut: Words[];
}

export interface ExportContext {
  generatedAt: Date;
  /// The organisation's zone, for the page's formatting. The file's dates are ISO and need none.
  timeZone: string | null;
  /// The office as the organisation names it; blank reads as "the procurement office".
  officeName: string;
}

// --- reading a value -----------------------------------------------------------------------------------------------------------------------

const isDate = (v: unknown): v is Date => v instanceof Date && !Number.isNaN(v.getTime());
const day = (v: unknown) => (isDate(v) ? storedDay(v) : null);
const instant = (v: unknown) => (isDate(v) ? v.toISOString() : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
const count = (v: unknown) => (typeof v === "number" || typeof v === "bigint" ? String(v) : null);
const yesNo = (v: unknown) => (typeof v === "boolean" ? (v ? YES : NO) : null);
/// A Decimal as written, at its column's scale (both money and the rate are scale 2 in the schema); never through a float.
function decimal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function") return (v as { toFixed(dp: number): string }).toFixed(2);
  return null;
}
function enumWords(map: Readonly<Record<string, Words>>, v: unknown): Words | null {
  if (typeof v !== "string" || v === "") return null;
  return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : VALUE_NOT_KNOWN;
}
function listWords(list: Readonly<Record<string, Words>>, v: unknown): Words | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  return Object.prototype.hasOwnProperty.call(list, v) ? list[v] : NOT_ON_LIST;
}

const row = (label: ExportLabelKey, value: string | Words | null, rest: Omit<ExportRow, "label" | "value"> = {}): ExportRow => ({ label: EXPORT_LABEL[label], value, ...rest });
/// The detail rows of a record, without the ones that hold nothing.
const details = (rows: readonly (ExportRow | null)[]) => rows.filter((r): r is ExportRow => r != null && (r.value != null || (r.rows?.length ?? 0) > 0 || (r.files?.length ?? 0) > 0));
const pick = (model: ExportModel, r: SourceRow) => pickIn(model, r);

function files(rows: readonly SourceRow[]): ExportFile[] {
  return rows.flatMap((raw) => {
    const f = pick("DocumentVersion", raw);
    const versionId = text(f.id);
    if (!versionId) return [];
    return [{ name: text(f.originalFilename) ?? "", type: text(f.mediaType) ?? "", size: count(f.byteSize) ?? "", lodgedOn: instant(f.storedAt) ?? "", versionId, path: `${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(versionId)}` }];
  });
}

const notInOrderNote = (r: Record<string, unknown>) => (r.verification === "NOT_IN_ORDER" ? text(r.verificationNote) : null);

// --- the sections ----------------------------------------------------------------------------------------------------------------------------

function company(src: SupplierExportSource): ExportRow[] {
  const s = pick("Supplier", src.supplier);
  return [
    row("registeredName", text(s.registeredName), {
      rows: details([
        row("reference", text(s.reference)),
        row("registrationNo", text(s.registrationNo)),
        row("entityType", listWords(src.lists.entityType, s.entityTypeCode)),
        row("country", listWords(src.lists.country, s.countryCode)),
        row("registeredAddress", text(s.registeredAddress)),
        row("addressLine1", text(s.addressLine1)),
        row("addressLine2", text(s.addressLine2)),
        row("city", text(s.city)),
        row("postcode", text(s.postcode)),
        row("state", listWords(src.lists.state, s.stateCode)),
        row("bumiputeraClaim", listWords(src.lists.bumiputeraClaim, s.bumiputeraClaimCode)),
        row("incorporatedOn", day(s.incorporatedOn)),
        row("companyEmail", text(s.companyEmail)),
        row("status", enumWords(SUPPLIER_STATUS_LABEL, s.status)),
        row("registeredOn", day(s.registeredOn)),
      ]),
    }),
  ];
}

function contacts(src: SupplierExportSource): ExportRow[] {
  return src.contacts.map((c) => {
    if (!c.open) return row("contact", CONTACT_WITHHELD);
    const r = pick("SupplierContact", c.row);
    return row("contact", text(r.name), { rows: details([row("designation", text(r.designation)), row("email", text(r.email)), row("phone", text(r.phone)), row("primary", yesNo(r.isPrimary))]) });
  });
}

function accounts(src: SupplierExportSource): ExportRow[] {
  return src.contacts.flatMap((c) => {
    if (!c.account) return [];
    // Ruling 1875(7): a sign-in name is shown beside its contact, to a reader the contact is open to. A closed contact's account is withheld whole.
    if (!c.open) return [row("account", CONTACT_WITHHELD)];
    const a = pick("SupplierAccount", c.account);
    const contact = pick("SupplierContact", c.row);
    return [
      row("account", text(contact.name), {
        rows: details([
          row("loginName", text(a.loginName)),
          row("accountStatus", enumWords(ACCOUNT_STATUS_WORDS, a.status)),
          row("openedOn", instant(a.createdAt)),
          row("passwordChangedAt", instant(a.passwordChangedAt)),
          row("lastSignInAt", instant(a.lastSignInAt)),
          row("disabledAt", instant(a.disabledAt)),
        ]),
      }),
    ];
  });
}

function declarations(src: SupplierExportSource): ExportRow[] {
  return src.declarations.map((raw) => {
    const d = pick("RegistrationDeclaration", raw);
    return row("declaration", enumWords(DECLARATION_KIND_EXPORT_WORDS, d.kind), {
      rows: details([
        row("textVersion", count(d.textVersion)),
        row("signatoryName", text(d.signatoryName)),
        row("signatoryDesignation", text(d.signatoryDesignation)),
        row("signedOn", day(d.signedOn)),
        row("signedAt", instant(d.signedAt)),
        row("textEn", text(d.frozenTextEn)),
        row("textMs", text(d.frozenTextMs)),
      ]),
    });
  });
}

function bank(src: SupplierExportSource): ExportRow[] {
  const versions = src.bank.map((b) => ({ b, p: pick("CreditorProfile", b.row) }));
  const facts = versions.flatMap(({ p }) => (typeof p.version === "number" && typeof p.verification === "string" ? [{ version: p.version, sent: isDate(p.submittedAt), verification: p.verification as "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER" }] : []));
  const state = bankState(facts);
  // Decision 3: the bank tab's set only (in force, waiting, not in order). A superseded version would be a wider read than today.
  const shown: { version: number; words: Words }[] = [];
  for (const [v, words] of [
    [state.inForce, BANK_STATE_WORDS.inForce],
    [state.waiting, BANK_STATE_WORDS.waiting],
    [state.notInOrder, BANK_STATE_WORDS.notInOrder],
  ] as const) {
    if (v && !shown.some((s) => s.version === v.version)) shown.push({ version: v.version, words });
  }
  return shown.flatMap(({ version, words }) => {
    const found = versions.find(({ p }) => p.version === version);
    if (!found) return [];
    const p = found.p;
    return [
      row("bankVersion", String(version), {
        files: files(found.b.files),
        rows: details([
          row("bankState", words),
          row("beneficiaryName", text(p.beneficiaryName)),
          row("beneficiaryAddress", text(p.beneficiaryAddress)),
          row("beneficiaryIdentityNo", text(p.beneficiaryIdentityNo)),
          row("beneficiaryContactPerson", text(p.beneficiaryContactPerson)),
          row("beneficiaryTelephone", text(p.beneficiaryTelephone)),
          row("beneficiaryFax", text(p.beneficiaryFax)),
          row("beneficiaryTaxRegistrationNo", text(p.beneficiaryTaxRegistrationNo)),
          row("beneficiaryEmail", text(p.beneficiaryEmail)),
          row("bank", listWords(src.lists.bank, p.bankCode)),
          row("bankAccountNo", text(p.bankAccountNo)),
          row("bankAccountType", listWords(src.lists.bankAccountType, p.bankAccountTypeCode)),
          row("bankSwiftCode", text(p.bankSwiftCode)),
          row("bankAddress", text(p.bankAddress)),
          row("submittedAt", instant(p.submittedAt)),
          row("verification", enumWords(VERIFICATION_LABEL, p.verification)),
          row("verifiedOn", day(p.verifiedOn)),
          row("verificationNote", notInOrderNote(p)),
        ]),
      }),
    ];
  });
}

function documents(src: SupplierExportSource): ExportRow[] {
  return src.documents.map((doc) => {
    const d = pick("SupplierDocument", doc.row);
    const values = doc.values.map((raw) => {
      const v = pick("SupplierDocumentValue", raw);
      const code = text(v.codeSnapshot);
      const label = text(v.labelSnapshot);
      return { label: enumWords(VALUE_KIND_LABEL, v.kind) ?? EXPORT_LABEL.codes, value: code && label ? `${code} — ${label}` : (code ?? label) } satisfies ExportRow;
    });
    return row("document", text(d.typeLabelSnapshot), {
      files: files(doc.files),
      rows: details([
        row("documentReference", text(d.reference)),
        row("issuingAuthority", text(d.issuingAuthority)),
        row("title", text(d.title)),
        row("issuedOn", day(d.issuedOn)),
        row("validFrom", day(d.validFrom)),
        row("expiresOn", day(d.expiresOn)),
        d.notApplicable === true ? row("notApplicable", YES) : null,
        row("ratePercent", decimal(d.ratePercent)),
        row("lodgedOn", day(d.lodgedOn)),
        row("verification", enumWords(VERIFICATION_LABEL, d.verification)),
        row("verifiedOn", day(d.verifiedOn)),
        row("verificationNote", notInOrderNote(d)),
        ...values,
      ]),
    });
  });
}

function standing(src: SupplierExportSource): ExportRow[] {
  const v = src.standing;
  if (!v) return [];
  return [row("standing", v.title, { rows: details([...v.lines.map((l) => row("standingLine", l)), row("standingMeaning", v.meaning)]) })];
}

function standingChanges(src: SupplierExportSource): ExportRow[] {
  return src.standingChanges.map((raw) => {
    const e = pick("StandingEvent", raw);
    const cancelled = e.kind === "REGISTRATION_CANCELLED";
    return row("change", enumWords(STANDING_EVENT_LABEL, e.kind), {
      rows: details([
        // As standingEventFacts reads it: a cancellation's line is its body and reference, never a reason.
        row("reason", cancelled ? null : text(e.reasonSnapshot)),
        row("effectiveOn", day(e.effectiveOn)),
        row("endsOn", day(e.endsOn)),
        row("offenceNo", count(e.offenceNo)),
        row("periodMonths", count(e.periodMonths)),
        row("cancellingBody", text(e.bodyLabelSnapshot)),
        row("externalReference", text(e.externalReference)),
        row("cancelsRegistrationOn", day(e.cancelsRegistrationOn)),
        row("withdrawnAt", instant(e.withdrawnAt)),
      ]),
    });
  });
}

function applications(src: SupplierExportSource): ExportRow[] {
  return src.applications.map((app) => {
    const a = pick("SupplierApplication", app.row);
    const decisions = app.decisions.map((dec) => {
      const d = pick("ApplicationDecision", dec.row);
      const items = dec.items.map((raw) => {
        const i = pick("ResubmissionItem", raw);
        return row("itemAskedFor", text(i.labelSnapshot), { rows: details([row("remarks", text(i.remarks))]) });
      });
      return row("outcome", enumWords(OUTCOME_LABEL, d.outcome), { rows: details([row("decidedOn", day(d.decidedOn)), row("remarks", text(d.remarks)), row("resubmitBy", day(d.resubmitBy)), ...items]) });
    });
    return row("application", enumWords(APPLICATION_KIND_LABEL, a.kind), {
      rows: details([
        row("receivedOn", day(a.receivedOn)),
        row("channel", enumWords(CHANNEL_LABEL, a.channel)),
        row("status", enumWords(APPLICATION_STATUS_LABEL, a.status)),
        row("submittedAt", instant(a.submittedAt)),
        row("declarationSignedOn", day(a.declarationSignedOn)),
        row("epaymentFormReceivedOn", day(a.epaymentFormReceivedOn)),
        row("resubmitBy", day(a.resubmitBy)),
        ...decisions,
      ]),
    });
  });
}

function purchases(src: SupplierExportSource): ExportRow[] {
  return src.purchases.map((x) => {
    const p = x.row ? pick("DocumentPurchase", x.row) : null;
    const attempts = x.attempts.map((raw) => {
      const t = pick("PaymentAttempt", raw);
      return row("attempt", count(t.attemptNo), {
        rows: details([row("method", text(t.method)), row("paymentOutcome", enumWords(PAYMENT_OUTCOME_WORDS, t.outcome)), row("paymentReference", text(t.reference)), row("failureText", text(t.failureText)), row("attemptedAt", instant(t.attemptedAt))]),
      });
    });
    const downloads = x.downloads.map((raw) => {
      const d = pick("PurchaseDownload", raw);
      return row("download", text(d.title), { rows: details([row("downloadKind", enumWords(DOWNLOAD_KIND_WORDS, d.kind)), row("packVersion", count(d.packVersion)), row("partLabel", text(d.partLabel)), row("downloadedAt", instant(d.downloadedAt))]) });
    });
    return row("exercise", text(x.exerciseName), {
      rows: details([
        ...(p
          ? [
              row("amount", decimal(p.amount)),
              row("purchaseState", enumWords(PURCHASE_STATE_EXPORT_WORDS, p.state)),
              row("createdAt", instant(p.createdAt)),
              row("paidAt", instant(p.paidAt)),
              row("paidChannel", enumWords(PAYMENT_CHANNEL_WORDS, p.paidChannel)),
              row("paidMethod", text(p.paidMethod)),
              row("paidReference", text(p.paidReference)),
            ]
          : []),
        ...attempts,
        ...downloads,
      ]),
    });
  });
}

function bidReceipts(src: SupplierExportSource): ExportRow[] {
  return src.bidReceipts.map((x) => {
    const b = pick("OnlineBid", x.row);
    return row("bidReceipt", text(x.exerciseName), {
      rows: details([
        row("bidKind", enumWords(BID_KIND_WORDS, b.kind)),
        row("bidStatus", enumWords(BID_STATUS_WORDS, b.status)),
        row("statusAt", instant(b.statusAt)),
        row("receivedAt", instant(x.receivedAt)),
        x.late ? row("late", YES) : null,
        row("receiptDigest", text(b.receiptDigest)),
        row("keyFingerprint", text(x.keyFingerprint)),
      ]),
    });
  });
}

const BUILD: Readonly<Record<ExportSectionKey, (src: SupplierExportSource) => ExportRow[]>> = { company, contacts, accounts, declarations, bank, documents, standing, standingChanges, applications, purchases, bidReceipts };

/// The supplier's export, from what the reader read.
export function buildSupplierExport(src: SupplierExportSource, ctx: ExportContext): SupplierExport {
  const s = pick("Supplier", src.supplier);
  const reference = text(s.reference) ?? "";
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    generatedAt: ctx.generatedAt.toISOString(),
    organisation: src.organisationName,
    supplier: { reference, name: text(s.registeredName) ?? "" },
    sections: EXPORT_SECTION_ORDER.map((key) => ({ key, title: EXPORT_SECTION_TITLE[key], rows: BUILD[key](src) })),
    leftOut: leftOutWords(ctx.officeName, reference),
  };
}

/// The file's text: keys in the order the export is built, LF line ends, and a trailing newline.
export function exportJson(e: SupplierExport): string {
  return `${JSON.stringify(e, null, 2)}\n`;
}

/// A day that is not `YYYY-MM-DD` cannot name a file.
export class ExportFileNameError extends Error {
  readonly rule = "EXPORT_FILE_DAY";
  constructor(day: string) {
    super(`The export's file name needs its day as YYYY-MM-DD; "${day}" is not one.`);
    this.name = "ExportFileNameError";
  }
}

/// "supplier-data-<reference>-<YYYY-MM-DD>.json". A character a file name cannot safely carry becomes "-".
export function exportFileName(e: SupplierExport, day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ExportFileNameError(day);
  const reference = e.supplier.reference.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "supplier";
  return `supplier-data-${reference}-${day}.json`;
}

/// How many records each section held, for the audit table's `sectionCounts`.
export function exportSectionCounts(e: SupplierExport): Record<ExportSectionKey, number> {
  return Object.fromEntries(e.sections.map((s) => [s.key, s.rows.length])) as Record<ExportSectionKey, number>;
}

/// The export's audit changes: the form, how many records each section held, and the file's digest. Never an exported value.
export function exportAuditChanges(e: SupplierExport, form: "FILE" | "PAGE", sha256: string | null): FieldChange[] {
  const held = e.sections.map((s) => `${s.title.en}: ${s.rows.length}`).join(" · ");
  return [
    { field: "exportForm", before: null, after: EXPORT_FORM_WORDS[form].en },
    { field: "exportSections", before: null, after: held },
    ...(sha256 ? [{ field: "exportDigest", before: null, after: sha256 }] : []),
  ];
}
