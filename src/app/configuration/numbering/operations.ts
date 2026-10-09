import { defineOperations } from "../_editors/define";

export const numberingOperations = defineOperations("numbering", "Numbering", {
  saveSeries: { label: "Save a numbering series", load: () => import("./core").then((m) => m.saveSeries) },
});
