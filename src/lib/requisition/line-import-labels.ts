import type { Words } from "@/lib/requisition/line-import";

/** What the line upload says on the requisition form, in both languages. */
export const LINE_UPLOAD_WORDS = {
  template: { en: "Download template" },
  excel: { en: "Excel" },
  csv: { en: "CSV" },
  upload: { en: "Upload lines" },
  uploading: { en: "Reading the file…" },
  help: {
    en: "Or upload the filled template.",
  },
  confirmTitle: { en: "Replace the lines you have typed?" },
  replace: { en: "Replace lines" },
  keep: { en: "Keep my lines" },
  problemsTitle: { en: "Some rows were left out" },
  nothingTitle: { en: "No lines were read" },
  fixHint: {
    en: "Fix the file and upload again.",
  },
  failed: { en: "The file could not be sent. Try again." },
  dismiss: { en: "Dismiss" },
} satisfies Record<string, Words>;

export const linesRead = (count: number, name: string): Words => ({
  en: `${count} ${count === 1 ? "line" : "lines"} read from ${name}.`,
});

export const confirmReplace = (typed: number, incoming: number, left: number): Words => ({
  en: `Replaces ${typed === 1 ? "your line" : `your ${typed} lines`} with ${incoming} from the file.${left > 0 ? ` ${left} ${left === 1 ? "row" : "rows"} left out.` : ""}`,
});
