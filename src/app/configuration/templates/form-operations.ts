import { defineOperations } from "../_editors/define";

export const templatesFormsOperations = defineOperations("templates-forms", "Forms", {
  saveSignatureBlock: { label: "Save a signature block of a form", load: () => import("./form-core").then((m) => m.saveSignatureBlock) },
  removeSignatureBlock: { label: "Remove a signature block of a form", load: () => import("./form-core").then((m) => m.removeSignatureBlock) },
  saveDistributionRow: { label: "Save a distribution row of a form", load: () => import("./form-core").then((m) => m.saveDistributionRow) },
  removeDistributionRow: { label: "Remove a distribution row of a form", load: () => import("./form-core").then((m) => m.removeDistributionRow) },
  savePageCount: { label: "Save the printed page count of a form", load: () => import("./form-core").then((m) => m.savePageCount) },
  savePrintedField: { label: "Save a printed field of a form", load: () => import("./form-core").then((m) => m.savePrintedField) },
  removePrintedField: { label: "Remove a printed field of a form", load: () => import("./form-core").then((m) => m.removePrintedField) },
});
