/**
 * The restriction stamp (FR-DOC-009; SK001 7.3.2): where the tender is restricted, every
 * document the portal generates for it carries the stamp, clearly, at its head. The
 * restriction's wording and the stamp's words are the customer's configuration
 * (`TenderDocumentPolicy`), never a literal here (6.4 condition). Recording the answer on the
 * exercise is what 6.5 enforces at sale; at bid submission it is 6.7's (paper) and 6.15's
 * (electronic). Unanswered is not "unrestricted". Pure.
 */

import type { DocumentLanguage, Finding, PackPartFacts } from "./types";

export type RestrictionFault = "RESTRICTION_NOT_ANSWERED" | "STAMP_NOT_SET" | "UPLOADS_NOT_STAMPED";

export interface StampWords {
  EN: string | null;
  MS: string | null;
}

/// The languages the portal will generate the pack's documents in: each ready template part's languages; the bill and the Appendix in English.
export function generatedLanguages(parts: readonly PackPartFacts[]): DocumentLanguage[] {
  const out = new Set<DocumentLanguage>();
  for (const p of parts) {
    if (p.state !== "READY") continue;
    if (p.source === "TEMPLATE" && p.template) {
      if (p.template.bodyEn?.trim()) out.add("EN");
      if (p.template.bodyMs?.trim()) out.add("MS");
    } else if (p.source === "BQ_UNPRICED" || p.source === "APPENDIX") out.add("EN");
  }
  return (["MS", "EN"] as const).filter((l) => out.has(l));
}

/**
 * What submission needs of the restriction: the question answered; where restricted, the
 * stamp's words configured in every language a document is generated in. An uploaded part's
 * file is not generated here and cannot be stamped by the portal: a warning that it must
 * carry the stamp itself.
 */
export function restrictionFaults(i: { restricted: boolean | null; stamp: StampWords; parts: readonly PackPartFacts[] }): Finding<RestrictionFault>[] {
  if (i.restricted == null) return [{ code: "RESTRICTION_NOT_ANSWERED", level: "block" }];
  if (!i.restricted) return [];
  const out: Finding<RestrictionFault>[] = [];
  for (const lang of generatedLanguages(i.parts)) if (!i.stamp[lang]?.trim()) out.push({ code: "STAMP_NOT_SET", level: "block", data: { language: lang === "MS" ? "Malay" : "English" } });
  const uploads = i.parts.filter((p) => p.source === "UPLOAD" && p.state === "READY").length;
  if (uploads) out.push({ code: "UPLOADS_NOT_STAMPED", level: "warn", data: { count: uploads } });
  return out;
}

/// The stamp in each language where the tender is restricted; null where it is not.
export const stampFor = (restricted: boolean | null, stamp: StampWords): StampWords | null => (restricted === true ? stamp : null);

/// A generated document's text with the stamp at its head, as the first paragraph.
export function stamped(text: string, stamp: string | null | undefined): string {
  return stamp?.trim() ? `${stamp.trim()}\n\n${text}` : text;
}
