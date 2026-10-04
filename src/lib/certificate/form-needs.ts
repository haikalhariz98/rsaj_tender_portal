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

/// Where a need's form is chosen: a certificate kind's (or the delegation pair's) under Post-award controls, a routing
/// sheet type's printed sheet under Routing sheets (614b-C6).
export type SetAt = "POST_AWARD" | "ROUTING_SHEETS";

/// 614b-C6 (BD-613-95): the screens' own words for where each is set, in English and Malay.
export const SET_AT_WORDS: Readonly<Record<SetAt, Words>> = {
  POST_AWARD: w("Configuration › Post-award controls", "Konfigurasi › Kawalan selepas setuju terima"),
  ROUTING_SHEETS: w("Configuration › Routing sheets", "Konfigurasi › Helaian penghalaan"),
};

/**
 * 614b-C6 (BD-613-95): TEMPLATE_NOT_SET in words, naming the need and where its form is chosen, in English and Malay:
 * "No form is chosen for “{need}”. Choose it under Configuration › Post-award controls." The finding carries the need in
 * both languages and where it is set. BD-613-103 / S-6 (Run 0 fix round): the quotes hold only a need's label, never a
 * phrase standing in for one, so a finding without a need (none is raised so since openCertificate names its kind) says
 * "No form is chosen." with no quoted placeholder.
 */
export function templateNotSetWords(d: Record<string, string | number | null | undefined>): Words {
  const at = SET_AT_WORDS[d.setAt === "ROUTING_SHEETS" ? "ROUTING_SHEETS" : "POST_AWARD"];
  const en = typeof d.need === "string" && d.need ? d.need : null;
  if (!en) return w(`No form is chosen. Choose it under ${at.en}.`, `Tiada borang dipilih. Pilih di ${at.ms}.`);
  const ms = typeof d.needMs === "string" && d.needMs ? d.needMs : en;
  return w(`No form is chosen for “${en}”. Choose it under ${at.en}.`, `Tiada borang dipilih bagi “${ms}”. Pilih di ${at.ms}.`);
}

/**
 * BD-613-103 (sent back) / S-6: a certificate already opened without a form. Its form is fixed when it is opened
 * (Certificate.templateId), so choosing one under Post-award controls serves the next certificate raised, never this one;
 * the raise words (TEMPLATE_NOT_SET, BD-613-95) are for raises only. One finding, RAISED_WITHOUT_FORM, used by the
 * Signatures panel and by the first signature's refusal (the pin, revision.ts), naming the kind through KIND_WORDS:
 * - open: it was raised without a form; choosing one serves the next raised, not this one; void it and raise it again;
 * - VOID: only that it was raised without a form, with no advice;
 * - a kind the product does not raise again once void (the variation's application, opened by its prior approval's last
 *   step, BD-613-52): the void-and-raise advice would be a false exit, so it says there is no way to give it a form yet.
 *   Since BD-613-110 (run 1a) none is opened without a form (the send and the last step ask, openCertificate refuses), so
 *   these words serve only a certificate opened so before it.
 */
export function raisedWithoutFormFault(cert: { kind: string; status: string } | null): Finding {
  return { code: "RAISED_WITHOUT_FORM", level: "block", data: { kind: cert?.kind ?? null, status: cert?.status ?? null } };
}

/// The kinds the product never raises again once void, so "void it and raise it again" is not their exit.
export const NOT_RAISED_AGAIN: readonly CertificateKind[] = ["VARIATION_APPLICATION"];

export function raisedWithoutFormWords(d: Record<string, string | number | null | undefined>): Words {
  const kind = typeof d.kind === "string" && d.kind in KIND_WORDS ? KIND_WORDS[d.kind as CertificateKind] : null;
  const lead = kind
    ? w(`This certificate (${kind.en}) was raised without a form.`, `Perakuan ini (${kind.ms}) dibangkitkan tanpa borang.`)
    : w("This certificate was raised without a form.", "Perakuan ini dibangkitkan tanpa borang.");
  if (d.status === "VOID") return lead;
  const at = SET_AT_WORDS.POST_AWARD;
  const serves = w(`Choosing a form under ${at.en} serves the next one raised, not this one`, `Memilih borang di ${at.ms} terpakai bagi yang dibangkitkan seterusnya, bukan yang ini`);
  if (kind && NOT_RAISED_AGAIN.includes(d.kind as CertificateKind)) {
    return w(
      `${lead.en} ${serves.en}. It was opened when its variation's prior approval was approved and is not raised again, so voiding it would leave the variation without its application: there is no way to give it a form yet.`,
      `${lead.ms} ${serves.ms}. Ia dibuka apabila kelulusan awal perubahannya diluluskan dan tidak dibangkitkan semula, jadi membatalkannya akan meninggalkan perubahan itu tanpa permohonannya: belum ada cara untuk memberinya borang.`,
    );
  }
  return w(`${lead.en} ${serves.en}: void it and raise it again.`, `${lead.ms} ${serves.ms}: batalkannya dan bangkitkannya semula.`);
}

export interface FormOf {
  id: string;
  nameEn: string;
  bodyEn: string | null;
  bodyMs: string | null;
}

/// The refusal a module raises where it needs a form: none chosen (naming the need, in both languages, and where it is
/// chosen: 614b-C6), or chosen with no text (naming the form).
export function formNeedFault(t: FormOf | null, need: Words, setAt: SetAt = "POST_AWARD"): Finding | null {
  if (!t) return { code: "TEMPLATE_NOT_SET", level: "block", data: { need: need.en, needMs: need.ms, setAt } };
  if (!(t.bodyEn?.trim() || t.bodyMs?.trim())) return { code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form: t.nameEn } };
  return null;
}

/**
 * 6.14 increment 2 intake 1 (BD-613-96): the form check every raise act makes. Only TEMPLATE_NOT_SET refuses at raise; a
 * form chosen with no text is the certificate page's not-ready callout and refuses at the first signature and at issue
 * (BD-614-23, OD-2 A). Part A's raise acts go through it too (its FORM_NOT_SET retired), so every kind's raise says the
 * same thing, naming the need and where its form is chosen.
 */
export function raiseFormFault(form: { id: string } | null, need: Words, setAt: SetAt = "POST_AWARD"): Finding | null {
  return form ? null : formNeedFault(null, need, setAt);
}

/// A certificate kind's raise refused for want of its form (a screen's blocker says what the act would).
export const noFormFault = (kind: CertificateKind): Finding => raiseFormFault(null, KIND_WORDS[kind])!;

export type NeedState = "NOT_SET" | "BODY_EMPTY" | "READY";

export interface FormNeed {
  key: string;
  need: Words;
  /// Where the form is chosen.
  setAt: SetAt;
  form: { id: string; nameEn: string } | null;
  state: NeedState;
}

/// The state, by the one rule: no fault ready; otherwise the fault says which.
const stateOf = (t: FormOf | null): NeedState => {
  const f = formNeedFault(t, w("", ""));
  return !f ? "READY" : f.code === "TEMPLATE_NOT_SET" ? "NOT_SET" : "BODY_EMPTY";
};

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
