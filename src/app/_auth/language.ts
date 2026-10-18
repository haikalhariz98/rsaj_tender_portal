import { cache } from "react";

import { effectiveLanguage, type Language, type LanguageChoice } from "@/lib/i18n/language";

import { currentStaffOrNull } from "./actor";

/**
 * The language this request's screens are read in (NFR-LNG-001, ADR 0040). `choice` is what the signed-in person stored, null when they never
 * chose (or nobody is signed in), and `language` is what to render: the choice, or English. Once per request, through the cached actor read.
 */
export const currentLanguage = cache(async (): Promise<{ choice: LanguageChoice; language: Language }> => {
  const actor = await currentStaffOrNull();
  const choice = actor?.uiLanguage ?? null;
  return { choice, language: effectiveLanguage(choice) };
});
