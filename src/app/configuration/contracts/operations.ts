import { defineOperations } from "../_editors/define";

export const contractsOperations = defineOperations("contracts", "Contracts", {
  saveContractPolicy: { label: "Save the contract policy", load: () => import("./core").then((m) => m.saveContractPolicy) },
  saveDocumentPart: { label: "Save a contract document part", load: () => import("./core").then((m) => m.saveDocumentPart) },
  saveCopyRecipient: { label: "Save a recipient of a contract's copies", load: () => import("./core").then((m) => m.saveCopyRecipient) },
  retireContractRow: { label: "Retire a row from a contracts list", load: () => import("./core").then((m) => m.retireContractRow) },
});
