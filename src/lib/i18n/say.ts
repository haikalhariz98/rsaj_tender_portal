/**
 * Words to a string, in a language (NFR-LNG-001, ADR 0040). Built over the one pair shape, `Words`
 * (`@/lib/contract/labels`): there is no string-key lookup, so a key cannot reach a screen by construction.
 *
 * A pair with no Malay (blank or whitespace) renders its English; the registry lists every such pair for
 * review. A pair with no English either is a defect, and `say` refuses it by name rather than render a blank.
 */

import type { Words } from "@/lib/contract/labels";

import type { Language } from "./language";

/** A pair that cannot be rendered: its English is blank, so there is nothing to fall back to. */
export class BlankWordsError extends Error {
  readonly rule = "WORDS_ENGLISH_REQUIRED";
  constructor(readonly words: Words) {
    super(`A word pair has no English, so it cannot be shown in any language (ms: ${JSON.stringify(words.ms)}).`);
    this.name = "BlankWordsError";
  }
}

/** A sentence's placeholder with no value given. */
export class MissingPlaceholderError extends Error {
  readonly rule = "PLACEHOLDER_VALUE_REQUIRED";
  constructor(
    readonly placeholder: string,
    readonly template: string,
  ) {
    super(`No value was given for {${placeholder}} in ${JSON.stringify(template)}.`);
    this.name = "MissingPlaceholderError";
  }
}

const blank = (s: string) => s.trim() === "";

/** Whether a pair has Malay to show (a blank or whitespace `ms` does not count). */
export function hasMalay(words: Words): boolean {
  return !blank(words.ms);
}

/** The text for a language: Malay when it is there, else English. Never "", never a key. */
export function say(words: Words, lang: Language): string {
  if (blank(words.en)) throw new BlankWordsError(words);
  return lang === "ms" && hasMalay(words) ? words.ms : words.en;
}

/** The explicit "no Malay yet": renders English, and the registry's untranslated list names it. */
export function enOnly(en: string): Words {
  if (blank(en)) throw new BlankWordsError({ en, ms: "" });
  return { en, ms: "" };
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * A sentence with values: the template for the language (with the same Malay fallback as `say`), each
 * {name} replaced in one pass, so a value that itself holds "{x}" is never read as a placeholder. A missing
 * value throws in every environment: a "{name}" left on screen would be a key on screen. Values the template
 * does not name are ignored.
 */
export function sayWith(words: Words, lang: Language, values: Readonly<Record<string, string>>): string {
  const template = say(words, lang);
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new MissingPlaceholderError(name, template);
    return values[name];
  });
}
