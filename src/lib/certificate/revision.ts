/**
 * The template revision a certificate is signed under (FR-CRT-001, OD-2 A): pinned at the first signature,
 * with the form's identity, its printed signature blocks and its distribution list as they stood. A draft
 * follows the latest form; once anyone has signed, the order and recipients they signed under cannot move,
 * and a later revision of the form never alters it (ADR 0008 keeps issued text frozen as well). Pure.
 */

import { fieldsNamed as namedIn } from "@/lib/templates/merge";

import type { Correction } from "./corrections";
import { fieldNeed } from "./fields";
import { inPrintedOrder, type PrintedField } from "./printed";
import { freezeTerms, isTermField, termCodesIn, termFaults, type FrozenTerm, type Term } from "./terms";
import type { Block, DistributionRow, Finding } from "./types";

export interface TemplateRevision {
  templateId: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  formCode: string;
  revisionDate: string | null;
  bodyVersion: number;
  /// The text as it stood at the pin: the certificate is issued in it, whatever the form says later.
  bodyEn: string | null;
  bodyMs: string | null;
  blocks: Block[];
  distribution: DistributionRow[];
  /// The organisation's day it was pinned.
  pinnedOn: string;
  /// 6.14 increment 2: the printed form's page count and fields (label pairs, bindings), and the typing corrections
  /// and terms its text is rendered with, frozen with it (OD-2 A). Absent on a form pinned before increment 2: none.
  pageCount?: number | null;
  fields?: PrintedField[];
  corrections?: Correction[];
  terms?: FrozenTerm[];
}

export interface TemplateNow {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  formCode: string;
  revisionDate: string | null;
  bodyVersion: number;
  bodyEn: string | null;
  bodyMs: string | null;
  blocks: readonly Block[];
  distribution: readonly DistributionRow[];
  /// 6.14 increment 2: the printed form, the corrections that apply to this form, and the organisation's terms.
  /// Optional: a form read without them has none.
  pageCount?: number | null;
  fields?: readonly PrintedField[];
  corrections?: readonly Correction[];
  terms?: readonly Term[];
}

/// The revision to pin from the form as it stands, blocks in printed order and rows in list order.
export function pinRevision(t: TemplateNow, pinnedOn: string): TemplateRevision {
  return {
    templateId: t.id,
    code: t.code,
    nameEn: t.nameEn,
    nameMs: t.nameMs,
    formCode: t.formCode,
    revisionDate: t.revisionDate,
    bodyVersion: t.bodyVersion,
    bodyEn: t.bodyEn,
    bodyMs: t.bodyMs,
    blocks: [...t.blocks].sort((a, b) => a.blockOrder - b.blockOrder).map((b) => ({ ...b })),
    distribution: [...t.distribution].sort((a, b) => a.sortOrder - b.sortOrder || a.recipientCode.localeCompare(b.recipientCode)).map((d) => ({ ...d })),
    pinnedOn,
    pageCount: t.pageCount ?? null,
    fields: inPrintedOrder(t.fields ?? []).map((f) => ({ ...f })),
    // In a fixed order, so two pins of one list are equal; the order never changes the text (corrections.ts).
    corrections: [...(t.corrections ?? [])].sort((a, b) => (a.fromText < b.fromText ? -1 : a.fromText > b.fromText ? 1 : 0)).map((c) => ({ fromText: c.fromText, toText: c.toText })),
    terms: freezeTerms(termCodesIn([t.bodyEn, t.bodyMs].flatMap((b) => namedIn(b))), t.terms ?? []),
  };
}

/**
 * Why a form cannot be pinned (the first signature refuses): no form chosen; no blocks; a block whose
 * delegation answer is not decided; no distribution list; no text; a text naming a field a certificate of
 * this kind does not fill. Each is the form's configuration as it stands, so each is put right under
 * Configuration › Templates before anyone signs. Checked here so that nothing undecided is ever pinned: a
 * pinned revision is never edited, so a gap frozen into it would have no exit but voiding the certificate.
 */
export function pinFaults(t: TemplateNow | null, allowed: ReadonlySet<string>, fieldsNamed: (body: string) => string[]): Finding[] {
  if (!t) return [{ code: "TEMPLATE_NOT_SET", level: "block" }];
  const out: Finding[] = [];
  const form = t.nameEn;
  if (t.blocks.length === 0) out.push({ code: "NO_BLOCKS", level: "block", data: { form } });
  for (const b of [...t.blocks].sort((a, c) => a.blockOrder - c.blockOrder)) if (b.delegable == null) out.push({ code: "DELEGABLE_UNDECIDED", level: "block", data: { form, block: b.labelEn } });
  if (t.distribution.length === 0) out.push({ code: "NO_DISTRIBUTION_LIST", level: "block", data: { form } });
  const bodies = [t.bodyEn, t.bodyMs].filter((b): b is string => b != null && b.trim() !== "");
  if (bodies.length === 0) out.push({ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form } });
  // A term ({{term:code}}, increment 2) is judged by the terms configured, not the kind's field list.
  const unknown = [...new Set(bodies.flatMap(fieldsNamed))].filter((k) => !allowed.has(k) && !isTermField(k));
  if (unknown.length) out.push({ code: "UNKNOWN_FIELDS", level: "block", data: { form, fields: unknown.map((u) => `{{${u}}}`).join(", ") } });
  const texts = ([["EN", t.bodyEn], ["MS", t.bodyMs]] as const).filter(([, b]) => b != null && b.trim() !== "").map(([lang, b]) => ({ lang, fields: fieldsNamed(b!) }));
  out.push(...termFaults(texts, t.terms ?? [], form));
  return out;
}

/// What the certificate brings to the pin: the values its form's fields would be filled from at issue.
export interface PinContext {
  /// The pinned baseline version's Contract Date. Null: the version holds none (before execution).
  contractDate: string | null;
  /// The certificate's frozen figures, as they will be issued (overrides applied). Null: it carries none.
  figures: readonly { key: string; value: string | null }[] | null;
}

/**
 * Why a form, whole and decided, could still never issue on this certificate (6.14 inc 1 fix M-2): its text
 * names a field that would have no value at issue. A pinned revision is never edited and the figures and the
 * baseline version are frozen by then, so such a gap would leave the certificate no exit but voiding; it is
 * refused at the first signature instead, naming the field. The rule is the field's `fieldNeed`, so a figure
 * field (once 6.13 lists them) is held to its frozen value the same way.
 */
export function unfillableFaults(t: TemplateNow, ctx: PinContext, allowed: ReadonlySet<string>, fieldsNamed: (body: string) => string[]): Finding[] {
  const bodies = [t.bodyEn, t.bodyMs].filter((b): b is string => b != null && b.trim() !== "");
  // A field the certificate does not fill at all is UNKNOWN_FIELDS's (pinFaults), not this rule's.
  // Increment 2: a printed field bound to a value is held to it as a field the text names is.
  const printed = (t.fields ?? []).filter((f) => f.bound && f.computedKey).map((f) => f.computedKey!);
  const named = [...new Set([...bodies.flatMap(fieldsNamed), ...printed])].filter((k) => allowed.has(k));
  const out: Finding[] = [];
  const form = t.nameEn;
  const noValue: string[] = [];
  for (const k of named) {
    const n = fieldNeed(k);
    if (n.need === "DATING_BLOCK" && !t.blocks.some((b) => b.datesCertificate)) out.push({ code: "DATE_FIELD_NO_DATING_BLOCK", level: "block", data: { form } });
    if (n.need === "BASELINE" && ctx[n.key] == null) noValue.push(`{{${k}}}`);
    if (n.need === "FIGURE" && !ctx.figures?.some((f) => f.key === n.key && f.value != null && f.value !== "")) noValue.push(`{{${k}}}`);
  }
  if (noValue.length) out.push({ code: "FIELD_NO_VALUE", level: "block", data: { form, fields: noValue.join(", ") } });
  return out;
}

/// Everything the first signature refuses a form for: the form's own gaps, then a field it could never fill.
export function pinRefusals(t: TemplateNow | null, allowed: ReadonlySet<string>, fieldsNamed: (body: string) => string[], ctx: PinContext): Finding[] {
  const own = pinFaults(t, allowed, fieldsNamed);
  return t ? [...own, ...unfillableFaults(t, ctx, allowed, fieldsNamed)] : own;
}

/// A pinned revision read back from JSON, or null.
export function readRevision(json: unknown): TemplateRevision | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Partial<TemplateRevision>;
  if (typeof r.templateId !== "string" || !Array.isArray(r.blocks) || !Array.isArray(r.distribution)) return null;
  return r as TemplateRevision;
}
