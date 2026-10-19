import type { Words } from "@/lib/requisition/line-import";

/** What the line upload says on the requisition form, in both languages. */
export const LINE_UPLOAD_WORDS = {
  template: { en: "Download template" },
  excel: { en: "Excel" },
  csv: { en: "CSV" },
  upload: { en: "Upload lines" },
  uploading: { en: "Reading the file…" },
  help: {
    en: "Fill in the template and upload it, instead of typing each line. Nothing is saved until you press Save.",
  },
  confirmTitle: { en: "Replace the lines you have typed?" },
  replace: { en: "Replace lines" },
  keep: { en: "Keep my lines" },
  problemsTitle: { en: "Some rows were left out" },
  nothingTitle: { en: "No lines were read" },
  fixHint: {
    en: "Fix them in the file and upload it again, or add them by hand.",
  },
  failed: { en: "The file could not be sent. Try again." },
  dismiss: { en: "Dismiss" },
} satisfies Record<string, Words>;

export const linesRead = (count: number, name: string): Words => ({
  en: `${count} ${count === 1 ? "line" : "lines"} read from ${name}.`,
});

export const confirmReplace = (typed: number, incoming: number, left: number): Words => ({
  en: `The ${typed === 1 ? "line" : `${typed} lines`} on the form will be replaced by ${incoming} from the file.${left > 0 ? ` ${left} ${left === 1 ? "problem was" : "problems were"} found: those rows are not included.` : ""}`,
});
