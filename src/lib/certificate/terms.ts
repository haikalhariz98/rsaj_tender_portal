/**
 * Terms and their aliases (6.14 increment 2, FR-CRT-011): one canonical wording per concept, with the variants
 * the source documents use kept for search. Pure. Ships empty: the glossary is the customer's.
 *
 * - A form cites a term as `{{term:<code>}}`; the certificate prints the term's canonical wording in the text's
 *   language. A term with no wording in that language is refused when the form is pinned, naming it, never
 *   printed blank. The wording is frozen with the form at the first signature (OD-2 A), so a later change to the
 *   glossary never alters a certificate being signed or issued.
 * - A search for any variant (the canonical wording in either language, or an alias) finds what any other variant
 *   finds: `searchVariants` gives the query as typed plus the query with that variant swapped for each other one.
 *   Matching ignores letter case.
 */

import type { Finding } from "./types";

export const TERM_PREFIX = "term:";
export const isTermField = (key: string): boolean => key.startsWith(TERM_PREFIX);
export const termCodeOf = (key: string): string => key.slice(TERM_PREFIX.length);

export interface Term {
  code: string;
  canonicalEn: string | null;
  canonicalMs: string | null;
  aliases: readonly string[];
}

/// A term's wording as frozen with a pinned form.
export interface FrozenTerm {
  code: string;
  en: string | null;
  ms: string | null;
}

/// The term codes a body names, each once, in the order first named.
export const termCodesIn = (fields: readonly string[]): string[] => [...new Set(fields.filter(isTermField).map(termCodeOf))];

/// The terms to freeze with a pinned form: those its texts cite that are configured, in the order cited.
export function freezeTerms(cited: readonly string[], terms: readonly Term[]): FrozenTerm[] {
  return cited.flatMap((code) => {
    const t = terms.find((x) => x.code === code);
    return t ? [{ code, en: t.canonicalEn, ms: t.canonicalMs }] : [];
  });
}

/// The merge values of the cited terms in one language: empty where the term has no wording in it.
export function termValues(terms: readonly FrozenTerm[], lang: "EN" | "MS"): Record<string, string> {
  return Object.fromEntries(terms.map((t) => [`${TERM_PREFIX}${t.code}`, (lang === "MS" ? t.ms : t.en) ?? ""]));
}

/**
 * Why a form's texts cannot be pinned for their terms: a cited term that is not configured (UNKNOWN_TERM), or one
 * with no wording in the language of a text that cites it (TERM_NO_WORDING).
 */
export function termFaults(texts: readonly { lang: "EN" | "MS"; fields: readonly string[] }[], terms: readonly Term[], form: string): Finding[] {
  const unknown = new Set<string>();
  const noWording: string[] = [];
  for (const t of texts) {
    for (const code of termCodesIn(t.fields)) {
      const term = terms.find((x) => x.code === code);
      if (!term) unknown.add(code);
      else if (!(t.lang === "MS" ? term.canonicalMs : term.canonicalEn)?.trim()) noWording.push(`${code} (${t.lang === "MS" ? "Malay" : "English"})`);
    }
  }
  const out: Finding[] = [];
  if (unknown.size) out.push({ code: "UNKNOWN_TERM", level: "block", data: { form, terms: [...unknown].join(", ") } });
  if (noWording.length) out.push({ code: "TERM_NO_WORDING", level: "block", data: { form, terms: [...new Set(noWording)].join(", ") } });
  return out;
}

const CODE = /^[a-z][a-z0-9_]*$/;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

/// Every wording of a term: its canonical wordings and its aliases.
export const variantsOf = (t: Pick<Term, "canonicalEn" | "canonicalMs" | "aliases">): string[] => [t.canonicalEn, t.canonicalMs, ...t.aliases].filter((v): v is string => !!v && v.trim() !== "");

/**
 * Why a term cannot be saved, against the organisation's others (`others` excludes the one being edited): a code in
 * small letters, digits and underscores; at least one canonical wording; and no wording (canonical or alias) that is
 * also another term's, which would make a search for it ambiguous. An alias equal to the term's own canonical
 * wording is refused as pointless.
 */
export function termSaveFaults(t: Term, others: readonly Term[]): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!CODE.test(t.code)) f("TERM_CODE");
  if (others.some((o) => o.code === t.code)) f("TERM_CODE_TAKEN");
  if (!t.canonicalEn?.trim() && !t.canonicalMs?.trim()) f("TERM_CANONICAL_REQUIRED");
  const canon = [t.canonicalEn, t.canonicalMs].filter((v): v is string => !!v?.trim()).map(norm);
  const aliases = t.aliases.map(norm);
  if (aliases.some((a) => a === "")) f("TERM_ALIAS_EMPTY");
  if (aliases.some((a) => canon.includes(a))) f("TERM_ALIAS_IS_CANONICAL");
  if (new Set(aliases).size !== aliases.length) f("TERM_ALIAS_REPEATED");
  const mine = new Set([...canon, ...aliases].filter(Boolean));
  const clash = others.find((o) => variantsOf(o).some((v) => mine.has(norm(v))));
  if (clash) f("TERM_WORDING_TAKEN", { term: clash.code });
  return out;
}

export const SEARCH_VARIANTS_MAX = 12;

/// Text as compared: Unicode-normalised (NFC), whitespace collapsed.
const normText = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where a wording stands in a text as whole words (code review S-2): not inside a longer word, on Unicode letter and
 * digit boundaries, letter case ignored. -1: not there.
 */
export function wordAt(text: string, wording: string): number {
  const v = normText(wording);
  if (!v) return -1;
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, "iu").exec(text);
  return m ? m.index : -1;
}

/**
 * The searches a query stands for: the query as typed, then, for each term with a wording found in the query as whole
 * words (any letter case), the query with that wording swapped for each of the term's other wordings. Terms are taken
 * in code order and the list is capped at SEARCH_VARIANTS_MAX, the query as typed always first. With no term the query
 * stands alone.
 */
export function searchVariants(query: string, terms: readonly Term[]): string[] {
  const q = normText(query);
  if (!q) return [];
  const out: string[] = [q];
  for (const t of [...terms].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))) {
    const vs = variantsOf(t).map(normText);
    // The longest wording found wins, so "Tempoh Liabiliti Kecacatan" is swapped whole, not a shorter alias inside it.
    const found = [...vs].sort((a, b) => b.length - a.length).find((v) => wordAt(q, v) >= 0);
    if (!found) continue;
    const at = wordAt(q, found);
    for (const v of vs) {
      if (v.toLocaleLowerCase("en") === found.toLocaleLowerCase("en")) continue;
      const swapped = q.slice(0, at) + v + q.slice(at + found.length);
      if (!out.some((o) => o.toLocaleLowerCase("en") === swapped.toLocaleLowerCase("en"))) out.push(swapped);
      if (out.length >= SEARCH_VARIANTS_MAX) return out;
    }
  }
  return out;
}

/**
 * BD-614-33 as ruled: a term's wording changed keeps each replaced wording (per language) as an alias of the same
 * term, so frozen text in the old wording is still found by the term's other wordings (FR-CRT-011, ADR 0008). The
 * aliases after the edit: those given, plus each replaced canonical wording not already a wording of the term.
 */
export function aliasesKeeping(before: Pick<Term, "canonicalEn" | "canonicalMs"> | null, after: Term): string[] {
  const out = [...after.aliases];
  if (!before) return out;
  const has = (v: string) => [after.canonicalEn, after.canonicalMs, ...out].some((x) => x != null && norm(x) === norm(v));
  for (const old of [before.canonicalEn, before.canonicalMs]) if (old?.trim() && !has(old)) out.push(old.trim());
  return out;
}

/// Code review BD-614-33: of the aliases an edit removes, those an issued certificate's frozen text still says (whole words).
export function removedAliasesInUse(removed: readonly string[], texts: readonly { label: string; text: string }[]): { alias: string; certificates: string[] }[] {
  return removed.map((alias) => ({ alias, certificates: texts.filter((t) => wordAt(normText(t.text), alias) >= 0).map((t) => t.label) })).filter((x) => x.certificates.length > 0);
}
