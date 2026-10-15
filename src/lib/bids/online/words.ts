/**
 * What the supplier is told when an online submission, a withdrawal or a part's upload is refused, or warned (ADR 0036 D5 to D8, rulings 20b, 20e, 20h, 20m). One
 * place: no component restates them. Every refusal says which rule refused it, in words, never a code.
 *
 * In English and Malay, through the portal's one `Words` shape (ruling 20ab, NFR-LNG-001; log 1936: no second pattern). The Malay says no more than the English:
 * the same facts and the same limits. Where the portal already words a refusal (`portal/bids/words.ts`), its Malay is reused. A bid is "bida", as the portal
 * calls it (Bida Saya).
 */

import { w, type Words } from "@/lib/contract/labels";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE, MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import type { PartUploadFault, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";

const PAPER_ONLY = w("Bids on this exercise are handed in on paper, not through the portal.", "Bida bagi pelawaan ini diserahkan di atas kertas, bukan melalui portal.");
const NOT_ALLOWED = w(
  "This copy of the system does not take online bids at the moment. Contact the procurement office.",
  "Salinan sistem ini tidak menerima bida dalam talian buat masa ini. Hubungi pejabat perolehan.",
);
const NOT_PUBLISHED = w("The exercise is not open for bids.", "Pelawaan ini tidak dibuka untuk bida.");
// The portal's own words for the invitee check (`portal/bids/words.ts`, NOT_INVITED), so the purchase and the door say the same (20m).
const NOT_INVITED = w("This exercise invites named suppliers only, and your company is not on its list.", "Pelawaan ini hanya menjemput pembekal tertentu, dan syarikat anda tiada dalam senarainya.");

const STAMP_STALE = w(
  "Your submission waited too long behind other work on this exercise, so it was not taken and nothing was recorded. Submit again: the time stamped when you submit again decides whether it is late.",
  "Penyerahan anda menunggu terlalu lama di belakang kerja lain pada pelawaan ini, jadi ia tidak diterima dan tiada apa yang direkodkan. Serahkan sekali lagi: masa yang dicap apabila anda menyerahkan semula menentukan sama ada ia lewat.",
);
const NOT_TAKEN = w("Your submission was not taken and nothing was recorded. Try again.", "Penyerahan anda tidak diterima dan tiada apa yang direkodkan. Cuba lagi.");

export const SUBMIT_FAULT_WORDS: Readonly<Record<SubmitFault, Words>> = {
  CHANNEL_NOT_ONLINE: PAPER_ONLY,
  ONLINE_NOT_SET: w(
    "Online submission of bids is not set for the organisation, so bids are not taken through the portal.",
    "Penyerahan bida dalam talian belum ditetapkan bagi organisasi, jadi bida tidak diterima melalui portal.",
  ),
  ONLINE_NOT_ALLOWED: NOT_ALLOWED,
  NOT_PUBLISHED,
  CANCELLED: w("The exercise was cancelled, so no bid is taken.", "Pelawaan ini telah dibatalkan, jadi tiada bida diterima."),
  KEY_NOT_LIVE: w(
    "The exercise's sealing key is not ready, so no bid can be sealed yet. Contact the procurement office.",
    "Kunci meterai pelawaan ini belum sedia, jadi belum ada bida yang boleh dimeterai. Hubungi pejabat perolehan.",
  ),
  NO_LIVE_SALE: w(
    "Your company holds no purchase of the tender documents that stands, so it cannot submit a bid.",
    "Syarikat anda tiada pembelian dokumen tender yang masih berkuat kuasa, jadi ia tidak boleh menyerahkan bida.",
  ),
  NOT_ON_INVITEE_LIST: NOT_INVITED,
  LIVE_BID_HELD: w(
    "Your company already has a bid standing on this exercise, so a second bid is not taken. Up to the closing, replace it to change it.",
    "Syarikat anda sudah mempunyai bida yang masih berkuat kuasa pada pelawaan ini, jadi bida kedua tidak diterima. Sehingga tarikh tutup, gantikan bida itu untuk mengubahnya.",
  ),
  REPLACE_AFTER_CLOSING: w("The closing has passed, so a bid can no longer be replaced.", "Tarikh tutup telah berlalu, jadi bida tidak boleh diganti lagi."),
  NOTHING_TO_REPLACE: w("The submission named is not one of your company's bids that still stands.", "Penyerahan yang dinamakan bukan bida syarikat anda yang masih berkuat kuasa."),
  REPLACE_KIND_CHANGED: w(
    "A bid is replaced by a bid, and an alternative by an alternative. To add an alternative, submit it as an alternative.",
    "Bida diganti dengan bida, dan bida alternatif dengan bida alternatif. Untuk menambah bida alternatif, serahkannya sebagai bida alternatif.",
  ),
  ALTERNATIVES_NOT_STATED: w(
    "Whether alternative bids are permitted is not stated for this exercise, so no alternative is taken. Contact the procurement office.",
    "Sama ada bida alternatif dibenarkan belum dinyatakan bagi pelawaan ini, jadi tiada bida alternatif diterima. Hubungi pejabat perolehan.",
  ),
  PARENT_NOT_YOUR_LIVE_BID: w(
    "An alternative may name one of your company's own bids that still stands, and only an alternative names one.",
    "Bida alternatif boleh menamakan salah satu bida syarikat anda sendiri yang masih berkuat kuasa, dan hanya bida alternatif yang menamakannya.",
  ),
  PARENT_NOT_A_BID: w(
    "The submission named is an alternative. An alternative goes with a bid, not with another alternative.",
    "Penyerahan yang dinamakan ialah bida alternatif. Bida alternatif disertakan dengan bida, bukan dengan bida alternatif yang lain.",
  ),
  LATE_CLOSED: w(
    "The opening has started, so no further bid is taken: a late bid is taken only until the opening starts.",
    "Pembukaan telah bermula, jadi tiada lagi bida diterima: bida lewat hanya diterima sehingga pembukaan bermula.",
  ),
  PRICE_INVALID: w(
    "Write the price as an amount in ringgit and sen, above zero, with at most two decimal places and no commas.",
    "Tulis harga sebagai amaun dalam ringgit dan sen, melebihi sifar, dengan paling banyak dua tempat perpuluhan dan tanpa koma.",
  ),
  PERIOD_INVALID: w("Write the completion period as a whole number, at least 1.", "Tulis tempoh siap sebagai nombor bulat, sekurang-kurangnya 1."),
  UNIT_NOT_SET: w("Choose the unit of the completion period.", "Pilih unit tempoh siap."),
  FILE_NOT_YOURS: w("A file named is not one your company uploaded on this exercise.", "Fail yang dinamakan bukan fail yang dimuat naik oleh syarikat anda pada pelawaan ini."),
  FILE_NOT_DRAFT: w(
    "A file named has already been submitted or discarded. Each file belongs to one submission: upload it again.",
    "Fail yang dinamakan telah diserahkan atau dibuang. Setiap fail milik satu penyerahan sahaja: muat naik semula.",
  ),
  PART_UNKNOWN: w(
    "A file was uploaded for a part the bidder does not return on this exercise.",
    "Fail telah dimuat naik bagi bahagian yang tidak dikembalikan oleh petender pada pelawaan ini.",
  ),
  NO_FILES: w("Upload at least one part before submitting.", "Muat naik sekurang-kurangnya satu bahagian sebelum menyerahkan."),
  TOO_MANY_SUBMISSIONS: w(
    `Your company has made ${MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE} submissions on this exercise, the most taken. Nothing new was submitted, and your last submission stands as it is.`,
    `Syarikat anda telah membuat ${MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE} penyerahan pada pelawaan ini, had paling banyak yang diterima. Tiada apa yang baharu diserahkan, dan penyerahan terakhir anda kekal seperti sedia ada.`,
  ),
  STAMP_STALE,
  NOT_TAKEN,
};

export const WITHDRAW_FAULT_WORDS: Readonly<Record<WithdrawFault, Words>> = {
  NOT_YOURS: w("That bid is not one of your company's.", "Bida itu bukan milik syarikat anda."),
  NOT_LIVE: w("That bid no longer stands: it was replaced, withdrawn or opened.", "Bida itu tidak lagi berkuat kuasa: ia telah diganti, ditarik balik atau dibuka."),
  AFTER_CLOSING: w("The closing has passed, so a bid can no longer be withdrawn.", "Tarikh tutup telah berlalu, jadi bida tidak boleh ditarik balik lagi."),
  CANCELLED: w("The exercise was cancelled.", "Pelawaan ini telah dibatalkan."),
  ALTERNATIVE_NOT_LINKED: w(
    "Only your own alternatives linked to this bid can be withdrawn with it.",
    "Hanya bida alternatif anda sendiri yang dikaitkan dengan bida ini boleh ditarik balik bersamanya.",
  ),
  STAMP_STALE: w(
    "Your withdrawal waited too long behind other work on this exercise, so it was not taken and nothing was recorded. Withdraw again: the time stamped when you withdraw again decides whether it is in time.",
    "Penarikan balik anda menunggu terlalu lama di belakang kerja lain pada pelawaan ini, jadi ia tidak diterima dan tiada apa yang direkodkan. Tarik balik sekali lagi: masa yang dicap apabila anda menarik balik semula menentukan sama ada ia masih dalam masa.",
  ),
  NOT_TAKEN: w("Your withdrawal was not taken and nothing was recorded. Try again.", "Penarikan balik anda tidak diterima dan tiada apa yang direkodkan. Cuba lagi."),
};

export const PART_UPLOAD_FAULT_WORDS: Readonly<Record<PartUploadFault, Words>> = {
  CHANNEL_NOT_ONLINE: PAPER_ONLY,
  ONLINE_NOT_ALLOWED: NOT_ALLOWED,
  NOT_PUBLISHED,
  KEY_NOT_LIVE: w(
    "The exercise's sealing key is not ready, so no file can be sealed yet. Contact the procurement office.",
    "Kunci meterai pelawaan ini belum sedia, jadi belum ada fail yang boleh dimeterai. Hubungi pejabat perolehan.",
  ),
  FINGERPRINT_MISMATCH: w(
    "The exercise's sealing key is not the one published, so nothing was uploaded. Contact the procurement office.",
    "Kunci meterai pelawaan ini bukan kunci yang diterbitkan, jadi tiada apa yang dimuat naik. Hubungi pejabat perolehan.",
  ),
  NO_LIVE_SALE: w(
    "Your company holds no purchase of the tender documents that stands, so it cannot upload a bid.",
    "Syarikat anda tiada pembelian dokumen tender yang masih berkuat kuasa, jadi ia tidak boleh memuat naik bida.",
  ),
  NOT_ON_INVITEE_LIST: NOT_INVITED,
  LATE_CLOSED: w("The opening has started, so no further file is taken.", "Pembukaan telah bermula, jadi tiada lagi fail diterima."),
  PART_UNKNOWN: w("That part is not one of this exercise's parts.", "Bahagian itu bukan salah satu bahagian pelawaan ini."),
  PART_NOT_RETURNED: w("That part is not one a bidder returns.", "Bahagian itu bukan bahagian yang dikembalikan oleh petender."),
  TYPES_NOT_SET: w("The file types for that part are not set yet. Contact the procurement office.", "Jenis fail bagi bahagian itu belum ditetapkan. Hubungi pejabat perolehan."),
  TYPE_NOT_ACCEPTED: w(
    "That kind of file is not accepted for this part. The type is read from the file itself, not from its name.",
    "Jenis fail itu tidak diterima bagi bahagian ini. Jenisnya dibaca daripada fail itu sendiri, bukan daripada namanya.",
  ),
  OFFICE_REFUSED: w(
    "That Office file holds macros, embedded objects or a link to a template outside it, is protected by a password, or cannot be read with certainty, so it is not accepted.",
    "Fail Office itu mengandungi makro, objek terbenam atau pautan kepada templat di luarnya, dilindungi kata laluan, atau tidak dapat dibaca dengan pasti, jadi ia tidak diterima.",
  ),
  SIZE_NOT_SET: w("The largest file for that part is not set yet. Contact the procurement office.", "Saiz fail paling besar bagi bahagian itu belum ditetapkan. Hubungi pejabat perolehan."),
  TOO_LARGE: w("The file is larger than this part allows.", "Fail itu lebih besar daripada yang dibenarkan bagi bahagian ini."),
  EMPTY: w("The file is empty.", "Fail itu kosong."),
  BODY_TOO_SLOW: w("The file arrived too slowly and was not taken. Try again on a steadier connection.", "Fail itu tiba terlalu perlahan dan tidak diterima. Cuba lagi dengan sambungan yang lebih stabil."),
  HASH_MISMATCH: w(
    "The file the server received is not the file your browser read, so it was not taken. Try again.",
    "Fail yang diterima oleh pelayan bukan fail yang dibaca oleh pelayar anda, jadi ia tidak diterima. Cuba lagi.",
  ),
  THREAT: w("The file was found to hold a threat, so it was not taken.", "Fail itu didapati mengandungi ancaman, jadi ia tidak diterima."),
  SCAN_ERROR: w("The file could not be scanned for malware, so it was not taken. Try again later.", "Fail itu tidak dapat diimbas untuk perisian hasad, jadi ia tidak diterima. Cuba lagi kemudian."),
  TOO_MANY_DRAFT_FILES: w(
    `Your company holds ${MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE} uploaded parts not yet submitted on this exercise, the most held at once. Discard one, or submit, before uploading another.`,
    `Syarikat anda memegang ${MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE} bahagian yang dimuat naik tetapi belum diserahkan pada pelawaan ini, had paling banyak yang boleh dipegang serentak. Buang satu, atau serahkan, sebelum memuat naik yang lain.`,
  ),
};

export function submissionWarningWords(warning: SubmissionWarning): Words {
  switch (warning.code) {
    case "MANDATORY_PART_MISSING":
      return w(
        `No file was uploaded for ${warning.label ?? "a mandatory part"}. The bid is taken without it, and the opening will record it as missing.`,
        `Tiada fail dimuat naik bagi ${warning.label ?? "satu bahagian wajib"}. Bida diterima tanpanya, dan pembukaan akan merekodkannya sebagai tiada.`,
      );
    case "ALTERNATIVE_NOT_CONSIDERED":
      return w(
        "This exercise does not permit alternative bids. An alternative is taken and recorded, but it will be marked not considered.",
        "Pelawaan ini tidak membenarkan bida alternatif. Bida alternatif diterima dan direkodkan, tetapi ia akan ditandakan sebagai tidak dipertimbangkan.",
      );
    case "REPLACE_REUPLOADS_ALL":
      return w(
        "A replacement takes only the files uploaded for it: upload every part again. The bid it replaces is not opened.",
        "Bida gantian hanya mengambil fail yang dimuat naik untuknya: muat naik semula setiap bahagian. Bida yang digantikannya tidak dibuka.",
      );
  }
}

/// The upload's BUSY answer (20e): the deployment's limit on uploads at once, or one upload of the company's own still in flight.
export const UPLOAD_BUSY_WORDS: Words = w(
  "The portal is busy with other uploads. Try again in a moment. Only the time your bid is submitted decides whether it is late, not the time of an upload.",
  "Portal sedang sibuk dengan muat naik lain. Cuba lagi sebentar lagi. Hanya masa bida anda diserahkan yang menentukan sama ada ia lewat, bukan masa sesuatu muat naik.",
);

/// The answers of the part upload and discard routes that are not a rule's refusal (step 9): the rate limit, a request the portal could not read, nothing found. Rate
/// refusals say that only the submission's stamp decides lateness (20e).
export type PartRouteNotice = "RATE_LIMITED" | "NO_LENGTH" | "UNREADABLE" | "FIELDS_DISAGREE" | "NOT_FOUND" | "STORE_CLOSED" | "NOT_TAKEN" | "FILE_NOT_DRAFT";
export const PART_ROUTE_WORDS: Readonly<Record<PartRouteNotice, Words>> = {
  RATE_LIMITED: w(
    "You have uploaded a great many files in the last minute, so this one was not taken. Wait a minute and try again. Only the time your bid is submitted decides whether it is late, not the time of an upload.",
    "Anda telah memuat naik terlalu banyak fail dalam seminit yang lalu, jadi fail ini tidak diterima. Tunggu seminit dan cuba lagi. Hanya masa bida anda diserahkan yang menentukan sama ada ia lewat, bukan masa sesuatu muat naik.",
  ),
  NO_LENGTH: w("The upload did not say how large it is, so it was not read.", "Muat naik itu tidak menyatakan saiznya, jadi ia tidak dibaca."),
  UNREADABLE: w("That upload could not be read. Nothing was taken. Try again.", "Muat naik itu tidak dapat dibaca. Tiada apa yang diterima. Cuba lagi."),
  FIELDS_DISAGREE: w("The page did not say clearly which exercise and which part the file is for, so it was not taken. Reload the page and try again.", "Halaman tidak menyatakan dengan jelas pelawaan dan bahagian mana yang dimaksudkan fail itu, jadi ia tidak diterima. Muat semula halaman dan cuba lagi."),
  NOT_FOUND: w("That is not something you can open.", "Itu bukan sesuatu yang boleh anda buka."),
  STORE_CLOSED: w("Uploads are closed: the portal's file store is not set up. Contact the procurement office.", "Muat naik ditutup: simpanan fail portal belum disediakan. Hubungi pejabat perolehan."),
  NOT_TAKEN: w("The file was not taken. Nothing was recorded. Try again.", "Fail itu tidak diterima. Tiada apa yang direkodkan. Cuba lagi."),
  FILE_NOT_DRAFT: w("That file is no longer waiting to be submitted, so it cannot be discarded.", "Fail itu tidak lagi menunggu untuk diserahkan, jadi ia tidak boleh dibuang."),
};

/// The answers of the submit and withdraw routes that are not a rule's refusal (step 10): the rate limit, a request the portal could not read, nothing found, and the password asked
/// again. The password's answers say nothing of the account beyond what the portal's sign-in already says. Rate refusals say that only the stamp decides lateness (20e).
export type ActRouteNotice =
  | "SUBMIT_RATE_LIMITED" | "WITHDRAW_RATE_LIMITED" | "UNREADABLE" | "NOT_FOUND"
  | "PASSWORD_REQUIRED" | "WRONG_PASSWORD" | "LOCKED" | "THROTTLED" | "ACT_CLOSED";
export const ACT_ROUTE_WORDS: Readonly<Record<ActRouteNotice, Words>> = {
  SUBMIT_RATE_LIMITED: w(
    "You have tried to submit a great many times in the last minute, so this one was not taken. Wait a minute and try again. The time stamped when your submission is accepted decides whether it is late.",
    "Anda telah cuba menyerahkan terlalu banyak kali dalam seminit yang lalu, jadi penyerahan ini tidak diterima. Tunggu seminit dan cuba lagi. Masa yang dicap apabila penyerahan anda diterima menentukan sama ada ia lewat.",
  ),
  WITHDRAW_RATE_LIMITED: w(
    "You have tried to withdraw a great many times in the last minute, so this one was not taken. Wait a minute and try again. The time stamped when your withdrawal is accepted decides whether it is in time.",
    "Anda telah cuba menarik balik terlalu banyak kali dalam seminit yang lalu, jadi penarikan balik ini tidak diterima. Tunggu seminit dan cuba lagi. Masa yang dicap apabila penarikan balik anda diterima menentukan sama ada ia masih dalam masa.",
  ),
  UNREADABLE: w("That request could not be read. Nothing was done. Reload the page and try again.", "Permintaan itu tidak dapat dibaca. Tiada apa yang dilakukan. Muat semula halaman dan cuba lagi."),
  NOT_FOUND: w("That is not something you can open.", "Itu bukan sesuatu yang boleh anda buka."),
  PASSWORD_REQUIRED: w("Enter your password to go on.", "Masukkan kata laluan anda untuk meneruskan."),
  WRONG_PASSWORD: w("That password is not right. Nothing was done.", "Kata laluan itu tidak betul. Tiada apa yang dilakukan."),
  LOCKED: w("This account is locked after too many wrong passwords. Try again later.", "Akaun ini dikunci selepas terlalu banyak kata laluan yang salah. Cuba lagi kemudian."),
  THROTTLED: w("Too many attempts just now. Wait a few minutes and try again.", "Terlalu banyak percubaan sebentar tadi. Tunggu beberapa minit dan cuba lagi."),
  ACT_CLOSED: w(
    "This cannot be done at the moment: the procurement office has not finished setting up supplier sign-in. Tell the procurement office.",
    "Ini tidak dapat dilakukan buat masa ini: pejabat perolehan belum selesai menyediakan log masuk pembekal. Maklumkan kepada pejabat perolehan.",
  ),
};
