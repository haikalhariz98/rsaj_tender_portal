import { defineOperations } from "../_editors/define";

export const documentsOperations = defineOperations("documents", "Documents", {
  saveDocumentClass: { label: "Save a document class", load: () => import("./core").then((m) => m.saveDocumentClass) },
  lowerClassClassification: { kind: "CLASSIFICATION_DOWNGRADE", label: "Lower a document class's classification", load: () => import("./core").then((m) => m.lowerClassClassification) },
  saveStorePolicy: { label: "Save the upload rules", load: () => import("./core").then((m) => m.saveStorePolicy) },
});
