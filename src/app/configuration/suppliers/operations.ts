import { defineOperations } from "../_editors/define";

export const suppliersOperations = defineOperations("suppliers", "Suppliers", {
  saveRegistrationValue: { label: "Save a value a supplier's registration offers", load: () => import("./core").then((m) => m.saveRegistrationValue) },
  setRegistrationValueRetired: { label: "Retire or restore a value a supplier's registration offers", load: () => import("./core").then((m) => m.setRegistrationValueRetired) },
  saveDocumentType: { label: "Save a supplier document type", load: () => import("./core").then((m) => m.saveDocumentType) },
  setDocumentTypeRetired: { label: "Retire or restore a supplier document type", load: () => import("./core").then((m) => m.setDocumentTypeRetired) },
  saveListValue: { label: "Save an entity type or a country", load: () => import("./core").then((m) => m.saveListValue) },
  setListValueRetired: { label: "Retire or restore an entity type or a country", load: () => import("./core").then((m) => m.setListValueRetired) },
  saveSupplierPolicy: { label: "Save the supplier register policy", load: () => import("./core").then((m) => m.saveSupplierPolicy) },
  savePortalIntake: { label: "Save how the public application form is opened", load: () => import("./core").then((m) => m.savePortalIntake) },
  saveRegistrationSettings: { label: "Save the settings a supplier's registration is judged by", load: () => import("./core").then((m) => m.saveRegistrationSettings) },
  saveDeclarationText: { label: "Save a declaration's wording", load: () => import("./core").then((m) => m.saveDeclarationText) },
  setDeclarationTextRetired: { label: "Withdraw or restore a declaration's wording", load: () => import("./core").then((m) => m.setDeclarationTextRetired) },
  saveStandingReason: { label: "Save a reason for a supplier's standing", load: () => import("./core").then((m) => m.saveStandingReason) },
  setStandingReasonRetired: { label: "Retire or restore a reason for a supplier's standing", load: () => import("./core").then((m) => m.setStandingReasonRetired) },
  saveStandingRules: { label: "Save the register's standing rules", load: () => import("./core").then((m) => m.saveStandingRules) },
});
