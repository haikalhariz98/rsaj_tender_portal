/**
 * The registration's findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A rule returns a code and the labels it is about; this says it. A setting that
 * is not set is named, and says where to ask: the supplier cannot set it, so the sentence tells them the procurement office has to.
 */

import { formatDate } from "@/lib/format";
import type { Finding } from "@/lib/suppliers/types";

import type { UploadFault } from "./upload";
import { UPLOAD_SETTING_NAME } from "./upload";
import type { RegistrationFault, StepFault } from "./types";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });

type Data = Record<string, string | number | null>;
const s = (d: Data | undefined, k: string): string => (d && d[k] != null ? String(d[k]) : "");

const TEXT: Readonly<Record<RegistrationFault, (d: Data) => Words>> = {
  TIME_ZONE_UNSET: () => w("The organisation's time zone is not set, so today's date is not known and nothing can be checked. Tell the procurement office.", "Zon waktu organisasi belum ditetapkan, jadi tarikh hari ini tidak diketahui dan tiada apa-apa boleh disemak. Maklumkan kepada pejabat perolehan."),
  DOCUMENT_TYPES_NOT_SET: () => w("The procurement office has not set up the list of documents it asks for, so this step cannot be finished yet. Tell the procurement office.", "Pejabat perolehan belum menyediakan senarai dokumen yang diminta, jadi langkah ini belum boleh disiapkan. Maklumkan kepada pejabat perolehan."),
  DOCUMENT_TYPE_UNKNOWN: () => w("This document is of a kind the procurement office no longer asks for. Remove it.", "Dokumen ini daripada jenis yang tidak lagi diminta oleh pejabat perolehan. Buangkannya."),
  DOCUMENT_REQUIRED: (d) => w(`The ${s(d, "type")} is required. Upload it, or say it does not apply if that is allowed.`, `${s(d, "type")} diperlukan. Muat naiknya, atau nyatakan ia tidak berkenaan jika dibenarkan.`),
  DOCUMENT_DUPLICATE: (d) => w(`Only one ${s(d, "type")} is kept. Remove the extra one.`, `Hanya satu ${s(d, "type")} disimpan. Buangkan yang lebihan.`),
  FILE_REQUIRED: (d) => w(`Upload the file for the ${s(d, "type")}.`, `Muat naik fail bagi ${s(d, "type")}.`),
  EXPIRY_REQUIRED: (d) => w(`Give the date the ${s(d, "type")} expires.`, `Berikan tarikh ${s(d, "type")} tamat tempoh.`),
  EXPIRY_NOT_A_DAY: (d) => w(`The expiry date of the ${s(d, "type")} is not a date.`, `Tarikh tamat tempoh ${s(d, "type")} bukan tarikh yang sah.`),
  ALREADY_EXPIRED: (d) => w(`The ${s(d, "type")} expired on ${s(d, "expiresOn") ? formatDate(s(d, "expiresOn")) : "an earlier date"}. Upload a current one.`, `${s(d, "type")} telah tamat tempoh pada ${s(d, "expiresOn") ? formatDate(s(d, "expiresOn")) : "tarikh terdahulu"}. Muat naik yang terkini.`),
  EXPIRES_NOT_SET: (d) => w(`The procurement office has not said whether the ${s(d, "type")} expires. Give its expiry date if it has one.`, `Pejabat perolehan belum menyatakan sama ada ${s(d, "type")} tamat tempoh. Berikan tarikh tamat tempohnya jika ada.`),
  RATE_INVALID: (d) => w(`Give the rate on the ${s(d, "type")} as a percentage from 0 to 100, with at most two decimal places, for example 8 or 6.5.`, `Berikan kadar pada ${s(d, "type")} sebagai peratusan dari 0 hingga 100, dengan paling banyak dua tempat perpuluhan, contohnya 8 atau 6.5.`),
  TITLE_REQUIRED: (d) => w(`Give this ${s(d, "type")} a title, so it can be told from the others.`, `Berikan tajuk kepada ${s(d, "type")} ini, supaya boleh dibezakan daripada yang lain.`),
  TITLE_DUPLICATE: (d) => w(`You already have a ${s(d, "type")} titled "${s(d, "title")}". Give this one a different title.`, `Anda sudah ada ${s(d, "type")} bertajuk "${s(d, "title")}". Berikan tajuk yang berlainan.`),
  MANDATORY_NOT_SAID: (d) => w(`The procurement office has not said whether the ${s(d, "type")} is required.`, `Pejabat perolehan belum menyatakan sama ada ${s(d, "type")} diperlukan.`),
  NOT_APPLICABLE_NOT_ALLOWED: (d) => w(`The ${s(d, "type")} cannot be marked as not applicable.`, `${s(d, "type")} tidak boleh ditandakan sebagai tidak berkenaan.`),
  VALUE_UNKNOWN: () => w("This code is not on the procurement office's list.", "Kod ini tiada dalam senarai pejabat perolehan."),
  VALUE_RETIRED: (d) => w(`${s(d, "value")} is no longer on the list. Choose another, or remove it.`, `${s(d, "value")} tidak lagi dalam senarai. Pilih yang lain, atau buangkannya.`),
  VALUE_NOT_FOR_DOCUMENT: (d) => w(`${s(d, "value")} does not belong to the ${s(d, "type") || "document"} it was chosen for.`, `${s(d, "value")} bukan milik ${s(d, "type") || "dokumen"} yang ia dipilih untuknya.`),
  ONE_GRADE_ONLY: (d) => w(`Choose one grade only for the ${s(d, "type")}.`, `Pilih satu gred sahaja bagi ${s(d, "type")}.`),
  DOCUMENT_FIRST: (d) => w(`Add the ${s(d, "type")} in step 2 first. The codes of ${s(d, "body")} are recorded on it.`, `Tambah ${s(d, "type")} dalam langkah 2 dahulu. Kod ${s(d, "body")} direkodkan padanya.`),
  LIST_NOT_CONFIGURED: (d) => w(`The procurement office has not set up the codes for ${s(d, "body")}, so there is nothing to choose. This does not stop you sending your registration.`, `Pejabat perolehan belum menyediakan kod bagi ${s(d, "body")}, jadi tiada apa-apa untuk dipilih. Ini tidak menghalang anda menghantar pendaftaran.`),
  FIELD_REQUIRED: (d) => w(`${s(d, "field")} is required.`, `${s(d, "field")} diperlukan.`),
  BANKS_NOT_SET: () => w("The procurement office has not set up the list of banks, so the bank details cannot be finished yet. Tell the procurement office.", "Pejabat perolehan belum menyediakan senarai bank, jadi butiran bank belum boleh disiapkan. Maklumkan kepada pejabat perolehan."),
  ACCOUNT_TYPES_NOT_SET: () => w("The procurement office has not set up the list of account types, so the bank details cannot be finished yet. Tell the procurement office.", "Pejabat perolehan belum menyediakan senarai jenis akaun, jadi butiran bank belum boleh disiapkan. Maklumkan kepada pejabat perolehan."),
  BANK_NOT_LISTED: () => w("Choose the bank from the list.", "Pilih bank daripada senarai."),
  ACCOUNT_TYPE_NOT_LISTED: () => w("Choose the account type from the list.", "Pilih jenis akaun daripada senarai."),
  EMAIL_NOT_VALID: () => w("This email address does not look right.", "Alamat e-mel ini nampaknya tidak betul."),
  FORMAT_MISMATCH: (d) => w(`${s(d, "field")} is not in the form the procurement office expects. Check it.`, `${s(d, "field")} tidak dalam bentuk yang dijangka oleh pejabat perolehan. Semaknya.`),
  FORMAT_NOT_CHECKED: (d) => w(`${s(d, "field")}: its form is not checked, because the procurement office has not set one. Check it yourself.`, `${s(d, "field")}: bentuknya tidak disemak, kerana pejabat perolehan belum menetapkannya. Semak sendiri.`),
  IDENTITY_DIFFERS: () => w("This number is not the company's registration number. That is allowed, for example for a sole proprietor, and the office will see it.", "Nombor ini bukan nombor pendaftaran syarikat. Ini dibenarkan, contohnya bagi pemilik tunggal, dan pejabat akan melihatnya."),
  STATEMENT_REQUIRED: () => w("Upload a bank statement.", "Muat naik penyata bank."),
  TEXT_NOT_SET: (d) => (s(d, "kind") === "GIRO_AUTHORISATION"
    ? w("The GIRO authorisation text is not set. The procurement office has to write it before you can finish this step. Tell the procurement office.", "Teks kebenaran GIRO belum ditetapkan. Pejabat perolehan perlu menulisnya sebelum anda boleh menyiapkan langkah ini. Maklumkan kepada pejabat perolehan.")
    : w("The false-declaration text is not set. The procurement office has to write it before you can send your registration. Tell the procurement office.", "Teks perakuan maklumat palsu belum ditetapkan. Pejabat perolehan perlu menulisnya sebelum anda boleh menghantar pendaftaran. Maklumkan kepada pejabat perolehan.")),
  TEXT_STALE: (d) => (s(d, "ticked")
    ? w("The authorisation wording has changed since you ticked the box. Read it again and tick the box again.", "Perkataan kebenaran telah berubah sejak anda menandakan kotak. Bacanya semula dan tandakan kotak sekali lagi.")
    : w("The wording has been changed since you opened this page. Reload the page and read it again.", "Perkataan telah diubah sejak anda membuka halaman ini. Muat semula halaman dan bacanya semula.")),
  SIGNATORY_NAME_REQUIRED: () => w("Give the name of the person who signs.", "Berikan nama orang yang menandatangani."),
  SIGNATORY_DESIGNATION_REQUIRED: () => w("Give the position of the person who signs.", "Berikan jawatan orang yang menandatangani."),
  NOT_CONFIRMED: (d) => (s(d, "kind") === "FALSE_DECLARATION" ? w("Tick the box to confirm the declaration.", "Tandakan kotak untuk mengesahkan perakuan.") : w("Tick the box to confirm the authorisation.", "Tandakan kotak untuk mengesahkan kebenaran.")),
  NOTICE_NOT_SET: () => w("The procurement office has not written the notice you read before sending, so the registration cannot be sent yet. Tell the procurement office.", "Pejabat perolehan belum menulis notis yang anda baca sebelum menghantar, jadi pendaftaran belum boleh dihantar. Maklumkan kepada pejabat perolehan."),
  SIGNATORY_DIFFERS: () => w("The person who signs is not the contact on your account. That is allowed, and the office will see it.", "Orang yang menandatangani bukan kenalan pada akaun anda. Ini dibenarkan, dan pejabat akan melihatnya."),
  TOO_LONG: (d) => w(`This is too long. Keep it to ${s(d, "max")} characters.`, `Ini terlalu panjang. Hadkan kepada ${s(d, "max")} aksara.`),
  NOT_A_DAY: () => w("This is not a date.", "Ini bukan tarikh."),
  NOT_A_NUMBER: () => w("This is not a number.", "Ini bukan nombor."),
};

/// A finding of the registration's rules, in words.
export function registrationFaultText(f: Pick<StepFault, "code" | "data">): Words {
  const t = TEXT[f.code];
  return t ? t(f.data ?? {}) : w("This cannot be done as it stands.", "Ini tidak boleh dilakukan seperti keadaannya.");
}

export const hasRegistrationFaultText = (code: string): boolean => code in TEXT;

/// The words for a refused upload. The settings that are not set are named, because only the procurement office can set them.
export function uploadFaultText(f: Finding<UploadFault>, kind: "document" | "statement" = "document"): Words {
  switch (f.code) {
    case "STORE_POLICY_NOT_SET":
      return w("Uploads are closed: the procurement office has not set which kinds of file it takes and how large they may be. Tell the procurement office.", "Muat naik ditutup: pejabat perolehan belum menetapkan jenis fail yang diterima dan saiz maksimumnya. Maklumkan kepada pejabat perolehan.");
    case "CLASS_NOT_SET":
      return w(`Uploads are closed: the procurement office has not set ${s(f.data, "setting") || UPLOAD_SETTING_NAME[kind].cls}. Tell the procurement office.`, `Muat naik ditutup: pejabat perolehan belum menetapkan ${s(f.data, "setting") || UPLOAD_SETTING_NAME[kind].cls}. Maklumkan kepada pejabat perolehan.`);
    case "STATEMENT_CLASS_NOT_SULIT":
      return w("Uploads of bank statements are closed: the document class the procurement office chose for them is not classified SULIT, and a bank statement has to be. Tell the procurement office.", "Muat naik penyata bank ditutup: kelas dokumen yang dipilih oleh pejabat perolehan bukan SULIT, dan penyata bank mestilah SULIT. Maklumkan kepada pejabat perolehan.");
    case "QUOTA_NOT_SET":
      return w("Uploads are closed: the procurement office has not set how many files, and how many bytes in all, a registration may hold. Tell the procurement office.", "Muat naik ditutup: pejabat perolehan belum menetapkan berapa fail, dan berapa bait keseluruhan, yang boleh disimpan oleh satu pendaftaran. Maklumkan kepada pejabat perolehan.");
    case "EMPTY":
      return w("That file is empty.", "Fail itu kosong.");
    case "TOO_LARGE":
      return w("That file is larger than the procurement office takes.", "Fail itu lebih besar daripada yang diterima oleh pejabat perolehan.");
    case "TYPE_NOT_ALLOWED":
      return w("That kind of file is not accepted. Upload one of the kinds listed beside the upload button.", "Jenis fail itu tidak diterima. Muat naik salah satu jenis yang disenaraikan di sebelah butang muat naik.");
    case "QUOTA_FILES":
      return w(`Your registration already holds as many files as it may (${s(f.data, "max")}). Remove one first.`, `Pendaftaran anda sudah mempunyai fail sebanyak yang dibenarkan (${s(f.data, "max")}). Buangkan satu dahulu.`);
    case "QUOTA_BYTES":
      return w("Your registration would hold more than it may in all. Remove a file first, or upload a smaller one.", "Pendaftaran anda akan melebihi jumlah yang dibenarkan. Buangkan satu fail dahulu, atau muat naik yang lebih kecil.");
    default:
      // A refusal the document store itself gave (the class is gone, the class list is empty): the supplier cannot mend it, so the office is told.
      return w("That file could not be stored. Tell the procurement office.", "Fail itu tidak dapat disimpan. Maklumkan kepada pejabat perolehan.");
  }
}
