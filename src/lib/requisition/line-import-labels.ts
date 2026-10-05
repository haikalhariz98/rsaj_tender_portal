import type { Words } from "@/lib/requisition/line-import";

/** What the line upload says on the requisition form, in both languages. */
export const LINE_UPLOAD_WORDS = {
  template: { en: "Download template", ms: "Muat turun templat" },
  excel: { en: "Excel", ms: "Excel" },
  csv: { en: "CSV", ms: "CSV" },
  upload: { en: "Upload lines", ms: "Muat naik baris" },
  uploading: { en: "Reading the file…", ms: "Membaca fail…" },
  help: {
    en: "Fill in the template and upload it, instead of typing each line. Nothing is saved until you press Save.",
    ms: "Isi templat dan muat naik, tanpa menaip setiap baris. Tiada apa disimpan sehingga anda menekan Simpan.",
  },
  confirmTitle: { en: "Replace the lines you have typed?", ms: "Ganti baris yang telah anda taip?" },
  replace: { en: "Replace lines", ms: "Ganti baris" },
  keep: { en: "Keep my lines", ms: "Kekalkan baris saya" },
  problemsTitle: { en: "Some rows were left out", ms: "Sebahagian baris ditinggalkan" },
  nothingTitle: { en: "No lines were read", ms: "Tiada baris dibaca" },
  fixHint: {
    en: "Fix them in the file and upload it again, or add them by hand.",
    ms: "Baiki dalam fail dan muat naik semula, atau tambah secara manual.",
  },
  failed: { en: "The file could not be sent. Try again.", ms: "Fail tidak dapat dihantar. Cuba lagi." },
  dismiss: { en: "Dismiss", ms: "Tutup" },
} satisfies Record<string, Words>;

export const linesRead = (count: number, name: string): Words => ({
  en: `${count} ${count === 1 ? "line" : "lines"} read from ${name}.`,
  ms: `${count} baris dibaca daripada ${name}.`,
});

export const confirmReplace = (typed: number, incoming: number, left: number): Words => ({
  en: `The ${typed === 1 ? "line" : `${typed} lines`} on the form will be replaced by ${incoming} from the file.${left > 0 ? ` ${left} ${left === 1 ? "problem was" : "problems were"} found: those rows are not included.` : ""}`,
  ms: `${typed === 1 ? "Baris" : `${typed} baris`} pada borang akan diganti dengan ${incoming} baris daripada fail.${left > 0 ? ` ${left} masalah ditemui: baris itu tidak dimasukkan.` : ""}`,
});
