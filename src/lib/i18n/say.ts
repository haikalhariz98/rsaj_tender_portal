/**
 * Words to a string. English only (founder, 2026-10-19; supersedes ADR 0040): `say` returns the English and takes the language argument only
 * so existing call sites compile. Built over the one pair shape, `Words` (`@/lib/contract/labels`): there is no string-key lookup, so a key
 * cannot reach a screen by construction. A pair with no English is a defect, and `say` refuses it by name rather than render a blank.
 */

import type { Words } from "@/lib/contract/labels";

import type { Language } from "./language";

/** A pair that cannot be rendered: its English is blank, so there is nothing to fall back to. */
export class BlankWordsError extends Error {
  readonly rule = "WORDS_ENGLISH_REQUIRED";
  constructor(readonly words: Words) {
    super(`A word pair has no English, so it cannot be shown.`);
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

/** The text of a pair. Never "", never a key. */
export function say(words: Words, lang?: Language): string {
  void lang;
  if (blank(words.en)) throw new BlankWordsError(words);
  return words.en;
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * A sentence with values: the template for the language (with the same Malay fallback as `say`), each
 * {name} replaced in one pass, so a value that itself holds "{x}" is never read as a placeholder. A missing
 * value throws in every environment: a "{name}" left on screen would be a key on screen. Values the template
 * does not name are ignored.
 */
export function sayWith(words: Words, lang: Language | undefined, values: Readonly<Record<string, string>>): string {
  const template = say(words, lang);
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new MissingPlaceholderError(name, template);
    return values[name];
  });
}
