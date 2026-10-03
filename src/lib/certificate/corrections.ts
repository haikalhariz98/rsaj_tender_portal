/**
 * Text corrections (6.14 increment 2, FR-CRT-010): a known typing error in a controlled form, corrected when a
 * certificate's text is rendered, with the form's code and revision unchanged. Pure.
 *
 * The list is the customer's document-control decision (§13.10) and ships empty: with no correction the text is
 * rendered exactly as written. A correction applies to the forms it names, never to every form.
 *
 * The rule:
 * - only the form's own words are corrected, never a merge field (`{{…}}`) nor the value a field is filled with,
 *   so a contractor's name that happens to contain the misspelling prints as the contractor wrote it;
 * - one pass, left to right, the longest correction that matches at a place winning; what a correction writes is
 *   never corrected again (no cascade), so the order corrections were entered in never changes the text;
 * - matching is exact, letter case included: "CERTICATE" and "Certicate" are two corrections.
 *
 * A certificate freezes the corrections that applied to its form when the form was pinned at its first signature
 * (OD-2 A), so a correction added, changed or removed later never alters the text anyone signed under; an issued
 * certificate's text is frozen whole (ADR 0008). A draft follows the list as it stands.
 */

import type { Finding } from "./types";

export interface Correction {
  /// The correction's record (BD-614-26 as ruled: a pin and an issue record which applied). Absent in fixtures.
  id?: string;
  fromText: string;
  toText: string;
}

export interface Corrected {
  text: string;
  /// Each correction that changed something, with how many times, in the order first applied.
  applied: { id?: string; fromText: string; toText: string; count: number }[];
}

const FIELD = /\{\{[^{}]*\}\}/g;

/// Correct the words of a body outside its merge fields. An empty list returns the body as written.
export function applyCorrections(body: string, corrections: readonly Correction[]): Corrected {
  const usable = corrections.filter((c) => c.fromText.length > 0);
  if (usable.length === 0) return { text: body, applied: [] };
  // Longest first, then by the text itself, so the winner at a place never depends on the list's order.
  const byLength = [...usable].sort((a, b) => b.fromText.length - a.fromText.length || (a.fromText < b.fromText ? -1 : a.fromText > b.fromText ? 1 : 0));
  const counts = new Map<string, { id?: string; fromText: string; toText: string; count: number }>();
  const fix = (segment: string): string => {
    let out = "";
    let i = 0;
    while (i < segment.length) {
      const hit = byLength.find((c) => segment.startsWith(c.fromText, i));
      if (hit) {
        out += hit.toText;
        i += hit.fromText.length;
        const k = counts.get(hit.fromText) ?? { ...(hit.id ? { id: hit.id } : {}), fromText: hit.fromText, toText: hit.toText, count: 0 };
        k.count += 1;
        counts.set(hit.fromText, k);
      } else {
        out += segment[i];
        i += 1;
      }
    }
    return out;
  };
  let text = "";
  let last = 0;
  for (const m of body.matchAll(FIELD)) {
    text += fix(body.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  text += fix(body.slice(last));
  return { text, applied: [...counts.values()] };
}

/// A correction as entered, with the forms it applies to (template ids).
export interface CorrectionIn {
  fromText: string;
  toText: string;
  templateIds: readonly string[];
}

export const CORRECTION_MAX = 200;

/**
 * Why a correction cannot be saved, judged against the organisation's others (`others` excludes the one being
 * edited). Two corrections of the same words on one form would leave the text depending on which is read first, so
 * the second is refused; one correction may contain another's words (the longer wins where both match).
 */
export function correctionFaults(c: CorrectionIn, others: readonly CorrectionIn[]): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!c.fromText.trim()) f("CORRECTION_FROM_REQUIRED");
  if (!c.toText.trim()) f("CORRECTION_TO_REQUIRED");
  if (c.fromText !== c.fromText.trim() || c.toText !== c.toText.trim()) f("CORRECTION_SPACES");
  if (c.fromText.length > CORRECTION_MAX || c.toText.length > CORRECTION_MAX) f("CORRECTION_TOO_LONG", { max: CORRECTION_MAX });
  if (c.fromText.trim() && c.fromText === c.toText) f("CORRECTION_SAME");
  if (/[{}]/.test(c.fromText) || /[{}]/.test(c.toText)) f("CORRECTION_BRACES");
  if (c.templateIds.length === 0) f("CORRECTION_FORMS_REQUIRED");
  const clash = others.find((o) => o.fromText === c.fromText && o.templateIds.some((t) => c.templateIds.includes(t)));
  if (c.fromText.trim() && clash) f("CORRECTION_TAKEN", { from: c.fromText });
  return out;
}
