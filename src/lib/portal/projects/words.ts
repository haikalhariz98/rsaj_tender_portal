/**
 * My Projects' findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A finding names what the contractor can do about it where it can do something.
 */

import { formatDate } from "@/lib/format";

import type { ProjectFault, ProjectFinding } from "./types";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });
type Data = Record<string, string | number | null>;
const n = (d: Data, k: string) => String(d[k] ?? "");

const OWN: Readonly<Record<ProjectFault, (d: Data) => Words>> = {
  NOT_FOUND: () => w("That contract is not one you can open.", "Kontrak itu bukan yang boleh anda buka."),
  CONTRACT_NOT_ACTIVE: () => w("This contract is not being administered at the moment, so nothing can be sent on it.", "Kontrak ini tidak ditadbir buat masa ini, jadi tiada apa yang boleh dihantar padanya."),
  DAY_NOT_KNOWN: () => w("The organisation's time zone is not set, so the day cannot be recorded. Tell the procurement office.", "Zon waktu organisasi belum ditetapkan, jadi tarikh tidak dapat direkodkan. Maklumkan kepada pejabat perolehan."),
  TITLE_REQUIRED: () => w("Give the submission a title.", "Berikan tajuk kepada penyerahan."),
  TITLE_TOO_LONG: (d) => w(`The title is longer than ${n(d, "max")} characters.`, `Tajuk melebihi ${n(d, "max")} aksara.`),
  BODY_REQUIRED: () => w("Write what you are submitting.", "Tuliskan apa yang anda serahkan."),
  BODY_TOO_LONG: (d) => w(`The text is longer than ${n(d, "max")} characters.`, `Teks melebihi ${n(d, "max")} aksara.`),
  AMOUNT_REQUIRED: () => w("Give the amount claimed.", "Berikan amaun yang dituntut."),
  AMOUNT_FORMAT: () => w("The amount must be a figure in ringgit and sen, such as 12500.00.", "Amaun mestilah angka dalam ringgit dan sen, seperti 12500.00."),
  AMOUNT_NOT_ON_KIND: () => w("Only an interim claim carries an amount.", "Hanya tuntutan interim mempunyai amaun."),
  DAY_REQUIRED: () => w("Give the day.", "Berikan tarikh."),
  DAY_FORMAT: () => w("The day is not a date.", "Tarikh tidak sah."),
  DAY_IN_FUTURE: (d) => w(`The day cannot be after today (${formatDate(n(d, "day"))}).`, `Tarikh tidak boleh selepas hari ini (${formatDate(n(d, "day"))}).`),
  DAY_NOT_ON_KIND: () => w("Only an interim claim, a materials-on-site list and a notice of a cause of delay carry a day.", "Hanya tuntutan interim, senarai bahan di tapak dan notis sebab kelewatan mempunyai tarikh."),
  LINES_REQUIRED: () => w("List at least one item of materials.", "Senaraikan sekurang-kurangnya satu item bahan."),
  LINES_NOT_ON_KIND: () => w("Only a materials-on-site list carries items.", "Hanya senarai bahan di tapak mempunyai item."),
  LINE_INCOMPLETE: (d) => w(`Item ${n(d, "line")} needs a description, a quantity and where it is.`, `Item ${n(d, "line")} memerlukan perihalan, kuantiti dan lokasi.`),
  LINE_VALUE_FORMAT: (d) => w(`Item ${n(d, "line")}'s value must be a figure in ringgit and sen.`, `Nilai item ${n(d, "line")} mestilah angka dalam ringgit dan sen.`),
  TOO_MANY_LINES: (d) => w(`A list holds at most ${n(d, "max")} items. Send the rest as another list.`, `Senarai memuatkan paling banyak ${n(d, "max")} item.`),
  PASSWORD_REQUIRED: () => w("Enter your password to sign the declaration.", "Masukkan kata laluan anda untuk menandatangani akuan."),
  TOO_MANY_SUBMISSIONS: (d) => w(`This account has sent ${n(d, "max")} submissions in the last ${n(d, "minutes")} minutes, the most it may send in that time. Wait a while and send again, or call the office if something is urgent.`, `Akaun ini telah menghantar ${n(d, "max")} penyerahan dalam ${n(d, "minutes")} minit yang lalu, had maksimum bagi tempoh itu. Tunggu sebentar dan hantar semula, atau hubungi pejabat jika ada perkara mendesak.`),
  PORTAL_SIGNING_NOT_SET: () =>
    w(
      "The procurement office has not yet decided whether a contractor may sign from the supplier portal, so this cannot be signed here. Sign it on paper and the office records it, or ask the office to decide (Configuration, Post-award controls).",
      "Pejabat perolehan belum memutuskan sama ada kontraktor boleh menandatangani dari portal pembekal, jadi ini tidak boleh ditandatangani di sini. Tandatangani di atas kertas dan pejabat akan merekodkannya, atau minta pejabat membuat keputusan.",
    ),
  PORTAL_SIGNING_OFF: () =>
    w(
      "The procurement office takes a contractor's signature on paper only, so this cannot be signed here. Sign it on paper and the office records it.",
      "Pejabat perolehan menerima tandatangan kontraktor di atas kertas sahaja, jadi ini tidak boleh ditandatangani di sini. Tandatangani di atas kertas dan pejabat akan merekodkannya.",
    ),
  ALREADY_ANSWERED: () => w("This submission has already been answered.", "Penyerahan ini telah dijawab."),
  NOTE_REQUIRED: () => w("Say why it is returned, for the contractor to read.", "Nyatakan sebab ia dipulangkan, untuk dibaca oleh kontraktor."),
  NOTE_TOO_LONG: (d) => w(`The note is longer than ${n(d, "max")} characters.`, `Nota melebihi ${n(d, "max")} aksara.`),
  ENTRY_NOT_FOUND: () => w("That diary entry is not on this contract.", "Catatan diari itu tiada pada kontrak ini."),
  ALREADY_ATTESTED: () => w("The contractor's agent has already attested this entry.", "Ejen kontraktor telah mengesahkan catatan ini."),
  ALREADY_DISPUTED: () => w("A disagreement is already recorded on this entry.", "Percanggahan telah direkodkan pada catatan ini."),
  DISAGREEMENT_REQUIRED: () => w("Say what you disagree with.", "Nyatakan apa yang anda tidak setuju."),
  DISAGREEMENT_TOO_LONG: (d) => w(`The disagreement is longer than ${n(d, "max")} characters.`, `Percanggahan melebihi ${n(d, "max")} aksara.`),
  ENTRY_IN_FUTURE: () => w("This entry's day has not come yet.", "Tarikh catatan ini belum tiba."),
  CERTIFICATE_NOT_FOUND: () => w("That certificate is not on this contract.", "Perakuan itu tiada pada kontrak ini."),
  NOT_SIGNING: () => w("This certificate is not being signed at the moment.", "Perakuan ini tidak sedang ditandatangani buat masa ini."),
  NO_CONTRACTOR_BLOCK: () => w("This certificate has no block for the contractor to sign here.", "Perakuan ini tiada blok untuk ditandatangani kontraktor di sini."),
  BLOCK_NOT_NEXT: (d) => w(`The certificate is signed in order: "${n(d, "first")}" comes before the contractor's block.`, `Perakuan ditandatangani mengikut urutan: "${n(d, "first")}" mendahului blok kontraktor.`),
  BLOCK_SIGNED: () => w("The contractor's block on this certificate is already recorded.", "Blok kontraktor pada perakuan ini telah direkodkan."),
  BLOCK_IS_LAST: () =>
    w(
      "Your block is the last on this form, and recording it issues the certificate. For now a certificate is not issued from the supplier portal: sign or dispute it on paper, and the office records it.",
      "Blok anda adalah yang terakhir pada borang ini, dan merekodkannya akan mengeluarkan perakuan. Buat masa ini perakuan tidak dikeluarkan dari portal pembekal: tandatangani atau pertikaikannya di atas kertas, dan pejabat akan merekodkannya.",
    ),
  REFUSAL_NOT_ALLOWED: () => w("This form does not provide for the contractor to refuse to sign. Raise your dispute with the Superintending Officer in writing.", "Borang ini tidak memperuntukkan kontraktor enggan menandatangani. Kemukakan pertikaian anda kepada Pegawai Penguasa secara bertulis."),
  REFUSAL_NOTE_REQUIRED: () => w("Say what you dispute.", "Nyatakan apa yang anda pertikaikan."),
  REFUSAL_NOTE_TOO_LONG: (d) => w(`The dispute is longer than ${n(d, "max")} characters.`, `Pertikaian melebihi ${n(d, "max")} aksara.`),
};

export function projectFaultText(f: Pick<ProjectFinding, "code" | "data">): Words {
  return OWN[f.code]((f.data ?? {}) as Data);
}
export const hasProjectFaultText = (code: string): boolean => code in OWN;

export interface FaultView {
  field: string | null;
  level: ProjectFinding["level"];
  message: string;
  messageMs: string;
}

export const projectFaultViews = (fs: readonly ProjectFinding[]): FaultView[] =>
  fs.map((f) => {
    const t = projectFaultText(f);
    return { field: null, level: f.level, message: t.en, messageMs: t.ms };
  });
