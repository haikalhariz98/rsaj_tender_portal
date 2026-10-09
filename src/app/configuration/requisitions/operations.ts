import { defineOperations } from "../_editors/define";

export const requisitionsOperations = defineOperations("requisitions", "Requisitions", {
  savePolicy: { label: "Save the requisition policy", load: () => import("./core").then((m) => m.savePolicy) },
  saveBudgetCheckSource: { label: "Save where the budget check comes from", load: () => import("./core").then((m) => m.saveBudgetCheckSource) },
  saveErpFormat: { label: "Save the shape of a finance system number", load: () => import("./core").then((m) => m.saveErpFormat) },
  saveGateRule: { label: "Save a committee gate rule", load: () => import("./core").then((m) => m.saveGateRule) },
});
