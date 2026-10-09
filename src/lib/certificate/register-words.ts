/**
 * The documents register's words (6.14 increment 2, `/documents`), in English and Malay (AGENTS.md rule 5: the
 * screen renders `.en`; the Malay line is kept beside it). Exhaustive over each vocabulary it labels.
 */

import { w, type Words } from "./labels";
import type { CopyState } from "./library";

export const REGISTER_WORDS = {
  title: w("Documents", "Dokumen"),
  subtitle: w("The generated documents register, the copies still to go out, and the routing sheets still open.", "Daftar dokumen yang dijana, salinan yang belum dihantar, dan helaian penghalaan yang masih terbuka."),
  library: w("Library", "Perpustakaan"),
  libraryBlurb: w("Every certificate issued and every award document frozen, newest first, with the form it stands next to. A search looks through the whole register, the frozen text included, and finds a term by any of its wordings.", "Setiap perakuan yang dikeluarkan dan setiap dokumen award yang dibekukan, terbaru dahulu, dengan borang yang dipadankan. Carian meliputi seluruh daftar termasuk teks yang dibekukan, dan menemui istilah melalui mana-mana perkataannya."),
  libraryEmpty: w("Nothing generated yet", "Belum ada yang dijana"),
  libraryEmptyBody: w("No certificate has been issued and no award document frozen.", "Tiada perakuan dikeluarkan dan tiada dokumen award dibekukan."),
  libraryNoMatch: w("Nothing matches", "Tiada yang sepadan"),
  searchLabel: w("Search the register", "Cari dalam daftar"),
  searchPlaceholder: w("A number, a contract, a contractor, a kind or words in the text", "Nombor, kontrak, kontraktor, jenis atau perkataan dalam teks"),
  searchButton: w("Search", "Cari"),
  clearSearch: w("Clear", "Kosongkan"),
  distribution: w("Distribution", "Edaran"),
  distributionBlurb: w("Every addressed copy of an issued certificate not yet sent, or sent with its acknowledgement awaited, the oldest issue first. Each is sent and acknowledged on its certificate's Distribution tab. A contract's controlled copies are on its Copies and custody; an award's on its Distribution tab.", "Setiap salinan beralamat bagi perakuan yang dikeluarkan yang belum dihantar, atau dihantar dan pengakuannya ditunggu, terlama dahulu. Setiap satu dihantar dan diakui di tab Edaran perakuannya."),
  distributionEmpty: w("Nothing outstanding", "Tiada yang tertunggak"),
  distributionEmptyBody: w("Every copy of every issued certificate has gone, and every acknowledgement asked for has come back.", "Setiap salinan telah dihantar dan setiap pengakuan yang diminta telah diterima."),
  sheets: w("Routing sheets", "Helaian penghalaan"),
  sheetsBlurb: w("Every certificate on its routing sheet, the longest open first, with its elapsed time against its target in calendar days (assumed, a question to the customer). A sheet with no target, or not yet received, is shown and never judged. An award's pre-award sheet is on the award's Routing sheet tab.", "Setiap perakuan pada helaian penghalaannya, yang paling lama terbuka dahulu, dengan tempoh berlalu berbanding sasaran dalam hari kalendar (andaian)."),
  sheetsEmpty: w("No sheet open", "Tiada helaian terbuka"),
  sheetsEmptyBody: w("No certificate is on its routing sheet.", "Tiada perakuan pada helaian penghalaannya."),
  sheetsNoZone: w("The organisation's time zone is not set, so no sheet's elapsed time is judged: set it under Configuration › Organisation.", "Zon waktu organisasi belum ditetapkan, jadi tempoh berlalu tidak dinilai."),
  onCancelled: w("kept as they were and not listed here.", "dikekalkan seperti sedia ada dan tidak disenaraikan di sini."),
  review: w("Review queue", "Barisan semakan"),
} as const satisfies Record<string, Words>;

export const COPY_STATE_WORDS: Readonly<Record<CopyState, Words>> = {
  NOT_SENT: w("Not sent", "Belum dihantar"),
  ACK_AWAITED: w("Sent, acknowledgement awaited", "Dihantar, pengakuan ditunggu"),
  DONE: w("Done", "Selesai"),
};

export const SOURCE_WORDS = { CERTIFICATE: w("Certificate", "Perakuan"), AWARD_DOCUMENT: w("Award document", "Dokumen award") } as const satisfies Record<"CERTIFICATE" | "AWARD_DOCUMENT", Words>;
