/**
 * 614b-C2: the oracle for the alias in-use check. The product reads which issued certificates still say an alias in the
 * database (`aliasInUse`, term-use.ts, with `wholeWordPattern`); this is the same rule read in memory with `wordAt`, kept
 * only so the tests can hold the database pattern to it (terms-parity.test.ts). Imported by tests only: a source scan
 * refuses an import of this file from anything in `src` that is not a test. Pure.
 */

import { normText, wordAt } from "./terms";

/// Code review BD-614-33: of the aliases an edit removes, those a frozen text still says (whole words), with the texts' labels.
export function removedAliasesInUse(removed: readonly string[], texts: readonly { label: string; text: string }[]): { alias: string; certificates: string[] }[] {
  return removed.map((alias) => ({ alias, certificates: texts.filter((t) => wordAt(normText(t.text), alias) >= 0).map((t) => t.label) })).filter((x) => x.certificates.length > 0);
}

/// Whether one frozen text says one alias as whole words, by the oracle's reading.
export const saysAlias = (text: string, alias: string): boolean => wordAt(normText(text), alias) >= 0;

/**
 * `wholeWordPattern` (a Postgres advanced regular expression) as a JavaScript RegExp, for the parity test: the only
 * translation is `[:alnum:]` → `\p{L}\p{N}` (Unicode letters and digits, `wordAt`'s boundary), with the `u` flag, and
 * `~*`'s case-insensitivity as the `i` flag. Every other character means the same in both dialects.
 */
export function jsPatternOf(pattern: string): RegExp {
  return new RegExp(pattern.replaceAll("[:alnum:]", "\\p{L}\\p{N}"), "iu");
}

/// The aliases the parity corpus is built around: dots, a plus, digits, accented letters, several words.
export const PARITY_ALIASES: readonly string[] = ["S.O.", "P.P.", "Pegawai Penguasa", "Tempoh Liabiliti Kecacatan", "café", "ÉTÉ", "a+b", "No. 2", "Klausa 1.2", "pp"];

/**
 * A generated corpus of frozen texts (NFC), deterministic from its seed: each alias, a near miss or another word, set
 * at the start, the middle or the end of a text, beside letters, accented letters, digits, punctuation, white space or
 * a non-breaking space, in its own case, upper case or lower case, and its words split by one or more spaces, a tab, a
 * newline or a non-breaking space. Texts that are not NFC are 614b-C1's carry and are not here.
 */
export function parityCorpus(seed = 614, size = 400): string[] {
  let x = seed >>> 0;
  const next = () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  const sides = ["", "", " ", "x", "É", "é", "9", ".", ",", "(", ")", "-", "_", " ", "\n", "ß"];
  const gaps = [" ", "  ", "\t", "\n", " ", "   "];
  const others = ["SO", "S.O", "P.P", "Pegawai", "Penguasa Pegawai", "cafe", "CAFÉS", "ETE", "a b", "No.2", "Klausa 1.20", "approved", "app", "S.O.S", "1S.O."];
  const out: string[] = [];
  for (let i = 0; i < size; i++) {
    const core = next() < 0.7 ? pick(PARITY_ALIASES) : pick(others);
    const cased = pick([(s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s.toLowerCase()])(core);
    const spaced = cased.split(" ").join(pick(gaps));
    const at = pick(["start", "middle", "end", "alone"]);
    const left = pick(sides);
    const right = pick(sides);
    const body = `${left}${spaced}${right}`;
    const text = at === "start" ? `${body} the officer certifies.` : at === "end" ? `Certified by the ${body}` : at === "middle" ? `The ${body} delegates the work.` : body;
    out.push(text.normalize("NFC"));
  }
  return out;
}
