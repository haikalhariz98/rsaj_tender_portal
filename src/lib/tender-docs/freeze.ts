/**
 * What submitting a pack freezes (ADR 0013, ADR 0008 shape): each part's text as it goes
 * to approval, and a manifest of what it was made from. A template part is rendered from
 * its body version with the pack's merge fields, in each language it has text in; the bill
 * part is 6.2's bill unpriced (OD-8: no rate, no amount, no total); the Appendix part is
 * the Appendix as entered; an uploaded part pins the document versions attached to it. An
 * omitted part keeps its reason. Nothing frozen is ever re-rendered. Pure.
 */

import { formatSen } from "@/lib/money";
import { unpricedBq, type FrozenBq } from "@/lib/scope/bq";
import { ITEM_KIND_LABEL } from "@/lib/scope/labels";
import { renderedText, renderWith, type MergeWhitelist } from "@/lib/templates/merge";

import { APPENDIX_FIELD_LABEL, type AppendixFacts } from "./appendix";
import { clausesCited, type ClauseFacts } from "./clauses";
import { PACK_WHITELIST } from "./fields";
import { NOT_SET, periodText } from "./labels";
import { formatPct } from "./percent";
import { stamped, type StampWords } from "./stamp";
import type { DocumentLanguage, PackPartFacts, PackPartState, PartRole, PartSource } from "./types";

export interface PinnedFile {
  versionId: string;
  documentId: string;
  versionNo: number;
  sha256: string;
  title: string;
}

export interface ManifestEntry {
  partCode: string;
  printedNumber: string;
  label: string;
  role: PartRole;
  source: PartSource;
  state: PackPartState;
  omittedReason: string | null;
  inTableDocument: boolean | null;
  template: { id: string; code: string; name: string; bodyVersion: number } | null;
  bill: { versionId: string; versionNo: number } | null;
  appendixId: string | null;
  files: PinnedFile[];
  /// Increment 2: the clauses a template part cites, at the text version frozen; absent before increment 2.
  clauses?: { code: string; title: string; bodyVersion: number }[];
  /// Increment 2: whether the portal stamped the part's generated text with the restriction (FR-DOC-009).
  stamped?: boolean;
}

export interface FrozenDocument {
  partCode: string;
  source: PartSource;
  templateId: string | null;
  templateCode: string | null;
  templateName: string | null;
  templateFormCode: string;
  templateRevisionDate: string | null;
  templateBodyVersion: number | null;
  language: DocumentLanguage;
  fields: Record<string, unknown>;
  renderedText: string;
}

/// The bill as tenderers receive it: sections and lines, quantities and units, no rate, amount or total.
export function unpricedBqText(frozen: FrozenBq): string {
  const bill = unpricedBq(frozen);
  const lines = [`Bill of quantities, version ${bill.versionNo}`];
  for (const s of bill.sections) {
    lines.push("", `Section ${s.number}: ${s.title}`);
    for (const i of s.items) {
      const kind = i.kind === "MEASURED" ? (i.provisional ? " (provisional quantity)" : "") : ` (${ITEM_KIND_LABEL[i.kind].toLowerCase()})`;
      lines.push(`${i.itemRef || "-"}  ${i.description}: ${i.quantity ?? "quantity not stated"} ${i.unit}${kind}`);
    }
  }
  return lines.join("\n");
}

const money = (s: bigint | null) => (s == null ? NOT_SET : formatSen(s));

/// The Appendix as entered, in words. `office(code)` names an office or committee by its code.
export function appendixText(a: AppendixFacts, office: (code: string | null) => string): string {
  const L = APPENDIX_FIELD_LABEL;
  const lad = (kind: AppendixFacts["ladKind"], amount: bigint | null, pct: string | null) =>
    kind == null ? NOT_SET : kind === "AMOUNT_PER_DAY" ? (amount == null ? NOT_SET : `${formatSen(amount)} a day`) : pct == null ? NOT_SET : `${formatPct(pct)} of the contract sum a day, fixed at award`;
  const uplift =
    a.worksInsuranceUpliftKind == null
      ? NOT_SET
      : a.worksInsuranceUpliftKind === "AMOUNT"
        ? money(a.worksInsuranceUpliftAmount)
        : (a.worksInsuranceUpliftPct == null ? NOT_SET : `${formatPct(a.worksInsuranceUpliftPct)} of the contract sum`);
  const lines = [
    "Appendix to the Conditions of Contract",
    `${L.ladOfficerRoleCode}: ${office(a.ladOfficerRoleCode)}`,
    `${L.eotOfficerRoleCode}: ${office(a.eotOfficerRoleCode)}`,
    `${L.terminationOfficerRoleCode}: ${office(a.terminationOfficerRoleCode)}`,
    `${L.warRiskOfficerRoleCode}: ${office(a.warRiskOfficerRoleCode)}`,
    `${L.arbitrationOfficerRoleCode}: ${office(a.arbitrationOfficerRoleCode)}`,
    `${L.variationLimits}: ${a.variationLimits.length ? a.variationLimits.map((v) => `${v.label}, up to ${money(v.limit)}`).join("; ") : NOT_SET}`,
    `${L.pcSumWorksApply}: ${a.pcSumWorksApply == null ? NOT_SET : a.pcSumWorksApply ? a.pcSumWorksText || "Yes" : "None"}`,
    `${L.tplMinimum}: ${money(a.tplMinimum)}`,
    `${L.wcMinimum}: ${money(a.wcMinimum)}`,
    `${L.worksInsuranceUpliftKind}: ${uplift}`,
    `${L.insuranceExcess}: ${money(a.insuranceExcess)}`,
    `Liquidated damages: ${lad(a.ladKind, a.ladAmount, a.ladPct)}`,
    `${L.sectionalCompletion}: ${a.sectionalCompletion == null ? NOT_SET : a.sectionalCompletion ? "Applies" : "Does not apply"}`,
    ...(a.sectionalCompletion ? a.sections.map((s) => `  ${s.description}: ${lad(s.ladKind, s.ladAmount, s.ladPct)}`) : []),
    `${L.dlpApplies}: ${a.dlpApplies == null ? NOT_SET : a.dlpApplies ? (a.dlpMonths == null ? NOT_SET : periodText(a.dlpMonths, 0)) : "Does not apply"}`,
    `${L.firstInterimMinimum}: ${money(a.firstInterimMinimum)}`,
    `${L.subsequentInterimMinimum}: ${money(a.subsequentInterimMinimum)}`,
    `${L.honourCertificateDays}: ${a.honourCertificateDays == null ? NOT_SET : `${a.honourCertificateDays} days`}`,
  ];
  return lines.join("\n");
}

export interface FreezeInput {
  parts: readonly (PackPartFacts & { files: readonly PinnedFile[] })[];
  /// The pack's merge fields' values (`packFieldValues`).
  fields: Readonly<Record<string, string>>;
  /// The finalised bill, where the pack issues one.
  bill: { versionId: string; frozen: FrozenBq } | null;
  appendix: { id: string; facts: AppendixFacts; text: string } | null;
  /// Increment 2: the fields' values that differ by language (eligibility words, clause text), over `fields`.
  fieldsByLanguage?: Partial<Record<DocumentLanguage, Readonly<Record<string, string>>>>;
  /// The merge fields a template may name (`packWhitelist`); absent: the pack's only.
  whitelist?: MergeWhitelist;
  /// The restriction stamp by language where the tender is restricted (FR-DOC-009); absent or null: not restricted.
  stamp?: StampWords | null;
  /// The live clauses, for the manifest's record of what each part cites.
  clauses?: readonly ClauseFacts[];
}

/**
 * The documents and the manifest a submission freezes. Called only on a pack whose
 * `submitFaults` are clear: a template part has text, the bill is finalised, the Appendix
 * is complete, an uploaded part has its file.
 */
export function freezePack(i: FreezeInput): { documents: FrozenDocument[]; manifest: ManifestEntry[] } {
  const documents: FrozenDocument[] = [];
  const manifest: ManifestEntry[] = [];
  for (const p of i.parts) {
    const ready = p.state === "READY";
    manifest.push({
      partCode: p.partCode,
      printedNumber: p.printedNumber,
      label: p.label,
      role: p.role,
      source: p.source,
      state: p.state,
      omittedReason: p.state === "OMITTED" ? p.omittedReason : null,
      inTableDocument: p.inTableDocument,
      template: ready && p.source === "TEMPLATE" && p.template ? { id: p.template.id, code: p.template.code, name: p.template.nameEn, bodyVersion: p.template.bodyVersion } : null,
      bill: ready && p.source === "BQ_UNPRICED" && i.bill ? { versionId: i.bill.versionId, versionNo: i.bill.frozen.versionNo } : null,
      appendixId: ready && p.source === "APPENDIX" && i.appendix ? i.appendix.id : null,
      files: ready && p.source === "UPLOAD" ? [...p.files] : [],
      ...(i.clauses ? { clauses: ready && p.source === "TEMPLATE" ? clausesCited(p, i.clauses) : [] } : {}),
      ...(i.stamp !== undefined ? { stamped: !!i.stamp && ready && p.source !== "UPLOAD" } : {}),
    });
    if (!ready) continue;
    const base = { partCode: p.partCode, source: p.source, templateId: null, templateCode: null, templateName: null, templateFormCode: "", templateRevisionDate: null, templateBodyVersion: null };
    if (p.source === "TEMPLATE" && p.template) {
      const t = p.template;
      // Founder, 2026-10-20: English only for every new pack. A pack frozen before keeps the documents it froze.
      for (const language of ["EN"] as const) {
        const body = t.bodyEn;
        if (!body?.trim()) continue;
        const fields = { ...i.fields, ...(i.fieldsByLanguage?.[language] ?? {}) };
        documents.push({
          ...base,
          templateId: t.id,
          templateCode: t.code,
          templateName: t.nameEn,
          templateFormCode: t.formCode,
          templateRevisionDate: t.revisionDate,
          templateBodyVersion: t.bodyVersion,
          language,
          fields,
          renderedText: stamped(renderedText(renderWith(body, fields, i.whitelist ?? PACK_WHITELIST)), i.stamp?.[language]),
        });
      }
    } else if (p.source === "BQ_UNPRICED" && i.bill) {
      documents.push({ ...base, language: "EN", fields: { bill: unpricedBq(i.bill.frozen) }, renderedText: stamped(unpricedBqText(i.bill.frozen), i.stamp?.EN) });
    } else if (p.source === "APPENDIX" && i.appendix) {
      documents.push({ ...base, language: "EN", fields: { appendixId: i.appendix.id }, renderedText: stamped(i.appendix.text, i.stamp?.EN) });
    }
  }
  return { documents, manifest };
}

/**
 * The approved pack's manifest, as a later module reads it (FR-CTE-007's tender
 * documents constituent, for 6.6): read-only, from the frozen record only. Null where the
 * pack was never frozen or the record is not a manifest.
 */
export function packManifest(stored: unknown): ManifestEntry[] | null {
  if (!Array.isArray(stored)) return null;
  const ok = stored.every((e) => e && typeof e === "object" && typeof (e as ManifestEntry).partCode === "string" && Array.isArray((e as ManifestEntry).files));
  return ok ? (stored as ManifestEntry[]) : null;
}

/**
 * The Tender Table Document (FR-DOC-010, the part 6.4 builds): the frozen pack's parts that
 * are in it, ready, in print order. Its publication window is 6.5's and its inspection log
 * arrives with sign-in; this says only what it holds.
 */
export function tableDocumentManifest(manifest: readonly ManifestEntry[] | null): ManifestEntry[] {
  return (manifest ?? []).filter((m) => m.inTableDocument === true && m.state === "READY");
}
