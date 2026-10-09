import { defineOperations } from "../_editors/define";

export const scopeOperations = defineOperations("scope", "Scope and estimate", {
  saveScopePolicy: { label: "Save the scope and estimate policy", load: () => import("./core").then((m) => m.saveScopePolicy) },
  saveQualification: { label: "Save a qualification", load: () => import("./core").then((m) => m.saveQualification) },
  savePersonQualification: { label: "Record a qualification a person holds", load: () => import("./core").then((m) => m.savePersonQualification) },
  saveBqTemplate: { label: "Save a bill of quantities template", load: () => import("./core").then((m) => m.saveBqTemplate) },
  saveBqTemplateSection: { label: "Save a section of a bill template", load: () => import("./core").then((m) => m.saveBqTemplateSection) },
  saveSpecPanelColumn: { label: "Save a column of the specification panel", load: () => import("./core").then((m) => m.saveSpecPanelColumn) },
  saveMethodEstimateRule: { label: "Save the company-estimate rule of a method", load: () => import("./core").then((m) => m.saveMethodEstimateRule) },
  saveBasisBqRule: { label: "Save the bill rule of a contract basis", load: () => import("./core").then((m) => m.saveBasisBqRule) },
  saveMethodScopeRule: { label: "Save the scope-approval rule of a method", load: () => import("./core").then((m) => m.saveMethodScopeRule) },
});
