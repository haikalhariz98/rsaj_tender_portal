import type { Language } from "./language";

/**
 * The job title to show a person: the Malay one when Bahasa Malaysia is chosen and one is recorded, else the title as recorded. Nothing is
 * made up (NFR-LNG-001, ADR 0040): a blank Malay title is no title, so the English one stands.
 */
export function titleFor(title: { jobTitle: string | null; jobTitleMs?: string | null }, lang: Language): string | null {
  const ms = title.jobTitleMs?.trim();
  return lang === "ms" && ms ? ms : title.jobTitle;
}
