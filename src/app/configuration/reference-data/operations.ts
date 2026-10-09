import { defineOperations } from "../_editors/define";

export const referenceDataOperations = defineOperations("reference-data", "Reference data", {
  saveFundingRoute: { label: "Save a funding route", load: () => import("./core").then((m) => m.saveFundingRoute) },
  saveSourcingMethod: { label: "Save a sourcing method", load: () => import("./core").then((m) => m.saveSourcingMethod) },
  saveContractType: { label: "Save a contract type", load: () => import("./core").then((m) => m.saveContractType) },
  retireEntry: { label: "Retire an entry", load: () => import("./core").then((m) => m.retireEntry) },
  restoreEntry: { label: "Restore an entry", load: () => import("./core").then((m) => m.restoreEntry) },
  saveContractBehaviours: { label: "Save the behaviours of a contract type", load: () => import("./core").then((m) => m.saveContractBehaviours) },
  saveChecklistItem: { label: "Save a proposal checklist item", load: () => import("./core").then((m) => m.saveChecklistItem) },
  retireChecklistItem: { label: "Retire a proposal checklist item", load: () => import("./core").then((m) => m.retireChecklistItem) },
  saveJustificationReason: { label: "Save a reason a direct appointment may be justified by", load: () => import("./core").then((m) => m.saveJustificationReason) },
  saveContractBasis: { label: "Save a contract basis", load: () => import("./core").then((m) => m.saveContractBasis) },
  saveTaxonomy: { label: "Save a classification", load: () => import("./core").then((m) => m.saveTaxonomy) },
  saveTaxonomyValue: { label: "Save a value of a classification", load: () => import("./core").then((m) => m.saveTaxonomyValue) },
  saveTaxonomyMapping: { label: "Save a contract type's value in a classification", load: () => import("./core").then((m) => m.saveTaxonomyMapping) },
  removeTaxonomyMapping: { label: "Remove a contract type's value in a classification", load: () => import("./core").then((m) => m.removeTaxonomyMapping) },
  saveClassificationPolicy: { label: "Save how mixed scope is classified", load: () => import("./core").then((m) => m.saveClassificationPolicy) },
});
