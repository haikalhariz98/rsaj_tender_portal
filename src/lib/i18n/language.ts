/**
 * The languages a staff screen can be read in (NFR-LNG-001, ADR 0040). The stored choice is nullable:
 * null means the person never chose, which reads English, as before the choice existed, and the screen says
 * so rather than passing the default off as a choice.
 */

export const LANGUAGES = ["en", "ms"] as const;
export type Language = (typeof LANGUAGES)[number];

/** As stored: null = never chosen (reads English, and says so). */
export type LanguageChoice = Language | null;

/**
 * A language as a form sends it. Hand validation (no schema library): anything but exactly "en" or "ms" is
 * refused, including "", the stored spellings "EN" and "MS", a file, and an absent field.
 */
export function parseLanguageChoice(raw: FormDataEntryValue | null): { ok: true; value: Language } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  return (LANGUAGES as readonly string[]).includes(raw) ? { ok: true, value: raw as Language } : { ok: false };
}

/** The language a screen renders in: the choice, or English when none was made. */
export function effectiveLanguage(choice: LanguageChoice | undefined): Language {
  return choice ?? "en";
}

/** Each language's own name, the same in both settings (a proper name, not a translated word). */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: "English", ms: "Bahasa Malaysia" };

/** The database enum's spelling (`UiLanguage`). */
export function toStored(l: Language): "EN" | "MS" {
  return l === "ms" ? "MS" : "EN";
}

/** The stored spelling back to a choice; null stays null (never chosen). */
export function fromStored(v: "EN" | "MS" | null): LanguageChoice {
  if (v === null) return null;
  return v === "MS" ? "ms" : "en";
}
