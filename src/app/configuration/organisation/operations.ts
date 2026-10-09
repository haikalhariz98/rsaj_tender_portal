import { defineOperations } from "../_editors/define";

export const organisationOperations = defineOperations("organisation", "Organisation", {
  saveOrgUnit: { label: "Save a unit of the organisation", load: () => import("./core").then((m) => m.saveOrgUnit) },
  saveCostCentre: { label: "Save a cost centre", load: () => import("./core").then((m) => m.saveCostCentre) },
  saveSite: { label: "Save a site", load: () => import("./core").then((m) => m.saveSite) },
  saveTimeZone: { label: "Set the organisation's time zone", load: () => import("./core").then((m) => m.saveTimeZone) },
  saveDetails: { label: "Save the organisation's details", load: () => import("./core").then((m) => m.saveDetails) },
  uploadLogo: { label: "Replace the logo", load: () => import("./core").then((m) => m.uploadLogo) },
  removeLogo: { label: "Remove the logo", load: () => import("./core").then((m) => m.removeLogo) },
});
