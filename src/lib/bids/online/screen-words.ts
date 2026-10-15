/**
 * Every word on the supplier's screens for online bids (SR-13, ADR 0036 D5 to D8, D13; rulings 20ab, 20j, 20s; build plan step 11). One place: no component writes a sentence of its
 * own. All of it is the portal's `Words`, English and Malay, the Malay saying no more than the English (20ab), reviewed on the customer's side before LIVE (NFR-LNG-001). No
 * value calls a receipt or a bid "signed", "proof" or "verified", in either language (20j, 20s): `words.test.ts` scans this module's values and its string literals.
 * The sealing's honest limits (D13) are said in plain words, once, here.
 */

import { w, type Words } from "@/lib/contract/labels";

export const SCREEN_WORDS = {
  // ---- the exercise's tab and the submit page
  tab: w("Your bid", "Bida anda"),
  submitTitle: w("Submit your bid", "Serahkan bida anda"),
  submitSubtitle: w(
    "Upload each part, state your price and completion period, and enter your password. Your files are sealed as they arrive and stay sealed until the opening.",
    "Muat naik setiap bahagian, nyatakan harga dan tempoh siap anda, dan masukkan kata laluan anda. Fail anda dimeterai semasa ia tiba dan kekal bermeterai sehingga pembukaan.",
  ),
  backToExercise: w("Back to the exercise", "Kembali ke pelawaan"),
  openSubmitPage: w("Submit or replace a bid", "Serahkan atau gantikan bida"),
  closes: w("Closes", "Tarikh tutup"),
  notSet: w("Not set", "Belum ditetapkan"),
  sendingClosed: w(
    "Sending is closed: the person who runs the portal has not set its form key. Nothing can be sent until they do.",
    "Penghantaran ditutup: orang yang menguruskan portal belum menetapkan kunci borangnya. Tiada apa yang boleh dihantar sehingga ia ditetapkan.",
  ),
  pastClosingTitle: w("The closing time has passed", "Masa tutup telah berlalu"),
  closedTitle: w("Bids cannot be submitted now", "Bida tidak boleh diserahkan sekarang"),
  paperOnlyTitle: w("Bids are handed in on paper", "Bida diserahkan di atas kertas"),

  // ---- what sealing does, and does not (D13)
  limitsTitle: w("How your bid is protected", "Bagaimana bida anda dilindungi"),
  limits: w(
    "Each file is sealed as it arrives and is kept only in sealed form. It can be opened only by all the opening officers named for this exercise, together, at the opening. The portal reads your files and your password at the moment you send them, so the portal itself has to be trusted: sealing protects what is stored, not a portal that has been compromised. The closing time is kept by the portal's clock, not by the sealing.",
    "Setiap fail dimeterai semasa ia tiba dan disimpan dalam bentuk bermeterai sahaja. Ia hanya boleh dibuka oleh semua pegawai pembukaan yang dinamakan bagi pelawaan ini, bersama-sama, semasa pembukaan. Portal membaca fail dan kata laluan anda pada saat anda menghantarnya, jadi portal itu sendiri perlu dipercayai: pemeteraian melindungi apa yang disimpan, bukan portal yang telah diceroboh. Masa tutup dikekalkan oleh jam portal, bukan oleh pemeteraian.",
  ),

  // ---- a key changed under a waiting draft (step 8's review)
  discardedTitle: w("Files you had uploaded can no longer be used", "Fail yang anda muat naik tidak lagi boleh digunakan"),
  discardedOne: w(
    "The procurement office changed this exercise's sealing key after you uploaded a file that you had not yet submitted. A file is sealed to the key that was live when it arrived, so it cannot be used with the new key. Upload it again before you submit.",
    "Pejabat perolehan menukar kunci meterai pelawaan ini selepas anda memuat naik fail yang belum anda serahkan. Fail dimeterai kepada kunci yang aktif semasa ia tiba, jadi ia tidak boleh digunakan dengan kunci baharu. Muat naik semula sebelum anda menyerahkan.",
  ),
  discardedSealedTo: w("Sealed to the key with fingerprint", "Dimeterai kepada kunci dengan cap jari"),
  discardedNow: w("The key now live has fingerprint", "Kunci yang kini aktif mempunyai cap jari"),
  discardedParts: w("Files discarded", "Fail yang dibuang"),

  // ---- the key's fingerprint and its history (the opportunity page)
  keyTitle: w("The sealing key for this exercise", "Kunci meterai bagi pelawaan ini"),
  keySubtitle: w(
    "Your bid is sealed to this key. The fingerprint is printed on every receipt, so compare it with the one you are shown here.",
    "Bida anda dimeterai kepada kunci ini. Cap jari dicetak pada setiap resit, jadi bandingkan dengan yang ditunjukkan di sini.",
  ),
  keyLive: w("Fingerprint now", "Cap jari sekarang"),
  keyNone: w("No sealing key is published for this exercise yet.", "Belum ada kunci meterai diterbitkan bagi pelawaan ini."),
  keyHistory: w("Changes of the key", "Perubahan kunci"),
  keyNoChanges: w("The key has not been changed since it was published.", "Kunci tidak diubah sejak ia diterbitkan."),
  keyWhen: w("When", "Bila"),
  keyFrom: w("From fingerprint", "Daripada cap jari"),
  keyTo: w("To fingerprint", "Kepada cap jari"),

  // ---- the parts
  partsTitle: w("Parts of your bid", "Bahagian bida anda"),
  partsSubtitle: w(
    "Each part takes one file. The type is read from the file itself, not from its name.",
    "Setiap bahagian menerima satu fail. Jenisnya dibaca daripada fail itu sendiri, bukan daripada namanya.",
  ),
  partRequired: w("Required", "Wajib"),
  partOptional: w("Optional", "Pilihan"),
  partAccepts: w("Accepts", "Menerima"),
  partLargest: w("Largest file", "Fail terbesar"),
  partNoTypes: w("The file types for this part are not set yet.", "Jenis fail bagi bahagian ini belum ditetapkan."),
  partNoSize: w("The largest file for this part is not set yet.", "Saiz fail terbesar bagi bahagian ini belum ditetapkan."),
  partNone: w("This exercise has no part for a bidder to return.", "Pelawaan ini tiada bahagian untuk dikembalikan oleh petender."),
  partNotUploaded: w("No file uploaded", "Tiada fail dimuat naik"),
  partUploaded: w("Uploaded", "Dimuat naik"),
  partChoose: w("Choose a file", "Pilih fail"),
  partChooseAnother: w("Choose another file", "Pilih fail lain"),
  partRemove: w("Remove", "Buang"),
  partHashing: w("Reading the file in your browser…", "Membaca fail dalam pelayar anda…"),
  partSending: w("Sending and sealing…", "Menghantar dan memeterai…"),
  partRemoved: w("The file was removed.", "Fail itu telah dibuang."),
  partFileName: w("File", "Fail"),
  partDraftNote: w(
    "A file you uploaded earlier. Its name is kept sealed, so only the time is shown here.",
    "Fail yang anda muat naik sebelum ini. Namanya disimpan bermeterai, jadi hanya masa ditunjukkan di sini.",
  ),

  // ---- what is being submitted
  kindTitle: w("What you are submitting", "Apa yang anda serahkan"),
  kindBid: w("A bid", "Bida"),
  kindAlternative: w("An alternative bid", "Bida alternatif"),
  kindReplace: w("A replacement for a submission of mine", "Gantian bagi salah satu penyerahan saya"),
  kindReplacing: w("Replace which submission", "Gantikan penyerahan yang mana"),
  kindParent: w("The bid this alternative goes with", "Bida yang disertai oleh alternatif ini"),
  kindNoParent: w("Not tied to a bid", "Tidak dikaitkan dengan bida"),
  replaceNote: w(
    "A replacement takes only the files you upload for it, so upload every part again. The submission it replaces is not opened.",
    "Gantian hanya mengambil fail yang anda muat naik untuknya, jadi muat naik semula setiap bahagian. Penyerahan yang digantikannya tidak dibuka.",
  ),
  alternativesNotConsideredTitle: w("This exercise does not permit alternative bids", "Pelawaan ini tidak membenarkan bida alternatif"),
  alternativesNotConsidered: w(
    "An alternative is still taken and recorded, but it will be marked as not considered. Think before you submit one.",
    "Bida alternatif tetap diterima dan direkodkan, tetapi ia akan ditandakan sebagai tidak dipertimbangkan. Fikirkan dahulu sebelum anda menyerahkannya.",
  ),
  alternativesNotStated: w("Whether alternative bids are permitted is not stated for this exercise.", "Sama ada bida alternatif dibenarkan belum dinyatakan bagi pelawaan ini."),

  // ---- declared fields
  declareTitle: w("What you declare", "Apa yang anda isytiharkan"),
  declareSubtitle: w(
    "These two figures are sealed with your files and are read at the opening.",
    "Dua angka ini dimeterai bersama fail anda dan dibaca semasa pembukaan.",
  ),
  price: w("Price", "Harga"),
  priceHint: w("The figure only, with up to two decimal places and no separators.", "Angka sahaja, dengan sehingga dua tempat perpuluhan dan tanpa pemisah."),
  period: w("Completion period", "Tempoh siap"),
  periodHint: w("A whole number from 1.", "Nombor bulat bermula dengan 1."),
  unit: w("Counted in", "Dikira dalam"),
  unitDays: w("Days", "Hari"),
  unitWeeks: w("Weeks", "Minggu"),
  unitMonths: w("Months", "Bulan"),

  // ---- the act
  passwordTitle: w("Your password", "Kata laluan anda"),
  password: w("Password", "Kata laluan"),
  passwordHint: w("Entered again for this act. Nothing is submitted without it.", "Dimasukkan semula bagi tindakan ini. Tiada apa yang diserahkan tanpanya."),
  submitButton: w("Submit bid", "Serahkan bida"),
  replaceButton: w("Submit replacement", "Serahkan gantian"),
  submitting: w("Submitting…", "Menyerahkan…"),
  stampNote: w(
    "The time stamped when the portal accepts your submission decides whether it is late, not the time of an upload.",
    "Masa yang dicap apabila portal menerima penyerahan anda menentukan sama ada ia lewat, bukan masa sesuatu muat naik.",
  ),
  warningsTitle: w("Please note", "Sila ambil perhatian"),
  notReached: w(
    "That did not reach the portal, so nothing is known to have been done. Check your connection, look at Your bid for a new receipt, and try again only if there is none.",
    "Itu tidak sampai ke portal, jadi tiada apa yang diketahui telah dilakukan. Semak sambungan anda, lihat Bida anda untuk resit baharu, dan cuba lagi hanya jika tiada.",
  ),
  signedOut: w("You are no longer logged in. Log in again, then try again.", "Anda tidak lagi log masuk. Log masuk semula, kemudian cuba lagi."),
  secondTab: w("The page is out of date. Reload it and try again.", "Halaman ini sudah lapuk. Muat semulanya dan cuba lagi."),

  // ---- the receipt
  receiptTitle: w("Your receipt", "Resit anda"),
  receiptSubtitle: w("Print it or save it, and keep it until the opening.", "Cetak atau simpan resit ini, dan simpan sehingga pembukaan."),
  receiptNumber: w("Your submission number", "Nombor penyerahan anda"),
  receiptStamp: w("Stamped by the portal", "Dicap oleh portal"),
  receiptOnTime: w("Received in time", "Diterima dalam masa"),
  receiptLate: w("Received after the closing", "Diterima selepas tarikh tutup"),
  receiptLateNote: w(
    "A late submission is kept, sealed, and goes to the committee, which decides whether to admit it.",
    "Penyerahan yang lewat disimpan, bermeterai, dan dibawa kepada jawatankuasa, yang memutuskan sama ada menerimanya.",
  ),
  receiptKey: w("Sealing key fingerprint", "Cap jari kunci meterai"),
  receiptDigest: w("Receipt digest", "Cincangan resit"),
  receiptAlternativeNot: w("Marked as not considered", "Ditandakan sebagai tidak dipertimbangkan"),
  receiptPrint: w("Print the receipt", "Cetak resit"),
  receiptExercise: w("Exercise", "Pelawaan"),
  receiptSupplier: w("Company", "Syarikat"),
  receiptKind: w("Kind", "Jenis"),
  receiptAgain: w("Back to your bid", "Kembali ke bida anda"),

  // ---- the Your bid tab
  listTitle: w("Your submissions", "Penyerahan anda"),
  listSubtitle: w(
    "Each submission has its own number, counted from your first. Only the standing ones are opened.",
    "Setiap penyerahan mempunyai nombor sendiri, dikira dari yang pertama anda. Hanya yang masih berkuat kuasa dibuka.",
  ),
  listEmptyTitle: w("You have not submitted a bid", "Anda belum menyerahkan bida"),
  listEmptyBody: w("When you submit one, its receipt is kept here.", "Apabila anda menyerahkannya, resitnya disimpan di sini."),
  submission: w("Submission", "Penyerahan"),
  colNumber: w("No.", "No."),
  colKind: w("Kind", "Jenis"),
  colStamp: w("Stamped", "Dicap"),
  colStatus: w("Status", "Status"),
  colDigest: w("Receipt digest", "Cincangan resit"),
  colOpening: w("At the opening", "Semasa pembukaan"),
  statusSubmitted: w("Standing", "Berkuat kuasa"),
  statusReplaced: w("Replaced", "Diganti"),
  statusWithdrawn: w("Withdrawn", "Ditarik balik"),
  statusOpened: w("Opened", "Dibuka"),
  late: w("Late", "Lewat"),
  inTime: w("In time", "Dalam masa"),
  tiedTo: w("Goes with submission", "Disertai dengan penyerahan"),
  showReceipt: w("Show the receipt", "Tunjuk resit"),
  hideReceipt: w("Hide the receipt", "Sembunyikan resit"),
  notConsidered: w("Not considered", "Tidak dipertimbangkan"),
  rollMissing: w(
    "The opening has started, but the list of bids it froze is not recorded here yet, so nothing is said of this submission. Check again later.",
    "Pembukaan telah bermula, tetapi senarai bida yang dibekukannya belum direkodkan di sini, jadi tiada apa yang dinyatakan tentang penyerahan ini. Semak semula kemudian.",
  ),

  // ---- withdrawing
  withdraw: w("Withdraw", "Tarik balik"),
  withdrawTitle: w("Withdraw this submission", "Tarik balik penyerahan ini"),
  withdrawBody: w(
    "A withdrawn submission is not opened. This cannot be undone, but you may submit again before the closing.",
    "Penyerahan yang ditarik balik tidak dibuka. Ini tidak boleh dibatalkan, tetapi anda boleh menyerahkan semula sebelum tarikh tutup.",
  ),
  withdrawAlternatives: w("Alternatives that go with it", "Alternatif yang menyertainya"),
  withdrawAlternativesNote: w(
    "Tick the ones to withdraw as well. An alternative you leave unticked stays, and is no longer tied to this bid.",
    "Tandakan yang hendak ditarik balik sekali. Alternatif yang tidak ditandakan kekal, dan tidak lagi dikaitkan dengan bida ini.",
  ),
  withdrawButton: w("Withdraw submission", "Tarik balik penyerahan"),
  withdrawing: w("Withdrawing…", "Menarik balik…"),
  withdrawDone: w("The submission was withdrawn.", "Penyerahan itu telah ditarik balik."),
  withdrawLinksCleared: w("Alternatives left standing were untied from it.", "Alternatif yang dikekalkan telah dinyahkaitkan daripadanya."),
  cancel: w("Cancel", "Batal"),
  close: w("Close", "Tutup"),
  closedForWithdraw: w("Withdrawing is open until the closing time.", "Penarikan balik dibuka sehingga masa tutup."),

  // ---- demonstration
  demonstrationNote: w(
    "Bids made here are for trying the system out. They are not tenders and will not be awarded.",
    "Bida yang dibuat di sini adalah untuk mencuba sistem. Ia bukan tender dan tidak akan dianugerahkan.",
  ),
} as const satisfies Record<string, Words>;

export type ScreenWord = keyof typeof SCREEN_WORDS;

/** A bid's status, in words. */
export const BID_STATUS_WORDS: Readonly<Record<"SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED", Words>> = {
  SUBMITTED: SCREEN_WORDS.statusSubmitted,
  REPLACED: SCREEN_WORDS.statusReplaced,
  WITHDRAWN: SCREEN_WORDS.statusWithdrawn,
  OPENED: SCREEN_WORDS.statusOpened,
};

export const BID_KIND_WORDS: Readonly<Record<"BID" | "ALTERNATIVE", Words>> = { BID: SCREEN_WORDS.kindBid, ALTERNATIVE: SCREEN_WORDS.kindAlternative };

export const UNIT_WORDS: Readonly<Record<"DAYS" | "WEEKS" | "MONTHS", Words>> = { DAYS: SCREEN_WORDS.unitDays, WEEKS: SCREEN_WORDS.unitWeeks, MONTHS: SCREEN_WORDS.unitMonths };

/// A file format, as a supplier reads it. Media types are configuration keys and never reach a screen (AGENTS.md rule 5).
const TYPE_WORDS: Readonly<Record<string, Words>> = {
  "application/pdf": w("PDF", "PDF"),
  "image/png": w("PNG image", "Imej PNG"),
  "image/jpeg": w("JPEG image", "Imej JPEG"),
  "image/tiff": w("TIFF image", "Imej TIFF"),
  "text/csv": w("CSV file", "Fail CSV"),
};
const UNKNOWN_TYPE = w("a type the portal does not recognise", "jenis yang tidak dikenali oleh portal");

/// The accepted types of a part, listed. Empty when none is set: the screen then says the types are not set, never an empty list.
export function typesWords(types: readonly string[]): Words {
  const words = types.map((t) => TYPE_WORDS[t] ?? UNKNOWN_TYPE);
  return w(words.map((x) => x.en).join(", "), words.map((x) => x.ms).join(", "));
}
