/**
 * The forms the certificates need (6.14 increment 2, FR-CRT-012). Pure.
 *
 * The product writes no form: every certificate's form, including the ones the source documents mandate but the
 * forms library lacks, is a template the customer writes, reviews and issues with a form code (B6, a go-live
 * condition). The mechanism is one rule: where a module needs a form it names the need, and a need with no form
 * chosen refuses TEMPLATE_NOT_SET naming the setting, a form with no text TEMPLATE_BODY_EMPTY naming the form. The
 * certificate core applies it at the first signature (the form is pinned there, OD-2 A) and at issue; a draft may be
 * raised and routed while the text is still being written, and its page says so from the start.
 *
 * `formNeeds` lists every need with its state for Configuration › Templates, so the gaps are visible before any
 * certificate meets them.
 */

import { KIND_WORDS, w, type Words } from "./labels";
import type { CertificateKind, Finding } from "./types";
import { CERTIFICATE_KINDS } from "./types";

export interface FormOf {
  id: string;
  nameEn: string;
  bodyEn: string | null;
  bodyMs: string | null;
}

const hasText = (t: FormOf) => !!(t.bodyEn?.trim() || t.bodyMs?.trim());

/// The refusal a module raises where it needs a form: none chosen (naming the need), or chosen with no text (naming the form).
export function formNeedFault(t: FormOf | null, need: Words): Finding | null {
  if (!t) return { code: "TEMPLATE_NOT_SET", level: "block", data: { need: need.en } };
  if (!hasText(t)) return { code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form: t.nameEn } };
  return null;
}

export type NeedState = "NOT_SET" | "BODY_EMPTY" | "READY";

export interface FormNeed {
  key: string;
  need: Words;
  /// Where the form is chosen.
  setAt: "POST_AWARD" | "ROUTING_SHEETS";
  form: { id: string; nameEn: string } | null;
  state: NeedState;
}

const stateOf = (t: FormOf | null): NeedState => (!t ? "NOT_SET" : hasText(t) ? "READY" : "BODY_EMPTY");

/// The delegation pair is chosen per contract-type variant on the post-award controls, not per kind.
const PER_VARIANT: readonly CertificateKind[] = ["DELEGATION_LETTER", "DELEGATION_NOTICE"];

export const VARIANT_WORDS = { CONVENTIONAL: w("conventional contracts", "kontrak konvensional"), DESIGN_AND_BUILD: w("design and build contracts", "kontrak reka dan bina") } as const;

export interface NeedsInput {
  /// The form chosen per certificate kind (CertificateKindSetting), by kind.
  kinds: Readonly<Partial<Record<CertificateKind, FormOf | null>>>;
  /// The delegation pair's forms per variant (PostAwardPolicy).
  delegation: Readonly<Record<keyof typeof VARIANT_WORDS, { letter: FormOf | null; notice: FormOf | null }>>;
  /// Each routing sheet type in use (not retired), with its printed sheet (the document tracking form) and how many printed labels it has.
  sheets: readonly { id: string; labelEn: string; labelMs: string | null; form: FormOf | null }[];
}

/// Every form a certificate or a routing sheet needs, with its state, in a fixed order: the kinds as the vocabulary lists them, then the sheets.
export function formNeeds(i: NeedsInput): FormNeed[] {
  const out: FormNeed[] = [];
  for (const k of CERTIFICATE_KINDS) {
    if (PER_VARIANT.includes(k)) {
      for (const v of Object.keys(VARIANT_WORDS) as (keyof typeof VARIANT_WORDS)[]) {
        const t = k === "DELEGATION_LETTER" ? i.delegation[v].letter : i.delegation[v].notice;
        out.push({ key: `${k}:${v}`, need: w(`${KIND_WORDS[k].en}, ${VARIANT_WORDS[v].en}`, `${KIND_WORDS[k].ms}, ${VARIANT_WORDS[v].ms}`), setAt: "POST_AWARD", form: t ? { id: t.id, nameEn: t.nameEn } : null, state: stateOf(t) });
      }
      continue;
    }
    const t = i.kinds[k] ?? null;
    out.push({ key: k, need: KIND_WORDS[k], setAt: "POST_AWARD", form: t ? { id: t.id, nameEn: t.nameEn } : null, state: stateOf(t) });
  }
  for (const s of i.sheets) {
    out.push({ key: `sheet:${s.id}`, need: w(`The printed sheet of ${s.labelEn}`, `Helaian bercetak ${s.labelMs ?? s.labelEn}`), setAt: "ROUTING_SHEETS", form: s.form ? { id: s.form.id, nameEn: s.form.nameEn } : null, state: s.form ? "READY" : "NOT_SET" });
  }
  return out;
}

export const NEED_STATE_WORDS: Readonly<Record<NeedState, Words>> = {
  NOT_SET: w("No form chosen", "Tiada borang dipilih"),
  BODY_EMPTY: w("Form has no text: nothing on it can be signed", "Borang tiada teks: tiada apa boleh ditandatangani"),
  READY: w("Form written", "Borang ditulis"),
};
