import { defineOperations } from "../_editors/define";

export const tenderDocumentsConditionsOperations = defineOperations("tender-documents-conditions", "Conditions of contract", {
  saveRegistrationBody: { label: "Save a registration body", load: () => import("./conditions-core").then((m) => m.saveRegistrationBody) },
  retireRegistrationBody: { label: "Retire a registration body", load: () => import("./conditions-core").then((m) => m.retireRegistrationBody) },
  restoreRegistrationBody: { label: "Restore a registration body", load: () => import("./conditions-core").then((m) => m.restoreRegistrationBody) },
  saveClause: { label: "Save a clause", load: () => import("./conditions-core").then((m) => m.saveClause) },
  retireClause: { label: "Retire a clause", load: () => import("./conditions-core").then((m) => m.retireClause) },
  restoreClause: { label: "Restore a clause", load: () => import("./conditions-core").then((m) => m.restoreClause) },
});
