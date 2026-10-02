/**
 * Issuing a certificate (ADR 0022, ADR 0008): what the last signature checks before it numbers the certificate,
 * and the text it freezes. Pure.
 *
 * The text is the pinned revision's (OD-2 A), rendered in each language it has, with the certificate's bound
 * fields. A field the form names that is not a certificate's is refused; one with no value is refused, named:
 * a certificate never goes out with a blank where a figure belongs. The distribution list must resolve.
 */

import { renderWith, renderedText, type MergeWhitelist } from "@/lib/templates/merge";

import { certificateFieldLabel, mergeFields, type Lang } from "./fields";
import type { TemplateRevision } from "./revision";
import type { CertificateKind, Finding } from "./types";

export interface FrozenText {
  language: Lang;
  text: string;
}

export function whitelistFor(kind: CertificateKind): MergeWhitelist {
  const keys = mergeFields(kind);
  return { has: (k) => keys.has(k), label: (k) => certificateFieldLabel(k) };
}

/// The text in each language the pinned form has, and why it cannot be issued (empty: it can).
export function renderIssue(rev: TemplateRevision, kind: CertificateKind, values: (lang: Lang) => Record<string, string>, labelOf: (key: string) => string = certificateFieldLabel): { texts: FrozenText[]; faults: Finding[] } {
  const faults: Finding[] = [];
  const texts: FrozenText[] = [];
  const bodies: [Lang, string | null][] = [
    ["MS", rev.bodyMs],
    ["EN", rev.bodyEn],
  ];
  const present = bodies.filter(([, b]) => b != null && b.trim() !== "");
  if (present.length === 0) {
    faults.push({ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form: rev.nameEn } });
    return { texts, faults };
  }
  const wl = whitelistFor(kind);
  const unknown = new Set<string>();
  const missing = new Set<string>();
  for (const [lang, body] of present) {
    const r = renderWith(body!, values(lang), wl);
    r.unknown.forEach((u) => unknown.add(u));
    r.missing.forEach((m) => missing.add(m));
    texts.push({ language: lang, text: renderedText(r) });
  }
  if (unknown.size) faults.push({ code: "UNKNOWN_FIELDS", level: "block", data: { form: rev.nameEn, fields: [...unknown].map((u) => `{{${u}}}`).join(", ") } });
  if (missing.size) faults.push({ code: "MISSING_FIELDS", level: "block", data: { fields: [...missing].map(labelOf).join(", ") } });
  return { texts, faults };
}
