/**
 * Issuing a certificate (ADR 0022, ADR 0008): what the last signature checks before it numbers the certificate,
 * and the text it freezes. Pure.
 *
 * The text is the pinned revision's (OD-2 A), rendered in each language it has, with the certificate's bound
 * fields. A field the form names that is not a certificate's is refused; one with no value is refused, named:
 * a certificate never goes out with a blank where a figure belongs. The distribution list must resolve.
 *
 * Increment 2: the form's words are corrected by the typing corrections pinned with it (FR-CRT-010; never a merge
 * field or its value; the form code and revision stay the form's) and a cited term prints its canonical wording
 * (FR-CRT-011), both as frozen at the pin. The page's preview of a draft renders through `renderText`, the same
 * function, on the form as it stands, so the screen and the issue never word a text apart.
 */

import { renderWith, renderedText, type MergeWhitelist, type Rendered } from "@/lib/templates/merge";

import { applyCorrections, type Correction } from "./corrections";
import { certificateFieldLabel, mergeFields, type Lang } from "./fields";
import { formNeedFault } from "./form-needs";
import { w } from "./labels";
import type { TemplateRevision } from "./revision";
import { isTermField, termCodeOf, termValues, type FrozenTerm } from "./terms";
import type { CertificateKind, Finding } from "./types";

export interface FrozenText {
  language: Lang;
  text: string;
}

export function whitelistFor(kind: CertificateKind, terms: readonly FrozenTerm[] = []): MergeWhitelist {
  const keys = mergeFields(kind);
  const codes = new Set(terms.map((t) => t.code));
  return { has: (k) => keys.has(k) || (isTermField(k) && codes.has(termCodeOf(k))), label: (k) => (isTermField(k) ? `the term ${termCodeOf(k)}` : certificateFieldLabel(k)) };
}

/// One body in one language: corrected, then filled (terms included). Shared by the issue and the page's preview.
export function renderText(body: string, lang: Lang, kind: CertificateKind, values: Readonly<Record<string, string>>, corrections: readonly Correction[], terms: readonly FrozenTerm[]): Rendered & { corrected: string[]; applied: AppliedCorrection[] } {
  const c = applyCorrections(body, corrections);
  const r = renderWith(c.text, { ...termValues(terms, lang), ...values }, whitelistFor(kind, terms));
  return { ...r, corrected: c.applied.map((a) => a.fromText), applied: c.applied.map((a) => ({ ...(a.id ? { id: a.id } : {}), fromText: a.fromText, toText: a.toText })) };
}

/// A correction that changed a text's words: its record and its wrong and right wording (BD-614-26 as ruled).
export interface AppliedCorrection {
  id?: string;
  fromText: string;
  toText: string;
}

/// The corrections that applied across texts, each once, in the order first applied.
export const distinctApplied = (lists: readonly (readonly AppliedCorrection[])[]): AppliedCorrection[] => {
  const out: AppliedCorrection[] = [];
  for (const l of lists) for (const a of l) if (!out.some((x) => x.fromText === a.fromText)) out.push(a);
  return out;
};

/// The English text the pinned form has, why it cannot be issued (empty: it can), and how many corrections changed its words.
export function renderIssue(rev: TemplateRevision, kind: CertificateKind, values: (lang: Lang) => Record<string, string>, labelOf: (key: string) => string = certificateFieldLabel): { texts: FrozenText[]; faults: Finding[]; corrected: number; applied: AppliedCorrection[] } {
  const faults: Finding[] = [];
  const texts: FrozenText[] = [];
  // Founder, 2026-10-20: a new certificate is issued in English only. A stored Malay body is kept on the form and never issued.
  const bodies: [Lang, string | null][] = [["EN", rev.bodyEn]];
  const present = bodies.filter(([, b]) => b != null && b.trim() !== "");
  // FR-CRT-012: the one rule (form-needs.ts) decides a form with no text.
  const empty = formNeedFault({ id: rev.templateId, nameEn: rev.nameEn, bodyEn: rev.bodyEn, bodyMs: rev.bodyMs }, w("This certificate's form", "Borang perakuan ini"));
  if (empty || present.length === 0) {
    faults.push(empty ?? { code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form: rev.nameEn } });
    return { texts, faults, corrected: 0, applied: [] };
  }
  const unknown = new Set<string>();
  const missing = new Set<string>();
  const applied: AppliedCorrection[][] = [];
  for (const [lang, body] of present) {
    const r = renderText(body!, lang, kind, values(lang), rev.corrections ?? [], rev.terms ?? []);
    r.unknown.forEach((u) => unknown.add(u));
    r.missing.forEach((m) => missing.add(m));
    applied.push(r.applied);
    texts.push({ language: lang, text: renderedText(r) });
  }
  if (unknown.size) faults.push({ code: "UNKNOWN_FIELDS", level: "block", data: { form: rev.nameEn, fields: [...unknown].map((u) => `{{${u}}}`).join(", ") } });
  if (missing.size) faults.push({ code: "MISSING_FIELDS", level: "block", data: { fields: [...missing].map((k) => (isTermField(k) ? `the term ${termCodeOf(k)}` : labelOf(k))).join(", ") } });
  const all = distinctApplied(applied);
  return { texts, faults, corrected: all.length, applied: all };
}
