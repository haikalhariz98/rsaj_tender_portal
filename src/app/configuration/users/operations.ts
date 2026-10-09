import { defineOperations } from "../_editors/define";

export const usersOperations = defineOperations("users", "Users and roles", {
  savePerson: { label: "Save a person's record", load: () => import("./core").then((m) => m.savePerson) },
  setPersonActive: { label: "Mark a person as having left, or put them back", load: () => import("./core").then((m) => m.setPersonActive) },
  setGrant: { label: "Grant or withdraw a capability of an office", load: () => import("./core").then((m) => (_prev, data) => m.setGrant(String(data.get("roleCode") ?? ""), String(data.get("capabilityId") ?? ""), data.get("granted") === "yes")) },
  saveDelegation: { label: "Save a delegation", load: () => import("./core").then((m) => m.saveDelegation) },
  saveReportingLine: { label: "Save a reporting line", load: () => import("./core").then((m) => m.saveReportingLine) },
  saveOffice: { label: "Save an office", load: () => import("./core").then((m) => m.saveOffice) },
  saveAssignment: { label: "Give an office to a person", load: () => import("./core").then((m) => m.saveAssignment) },
  endAssignment: { label: "End an office held by a person", load: () => import("./core").then((m) => m.endAssignment) },
});
