/**
 * The words the shared components write themselves (NFR-LNG-001, ADR 0040): the list's tools and paging, the tab strip, the drawer's
 * header, the editor's buttons, the history drawer, the selects and file pickers. Words a screen hands in are the screen's own. The Malay is
 * drafted in the N1 slice and not yet reviewed by the customer. Sentences with values use {name} placeholders (`sayWith`).
 */

import { w, type Words } from "@/lib/contract/labels";

import type { Catalogue } from "../registry";

export const COMPONENT_WORDS = {
  // Drawers and the editor
  close: w("Close", "Tutup"),
  cancel: w("Cancel", "Batal"),
  save: w("Save", "Simpan"),
  saving: w("Saving…", "Menyimpan…"),
  changeIt: w("Change it", "Ubah"),
  notSet: w("Not set", "Belum ditetapkan"),
  nothingTyped: w("Nothing typed", "Tiada yang ditaip"),
  // DataList
  searchPlaceholder: w("Search…", "Cari…"),
  searchThisList: w("Search this list", "Cari dalam senarai ini"),
  nothingHere: w("Nothing here", "Tiada apa-apa di sini"),
  nothingMatches: w("Nothing matches", "Tiada yang sepadan"),
  noMatch: w("No record matches the view, search and filters you have chosen.", "Tiada rekod yang sepadan dengan paparan, carian dan penapis yang dipilih."),
  showAllRecords: w("Show all records", "Tunjuk semua rekod"),
  view: w("View", "Paparan"),
  allRecords: w("All records", "Semua rekod"),
  anyOf: w("Any {label}", "Mana-mana {label}"),
  downloadCsv: w("Download this view as CSV", "Muat turun paparan ini sebagai CSV"),
  downloadCsvLeavesOut: w("Download this view as CSV, SULIT columns left out", "Muat turun paparan ini sebagai CSV, lajur SULIT ditinggalkan"),
  downloadCsvTitleLeavesOut: w("Download this view as CSV (SULIT columns left out)", "Muat turun paparan ini sebagai CSV (lajur SULIT ditinggalkan)"),
  nSelected: w("{count} selected", "{count} dipilih"),
  clear: w("Clear", "Kosongkan"),
  selectRow: w("Select {name}", "Pilih {name}"),
  selectAllRows: w("Select all rows", "Pilih semua baris"),
  actions: w("Actions", "Tindakan"),
  showing: w("Showing {from}-{to} of {total}", "Menunjukkan {from}-{to} daripada {total}"),
  rows: w("Rows", "Baris"),
  rowsPerPage: w("Rows per page", "Baris setiap halaman"),
  pagination: w("Pagination", "Penomboran halaman"),
  previousPage: w("Previous page", "Halaman sebelumnya"),
  nextPage: w("Next page", "Halaman seterusnya"),
  // Tabs
  sections: w("Sections", "Bahagian"),
  theTabs: w("the tabs", "tab"),
  sectionsOf: w("{label} sections", "Bahagian {label}"),
  scrollBack: w("Scroll {label} back", "Tatal {label} ke belakang"),
  scrollForward: w("Scroll {label} forward", "Tatal {label} ke hadapan"),
  loading: w("Loading…", "Memuatkan…"),
  // History drawer
  history: w("History", "Sejarah"),
  historyOf: w("History of {label}", "Sejarah {label}"),
  noChangeRecorded: w("No change to this record has been recorded.", "Tiada perubahan pada rekod ini yang direkodkan."),
  empty: w("empty", "kosong"),
  nothingRecorded: w("Nothing recorded", "Tiada yang direkodkan"),
  created: w("Created", "Dicipta"),
  changed: w("Changed", "Diubah"),
  removed: w("Removed", "Dibuang"),
  notAttributed: w("Not attributed — before sign-in", "Tiada atribusi — sebelum log masuk wujud"),
  unknown: w("Unknown", "Tidak diketahui"),
  // Selects and pickers
  selectEllipsis: w("Select…", "Pilih…"),
  noMatches: w("No matches", "Tiada padanan"),
  oneOption: w("1 option", "1 pilihan"),
  nOptions: w("{count} options", "{count} pilihan"),
  selectAnOption: w("Select an option", "Pilih satu pilihan"),
  select: w("Select", "Pilih"),
  search: w("Search", "Cari"),
  nothingToChoose: w("Nothing to choose yet", "Belum ada yang boleh dipilih"),
  noMatchesFor: w("No matches for “{query}”", "Tiada padanan untuk “{query}”"),
  searching: w("Searching", "Sedang mencari"),
  listNotLoaded: w("The list could not be loaded", "Senarai tidak dapat dimuatkan"),
  chooseFile: w("Choose file", "Pilih fail"),
  noFileChosen: w("No file chosen", "Tiada fail dipilih"),
  uploadProgress: w("Upload progress", "Kemajuan muat naik"),
  uploaded: w("Uploaded.", "Dimuat naik."),
  showFullDescription: w("Show the full description", "Tunjuk keterangan penuh"),
  // The step bar (Stepper): a step's state, said after its name for a screen reader
  stepDone: w("done", "selesai"),
  stepCurrent: w("waiting now", "menunggu sekarang"),
  stepWaiting: w("not reached yet", "belum sampai"),
  stepRejected: w("rejected", "ditolak"),
  stepParked: w("parked", "ditangguhkan"),
  // The SULIT marks (SulitLock, SulitTag, SulitWithheld and a SULIT column's header). SULIT itself is the classification mark and stays.
  sulitWithheld: w("SULIT · withheld", "SULIT · disembunyikan"),
  sulitValue: w("SULIT. Shown only to the people entitled to it, and every reading is logged.", "SULIT. Ditunjukkan hanya kepada mereka yang berhak, dan setiap bacaan direkodkan."),
  sulitColumn: w(
    "SULIT. Shown to the people entitled to it and withheld from everyone else, and every reading is logged. Not exported.",
    "SULIT. Ditunjukkan kepada mereka yang berhak dan disembunyikan daripada orang lain, dan setiap bacaan direkodkan. Tidak dieksport.",
  ),
  // Where a configured fact came from (ProvenanceBadge)
  provStated: w("Stated", "Dinyatakan"),
  provObserved: w("Observed", "Diperhatikan"),
  provAssumed: w("Assumed", "Andaian"),
  provNotSet: w("Not set", "Belum ditetapkan"),
  provStatedHint: w("Written in a governing document", "Ditulis dalam dokumen yang mengawal"),
  provObservedHint: w("Seen in practice, not written down", "Dilihat dalam amalan, tidak ditulis"),
  provAssumedHint: w("A working default, awaiting sign-off", "Lalai kerja, menunggu pengesahan"),
  provNotSetHint: w("Nobody has said where this came from", "Tiada siapa menyatakan dari mana ini datang"),
} as const satisfies Record<string, Words>;

export const COMPONENTS: Catalogue = {
  name: "components",
  review: "DRAFTED_NOT_REVIEWED",
  words: COMPONENT_WORDS,
};
