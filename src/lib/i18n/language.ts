/**
 * The staff screens read in English only. Founder, 2026-10-19: "remove the Malay translation work, only English needed in the system"
 * (supersedes ADR 0040; NFR-LNG-001 is a departure RSAJ must accept before go-live, see the backlog).
 *
 * `Language` stays as a one-member type so the many `say(words, lang)` calls keep compiling while the call sites are tidied; nothing is
 * chosen, stored or switched. `StaffAccount.uiLanguage` is no longer read or written; the column is kept so no data is deleted.
 */

export const LANGUAGES = ["en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The one language every screen is read in. */
export const ENGLISH: Language = "en";

/** The stored spellings of the retired display-language setting, read in words for the audit trail's History (old rows still hold them). */
export const STAFF_LANGUAGE_VALUE_WORDS: Readonly<Record<string, string>> = {
  EN: "English",
  MS: "Bahasa Malaysia",
};
