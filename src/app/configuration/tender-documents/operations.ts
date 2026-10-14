import { defineOperations } from "../_editors/define";

export const tenderDocumentsOperations = defineOperations("tender-documents", "Tender documents", {
  saveTenderPart: { label: "Save a tender document part", load: () => import("./core").then((m) => m.saveTenderPart) },
  saveTenderPartBidRules: { label: "Save what a bidder may upload for a tender document part online", load: () => import("./core").then((m) => m.saveTenderPartBidRules) },
  retireTenderPart: { label: "Retire a tender document part", load: () => import("./core").then((m) => m.retireTenderPart) },
  saveTenderPartTemplateFile: { label: "Set or remove the template file of a tender document part", load: () => import("./core").then((m) => m.saveTenderPartTemplateFile) },
  restoreTenderPart: { label: "Restore a tender document part", load: () => import("./core").then((m) => m.restoreTenderPart) },
  saveTenderPolicy: { label: "Save the tender documents policy", load: () => import("./core").then((m) => m.saveTenderPolicy) },
  saveMethodDocumentPack: { label: "Save the pack a sourcing method assembles", load: () => import("./core").then((m) => m.saveMethodDocumentPack) },
});
