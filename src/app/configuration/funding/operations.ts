import { defineOperations } from "../_editors/define";

export const fundingOperations = defineOperations("funding", "Funding", {
  saveFundingSource: { label: "Save a funding source", load: () => import("./core").then((m) => m.saveFundingSource) },
  saveProjectCategory: { label: "Save a project category", load: () => import("./core").then((m) => m.saveProjectCategory) },
  saveImpactMeasure: { label: "Save an impact measure", load: () => import("./core").then((m) => m.saveImpactMeasure) },
  setFundingRowRetired: { label: "Retire or restore a row of a funding list", load: () => import("./core").then((m) => m.setFundingRowRetired) },
});
