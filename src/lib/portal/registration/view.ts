/**
 * The registration wizard's pages, as plain data (Phase 4b). Pure: the page reads the draft and the configuration, these shape what each step shows, and the client components draw it. Keeping
 * the shaping here is what lets a test say that a step shows the office's own words, that a setting not set is named, and that no code is shown alone.
 */

import { codeSections } from "./codes";
import { fillText } from "./declaration";
import { draftOf, type DraftView } from "./draft-view";
import { uploadFault, uploadSettingFault, type UploadKind, type UploadPolicy, type UploadStore } from "./upload";
import { valueLabel } from "./values";
import { uploadFaultText } from "./words";
import type { DeclarationKind, DocumentTypeConfig, RegistrationContext, RegistrationStep } from "./types";
import { VALUE_KIND_LABEL } from "@/lib/suppliers/labels";
import type { RegistrationValueKind } from "@/lib/suppliers/types";

export type Requirement = "REQUIRED" | "OPTIONAL" | "NOT_SAID";

export const requirementOf = (t: Pick<DocumentTypeConfig, "mandatoryAtRegistration">): Requirement => (t.mandatoryAtRegistration === true ? "REQUIRED" : t.mandatoryAtRegistration === false ? "OPTIONAL" : "NOT_SAID");

/// The kinds of document the supplier is asked for: live ones, in the office's order.
export const liveTypes = (ctx: RegistrationContext): DocumentTypeConfig[] => ctx.types.filter((t) => !t.retired);

export interface StepInfo {
  key: RegistrationStep;
  label: string;
  sub: string;
}

export const STEP_INFO: readonly StepInfo[] = [
  { key: "company", label: "Company", sub: "As the office accepted it" },
  { key: "documents", label: "Documents", sub: "Certificates and their dates" },
  { key: "codes", label: "Work codes", sub: "Grades, categories, fields" },
  { key: "epayment", label: "Bank details", sub: "E-payment and GIRO" },
  { key: "review", label: "Review and send", sub: "Sign and send" },
];

export const stepTitle = (s: RegistrationStep): string => STEP_INFO.find((x) => x.key === s)!.label;

/// "What you'll need": each document, in the office's words, with whether it is required, and what happens to the codes.
export interface NeedView {
  name: string;
  hint: string | null;
  requirement: Requirement;
  /// Whether it carries an expiry date, in words.
  expiry: string | null;
}

export function needList(ctx: RegistrationContext): NeedView[] {
  return liveTypes(ctx).map((t) => ({ name: t.nameEn, hint: t.hintEn?.trim() ? t.hintEn : null, requirement: requirementOf(t), expiry: t.expires === true ? "Has an expiry date" : t.expires === null ? "May have an expiry date" : null }));
}

/// The words for the files an upload takes, from the organisation's own settings: never a literal. Null where the organisation has not set them.
export function acceptNote(store: UploadStore, mediaLabel: (type: string) => string, formatBytes: (n: bigint) => string): string | null {
  if (store.allowedTypes.length === 0 || store.capBytes == null) return null;
  return `${store.allowedTypes.map(mediaLabel).join(", ")}; up to ${formatBytes(store.capBytes)} each.`;
}

/// Why an upload of this kind is closed, in words naming the setting, or null where it is open. The quota is judged when a file arrives, not here.
export function uploadClosedWords(store: UploadStore, policy: UploadPolicy, kind: UploadKind): string | null {
  const f = uploadSettingFault(store, policy, kind);
  return f ? uploadFaultText(f, kind).en : null;
}

/// The same for a file just chosen: the first reason it will not be taken, for the page to say before it is sent (the server judges again).
export function fileWords(file: { size: bigint; type: string | null }, store: UploadStore, policy: UploadPolicy, usage: { files: number; bytes: bigint }, kind: UploadKind): string | null {
  const f = uploadFault({ size: file.size, sniffedType: file.type }, store, policy, usage, kind);
  return f ? uploadFaultText(f, kind).en : null;
}

export interface CodeKindShape {
  kind: string;
  label: string;
  single: boolean;
}

/// The kinds a certificate may be given codes of, with their names, a grade being one only.
export const codeKinds = (kinds: readonly RegistrationValueKind[]): CodeKindShape[] => kinds.map((k) => ({ kind: k, label: VALUE_KIND_LABEL[k].en, single: k === "GRADE" }));

export interface CodeDocumentShape {
  id: string;
  label: string;
  kinds: CodeKindShape[];
  chosen: { value: string; label: string; kind: string }[];
}

export interface CodeSectionShape {
  bodyId: string;
  bodyName: string;
  state: "OPEN" | "DOCUMENT_FIRST" | "LIST_NOT_CONFIGURED";
  missingTypes: string[];
  documents: CodeDocumentShape[];
}

/// Step 3 as data. `valueNames` names every value the draft holds, as "code — name".
export function codeSectionShapes(view: DraftView, ctx: RegistrationContext): CodeSectionShape[] {
  const draft = draftOf(view);
  const names = new Map(ctx.values.map((v) => [v.id, valueLabel(v)]));
  const kindOf = new Map(ctx.values.map((v) => [v.id, v.kind as string]));
  return codeSections(draft.documents, ctx).map((s) => ({
    bodyId: s.body.id,
    bodyName: s.body.nameEn,
    state: s.state,
    missingTypes: s.missingTypeNames,
    documents: s.types.flatMap((x) =>
      x.documents.map((d) => ({
        id: d.id,
        label: d.title ? `${x.type.nameEn} · ${d.title}` : x.type.nameEn,
        kinds: codeKinds(x.type.valueKinds),
        chosen: d.valueIds.map((id) => ({ value: id, label: names.get(id) ?? "A code no longer listed", kind: kindOf.get(id) ?? "" })),
      })),
    ),
  }));
}

/// A declaration's wording as the page shows it, with the organisation's name filled in, or null while no text is set.
export function declarationShown(ctx: RegistrationContext, kind: DeclarationKind, organisationName: string): { id: string; en: string; ms: string; version: number } | null {
  const t = ctx.texts[kind];
  if (!t) return null;
  return { id: t.id, en: fillText(t.bodyEn, organisationName), ms: t.bodyMs ? fillText(t.bodyMs, organisationName) : "", version: t.version };
}

/// Which fields of the bank details were filled in for the supplier from what it had already given, said under the field. The tax number comes from the document that carries a rate (the
/// tax certificate: the product knows no tax by name, only that one kind of document records a rate), the email from the company's.
export function creditorPrefill(view: DraftView, ctx: RegistrationContext, companyEmail: string): { values: { beneficiaryTaxRegistrationNo?: string; beneficiaryEmail?: string }; said: Record<string, string> } {
  const values: { beneficiaryTaxRegistrationNo?: string; beneficiaryEmail?: string } = {};
  const said: Record<string, string> = {};
  const taxTypeIds = ctx.types.filter((t) => t.recordsRate === true).map((t) => t.id);
  const tax = view.documents.find((d) => taxTypeIds.includes(d.typeId) && !d.notApplicable && d.reference.trim());
  if (!view.creditor.beneficiaryTaxRegistrationNo.trim() && tax) {
    values.beneficiaryTaxRegistrationNo = tax.reference.trim();
    said.beneficiaryTaxRegistrationNo = "Taken from your tax certificate. Change it if it is wrong.";
  }
  if (!view.creditor.beneficiaryEmail.trim() && companyEmail.trim()) {
    values.beneficiaryEmail = companyEmail.trim();
    said.beneficiaryEmail = "Taken from your company's email. Change it if it is wrong.";
  }
  return { values, said };
}
